// Optional vibration feedback (mobile). Uses the Vibration API where available;
// a no-op elsewhere. Gated by a pref and only used for meaningful moments
// (bursts and wins) so it stays a pleasant accent rather than constant buzzing.
let enabled = true;

export function isHapticsOn() {
    return enabled;
}
export function setHaptics(on) {
    enabled = !!on;
}
export function applyHapticsPref(v) {
    if (typeof v === "boolean") enabled = v;
}
export function hapticsSupported() {
    return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

function buzz(pattern) {
    if (!enabled || !hapticsSupported()) return;
    try {
        navigator.vibrate(pattern);
    } catch (e) {
        /* ignore */
    }
}

// A single move's cascade — stronger the bigger the chain (capped so it's a tap,
// not a rumble).
export function buzzBurst(cells) {
    buzz(Math.min(70, 12 + cells * 4));
}
// A short celebratory pattern on a win.
export function buzzWin() {
    buzz([40, 50, 40, 50, 90]);
}
