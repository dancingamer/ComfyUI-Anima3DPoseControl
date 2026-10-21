"""Apply an Anima 3D-pose patch on both the 28-block base and Anima 2.9B.

A pose patch trained on the base model names its blocks 0–27. Anima 2.9B has
40 blocks, with 12 new blocks inserted between the original ones. This node
sends each original block's pose residual to that block's 2.9B index.
Inserted blocks are skipped until a LoRA is already on the model. The LoRA
lands on the original blocks only, and the untouched inserted blocks then
wash the pose out, so those blocks repeat the previous original residual.
A LoRA on the self-attention projections rotates that residual, so those
projections keep the base weight while the LoRA stays on the other layers.
"""

import torch
import uuid

import comfy.ldm.anima.lllite as lllite
from comfy_extras.nodes_model_patch import AnimaLLLiteApply

_PREFIX = "lllite_dit_blocks_"


def _pose_block_indices(model_patch):
    names = getattr(getattr(model_patch, "model", None), "module_names", None)
    if not names:
        return None
    indices = set()
    for name in names:
        text = str(name)
        if not text.startswith(_PREFIX):
            continue
        number = text[len(_PREFIX):].split("_", 1)[0]
        if number.isdigit():
            indices.add(int(number))
    return indices


def _legacy_index_map(model, model_patch):
    indices = _pose_block_indices(model_patch)
    if not indices or any(index >= 28 for index in indices):
        return None
    config = getattr(getattr(model, "model", None), "model_config", None)
    unet_config = getattr(config, "unet_config", None)
    if not isinstance(unet_config, dict) or unet_config.get("image_model") != "anima":
        return None
    if unet_config.get("num_blocks") != 40:
        return None
    from . import ANIMA_29B_BLOCKS, ANIMA_29B_LEGACY_MAP
    inverse = {new: old for old, new in enumerate(ANIMA_29B_LEGACY_MAP)}
    if not getattr(model, "patches", None):
        return inverse
    filled = {}
    previous = inverse[ANIMA_29B_LEGACY_MAP[0]]
    for index in range(ANIMA_29B_BLOCKS):
        if index in inverse:
            previous = inverse[index]
        filled[index] = previous
    return filled


class _MappedAttention:
    def __init__(self, inner, index_map):
        self.inner = inner
        self.index_map = index_map

    def __call__(self, q, k, v, pe=None, attn_mask=None, extra_options=None):
        extra_options = extra_options or {}
        mapped = self.index_map.get(extra_options.get("block_index"))
        if mapped is None:
            return {"q": q, "k": k, "v": v, "pe": pe, "attn_mask": attn_mask}
        forwarded = extra_options
        if mapped != extra_options.get("block_index"):
            forwarded = dict(extra_options)
            forwarded["block_index"] = mapped
        return self.inner(q, k, v, pe=pe, attn_mask=attn_mask, extra_options=forwarded)


_POSE_LORA_PARTS = (
    "self_attn.q_proj",
    "self_attn.k_proj",
    "self_attn.v_proj",
    "self_attn.output_proj",
    "adaln_modulation_self_attn",
)


def _drop_pose_layer_loras(model):
    removed = False
    for key in list(model.patches):
        if any(part in key for part in _POSE_LORA_PARTS):
            del model.patches[key]
            removed = True
    if removed:
        model.patches_uuid = uuid.uuid4()


class _MappedMLP:
    def __init__(self, inner, index_map):
        self.inner = inner
        self.index_map = index_map

    def __call__(self, args):
        options = args.get("transformer_options") or {}
        mapped = self.index_map.get(options.get("block_index"))
        if mapped is None:
            return args
        if mapped != options.get("block_index"):
            forwarded = dict(args)
            forwarded["transformer_options"] = dict(options)
            forwarded["transformer_options"]["block_index"] = mapped
            args = forwarded
        return self.inner(args)


class AnimaPoseApply:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "model_patch": ("MODEL_PATCH",),
                "image": ("IMAGE",),
                "strength": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.01}),
                "start_percent": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.001}),
                "end_percent": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.001}),
            },
            "optional": {"mask": ("MASK",)},
        }

    RETURN_TYPES = ("MODEL",)
    FUNCTION = "apply_patch"
    CATEGORY = "Anima/Pose"
    DESCRIPTION = "3D 포즈 패치를 Anima base와 Anima 2.9B에 적용합니다. 28블록용 패치는 2.9B의 원래 블록 위치로 옮겨 붙입니다."

    def apply_patch(self, model, model_patch, image, strength, start_percent, end_percent, mask=None):
        index_map = _legacy_index_map(model, model_patch)
        if index_map is None:
            return AnimaLLLiteApply().apply_patch(
                model, model_patch, image, strength, start_percent, end_percent, mask=mask,
            )

        image = image[..., :3]
        if model_patch.model.cond_in_channels == 4 and mask is None:
            mask = torch.zeros_like(image[..., 0])
        elif model_patch.model.cond_in_channels != 4:
            mask = None

        model_sampling = model.get_model_object("model_sampling")
        sigma_start = float(model_sampling.percent_to_sigma(start_percent))
        sigma_end = float(model_sampling.percent_to_sigma(end_percent))
        patch = lllite.AnimaLLLitePatch(model_patch, image, mask, strength, sigma_start, sigma_end)
        model_patched = model.clone()
        if model_patched.patches:
            _drop_pose_layer_loras(model_patched)
        model_patched.set_model_post_input_patch(patch)
        model_patched.set_model_attn1_patch(_MappedAttention(lllite.AnimaLLLiteAttentionPatch(
            patch,
            {"q": "self_attn_q_proj", "k": "self_attn_k_proj", "v": "self_attn_v_proj"},
        ), index_map))
        model_patched.set_model_attn2_patch(_MappedAttention(lllite.AnimaLLLiteAttentionPatch(
            patch,
            {"q": "cross_attn_q_proj"},
        ), index_map))
        model_patched.set_model_patch(_MappedMLP(lllite.AnimaLLLiteMLPPatch(patch), index_map), "mlp_patch")
        return (model_patched,)
