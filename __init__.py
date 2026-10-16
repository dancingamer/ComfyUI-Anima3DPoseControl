"""Split Anima loader that also accepts an Easy Use LoRA preset stack.

Anima base and Anima 2.9B both load through ComfyUI's UNET loader. A 2.9B
checkpoint has 40 blocks; a LoRA trained on the original 28-block model is
remapped onto the inherited block positions before it is applied.
"""

import re

import comfy.model_detection
import comfy.sd
import comfy.utils
import folder_paths
import nodes

from .anima_camera import NODE_CLASS_MAPPINGS as _CAMERA_NODE_CLASS_MAPPINGS
from .anima_camera import NODE_DISPLAY_NAME_MAPPINGS as _CAMERA_NODE_DISPLAY_NAME_MAPPINGS
from .anima_prompt import AnimaRegionBase, register_routes

ANIMA_BASE_BLOCKS = 28
ANIMA_29B_BLOCKS = 40
ANIMA_29B_INSERTS = (2, 5, 8, 11, 14, 17, 21, 24, 27, 30, 33, 36)
ANIMA_29B_LEGACY_MAP = tuple(
    index for index in range(ANIMA_29B_BLOCKS) if index not in ANIMA_29B_INSERTS
)

_FLAT_BLOCK = re.compile(
    r"^(?P<prefix>lora_unet_{1,2}blocks_)(?P<index>\d+)(?P<suffix>_.+)$"
)
_DOTTED_BLOCKS = (
    re.compile(
        r"^(?P<prefix>(?:model\.)?diffusion_model\.blocks\.)"
        r"(?P<index>\d+)(?P<suffix>\..+)$"
    ),
    re.compile(r"^(?P<prefix>blocks\.)(?P<index>\d+)(?P<suffix>\..+)$"),
)


def _block_match(key):
    match = _FLAT_BLOCK.match(key)
    if match is not None:
        return match
    for pattern in _DOTTED_BLOCKS:
        match = pattern.match(key)
        if match is not None:
            return match
    return None


def _block_indices(state_dict):
    indices = set()
    for key in state_dict:
        match = _block_match(str(key))
        if match is not None:
            indices.add(int(match.group("index")))
    return indices


def _remap_legacy_key(key):
    match = _block_match(key)
    if match is None:
        return key
    old_index = int(match.group("index"))
    if old_index < 0 or old_index >= ANIMA_BASE_BLOCKS:
        return key
    new_index = ANIMA_29B_LEGACY_MAP[old_index]
    prefix = match.group("prefix")
    suffix = match.group("suffix")
    if prefix.startswith("lora_unet_"):
        return f"lora_unet_blocks_{new_index}{suffix}"
    return f"diffusion_model.blocks.{new_index}{suffix}"


def _anima_block_count(state_dict, key_prefix):
    prefix = f"{key_prefix}blocks."
    indices = set()
    for key in state_dict:
        text = str(key)
        if not text.startswith(prefix):
            continue
        head = text[len(prefix):].split(".", 1)[0]
        if head.isdigit():
            indices.add(int(head))
    if not indices:
        return None
    return max(indices) + 1


def _load_unet(unet_name, weight_dtype):
    original = comfy.model_detection.detect_unet_config

    def detect_unet_config(state_dict, key_prefix, *args, **kwargs):
        config = original(state_dict, key_prefix, *args, **kwargs)
        if not isinstance(config, dict) or config.get("image_model") != "anima":
            return config
        count = _anima_block_count(state_dict, str(key_prefix or ""))
        if count is None or count == config.get("num_blocks"):
            return config
        patched = dict(config)
        patched["num_blocks"] = count
        return patched

    comfy.model_detection.detect_unet_config = detect_unet_config
    try:
        model, = nodes.UNETLoader().load_unet(unet_name, weight_dtype)
    finally:
        if comfy.model_detection.detect_unet_config is detect_unet_config:
            comfy.model_detection.detect_unet_config = original
    return model


def _is_anima_29b(model):
    config = getattr(getattr(model, "model", None), "model_config", None)
    unet_config = getattr(config, "unet_config", None)
    return (
        isinstance(unet_config, dict)
        and unet_config.get("image_model") == "anima"
        and unet_config.get("num_blocks") == ANIMA_29B_BLOCKS
    )


def _prepare_29b_lora(state_dict, lora_name):
    indices = _block_indices(state_dict)
    if not indices or any(index >= ANIMA_BASE_BLOCKS for index in indices):
        return dict(state_dict)
    if indices != set(range(ANIMA_BASE_BLOCKS)):
        raise RuntimeError(
            f"{lora_name} 은 2.9B에 바로 적용할 수 없습니다. "
            "원본 Anima 28블록 LoRA는 0–27 블록이 모두 있어야 하고, "
            "2.9B 전용 LoRA는 일반 LoRA로 적용됩니다."
        )
    remapped = {}
    for key, value in state_dict.items():
        remapped[_remap_legacy_key(str(key))] = value
    return remapped


