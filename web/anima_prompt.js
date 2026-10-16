import {app} from "../../scripts/app.js";

function widget(node, name) {
    return node?.widgets?.find((item) => item.name === name);
}

function sourceNode(node, inputName) {
    const input = node.inputs?.find((item) => item.name === inputName);
    if (!input || input.link == null) {
        return null;
    }
    const link = node.graph?.links?.[input.link];
    if (!link) {
        return null;
    }
    return node.graph.getNodeById(link.origin_id);
}

function parseLoras(node) {
    const raw = widget(node, "loras")?.value;
    if (!raw) {
        return [];
    }
    try {
        const data = typeof raw === "string" ? JSON.parse(raw) : raw;
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

function clean(value) {
    return String(value || "").trim().replace(/^,+|,+$/g, "").trim();
}

app.registerExtension({
    name: "AnimaSeedLoader.PromptPreview",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "AnimaLoraPrompt") {
            return;
        }
        const created = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = created?.apply(this, arguments);
            const box = document.createElement("textarea");
            box.readOnly = true;
            box.placeholder = "스타일 태그와 켜진 T+ 트리거가 여기에 표시됩니다.";
            box.style.cssText = "width:100%;height:128px;box-sizing:border-box;background:#1b1e27;color:#d7dbe6;border:1px solid #3a4154;border-radius:8px;padding:8px;resize:vertical;font:12px/1.45 sans-serif;";
            const label = document.createElement("div");
            label.textContent = "적용될 프롬프트";
            label.style.cssText = "color:#9aa3b5;font:12px sans-serif;margin:0 0 4px;";
            const root = document.createElement("div");
            root.append(label, box);
            this.addDOMWidget("applied_prompt", "div", root, {
                serialize: false,
                getMinHeight: () => 160,
            });

            let timer = 0;
            let lastKey = "";
            const refresh = async () => {
                const preset = sourceNode(this, "style_prompt") || sourceNode(this, "trigger_words");
                const style = clean(widget(preset, "style_prompt")?.value);
                const loras = parseLoras(preset);
                const prompt = clean(widget(this, "prompt")?.value);
                const active = loras.filter((row) => row && row.on !== false && row.use_trigger_words !== false && row.name && row.name !== "None");
                const armedOff = loras.filter((row) => row && row.on === false && row.use_trigger_words !== false && row.name && row.name !== "None");
                const key = JSON.stringify({style, prompt, active: active.map((row) => row.name), off: armedOff.length});
                if (key === lastKey) {
                    return;
                }
                let triggers = [];
                let missing = [];
                if (active.length) {
                    const response = await fetch("/anima_seed/lora_triggers", {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({loras: active.map((row) => ({name: row.name}))}),
                    });
                    if (!response.ok) {
                        return;
                    }
                    const data = await response.json();
                    triggers = data.triggers || [];
                    missing = data.missing || [];
                }
                lastKey = key;
                const lines = [clean([style, triggers.join(", "), prompt].filter(Boolean).join(", "))];
                if (missing.length) {
                    lines.push("", "트리거 태그가 없는 LoRA: " + missing.join(", "));
                }
                if (!active.length && armedOff.length) {
                    lines.push("", "T+여도 왼쪽 토글이 꺼진 LoRA는 태그가 붙지 않습니다.");
                }
                box.value = lines.join("\n");
            };
            const tick = () => {
                timer = window.setTimeout(async () => {
                    try {
                        await refresh();
                    } catch {
                        lastKey = "";
                    }
                    tick();
                }, 700);
            };
            tick();
            const removed = this.onRemoved;
            this.onRemoved = function () {
                window.clearTimeout(timer);
                return removed?.apply(this, arguments);
            };
            if (this.size[1] < 360) {
                this.setSize([Math.max(this.size[0], 360), 360]);
            }
            return result;
        };
    },
});
