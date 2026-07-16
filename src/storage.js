// Persistence + shareable resume links for a game in progress.
import { decodeState } from "./state.js";

const SAVE_KEY = "cr_save";
const SAVE_TIME_KEY = "cr_save_time";

export function saveSlotExists() {
    try {
        return !!localStorage.getItem(SAVE_KEY);
    } catch (e) {
        return false;
    }
}

export function readSaveSlot() {
    try {
        return decodeState(localStorage.getItem(SAVE_KEY));
    } catch (e) {
        return null;
    }
}

export function writeSaveSlot(code) {
    try {
        localStorage.setItem(SAVE_KEY, code);
        localStorage.setItem(SAVE_TIME_KEY, String(Date.now()));
    } catch (e) {
        /* storage may be unavailable */
    }
}

export function savedAtLabel() {
    try {
        const ts = parseInt(localStorage.getItem(SAVE_TIME_KEY) || "", 10);
        if (!ts) return "";
        const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
        let rel;
        if (s < 60) rel = "just now";
        else if (s < 3600) rel = `${Math.floor(s / 60)} min ago`;
        else if (s < 86400) rel = `${Math.floor(s / 3600)} hr ago`;
        else rel = `${Math.floor(s / 86400)} day${s < 172800 ? "" : "s"} ago`;
        return `last saved ${rel}`;
    } catch (e) {
        return "";
    }
}

export function buildResumeUrl(code) {
    const base = location.origin + location.pathname;
    return `${base}?s=${code}`;
}

// Strip the ?s= resume code from the address bar (e.g. back on the menu),
// leaving any other query params intact.
export function clearUrl() {
    try {
        const u = new URLSearchParams(location.search);
        u.delete("s");
        const q = u.toString();
        window.history.replaceState(null, "", location.pathname + (q ? "?" + q : ""));
    } catch (e) {
        /* ignore */
    }
}

// Forget the saved game entirely (used when a match finishes).
export function clearSavedGame() {
    try {
        localStorage.removeItem(SAVE_KEY);
        localStorage.removeItem(SAVE_TIME_KEY);
    } catch (e) {
        /* ignore */
    }
    clearUrl();
}

// Read a resume code from the URL (?s=...) at startup, if present.
export function resumeFromUrl() {
    try {
        const s = new URLSearchParams(location.search).get("s");
        return s ? decodeState(s) : null;
    } catch (e) {
        return null;
    }
}

// Remove any open save popup (also called on scene changes so it can't linger).
export function removeSaveModal() {
    const el = document.getElementById("cr-modal");
    if (el) el.remove();
}

// An HTML popup for the resume link. Kaplay handles canvas clicks in its render
// loop (no user-activation), so clipboard writes must happen inside a real DOM
// button handler — hence a DOM overlay rather than an in-canvas one. The link is
// also shown in a selectable field so it can always be copied manually.
export function showSaveModal(url) {
    removeSaveModal();
    const wrap = document.createElement("div");
    wrap.id = "cr-modal";
    wrap.style.cssText =
        "position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;" +
        "background:rgba(0,0,0,.72);font-family:system-ui,-apple-system,sans-serif;padding:16px;";
    const card = document.createElement("div");
    card.style.cssText =
        "background:#1c1e2a;border:2px solid #5a6078;border-radius:16px;padding:22px;width:100%;max-width:520px;" +
        "color:#eef;text-align:center;box-shadow:0 12px 48px rgba(0,0,0,.6);";
    const title = document.createElement("div");
    title.textContent = "✓ Game Saved";
    title.style.cssText = "font-size:24px;font-weight:700;margin-bottom:4px;color:#7fdca0;";
    const sub = document.createElement("div");
    sub.textContent = "Copy this link to continue the game later:";
    sub.style.cssText = "font-size:14px;color:#aab;margin-bottom:14px;";
    const input = document.createElement("input");
    input.readOnly = true;
    input.value = url;
    input.style.cssText =
        "width:100%;box-sizing:border-box;padding:11px;border-radius:9px;border:1px solid #454b60;" +
        "background:#0d0f18;color:#bfe3ff;font-size:13px;margin-bottom:12px;text-align:center;";
    const status = document.createElement("div");
    status.style.cssText = "font-size:14px;min-height:18px;margin-bottom:12px;color:#7fdca0;";
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:10px;";
    const copyBtn = document.createElement("button");
    copyBtn.textContent = "Copy Link";
    copyBtn.style.cssText =
        "flex:2;padding:13px;border:none;border-radius:10px;background:#2a86d6;color:#fff;font-size:16px;font-weight:600;cursor:pointer;";
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    closeBtn.style.cssText =
        "flex:1;padding:13px;border:none;border-radius:10px;background:#3a4055;color:#fff;font-size:16px;cursor:pointer;";

    function copyNow() {
        // this runs inside a real click handler -> user activation is present
        let ok = false;
        try {
            input.focus();
            input.select();
            input.setSelectionRange(0, url.length);
            ok = document.execCommand("copy");
        } catch (e) {
            ok = false;
        }
        if (ok) {
            status.textContent = "✓ Link copied to clipboard!";
            return;
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(
                () => (status.textContent = "✓ Link copied to clipboard!"),
                () => (status.textContent = "Press and hold the link above to copy it."),
            );
        } else {
            status.textContent = "Press and hold the link above to copy it.";
        }
    }
    copyBtn.addEventListener("click", copyNow);
    closeBtn.addEventListener("click", removeSaveModal);
    wrap.addEventListener("click", (e) => {
        if (e.target === wrap) removeSaveModal();
    });

    row.appendChild(copyBtn);
    row.appendChild(closeBtn);
    card.appendChild(title);
    card.appendChild(sub);
    card.appendChild(input);
    card.appendChild(status);
    card.appendChild(row);
    wrap.appendChild(card);
    document.body.appendChild(wrap);
}
