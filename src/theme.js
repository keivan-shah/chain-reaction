// Colour palette + UI chrome tokens, shared across scenes.
import { k } from "./k.js";

// Two source palettes as plain {r,g,b}. The default is our muted jewel set; the
// colour-blind set is Okabe–Ito adapted for the dark background (light grey
// stands in for Okabe–Ito black, which would be invisible on UI.bg).
const DEFAULT_PALETTE = [
    { r: 232, g: 178, b: 45 },  // 1 amber
    { r: 70, g: 140, b: 246 },  // 2 blue
    { r: 229, g: 72, b: 92 },   // 3 rose
    { r: 48, g: 190, b: 130 },  // 4 emerald
    { r: 160, g: 120, b: 235 }, // 5 violet
    { r: 40, g: 190, b: 200 },  // 6 cyan
    { r: 238, g: 140, b: 70 },  // 7 orange
    { r: 214, g: 220, b: 232 }, // 8 silver
];
const CB_PALETTE = [
    { r: 0xe6, g: 0x9f, b: 0x00 }, // orange
    { r: 0x56, g: 0xb4, b: 0xe9 }, // sky blue
    { r: 0x00, g: 0x9e, b: 0x73 }, // bluish green
    { r: 0xf0, g: 0xe4, b: 0x42 }, // yellow
    { r: 0x00, g: 0x72, b: 0xb2 }, // blue
    { r: 0xd5, g: 0x5e, b: 0x00 }, // vermillion
    { r: 0xcc, g: 0x79, b: 0xa7 }, // reddish purple
    { r: 0xee, g: 0xee, b: 0xee }, // light grey (stands in for black)
];

// The live player palette. Every module imports THIS array and reads colors[i]
// at draw time, so switching palettes mutates the entries in place (never
// replaces the array) — that way any reference captured at scene setup updates
// too. Both source palettes must stay length 8 (MAX_PLAYERS + the save codec
// reject owner >= numPlayers / numPlayers > 8).
export const colors = DEFAULT_PALETTE.map((c) => k.rgb(c.r, c.g, c.b));
export const MAX_PLAYERS = colors.length;

let _colorblind = false;
export function isColorblind() {
    return _colorblind;
}
export function setColorblind(on) {
    _colorblind = !!on;
    const src = _colorblind ? CB_PALETTE : DEFAULT_PALETTE;
    for (let i = 0; i < colors.length; i++) {
        colors[i].r = src[i].r;
        colors[i].g = src[i].g;
        colors[i].b = src[i].b;
    }
}

// UI chrome palette
export const UI = {
    bg: k.rgb(11, 12, 18),
    panel: k.rgb(22, 24, 33),
    panelHi: k.rgb(30, 33, 45),
    border: k.rgb(48, 53, 70),
    text: k.rgb(228, 231, 240),
    textDim: k.rgb(138, 145, 163),
    accent: k.rgb(96, 165, 250), // refined blue accent
    good: k.rgb(52, 180, 130),
    danger: k.rgb(220, 90, 100),
};
