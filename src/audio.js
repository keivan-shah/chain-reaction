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
const settings = { sfx: true, music: true, volume: 0.8 };

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
    master.gain.value = settings.volume; // master volume (0..1)
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
// which also kicks off the music if it's enabled. After that first unlock the
// listeners are removed: every SFX/music call goes through ensureCtx(), which
// already resumes a suspended context, so we don't need to run on every input.
if (typeof window !== "undefined") {
    const unlock = () => {
        const c = ensureCtx();
        if (!c) return;
        if (c.state === "suspended") c.resume();
        if (settings.music && !musicPlaying) startMusic();
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("keydown", unlock);
        window.removeEventListener("touchstart", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock, { passive: true });
}

// Cached noise buffers, keyed by duration, so repeated hits (esp. the hi-hat,
// which fires several times a second) reuse one buffer instead of allocating and
// filling a fresh one each time.
const _noiseCache = {};
function noiseBuffer(c, dur, shaper) {
    let buf = _noiseCache[dur];
    if (buf && buf.sampleRate === c.sampleRate) return buf;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = shaper(Math.random() * 2 - 1, i, len);
    _noiseCache[dur] = buf;
    return buf;
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
    const noise = c.createBufferSource();
    noise.buffer = noiseBuffer(c, dur, (n, i, len) => {
        const env = 1 - i / len;
        return n * env * env;
    });
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

// ---- Music: a handful of upbeat chiptune loops, all synthesized in-browser (no
// audio assets). A track is either an "arp" style (a 4-chord loop arpeggiated,
// like the original "Sunrise") or a "seq" style (an explicit melody line + bass).
// The player shuffles through them, or you can lock to one in the Sound popup.
// Optional per-track `gain` trims a track's relative loudness. ----
const TRACKS = [
    {
        name: "Sunrise", // C major I–vi–IV–V (the original) — a touch louder
        bpm: 128,
        gain: 1.3,
        chords: [
            [60, 64, 67], // C
            [57, 60, 64], // Am
            [53, 57, 60], // F
            [55, 59, 62], // G
        ],
        arp: [0, 1, 2, 1, 0, 1, 2, 1],
        leadWave: "triangle",
        bassWave: "sine",
        bassSteps: [0, 4],
        hatSteps: [1, 3, 5, 7],
    },
    {
        name: "Neon Sprint", // D major vi–IV–I–V, driving square lead
        bpm: 140,
        chords: [
            [59, 62, 66], // Bm
            [55, 59, 62], // G
            [50, 54, 57], // D
            [57, 61, 64], // A
        ],
        arp: [0, 2, 1, 0, 2, 1, 2, -1],
        leadWave: "square",
        bassWave: "triangle",
        bassSteps: [0, 2, 4, 6],
        hatSteps: [1, 3, 5, 7],
    },
    {
        name: "Dust on the Windowsill", // chill lo-fi (Dm7–G7–Cmaj7–Am7)
        type: "seq",
        bpm: 104,
        lead: [65, -1, 69, -1, 72, -1, -1, -1, 71, -1, -1, -1, 74, -1, 0, 0, 64, -1, 67, -1, 71, -1, -1, -1, 72, -1, 69, -1, -1, -1, 0, 0],
        bass: [38, -1, -1, -1, 45, -1, -1, -1, 43, -1, -1, -1, 50, -1, -1, -1, 36, -1, -1, -1, 43, -1, -1, -1, 45, -1, -1, -1, 40, -1, -1, -1],
        leadWave: "triangle",
        bassWave: "sine",
        hat: [0, 0, 1, 0, 0, 0, 1, 0],
    },
    {
        name: "Funky Sunshine Strut",
        type: "seq",
        bpm: 116,
        lead: [72, -1, 0, 76, 0, 74, 72, 0, 69, 0, 72, -1, 0, 74, 0, 72, 76, 0, 79, -1, 0, 77, 76, 0, 74, 0, 72, 0, 74, 76, 72, -1],
        bass: [48, 0, 48, 50, 0, 52, 55, 0, 45, 0, 45, 47, 0, 48, 52, 0, 41, 0, 41, 45, 0, 48, 45, 0, 43, 0, 43, 47, 0, 50, 43, 0],
        leadWave: "triangle",
        bassWave: "sine",
        hat: [1, 0, 1, 1, 0, 1, 0, 1],
    },
    {
        name: "Onward to the Summit",
        type: "seq",
        bpm: 132,
        lead: [67, 72, 76, 79, -1, 76, 79, -1, 69, 72, 77, 81, -1, 84, -1, 0, 74, 79, 83, 86, -1, -1, 83, -1, 84, 83, 79, 76, 72, -1, -1, -1],
        bass: [48, 43, 48, 43, 48, 43, 48, 43, 41, 48, 41, 48, 41, 48, 41, 48, 43, 50, 43, 50, 43, 50, 43, 50, 48, 43, 48, 43, 48, 52, 55, 0],
        leadWave: "triangle",
        bassWave: "triangle",
        hat: [1, 0, 1, 0, 1, 0, 1, 1],
    },
];
const CYCLES_PER_TRACK = 4; // full 4-bar cycles before rotating (~30s per track)
let trackIdx = 0;
let cyclesOnTrack = 0;
let trackMode = -1; // -1 = shuffle/rotate all; >=0 = loop just that track

function leadNote(m, t, dur, wave, vol) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = wave || "triangle";
    o.frequency.value = midiToFreq(m);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2 * (vol || 1), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(musicFilter);
    o.start(t);
    o.stop(t + dur + 0.02);
}

function bassNote(m, t, dur, wave, vol) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = wave || "sine";
    o.frequency.value = midiToFreq(m);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32 * (vol || 1), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(musicFilter);
    o.start(t);
    o.stop(t + dur + 0.02);
}

