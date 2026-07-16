// ================================================================
//  Tiny Web Audio engine: synthesized SFX (UI click, orb place, burst)
//  + a looping, upbeat chiptune background track. Everything is generated
//  in-browser, so there are no audio assets to bundle or license, and it
//  works fully offline.
// ================================================================

let ctx = null;
let master = null;
let sfxGain = null;
let musicGain = null;
let musicFilter = null;
const settings = { sfx: true, music: true };

let musicPlaying = false;
let schedTimer = null;
let step = 0;
let nextTime = 0;

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
    musicFilter = ctx.createBiquadFilter(); // tame harshness for a warm loop
    musicFilter.type = "lowpass";
    musicFilter.frequency.value = 2600;
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.2;
    musicFilter.connect(musicGain);
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

const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---- SFX ----

// subtle UI tick for menu buttons
export function playClick() {
    if (!settings.sfx) return;
    const c = ensureCtx();
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(520, t);
    o.frequency.exponentialRampToValueAtTime(360, t + 0.06);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g);
    g.connect(sfxGain);
    o.start(t);
    o.stop(t + 0.12);
}

// satisfying "pop" when an orb is placed (bright, upward blip + shimmer)
export function playPlace() {
    if (!settings.sfx) return;
    const c = ensureCtx();
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(300, t);
    o.frequency.exponentialRampToValueAtTime(680, t + 0.05); // upward "pop"
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
    o.connect(g);
    g.connect(sfxGain);
    o.start(t);
    o.stop(t + 0.2);
    // a little high shimmer on top
    const o2 = c.createOscillator();
    const g2 = c.createGain();
    o2.type = "triangle";
    o2.frequency.setValueAtTime(1000, t);
    o2.frequency.exponentialRampToValueAtTime(1500, t + 0.04);
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(0.12, t + 0.006);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o2.connect(g2);
    g2.connect(sfxGain);
    o2.start(t);
    o2.stop(t + 0.12);
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

// ---- Music: an upbeat chiptune loop over an uplifting I–vi–IV–V progression ----
const BPM = 128;
const EIGHTH = 60 / BPM / 2;
// four bars, each a chord (C major, A minor, F major, G major), lead an octave up
const CHORDS = [
    [60, 64, 67],
    [57, 60, 64],
    [53, 57, 60],
    [55, 59, 62],
];
const ARP = [0, 1, 2, 1, 0, 1, 2, 1]; // 8 eighth-notes per bar (bouncy up-down)

function leadNote(m, t, dur) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = midiToFreq(m);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(musicFilter);
    o.start(t);
    o.stop(t + dur + 0.02);
}

function bassNote(m, t, dur) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = midiToFreq(m);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(musicFilter);
    o.start(t);
    o.stop(t + dur + 0.02);
}

function hat(t) {
    const dur = 0.03;
    const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const n = ctx.createBufferSource();
    n.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(hp);
    hp.connect(g);
    g.connect(musicGain); // hats bypass the lowpass so they stay crisp
    n.start(t);
    n.stop(t + dur);
}

function scheduleLoop() {
    if (!musicPlaying || !ctx) return;
    while (nextTime < ctx.currentTime + 0.3) {
        const bar = Math.floor(step / 8) % CHORDS.length;
        const s = step % 8;
        const chord = CHORDS[bar];
        leadNote(chord[ARP[s]] + 12, nextTime, EIGHTH * 0.9); // arpeggio, octave up
        if (s === 0 || s === 4) bassNote(chord[0] - 12, nextTime, EIGHTH * 3.6); // groovy bass
        if (s % 2 === 1) hat(nextTime); // off-beat hats for energy
        nextTime += EIGHTH;
        step++;
    }
    schedTimer = setTimeout(scheduleLoop, 45);
}

export function startMusic() {
    if (!settings.music) return;
    const c = ensureCtx();
    if (!c || musicPlaying) return;
    musicPlaying = true;
    step = 0;
    nextTime = c.currentTime + 0.1;
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
