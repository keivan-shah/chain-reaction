// Menu selections, persisted across restarts.
import { MAX_PLAYERS } from "./theme.js";
import { DEFAULT_SIZE, clampSize } from "./grids.js";
import * as audio from "./audio.js";

export const cfg = {
    numPlayers: 2,
    cpuCount: 1,
    difficulty: "Medium", // Easy | Medium | Hard
    randomOn: false,
    size: DEFAULT_SIZE, // grid size index (0 small, 1 standard, 2 large)
};

const PREFS_KEY = "cr_prefs";

export function loadPrefs() {
    try {
        const p = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
        if (Number.isInteger(p.numPlayers)) cfg.numPlayers = Math.max(2, Math.min(MAX_PLAYERS, p.numPlayers));
        if (Number.isInteger(p.cpuCount)) cfg.cpuCount = Math.max(0, Math.min(cfg.numPlayers, p.cpuCount));
        if (["Easy", "Medium", "Hard"].includes(p.difficulty)) cfg.difficulty = p.difficulty;
        if (Number.isInteger(p.size)) cfg.size = clampSize(p.size);
        if (typeof p.randomOn === "boolean") cfg.randomOn = p.randomOn;
        audio.applyAudioPrefs({ sfx: p.sfx, music: p.music });
    } catch (e) {
        /* ignore */
    }
}

export function savePrefs() {
    try {
        localStorage.setItem(
            PREFS_KEY,
            JSON.stringify({
                numPlayers: cfg.numPlayers,
                cpuCount: cfg.cpuCount,
                difficulty: cfg.difficulty,
                size: cfg.size,
                randomOn: cfg.randomOn,
                sfx: audio.isSfxOn(),
                music: audio.isMusicOn(),
            }),
        );
    } catch (e) {
        /* ignore */
    }
}
