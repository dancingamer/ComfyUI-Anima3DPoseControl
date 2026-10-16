import {app} from "../../scripts/app.js";

const PRESETS = {
    "정면": [0, 0, 0, 0, 0],
    "왼쪽": [-0.5, 0, 0, 0, 0],
    "중앙": [0, 0, 0.25, 0, 0],
    "오른쪽": [0.5, 0, 0, 0, 0],
    "후면": [1, 0, 0, 0, 0],
};

const AXES = [
    ["pos_x", "X · 좌우"],
    ["pos_y", "Y · 상하"],
    ["pos_z", "Z · 거리"],
    ["roll", "R · 롤"],
    ["frame_y", "Frame Y"],
];

function widget(node, name) {
    return node.widgets?.find((item) => item.name === name);
}

function hide(node, name) {
    const item = widget(node, name);
    if (!item) {
        return;
    }
    item.hidden = true;
    item.computeSize = () => [0, -4];
}

function setValue(node, name, value) {
    const item = widget(node, name);
    if (!item) {
        return;
    }
    item.value = value;
    item.callback?.(value);
}

function clamp(value) {
    return Math.max(-1, Math.min(1, value));
}

function current(node) {
    return {
        x: Number(widget(node, "pos_x")?.value ?? 0),
        y: Number(widget(node, "pos_y")?.value ?? 0),
        z: Number(widget(node, "pos_z")?.value ?? 0),
        roll: Number(widget(node, "roll")?.value ?? 0),
        frameY: Number(widget(node, "frame_y")?.value ?? 0),
        enabled: widget(node, "enabled")?.value !== false,
        prompt: String(widget(node, "prompt")?.value ?? ""),
    };
}

function angleLabel(x) {
    const degrees = Math.round(Math.abs(x) * 180);
    if (degrees <= 8) {
        return "정면";
    }
    if (degrees >= 170) {
        return "후면";
    }
    return `${x > 0 ? "오른쪽" : "왼쪽"} ${degrees}°`;
}

function drawOrbit(canvas, values) {
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height * 0.52;
    const rx = width * 0.34 * (1 - values.z * 0.12);
    const ry = rx * 0.36;
    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.35);
    ctx.strokeStyle = "rgba(214, 146, 92, 0.85)";
    ctx.setLineDash([5, 6]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * 0.72, rx * 1.05, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = "rgba(90, 214, 206, 0.9)";
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    const markers = [
        ["B", cx, cy - ry],
        ["F", cx, cy + ry],
        ["R", cx - rx, cy],
        ["L", cx + rx, cy],
    ];
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const [label, px, py] of markers) {
        ctx.fillStyle = "#7ef0ea";
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#d5f7f5";
        const ox = label === "R" ? -14 : label === "L" ? 14 : 0;
        const oy = label === "B" ? -12 : label === "F" ? 12 : 0;
        ctx.fillText(label, px + ox, py + oy);
    }

    ctx.strokeStyle = "#9fd8ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy - 16, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - 8);
    ctx.lineTo(cx, cy + 12);
    ctx.moveTo(cx - 10, cy);
    ctx.lineTo(cx + 10, cy);
    ctx.moveTo(cx, cy + 12);
    ctx.lineTo(cx - 8, cy + 24);
    ctx.moveTo(cx, cy + 12);
    ctx.lineTo(cx + 8, cy + 24);
    ctx.stroke();

    const azimuth = values.x * Math.PI;
    const elevation = values.y * Math.PI / 2;
    const knobX = cx + Math.sin(azimuth) * Math.cos(elevation) * rx;
    const knobY = cy + Math.cos(azimuth) * Math.cos(elevation) * ry - Math.sin(elevation) * rx * 0.55;
    ctx.strokeStyle = "rgba(255, 186, 120, 0.85)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(knobX, knobY);
    ctx.stroke();
    ctx.fillStyle = "#141820";
    ctx.strokeStyle = "#ffb15a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(knobX - 8, knobY - 6, 16, 12, 3);
    ctx.fill();
    ctx.stroke();
}

