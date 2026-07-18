// On-device play records (no accounts, no network). Tracks completed games,
// human win-rate per CPU difficulty, and two "records": the longest chain
// reaction (waves in a single move) and the biggest cascade (cells burst in a
// single move). Persisted to localStorage.
const KEY = "cr_stats";
const DIFFS = ["Easy", "Medium", "Hard"];

function fresh() {
    return {
        games: 0,
        wins: 0, // games a human won (any mode)
        byDiff: { Easy: { p: 0, w: 0 }, Medium: { p: 0, w: 0 }, Hard: { p: 0, w: 0 } },
        longestChain: 0, // most waves in one move
        biggestCascade: 0, // most orb bursts in one move (a cell can burst more than once)
    };
}

let stats = null;

export function loadStats() {
    try {
        const s = JSON.parse(localStorage.getItem(KEY) || "null");
        stats = fresh();
        if (s && typeof s === "object") {
            if (Number.isFinite(s.games)) stats.games = s.games;
            if (Number.isFinite(s.wins)) stats.wins = s.wins;
            if (Number.isFinite(s.longestChain)) stats.longestChain = s.longestChain;
            if (Number.isFinite(s.biggestCascade)) stats.biggestCascade = s.biggestCascade;
            if (s.byDiff)
                for (const d of DIFFS)
                    if (s.byDiff[d]) {
                        stats.byDiff[d].p = s.byDiff[d].p | 0;
                        stats.byDiff[d].w = s.byDiff[d].w | 0;
                    }
        }
    } catch (e) {
        stats = fresh();
    }
    return stats;
}

export function getStats() {
    if (!stats) loadStats();
    return stats;
}

function save() {
    try {
        localStorage.setItem(KEY, JSON.stringify(stats));
    } catch (e) {
        /* ignore */
    }
}

// Called once per resolved move with that move's cascade waves.
export function recordMove(waves) {
    if (!stats) loadStats();
    if (!waves || waves.length === 0) return;
    let cells = 0;
    for (const w of waves) cells += w.length;
    let changed = false;
    if (waves.length > stats.longestChain) {
        stats.longestChain = waves.length;
        changed = true;
    }
    if (cells > stats.biggestCascade) {
        stats.biggestCascade = cells;
        changed = true;
    }
    if (changed) save();
}

// Called once when a game that has a human finishes (the caller excludes all-CPU
// watch games). "you" is player 0 — the human who set the game up (humans always
// fill the first slots), so youWon = (winner === 0).
export function recordGameEnd({ difficulty, hadCPU, youWon }) {
    if (!stats) loadStats();
    stats.games++;
    if (youWon) stats.wins++;
    if (hadCPU) {
        const d = stats.byDiff[difficulty] || stats.byDiff.Medium;
        d.p++;
        if (youWon) d.w++;
    }
    save();
}

export function resetStats() {
    stats = fresh();
    save();
}
