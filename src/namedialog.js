// A small DOM dialog for entering custom player names. Like the save modal
// (storage.js), this lives outside the kaplay canvas because a real <input> gives
// proper keyboard/focus handling that an in-canvas field can't. Names are
// device-local (kept in prefs, not in the shareable save link).
import { colors } from "./theme.js";

const MODAL_ID = "cr-name-modal";
const NAME_MAX = 12;

export function removeNameModal() {
    const el = document.getElementById(MODAL_ID);
    if (el) el.remove();
}

// showNameModal(count, names, onSave): one row per player slot; onSave receives a
// trimmed, length-capped array aligned to player index.
export function showNameModal(count, names, onSave) {
    removeNameModal();
    const wrap = document.createElement("div");
    wrap.id = MODAL_ID;
    wrap.style.cssText =
        "position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;" +
        "background:rgba(0,0,0,.72);font-family:system-ui,-apple-system,sans-serif;padding:16px;";
    const card = document.createElement("div");
    card.style.cssText =
        "background:#1c1e2a;border:2px solid #5a6078;border-radius:16px;padding:22px;width:100%;max-width:460px;" +
        "max-height:80vh;overflow:auto;color:#eef;box-shadow:0 12px 48px rgba(0,0,0,.6);";
    const title = document.createElement("div");
    title.textContent = "Player names";
    title.style.cssText = "font-size:23px;font-weight:700;margin-bottom:4px;text-align:center;";
    const sub = document.createElement("div");
    sub.textContent = "Leave blank for the default. Saved on this device.";
    sub.style.cssText = "font-size:13px;color:#aab;margin-bottom:16px;text-align:center;";
    card.appendChild(title);
    card.appendChild(sub);

    const inputs = [];
    for (let i = 0; i < count; i++) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:11px;margin-bottom:11px;";
        const dot = document.createElement("span");
        const c = colors[i];
        dot.style.cssText = `flex:0 0 auto;width:18px;height:18px;border-radius:50%;background:rgb(${c.r},${c.g},${c.b});`;
        const input = document.createElement("input");
        input.type = "text";
        input.maxLength = NAME_MAX;
        input.placeholder = `Player ${i + 1}`;
        input.value = (names && names[i]) || "";
        input.style.cssText =
            "flex:1;box-sizing:border-box;padding:11px;border-radius:9px;border:1px solid #454b60;" +
            "background:#0d0f18;color:#eef;font-size:16px;";
        inputs.push(input);
        row.appendChild(dot);
        row.appendChild(input);
        card.appendChild(row);
    }

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:10px;margin-top:6px;";
    const saveBtn = document.createElement("button");
    saveBtn.textContent = "Save";
    saveBtn.style.cssText =
        "flex:2;padding:13px;border:none;border-radius:10px;background:#2a86d6;color:#fff;font-size:16px;font-weight:600;cursor:pointer;";
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.cssText =
        "flex:1;padding:13px;border:none;border-radius:10px;background:#3a4055;color:#fff;font-size:16px;cursor:pointer;";
    btnRow.appendChild(saveBtn);
    btnRow.appendChild(cancelBtn);
    card.appendChild(btnRow);

    saveBtn.addEventListener("click", () => {
        const arr = inputs.map((el) => el.value.trim().slice(0, NAME_MAX));
        if (typeof onSave === "function") onSave(arr);
        removeNameModal();
    });
    cancelBtn.addEventListener("click", removeNameModal);
    wrap.addEventListener("click", (e) => {
        if (e.target === wrap) removeNameModal();
    });

    wrap.appendChild(card);
    document.body.appendChild(wrap);
    if (inputs[0]) inputs[0].focus();
}
