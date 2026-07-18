// A small credit line pinned to the bottom of the how-to ("?") screen, as a real
// DOM overlay so the ❤️ emoji renders and the links are natively clickable
// (canvas clicks run in kaplay's render loop and can be popup-blocked). The
// container ignores pointer events; only the <a> links are clickable, so it
// never swallows taps meant for the canvas.
const ID = "cr-credit";

export function removeCreditFooter() {
    const el = document.getElementById(ID);
    if (el) el.remove();
}

export function showCreditFooter() {
    removeCreditFooter();
    const el = document.createElement("div");
    el.id = ID;
    // nowrap + a viewport-scaled font so it always sits on a single line
    el.style.cssText =
        "position:fixed;left:0;right:0;bottom:12px;z-index:90000;text-align:center;pointer-events:none;" +
        "padding:0 8px;white-space:nowrap;overflow:hidden;" +
        "font-family:system-ui,-apple-system,sans-serif;font-size:clamp(10px,3.3vw,15px);color:#8a91a3;";
    // the words themselves are the links: "Keivan" -> site, "open-source" -> repo
    const link = (text, href) =>
        `<a href="${href}" target="_blank" rel="noopener noreferrer" ` +
        `style="color:#7fb3ff;font-weight:600;text-decoration:none;pointer-events:auto;">${text}</a>`;
    el.innerHTML =
        `Made with <span style="color:#e5485c;">❤️</span> by ${link("Keivan", "https://keivan.in")}` +
        ` • ${link("open-source", "https://github.com/keivan-shah/chain-reaction")}` +
        ` | contributions welcome`;
    document.body.appendChild(el);
}
