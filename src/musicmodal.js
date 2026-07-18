// A single "Sound" popup holding every audio option: master volume, SFX on/off,
// music on/off, and a track picker (shuffle-all or a specific song, which starts
// playing immediately). Same DOM-overlay pattern as the other dialogs.
import * as audio from "./audio.js";

const MODAL_ID = "cr-music-modal";

export function removeMusicModal() {
    const el = document.getElementById(MODAL_ID);
    if (el) el.remove();
}

export function showMusicModal(onChange) {
    removeMusicModal();
    const save = () => typeof onChange === "function" && onChange();

    const wrap = document.createElement("div");
    wrap.id = MODAL_ID;
    wrap.style.cssText =
        "position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;" +
        "background:rgba(0,0,0,.72);font-family:system-ui,-apple-system,sans-serif;padding:16px;";
    const card = document.createElement("div");
    card.style.cssText =
        "background:#1c1e2a;border:2px solid #5a6078;border-radius:16px;padding:22px;width:100%;max-width:460px;" +
        "max-height:84vh;overflow:auto;color:#eef;box-shadow:0 12px 48px rgba(0,0,0,.6);";
    const title = document.createElement("div");
    title.textContent = "Sound";
    title.style.cssText = "font-size:23px;font-weight:700;margin-bottom:16px;text-align:center;";
    card.appendChild(title);

    // ---- Volume ----
    const volLabel = document.createElement("div");
    volLabel.style.cssText = "font-size:14px;color:#aab;margin-bottom:6px;";
    const vol = document.createElement("input");
    vol.type = "range";
    vol.min = "0";
    vol.max = "100";
    vol.value = String(Math.round(audio.getVolume() * 100));
    vol.style.cssText = "width:100%;margin-bottom:16px;accent-color:#2a86d6;";
    const setVolLabel = () => (volLabel.textContent = `Volume: ${vol.value}%`);
    setVolLabel();
    vol.addEventListener("input", () => {
        audio.setVolume(vol.value / 100);
        setVolLabel();
        save();
    });
    card.appendChild(volLabel);
    card.appendChild(vol);

    // ---- SFX + Music toggles (side by side) ----
    const toggleRow = document.createElement("div");
    toggleRow.style.cssText = "display:flex;gap:10px;margin-bottom:16px;";
    function toggleBtn(label, get, set) {
        const b = document.createElement("button");
        b.style.cssText = "flex:1;padding:12px;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;";
        const sync = () => {
            const on = get();
            b.textContent = `${label}: ${on ? "On" : "Off"}`;
            b.style.background = on ? "#1e402f" : "#3a4055";
            b.style.color = on ? "#7fdca0" : "#cfd4e0";
        };
        b.addEventListener("click", () => {
            set(!get());
            sync();
            syncTracks();
            save();
        });
        sync();
        b._sync = sync;
        toggleRow.appendChild(b);
        return b;
    }
    const sfxBtn = toggleBtn("SFX", () => audio.isSfxOn(), (v) => audio.setSfx(v));
    const musicBtn = toggleBtn("Music", () => audio.isMusicOn(), (v) => audio.setMusic(v));
    card.appendChild(toggleRow);

    // ---- Track picker ----
    const listLabel = document.createElement("div");
    listLabel.textContent = "TRACK";
    listLabel.style.cssText = "font-size:12px;letter-spacing:2px;color:#8a91a3;margin-bottom:8px;font-weight:700;";
    card.appendChild(listLabel);

    const rows = [];
    function addRow(label, mode) {
        const r = document.createElement("button");
        r.style.cssText =
            "display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:12px 14px;margin-bottom:8px;" +
            "border-radius:10px;font-size:16px;cursor:pointer;border:1px solid #454b60;background:#0d0f18;color:#eef;";
        const dot = document.createElement("span");
        dot.style.cssText = "flex:0 0 auto;width:9px;height:9px;border-radius:50%;background:#454b60;";
        const txt = document.createElement("span");
        txt.textContent = label;
        txt.style.flex = "1";
        const now = document.createElement("span");
        now.textContent = "▶ playing";
        now.style.cssText = "font-size:13px;color:#7fdca0;font-weight:600;display:none;";
        r.appendChild(dot);
        r.appendChild(txt);
        r.appendChild(now);
        r.addEventListener("click", () => {
            audio.selectTrack(mode); // enables music + plays immediately
            musicBtn._sync();
            syncTracks();
            save();
        });
        card.appendChild(r);
        rows.push({ dot, now, r, mode });
    }
    addRow("🔀 Shuffle all", -1);
    audio.getTrackNames().forEach((name, i) => addRow(name, i));

    function syncTracks() {
        const on = audio.isMusicOn();
        const mode = audio.getTrackMode();
        rows.forEach(({ dot, now, r, mode: m }) => {
            const sel = m === mode;
            r.style.borderColor = sel ? "#2a86d6" : "#454b60";
            r.style.background = sel ? "#12233a" : "#0d0f18";
            dot.style.background = sel ? "#2a86d6" : "#454b60";
            now.style.display = sel && on ? "inline" : "none";
        });
    }
    syncTracks();

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Done";
    closeBtn.style.cssText =
        "width:100%;padding:13px;border:none;border-radius:10px;background:#2a86d6;color:#fff;font-size:16px;font-weight:600;cursor:pointer;margin-top:6px;";
    closeBtn.addEventListener("click", removeMusicModal);
    card.appendChild(closeBtn);

    wrap.addEventListener("click", (e) => {
        if (e.target === wrap) removeMusicModal();
    });
    wrap.appendChild(card);
    document.body.appendChild(wrap);
}
