"""Preview helpers and the region base-prompt injector."""


def _trigger_words(names):
    from easyuse_anima.lora.metadata import _get_lora_info

    triggers = []
    seen = set()
    missing = []
    for name in names:
        _path, words = _get_lora_info(name)
        kept = []
        for word in words or []:
            text = str(word).strip()
            if text and text not in seen:
                seen.add(text)
                kept.append(text)
        if kept:
            triggers.extend(kept)
        else:
            missing.append(name.split("/")[-1])
    return triggers, missing


def register_routes():
    from aiohttp import web
    from server import PromptServer

    @PromptServer.instance.routes.post("/anima_seed/lora_triggers")
    async def lora_triggers(request):
        payload = await request.json()
        names = []
        for row in (payload.get("loras") or [])[:64]:
            if isinstance(row, dict):
                name = str(row.get("name") or "").strip()
            else:
                name = str(row or "").strip()
            if name and name != "None":
                names.append(name.replace("\\", "/"))
        triggers, missing = _trigger_words(names)
        return web.json_response({"triggers": triggers, "missing": missing})


class AnimaRegionBase:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "region": ("region",),
                "base_prompt": ("STRING", {"forceInput": True}),
            }
        }

    RETURN_TYPES = ("region",)
    RETURN_NAMES = ("region",)
    FUNCTION = "apply"
    CATEGORY = "Anima/Loaders"
    DESCRIPTION = "연결된 프롬프트를 리전 공통 기본 문장으로 붙입니다. 페인터의 Base 칸에 긴 문장을 쓰지 않아도 됩니다."

    def apply(self, region, base_prompt):
        text = str(base_prompt or "").strip().strip(",")
        chain = list(region or [])
        if not text:
            return (chain,)
        chain.append({"__comfycouple_chain_meta__": {"base_prompt_text": text}})
        return (chain,)
