import {app} from "../../scripts/app.js";

function widget(node, name) {
    return node?.widgets?.find((item) => item.name === name);
}

function sourceNode(node, inputName) {
    const index = node?.inputs?.findIndex((item) => item?.name === inputName) ?? -1;
    if (index >= 0 && typeof node.getInputNode === "function") {
        try {
            const found = node.getInputNode(index);
            if (found) {
                return found;
            }
        } catch {
            return null;
        }
    }
    const input = node?.inputs?.find((item) => item?.name === inputName);
    if (!input || input.link == null || !node.graph) {
        return null;
    }
    const links = node.graph.links;
    const link = links?.get?.(input.link) || links?.[input.link];
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

function profileStyle(preset) {
    const index = String(widget(preset, "profile_index")?.value || "1");
    let data = widget(preset, "profile_data")?.value;
    try {
        data = typeof data === "string" ? JSON.parse(data || "{}") : (data || {});
    } catch {
        data = {};
    }
    const profile = data?.[index];
    return clean(profile?.style_prompt);
}

function isCamera(node) {
    const name = node?.comfyClass || node?.constructor?.comfyClass || node?.type;
    return name === "CameraControlNode";
}

function nodeClass(node) {
    return node?.comfyClass || node?.constructor?.comfyClass || node?.type || "";
}

function cameraPrompt(node) {
    const core = window.BskCameraCore;
    if (!isCamera(node) || !core) {
        return "";
    }
    const number = (name) => {
        const value = parseFloat(widget(node, name)?.value);
        return Number.isFinite(value) ? value : 0;
    };
    const config = core.loadConfig(widget(node, "config")?.value);
    return clean(core.computePrompt(number("pos_x"), number("pos_y"), number("pos_z"), number("roll"), config));
}

function lakisPrompt(node) {
    if (nodeClass(node) !== "AnimaCameraPanel" || widget(node, "enabled")?.value === false) {
        return "";
    }
    const tags = window.AnimaLakisCamera?.tags;
    if (!tags) {
        return "";
    }
    const number = (name) => {
        const value = parseFloat(widget(node, name)?.value);
        return Number.isFinite(value) ? value : 0;
    };
    return clean(tags(number("pos_x"), number("pos_y"), number("pos_z"), number("roll"), number("frame_y")));
}

function activeCamera(node) {
    const source = sourceNode(node, "camera_prompt");
    if (nodeClass(source) !== "AnimaCameraSource") {
        return source;
    }
    const choice = String(widget(source, "source")?.value || "BSK");
    return sourceNode(source, choice === "LAKIS" ? "lakis" : "bsk");
}

function cameraText(node) {
    const selected = activeCamera(node);
    if (isCamera(selected)) {
        return cameraPrompt(selected);
    }
    return lakisPrompt(selected);
}

function promptInput(item) {
    return item?.inputEl || item?.element?.querySelector?.("textarea") || null;
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
            box.style.cssText = "flex:1 1 auto;width:100%;min-height:120px;box-sizing:border-box;background:#1b1e27;color:#d7dbe6;border:1px solid #3a4154;border-radius:8px;padding:8px;resize:none;overflow:auto;font:12px/1.45 sans-serif;";
            const label = document.createElement("div");
            label.textContent = "적용될 프롬프트";
            label.style.cssText = "flex:0 0 auto;color:#9aa3b5;font:12px sans-serif;margin:0 0 4px;";
            const root = document.createElement("div");
            root.style.cssText = "display:flex;flex-direction:column;width:100%;height:100%;min-height:0;box-sizing:border-box;";
            root.append(label, box);
            this.addDOMWidget("applied_prompt", "div", root, {
                serialize: false,
                getMinHeight: () => 160,
            });

            const promptWidget = widget(this, "prompt");
            this._ownPrompt = String(promptWidget?.value || "");
            if (promptWidget) {
                const node = this;
                promptWidget.serializeValue = () => node._ownPrompt || "";
            }
            const applied = widget(this, "applied_prompt");
            if (applied) {
                applied.serialize = false;
            }

            let timer = 0;
            let lastKey = "";
            const refresh = async () => {
                const preset = sourceNode(this, "style_prompt") || sourceNode(this, "trigger_words");
                const typedStyle = clean(widget(preset, "style_prompt")?.value);
                const style = typedStyle || profileStyle(preset);
                const loras = parseLoras(preset);
                const camera = cameraText(this);
                const promptInputEl = promptInput(promptWidget);
                if (promptInputEl && !promptInputEl.dataset.animaBound) {
                    promptInputEl.dataset.animaBound = "1";
                    promptInputEl.addEventListener("focus", () => {
                        promptInputEl.value = this._ownPrompt || "";
                    });
                    promptInputEl.addEventListener("input", () => {
                        this._ownPrompt = promptInputEl.value;
                        if (promptWidget) {
                            promptWidget.value = this._ownPrompt;
                        }
                        lastKey = "";
                    });
                }
                const storedPrompt = clean(promptWidget?.value);
                if (!this._ownPrompt && storedPrompt) {
                    this._ownPrompt = storedPrompt;
                }
                const ownPrompt = document.activeElement === promptInputEl
                    ? clean(promptInputEl.value)
                    : clean(this._ownPrompt);
                const active = loras.filter((row) => row && row.on !== false && row.use_trigger_words !== false && row.name && row.name !== "None");
                const armedOff = loras.filter((row) => row && row.on === false && row.use_trigger_words !== false && row.name && row.name !== "None");
                const key = JSON.stringify({camera, style, ownPrompt, active: active.map((row) => row.name), off: armedOff.length, focused: document.activeElement === promptInputEl});
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
                const shown = clean([camera, style, triggers.join(", "), ownPrompt].filter(Boolean).join(", "));
                if (promptInputEl && document.activeElement !== promptInputEl) {
                    promptInputEl.value = shown;
                    if (promptWidget) {
                        promptWidget.value = this._ownPrompt || "";
                    }
                }
                const lines = [shown];
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
            const configured = this.onConfigure;
            this.onConfigure = function () {
                const result = configured?.apply(this, arguments);
                const loaded = String(widget(this, "prompt")?.value || "");
                if (loaded) {
                    this._ownPrompt = loaded;
                }
                lastKey = "";
                return result;
            };
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