def _apply_29b_lora(model, clip, lora_name, strength_model, strength_clip):
    lora_path = folder_paths.get_full_path_or_raise("loras", lora_name)
    loaded = comfy.utils.load_torch_file(lora_path, safe_load=True, return_metadata=True)
    if isinstance(loaded, tuple):
        state_dict, metadata = loaded
    else:
        state_dict, metadata = loaded, None
    converted = _prepare_29b_lora(state_dict, lora_name)
    model, clip = comfy.sd.load_lora_for_models(
        model, clip, converted, strength_model, strength_clip, lora_metadata=metadata,
    )
    return model, clip


def _apply_stack(model, clip, lora_stack):
    if not lora_stack:
        return model, clip
    loader = nodes.LoraLoader()
    for entry in lora_stack:
        lora_name, strength_model, strength_clip = entry
        lora_name = str(lora_name).replace("\\", "/")
        strength_model = float(strength_model)
        strength_clip = float(strength_clip)
        if strength_model == 0 and strength_clip == 0:
            continue
        if _is_anima_29b(model):
            model, clip = _apply_29b_lora(
                model, clip, lora_name, strength_model, strength_clip,
            )
        else:
            model, clip = loader.load_lora(
                model, clip, lora_name, strength_model, strength_clip,
            )
    return model, clip


def _join_prompt(*parts):
    texts = []
    for part in parts:
        text = str(part or "").strip().strip(",")
        if text:
            texts.append(text)
    return ", ".join(texts)


class AnimaModelLoader:
    @classmethod
    def INPUT_TYPES(cls):
        clip_types = nodes.CLIPLoader.INPUT_TYPES()["required"]["type"][0]
        return {
            "required": {
                "unet_name": (folder_paths.get_filename_list("diffusion_models"),),
                "weight_dtype": (["default", "fp8_e4m3fn", "fp8_e4m3fn_fast", "fp8_e5m2"],),
                "clip_name": (folder_paths.get_filename_list("text_encoders"),),
                "clip_type": (clip_types,),
                "clip_device": (["default", "cpu"],),
                "vae_name": (folder_paths.get_filename_list("vae"),),
            },
            "optional": {
                "lora_stack": ("LORA_STACK",),
            },
        }

    RETURN_TYPES = ("MODEL", "CLIP", "VAE", "STRING")
    RETURN_NAMES = ("model", "clip", "vae", "model_name")
    FUNCTION = "load"
    CATEGORY = "Anima/Loaders"
    DESCRIPTION = "Anima base와 Anima 2.9B UNET을 불러오고, LoRA 프리셋 스택을 모델에 맞게 적용합니다."

    def load(self, unet_name, weight_dtype, clip_name, clip_type, clip_device, vae_name, lora_stack=None):
        model = _load_unet(unet_name, weight_dtype)
        clip, = nodes.CLIPLoader().load_clip(clip_name, clip_type, clip_device)
        vae, = nodes.VAELoader().load_vae(vae_name)
        model, clip = _apply_stack(model, clip, lora_stack)
        return (model, clip, vae, unet_name)


class AnimaLoraPrompt:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompt": ("STRING", {"multiline": True, "default": ""}),
            },
            "optional": {
                "style_prompt": ("STRING", {"forceInput": True}),
                "trigger_words": ("STRING", {"forceInput": True}),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    FUNCTION = "join"
    CATEGORY = "Anima/Loaders"
    DESCRIPTION = "스타일 문장과 켜진 T+ 트리거를 긍정 프롬프트 앞에 붙입니다. 아래 칸에 합쳐진 문장이 보입니다."

    def join(self, prompt, style_prompt="", trigger_words=""):
        return (_join_prompt(style_prompt, trigger_words, prompt),)


NODE_CLASS_MAPPINGS = {
    "AnimaModelLoader": AnimaModelLoader,
    "AnimaLoraPrompt": AnimaLoraPrompt,
    "AnimaRegionBase": AnimaRegionBase,
    **_CAMERA_NODE_CLASS_MAPPINGS,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "AnimaModelLoader": "Anima 모델 로더",
    "AnimaLoraPrompt": "Anima LoRA 프롬프트",
    "AnimaRegionBase": "리전 기본 프롬프트",
    **_CAMERA_NODE_DISPLAY_NAME_MAPPINGS,
}

WEB_DIRECTORY = "./web"
register_routes()
