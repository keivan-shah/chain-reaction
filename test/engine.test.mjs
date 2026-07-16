// Node smoke/stress test for the pure engine.
// Run: node test/engine.test.mjs
// Validates that cascades always terminate (the original recursive bug
// stack-overflowed near completion) and that full games end with a
// single valid winner.
import { makeEngine, pickAIMove, legalMoves } from "../src/engine.js";

let failures = 0;
function assert(cond, msg) {
    if (!cond) {
        failures++;
        console.error("  ✗ " + msg);
    }
}

// simple seeded RNG so runs are reproducible
function mulberry32(a) {
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function playGame(COLS, ROWS, numPlayers, difficulty, rng) {
    const eng = makeEngine(COLS, ROWS);
    let board = eng.newBoard();
    const moved = new Set();
    const eliminated = new Set();
    let cur = 0;
    let turns = 0;
    const maxTurns = COLS * ROWS * 60; // generous safety bound

    while (turns++ < maxTurns) {
        const allMoved = moved.size >= numPlayers;

        // pick a move (AI for everyone in the test)
        const mv = pickAIMove(eng, board, cur, numPlayers, difficulty, rng);
        assert(mv !== null, `player ${cur} had no legal move`);
        if (!mv) return { ok: false };

        const res = eng.simulateMove(board, mv.x, mv.y, cur, allMoved);
        // cascade must have terminated within the cap (waves finite)
        assert(res.waves.length < COLS * ROWS * 8, "cascade hit iteration cap (non-termination!)");
        board = res.board;
        moved.add(cur);

        // eliminations
        if (moved.size >= numPlayers) {
            const totals = eng.orbTotals(board, numPlayers);
            for (let p = 0; p < numPlayers; p++)
                if (totals[p] === 0) eliminated.add(p);
        }

        if (allMoved && res.winner !== null) {
            // sanity: winner should own every orb
            const owners = eng.ownersWithOrbs(board);
            assert(owners.size === 1, "winner declared but >1 owner has orbs");
            assert([...owners][0] === res.winner, "winner mismatch vs board owners");
            return { ok: true, winner: res.winner, turns };
        }

        // next non-eliminated player
        let n = cur;
        for (let i = 0; i < numPlayers; i++) {
            n = (n + 1) % numPlayers;
            if (!eliminated.has(n)) break;
        }
        cur = n;
    }
    assert(false, "game did not finish within maxTurns");
    return { ok: false };
}

console.log("Engine stress test");

// 1) games to completion across difficulties/boards/player-counts.
// Hard is 2-ply and much slower, so it runs on the small board only.
const plans = [
    { C: 9, R: 16, diff: "Easy", n: 30 },
    { C: 9, R: 16, diff: "Medium", n: 30 },
    { C: 9, R: 16, diff: "Hard", n: 2 },
    { C: 15, R: 25, diff: "Easy", n: 10 },
    { C: 15, R: 25, diff: "Medium", n: 4 },
];
let games = 0;
let winners = 0;
const t0 = Date.now();
for (const pl of plans) {
    for (let g = 0; g < pl.n; g++) {
        for (const np of [2, 3, 4]) {
            const rng = mulberry32(1000 * games + 7);
            const r = playGame(pl.C, pl.R, np, pl.diff, rng);
            games++;
            if (r.ok) winners++;
        }
    }
}
console.log(`  played ${games} full games, ${winners} finished with a valid winner`);
assert(winners === games, "some games failed to finish cleanly");

// 2) winning capture: board fully loaded by player 0 with a single player-1
//    toe-hold. The win-check must halt the cascade the instant player 0 owns
//    everything (this is the state the OLD recursive code looped on forever).
{
    const [C, R] = [9, 16];
    const eng = makeEngine(C, R);
    const b = eng.newBoard();
    for (let x = 0; x < C; x++)
        for (let y = 0; y < R; y++) b[x][y] = { count: eng.mass[x][y] - 1, owner: 0 };
    b[0][0] = { count: 1, owner: 1 };
    const res = eng.simulateMove(b, 1, 0, 0, true);
    assert(res.winner === 0, "player 0 should win the saturated board");
    assert(res.waves.length < C * R * 8, "winning cascade hit the cap");
    console.log(`  winning capture: winner=${res.winner} in ${res.waves.length} wave(s)`);
}

// 3) deep multi-wave cascade with NO winner short-circuit (allowWin=false):
//    a fully-loaded single-owner board is maximally unstable; the OLD code
//    recursed to that depth and blew the stack. The iterative engine must
//    resolve it within the safety cap and never throw.
{
    const [C, R] = [9, 16];
    const eng = makeEngine(C, R);
    const b = eng.newBoard();
    for (let x = 0; x < C; x++)
        for (let y = 0; y < R; y++) b[x][y] = { count: eng.mass[x][y] - 1, owner: 0 };
    let threw = false;
    let res;
    try {
        res = eng.simulateMove(b, 4, 8, 0, false); // no win halt -> forced deep chain
    } catch (e) {
        threw = true;
        console.error("  ✗ deep cascade threw: " + e.message);
    }
    assert(!threw, "deep cascade must not throw (no stack overflow)");
    assert(res && res.waves.length > 5, "expected a genuinely deep cascade");
    assert(res && res.waves.length <= C * R * 8, "deep cascade must stay within the cap");
    console.log(`  deep cascade resolved in ${res ? res.waves.length : "?"} waves without throwing`);
}

console.log(`  done in ${Date.now() - t0}ms`);
if (failures === 0) {
    console.log("ALL PASS ✅");
    process.exit(0);
} else {
    console.error(`${failures} FAILURES ❌`);
    process.exit(1);
}
