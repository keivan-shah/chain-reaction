// Optional per-turn countdown presets. The timer is opt-in: a single slider runs
// from the fastest turn (2s) up to the last index, which means "Off" (∞ — no
// timer at all). We store the slider *index* in prefs so the same control drives
// both the menu and the in-game pause panel.
export const TIMER_SECS = [2, 3, 4, 5, 7, 10, 15, 20, 30];
export const TIMER_OFF = TIMER_SECS.length; // rightmost slider stop = Off / infinity
export const DEFAULT_TIMER = TIMER_OFF; // default is no timer (players opt in)

export function clampTimer(i) {
    return Math.max(0, Math.min(TIMER_OFF, i | 0));
}

// seconds for a slider index, or 0 when the timer is Off
export function timerSeconds(idx) {
    const i = clampTimer(idx);
    return i >= TIMER_OFF ? 0 : TIMER_SECS[i];
}

// human-readable label for the slider
export function timerLabel(idx) {
    const i = clampTimer(idx);
    return i >= TIMER_OFF ? "Off (∞)" : `${TIMER_SECS[i]}s`;
}