function buildPanel() {
    const root = document.createElement("div");
    root.className = "lakis-composition";
    root.innerHTML = `
        <style>
            .lakis-composition { background:#12141c; color:#d7dbe6; border:1px solid #2a3142; border-radius:14px; padding:12px 14px 14px; font:12px/1.45 "Segoe UI", sans-serif; box-sizing:border-box; }
            .lakis-composition * { box-sizing:border-box; }
            .lakis-head { display:flex; align-items:center; gap:8px; }
            .lakis-head strong { font-size:16px; letter-spacing:-0.02em; }
            .lakis-head .spacer { flex:1; }
            .lakis-switch { position:relative; width:36px; height:20px; }
            .lakis-switch input { opacity:0; width:0; height:0; }
            .lakis-switch span { position:absolute; inset:0; background:#343846; border-radius:99px; transition:0.15s; }
            .lakis-switch span:before { content:""; position:absolute; width:16px; height:16px; left:2px; top:2px; background:#e8eaf2; border-radius:50%; transition:0.15s; }
            .lakis-switch input:checked + span { background:#3b82f6; }
            .lakis-switch input:checked + span:before { transform:translateX(16px); }
            .lakis-reset { background:#1c2230; color:#d7dbe6; border:1px solid #343c4e; border-radius:8px; padding:4px 10px; cursor:pointer; }
            .lakis-note { color:#8b93a7; margin:6px 0 8px; }
            .lakis-composition canvas { width:100%; height:210px; display:block; cursor:crosshair; border-radius:10px; }
            .lakis-meta { display:flex; justify-content:space-between; gap:12px; color:#9aa3b5; margin-top:4px; }
            .lakis-meta b { color:#e2b15a; font-weight:600; }
            .lakis-row { display:grid; grid-template-columns:72px 1fr 48px; align-items:center; gap:8px; margin:7px 0; }
            .lakis-row span:last-child { text-align:right; font-variant-numeric:tabular-nums; color:#d7dbe6; }
            .lakis-row input[type=range] { -webkit-appearance:none; appearance:none; height:8px; border-radius:99px; background:linear-gradient(90deg,#7c6cff var(--p), #2c3344 var(--p)); outline:none; }
            .lakis-row input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:16px; height:16px; border-radius:50%; background:#f4f1ff; border:2px solid #8d7dff; }
            .lakis-preview { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-top:8px; }
            .lakis-preview em { color:#8b93a7; font-style:normal; margin-right:4px; }
            .lakis-preview button, .lakis-extra input { background:#1c2230; color:#d7dbe6; border:1px solid #343c4e; border-radius:8px; }
            .lakis-preview button { padding:4px 10px; cursor:pointer; }
            .lakis-preview button.active { border-color:#7c6cff; color:#fff; }
            .lakis-extra { margin-top:8px; }
            .lakis-extra input { width:100%; padding:6px 8px; }
            .lakis-composition.off { opacity:0.55; }
        </style>
        <div class="lakis-head">
            <strong>구도 설정</strong>
            <div class="spacer"></div>
            <label class="lakis-switch" title="구도 적용"><input data-enabled type="checkbox" checked><span></span></label>
            <button type="button" class="lakis-reset" data-reset>초기화</button>
        </div>
        <div class="lakis-note">노브를 드래그해 시점을 이동하고, 휠로 거리를 조절합니다.</div>
        <canvas width="640" height="420"></canvas>
        <div class="lakis-meta">
            <div>좌드래그 · 카메라<br>우드래그 / ALT · 보기 회전</div>
            <div><b data-angle>정면</b><br>휠 · 거리</div>
        </div>
        <div data-sliders></div>
        <div class="lakis-preview"><em>프리뷰</em><span data-presets></span></div>
        <label class="lakis-extra">추가 프롬프트<input data-prompt type="text" placeholder="캐릭터 설명. 비우면 구도 태그만 사용합니다."></label>
    `;
    return root;
}

