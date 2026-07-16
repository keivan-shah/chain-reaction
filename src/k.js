// Shared kaplay instance + fonts. Every module imports `k` from here so the
// whole app runs on a single engine.
import kaplay from "kaplay";
import interRegular from "@fontsource/inter/files/inter-latin-500-normal.woff2";
import interBold from "@fontsource/inter/files/inter-latin-700-normal.woff2";

// Render at the device's full pixel ratio so the letterboxed canvas is native
// resolution (a hardcoded 2 was upscaled -> blurry on high-DPR phones). Floor
// at 2 so low-DPR desktops still supersample; cap at 4 for perf headroom.
const DPR = Math.max(2, Math.min(4, (typeof window !== "undefined" && window.devicePixelRatio) || 2));

export const k = kaplay({
    width: 900, // 9*100
    height: 1600, // 16*100
    canvas: document.getElementById("game"),
    letterbox: true,
    pixelDensity: DPR,
    maxFPS: 60,
    background: [11, 12, 18],
    debug: false,
});
k.setLayers(["game", "ui", "overlay"], "game");

// Clean, professional typeface instead of kaplay's default rounded game font.
export const FONT = "ui";
export const FONT_BOLD = "ui-bold";
k.loadFont(FONT, interRegular);
k.loadFont(FONT_BOLD, interBold);

// Default every text/drawText to the UI font unless one is given explicitly.
const _text = k.text.bind(k);
k.text = (t, o = {}) => _text(t, { font: FONT, ...o });
const _drawText = k.drawText.bind(k);
k.drawText = (o = {}) => _drawText({ font: FONT, ...o });