function hat(t) {
    const dur = 0.03;
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(ctx, dur, (v, i, len) => v * (1 - i / len));
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

// pick a different track than the current one, so rotation always varies
function nextTrackIdx() {
    if (TRACKS.length <= 1) return 0;
    let i = trackIdx;
    while (i === trackIdx) i = Math.floor(Math.random() * TRACKS.length);
    return i;
}

// how long a note lasts in a "seq" voice: 1 eighth + any following holds (-1)
function seqDur(arr, s, len) {
    let d = 1;
    while (d < len && arr[(s + d) % len] === -1) d++;
    return d;
}

function scheduleLoop() {
    if (!musicPlaying || !ctx) return;
    // schedule ~0.7s ahead so the loop doesn't gap when a backgrounded tab
    // throttles setTimeout to ~1s
    while (nextTime < ctx.currentTime + 0.7) {
        const track = TRACKS[trackIdx];
        const eighth = 60 / track.bpm / 2;
        let loopLen;
        if (track.type === "seq") {
            // explicit melody: one value per eighth — a MIDI pitch starts a note,
            // -1 holds the previous note, 0 is a rest (used for famous tunes)
            loopLen = track.lead.length;
            const s = step % loopLen;
            const lp = track.lead[s];
            if (lp > 0) leadNote(lp, nextTime, eighth * seqDur(track.lead, s, loopLen) * 0.95, track.leadWave, track.gain);
            const bp = track.bass[s];
            if (bp > 0) bassNote(bp, nextTime, eighth * seqDur(track.bass, s, loopLen) * 0.95, track.bassWave, track.gain);
            if (track.hat && track.hat[s % track.hat.length]) hat(nextTime);
        } else {
            // arpeggio over a 4-chord loop (the original "Sunrise" style)
            const bars = track.chords.length;
            loopLen = bars * 8;
            const s = step % 8;
            const chord = track.chords[Math.floor(step / 8) % bars];
            const ai = track.arp[s];
            const bassDur = eighth * (track.bassSteps.length <= 2 ? 3.6 : 1.8);
            if (ai >= 0) leadNote(chord[ai] + 12, nextTime, eighth * 0.9, track.leadWave, track.gain);
            if (track.bassSteps.includes(s)) bassNote(chord[0] - 12, nextTime, bassDur, track.bassWave, track.gain);
            if (track.hatSteps.includes(s)) hat(nextTime);
        }
        nextTime += eighth;
        step++;
        // in shuffle mode, rotate to a fresh track after a few full cycles
        if (trackMode < 0 && step % loopLen === 0 && ++cyclesOnTrack >= CYCLES_PER_TRACK) {
            cyclesOnTrack = 0;
            step = 0;
            trackIdx = nextTrackIdx();
        }
    }
    schedTimer = setTimeout(scheduleLoop, 45);
}

export function startMusic() {
    if (!settings.music) return;
    const c = ensureCtx();
    if (!c || musicPlaying) return;
    musicPlaying = true;
    step = 0;
    cyclesOnTrack = 0;
    // a chosen track, else a random opener each session
    trackIdx = trackMode >= 0 ? trackMode : Math.floor(Math.random() * TRACKS.length);
    nextTime = c.currentTime + 0.1;
    scheduleLoop();
}

// ---- track selection ----
export function getTrackNames() {
    return TRACKS.map((t) => t.name);
}
export function getTrackMode() {
    return trackMode;
}
// mode: -1 = shuffle all, or a track index. Enables music and (re)starts it so
// the choice is heard right away.
export function selectTrack(mode) {
    trackMode = Number.isInteger(mode) && mode >= 0 && mode < TRACKS.length ? mode : -1;
    settings.music = true;
    stopMusic();
    startMusic();
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
export function getVolume() {
    return settings.volume;
}
export function setVolume(v) {
    settings.volume = Math.max(0, Math.min(1, v));
    if (master) master.gain.value = settings.volume;
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
    if (Number.isFinite(p.volume)) setVolume(p.volume);
    if (Number.isInteger(p.track)) trackMode = p.track >= 0 && p.track < TRACKS.length ? p.track : -1;
}
