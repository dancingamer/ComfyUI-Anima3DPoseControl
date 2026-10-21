PRESETS = {
    "정면": (0.0, 0.0, 0.0, 0.0, 0.0),
    "왼쪽": (-0.5, 0.0, 0.0, 0.0, 0.0),
    "중앙": (0.0, 0.0, 0.25, 0.0, 0.0),
    "오른쪽": (0.5, 0.0, 0.0, 0.0, 0.0),
    "후면": (1.0, 0.0, 0.0, 0.0, 0.0),
}


def _clamp(value):
    return max(-1.0, min(1.0, float(value)))


def _view_phrase(degrees):
    side = abs(degrees)
    right = degrees > 0
    if side < 18:
        return "front view"
    if side < 70:
        return "front-right quarter view" if right else "front-left quarter view"
    if side < 112:
        return "right side view" if right else "left side view"
    if side < 162:
        return "back-right quarter view" if right else "back-left quarter view"
    return "back view"


def _lora_tags(degrees):
    side = abs(degrees)
    if side <= 90:
        side_weight = side / 90
        back_weight = 0.0
    else:
        side_weight = (180 - side) / 90
        back_weight = (side - 90) / 90
    tags = []
    if side_weight >= 0.2:
        name = "from_right" if degrees >= 0 else "from_left"
        tags.append(f"({name}:{side_weight:.2f})")
    if back_weight >= 0.2:
        tags.append(f"(from_behind:{back_weight:.2f})")
    return tags


def _elevation_phrase(pos_y):
    elevation = float(pos_y) * 90.0
    if elevation >= 35:
        return "high-angle shot"
    if elevation >= 12:
        return "elevated shot"
    if elevation <= -12:
        return "low-angle shot"
    return "eye-level shot"


def _distance_phrase(pos_z):
    pos_z = float(pos_z)
    if pos_z >= 0.45:
        return "close-up"
    if pos_z <= -0.45:
        return "wide shot"
    return "medium shot"


def angle_label(pos_x):
    degrees = int(round(abs(float(pos_x)) * 180))
    if degrees <= 8:
        return "정면"
    if degrees >= 170:
        return "후면"
    side = "오른쪽" if float(pos_x) > 0 else "왼쪽"
    return f"{side} {degrees}°"


def compose_camera_prompt(pos_x, pos_y, pos_z, roll, frame_y):
    pos_x = _clamp(pos_x)
    pos_y = _clamp(pos_y)
    pos_z = _clamp(pos_z)
    roll = _clamp(roll)
    frame_y = _clamp(frame_y)
    degrees = pos_x * 180.0
    tags = _lora_tags(degrees)
    tags.append(_view_phrase(degrees))
    tags.append(_elevation_phrase(pos_y))
    tags.append(_distance_phrase(pos_z))
    if abs(roll) >= 0.2:
        tags.append("dutch angle")
    if frame_y >= 0.25:
        tags.append("upper frame")
    elif frame_y <= -0.25:
        tags.append("lower frame")
    return ", ".join(tags) + ","


def apply_preset(name, pos_x, pos_y, pos_z, roll, frame_y):
    if name in PRESETS:
        return PRESETS[name]
    return (
        _clamp(pos_x),
        _clamp(pos_y),
        _clamp(pos_z),
        _clamp(roll),
        _clamp(frame_y),
    )


class AnimaCameraPanel:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "preset": (["직접 지정", *PRESETS], {"default": "직접 지정"}),
                "pos_x": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 1.0, "step": 0.01, "display": "slider"}),
                "pos_y": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 1.0, "step": 0.01, "display": "slider"}),
                "pos_z": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 1.0, "step": 0.01, "display": "slider"}),
                "roll": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 1.0, "step": 0.01, "display": "slider"}),
                "prompt": ("STRING", {"multiline": True, "default": ""}),
                "frame_y": ("FLOAT", {"default": 0.0, "min": -1.0, "max": 1.0, "step": 0.01, "display": "slider"}),
                "enabled": ("BOOLEAN", {"default": True}),
            }
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("camera_prompt", "combined_prompt")
    FUNCTION = "compose"
    CATEGORY = "Anima/Camera"
    DESCRIPTION = "구도 설정. 궤도 노브와 슬라이더로 시점 태그를 만들고 Anima 카메라 LoRA 프롬프트에 붙입니다."

    def compose(self, preset, pos_x, pos_y, pos_z, roll, prompt, frame_y, enabled):
        pos_x, pos_y, pos_z, roll, frame_y = apply_preset(preset, pos_x, pos_y, pos_z, roll, frame_y)
        body = (prompt or "").strip().strip(",")
        if not enabled:
            return ("", body)
        camera = compose_camera_prompt(pos_x, pos_y, pos_z, roll, frame_y)
        combined = f"{body}, {camera}" if body else camera
        return (camera, combined)


class AnimaCameraSource:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "source": (["BSK", "LAKIS"], {"default": "BSK"}),
            },
            "optional": {
                "bsk": ("STRING", {"forceInput": True}),
                "lakis": ("STRING", {"forceInput": True}),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("camera_prompt",)
    FUNCTION = "pick"
    CATEGORY = "Anima/Camera"
    DESCRIPTION = "BSK 카메라 문장과 구도 설정 문장 중 하나를 프롬프트 앞에 붙입니다."

    def pick(self, source, bsk="", lakis=""):
        chosen = bsk if source == "BSK" else lakis
        return (str(chosen or "").strip(),)


NODE_CLASS_MAPPINGS = {
    "AnimaCameraPanel": AnimaCameraPanel,
    "AnimaCameraSource": AnimaCameraSource,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "AnimaCameraPanel": "구도 설정",
    "AnimaCameraSource": "카메라 선택",
}
