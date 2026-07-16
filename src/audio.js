// ================================================================
//  Tiny Web Audio engine: synthesized SFX (click / burst) + a looping
//  background tune. Everything is generated in-browser, so there are no
//  audio assets to bundle or license, and it works fully offline.
//
//  The tune is Beethoven's "Ode to Joy" — a public-domain melody —
//  rendered with a soft synth, so it's recognisable and free to use.
// ================================================================

let ctx = null;
let master = null;
let sfxGain = null;
let musicGain = null;
const settings = { sfx: true, music: true };

let musicPlaying = false;
let schedTimer = null;
let noteIdx = 0;
let nextNoteTime = 0;

function ensureCtx() {
    if (ctx) {
        if (ctx.state === "suspended") ctx.resume();
        return ctx;
    }
    const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.9;
    sfxGain.connect(master);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.22;
    musicGain.connect(master);
    return ctx;
}

// Browsers only allow audio after a user gesture — unlock on the first input,
// which also kicks off the music if it's enabled.
if (typeof window !== "undefined") {
    const unlock = () => {
        const c = ensureCtx();
        if (!c) return;
        if (c.state === "suspended") c.resume();
        if (settings.music && !musicPlaying) startMusic();
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock, { passive: true });
}

// ---- SFX ----
export function playClick() {
    if (!settings.sfx) return;
    const c = ensureCtx();
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "triangle";
    const base = 620 + Math.random() * 120; // a little variation = playful
    o.frequency.setValueAtTime(base, t);
    o.frequency.exponentialRampToValueAtTime(base * 0.6, t + 0.09);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.45, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    o.connect(g);
    g.connect(sfxGain);
    o.start(t);
    o.stop(t + 0.15);
}

export function playBurst() {
    if (!settings.sfx) return;
    const c = ensureCtx();
    if (!c) return;
    const t = c.currentTime;

    // filtered noise "crack"
    const dur = 0.24;
    const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
        const env = 1 - i / data.length;
        data[i] = (Math.random() * 2 - 1) * env * env;
    }
    const noise = c.createBufferSource();
    noise.buffer = buf;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(2200, t);
    lp.frequency.exponentialRampToValueAtTime(320, t + dur);
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + dur);
    noise.connect(lp);
    lp.connect(ng);
    ng.connect(sfxGain);
    noise.start(t);
    noise.stop(t + dur);

    // low "thump" for body
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(240, t);
    o.frequency.exponentialRampToValueAtTime(72, t + 0.18);
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g);
    g.connect(sfxGain);
    o.start(t);
    o.stop(t + 0.22);
}

// ---- Music: "Ode to Joy" (public domain), [midiNote, beats] ----
const BPM = 108;
const MELODY = [
    [64, 1], [64, 1], [65, 1], [67, 1],
    [67, 1], [65, 1], [64, 1], [62, 1],
    [60, 1], [60, 1], [62, 1], [64, 1],
    [64, 1.5], [62, 0.5], [62, 2],
    [64, 1], [64, 1], [65, 1], [67, 1],
    [67, 1], [65, 1], [64, 1], [62, 1],
    [60, 1], [60, 1], [62, 1], [64, 1],
    [62, 1.5], [60, 0.5], [60, 2],
];

function midiToFreq(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
}

function playNote(m, t, dur) {
    if (!ctx) return;
    const f = midiToFreq(m);
    const rel = Math.min(0.14, dur * 0.4);
    // main voice
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    g.gain.setValueAtTime(0.25, Math.max(t + 0.02, t + dur - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(musicGain);
    o.start(t);
    o.stop(t + dur + 0.03);
    // octave-below pad for warmth (always consonant)
    const o2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    o2.type = "sine";
    o2.frequency.value = f / 2;
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(0.12, t + 0.03);
    g2.gain.setValueAtTime(0.12, Math.max(t + 0.03, t + dur - rel));
    g2.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o2.connect(g2);
    g2.connect(musicGain);
    o2.start(t);
    o2.stop(t + dur + 0.03);
}

function scheduleLoop() {
    if (!musicPlaying || !ctx) return;
    while (nextNoteTime < ctx.currentTime + 0.25) {
        const [m, beats] = MELODY[noteIdx];
        const dur = (beats * 60) / BPM;
        playNote(m, nextNoteTime, dur);
        nextNoteTime += dur;
        noteIdx = (noteIdx + 1) % MELODY.length;
    }
    schedTimer = setTimeout(scheduleLoop, 60);
}

export function startMusic() {
    if (!settings.music) return;
    const c = ensureCtx();
    if (!c || musicPlaying) return;
    musicPlaying = true;
    noteIdx = 0;
    nextNoteTime = c.currentTime + 0.1;
    scheduleLoop();
}

export function stopMusic() {
    musicPlaying = false;
    if (schedTimer) {
        clearTimeout(schedTimer);
        schedTimer = null;
    }
}

// ---- settings ----
export function isSfxOn() {
    return settings.sfx;
}
export function isMusicOn() {
    return settings.music;
}
export function setSfx(on) {
    settings.sfx = !!on;
}
export function setMusic(on) {
    settings.music = !!on;
    if (settings.music) startMusic();
    else stopMusic();
}
export function applyAudioPrefs(p) {
    if (!p) return;
    if (typeof p.sfx === "boolean") settings.sfx = p.sfx;
    if (typeof p.music === "boolean") settings.music = p.music;
}