app.registerExtension({
    name: "AnimaPoseCamera.Composition",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "AnimaCameraPanel") {
            return;
        }
        const created = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = created?.apply(this, arguments);
            for (const name of ["preset", "pos_x", "pos_y", "pos_z", "roll", "prompt", "frame_y", "enabled"]) {
                hide(this, name);
            }
            const root = buildPanel();
            const canvas = root.querySelector("canvas");
            const sliders = {};
            const readouts = {};
            const sliderBox = root.querySelector("[data-sliders]");
            for (const [name, label] of AXES) {
                const row = document.createElement("label");
                row.className = "lakis-row";
                row.innerHTML = `<span>${label}</span><input data-axis="${name}" type="range" min="-1" max="1" step="0.01"><span data-readout>0.00</span>`;
                sliderBox.appendChild(row);
                sliders[name] = row.querySelector("input");
                readouts[name] = row.querySelector("[data-readout]");
            }
            const enabledInput = root.querySelector("[data-enabled]");
            const promptInput = root.querySelector("[data-prompt]");
            const angle = root.querySelector("[data-angle]");
            const presetBox = root.querySelector("[data-presets]");
            const presetButtons = {};

            const refresh = () => {
                const values = current(this);
                root.classList.toggle("off", !values.enabled);
                enabledInput.checked = values.enabled;
                promptInput.value = values.prompt;
                const percent = {
                    pos_x: values.x,
                    pos_y: values.y,
                    pos_z: values.z,
                    roll: values.roll,
                    frame_y: values.frameY,
                };
                for (const name of Object.keys(sliders)) {
                    sliders[name].value = percent[name];
                    sliders[name].style.setProperty("--p", `${((percent[name] + 1) / 2) * 100}%`);
                    readouts[name].textContent = Number(percent[name]).toFixed(2);
                }
                angle.textContent = angleLabel(values.x);
                drawOrbit(canvas, values);
                const preset = widget(this, "preset")?.value;
                for (const [name, button] of Object.entries(presetButtons)) {
                    button.classList.toggle("active", name === preset);
                }
            };

            const writeAxis = (name, value) => {
                setValue(this, "preset", "직접 지정");
                setValue(this, name, clamp(value));
                refresh();
            };

            for (const [name] of AXES) {
                sliders[name].addEventListener("input", () => writeAxis(name, Number(sliders[name].value)));
            }
            enabledInput.addEventListener("change", () => {
                setValue(this, "enabled", enabledInput.checked);
                refresh();
            });
            promptInput.addEventListener("input", () => {
                setValue(this, "prompt", promptInput.value);
            });
            root.querySelector("[data-reset]").addEventListener("click", () => {
                setValue(this, "preset", "직접 지정");
                for (const name of ["pos_x", "pos_y", "pos_z", "roll", "frame_y"]) {
                    setValue(this, name, 0);
                }
                refresh();
            });
            for (const name of Object.keys(PRESETS)) {
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = name;
                button.addEventListener("click", () => {
                    const [x, y, z, roll, frameY] = PRESETS[name];
                    setValue(this, "preset", name);
                    setValue(this, "pos_x", x);
                    setValue(this, "pos_y", y);
                    setValue(this, "pos_z", z);
                    setValue(this, "roll", roll);
                    setValue(this, "frame_y", frameY);
                    refresh();
                });
                presetBox.appendChild(button);
                presetButtons[name] = button;
            }

            let drag = null;
            canvas.addEventListener("pointerdown", (event) => {
                event.preventDefault();
                event.stopPropagation();
                canvas.setPointerCapture(event.pointerId);
                const values = current(this);
                drag = {
                    button: event.button,
                    alt: event.altKey,
                    x: event.clientX,
                    roll: values.roll,
                };
                if (event.button !== 2 && !event.altKey) {
                    aim(event);
                }
            });
            const aim = (event) => {
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;
                const px = (event.clientX - rect.left) * scaleX;
                const py = (event.clientY - rect.top) * scaleY;
                const cx = canvas.width / 2;
                const cy = canvas.height * 0.52;
                const rx = canvas.width * 0.34;
                const azimuth = Math.atan2(px - cx, py - cy);
                const elevation = (cy - py) / (rx * 0.9);
                writeAxis("pos_x", azimuth / Math.PI);
                setValue(this, "pos_y", clamp(elevation));
                refresh();
            };
            canvas.addEventListener("pointermove", (event) => {
                if (!drag) {
                    return;
                }
                if (drag.button === 2 || drag.alt || event.altKey) {
                    writeAxis("roll", drag.roll + (event.clientX - drag.x) / 180);
                    return;
                }
                aim(event);
            });
            canvas.addEventListener("pointerup", () => {
                drag = null;
            });
            canvas.addEventListener("contextmenu", (event) => event.preventDefault());
            canvas.addEventListener("wheel", (event) => {
                event.preventDefault();
                event.stopPropagation();
                const values = current(this);
                writeAxis("pos_z", values.z + (event.deltaY > 0 ? -0.04 : 0.04));
            }, {passive: false});
            root.addEventListener("pointerdown", (event) => event.stopPropagation());

            this.addDOMWidget("lakis_composition", "div", root, {
                serialize: false,
                getMinHeight: () => 700,
            });
            this.setSize([440, 820]);
            refresh();
            const configure = this.onConfigure;
            this.onConfigure = function () {
                configure?.apply(this, arguments);
                refresh();
            };
            return result;
        };
    },
});
