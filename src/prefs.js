// Menu selections, persisted across restarts.
import { MAX_PLAYERS, setColorblind } from "./theme.js";
import { DEFAULT_SIZE, clampSize } from "./grids.js";
import { DEFAULT_TIMER, clampTimer } from "./timer.js";
import * as audio from "./audio.js";
import { applyHapticsPref, isHapticsOn } from "./haptics.js";

const NAME_MAX = 12; // per-name character cap

export const cfg = {
    numPlayers: 2,
    cpuCount: 1,
    difficulty: "Medium", // Easy | Medium | Hard
    randomOn: false,
    size: DEFAULT_SIZE, // grid size index (0 small, 1 standard, 2 large)
    timer: DEFAULT_TIMER, // per-turn countdown index (TIMER_OFF = disabled)
    colorblind: false, // colour-blind palette + on-orb player numerals
    names: [], // custom player names (device-local, index-aligned to players)
};

const PREFS_KEY = "cr_prefs";

export function loadPrefs() {
    try {
        const p = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
        if (Number.isInteger(p.numPlayers)) cfg.numPlayers = Math.max(2, Math.min(MAX_PLAYERS, p.numPlayers));
        if (Number.isInteger(p.cpuCount)) cfg.cpuCount = Math.max(0, Math.min(cfg.numPlayers, p.cpuCount));
        if (["Easy", "Medium", "Hard"].includes(p.difficulty)) cfg.difficulty = p.difficulty;
        if (Number.isInteger(p.size)) cfg.size = clampSize(p.size);
        if (Number.isInteger(p.timer)) cfg.timer = clampTimer(p.timer);
        if (typeof p.randomOn === "boolean") cfg.randomOn = p.randomOn;
        if (typeof p.colorblind === "boolean") cfg.colorblind = p.colorblind;
        if (Array.isArray(p.names))
            cfg.names = p.names.slice(0, MAX_PLAYERS).map((s) => (typeof s === "string" ? s.trim().slice(0, NAME_MAX) : ""));
        setColorblind(cfg.colorblind);
        audio.applyAudioPrefs({ sfx: p.sfx, music: p.music, volume: p.volume, track: p.track });
        applyHapticsPref(p.haptics);
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
                timer: cfg.timer,
                randomOn: cfg.randomOn,
                colorblind: cfg.colorblind,
                names: cfg.names,
                sfx: audio.isSfxOn(),
                music: audio.isMusicOn(),
                volume: audio.getVolume(),
                track: audio.getTrackMode(),
                haptics: isHapticsOn(),
            }),
        );
    } catch (e) {
        /* ignore */
    }
}
