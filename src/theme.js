// Colour palette + UI chrome tokens, shared across scenes.
import { k } from "./k.js";

// A restrained, modern player palette (muted jewel tones) rather than primaries.
export const colors = [
    k.rgb(232, 178, 45),  // 1 amber
    k.rgb(70, 140, 246),  // 2 blue
    k.rgb(229, 72, 92),   // 3 rose
    k.rgb(48, 190, 130),  // 4 emerald
    k.rgb(160, 120, 235), // 5 violet
    k.rgb(40, 190, 200),  // 6 cyan
    k.rgb(238, 140, 70),  // 7 orange
    k.rgb(214, 220, 232), // 8 silver
];
export const MAX_PLAYERS = colors.length;

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
