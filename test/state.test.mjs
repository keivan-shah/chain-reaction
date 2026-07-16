// Round-trip test for the save/resume state codec.
// Run: node test/state.test.mjs
import { makeEngine, pickAIMove } from "../src/engine.js";
import { encodeState, decodeState } from "../src/state.js";

let failures = 0;
const assert = (c, m) => {
    if (!c) {
        failures++;
        console.error("  ✗ " + m);
    }
};

function boardsEqual(a, b, cols, rows) {
    for (let x = 0; x < cols; x++)
        for (let y = 0; y < rows; y++)
            if (a[x][y].count !== b[x][y].count || a[x][y].owner !== b[x][y].owner) return false;
    return true;
}

function mulberry32(a) {
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// build a few mid-game states by playing random moves, then round-trip them
const cases = [
    { size: 1, cols: 9, rows: 16, np: 2, cpu: 1, diff: "Medium" },
    { size: 2, cols: 15, rows: 25, np: 4, cpu: 2, diff: "Hard" },
    { size: 0, cols: 7, rows: 12, np: 3, cpu: 0, diff: "Easy" },
];

for (const cse of cases) {
    const eng = makeEngine(cse.cols, cse.rows);
    let board = eng.newBoard();
    const rng = mulberry32(42);
    let cur = 0;
    for (let i = 0; i < 25; i++) {
        const mv = pickAIMove(eng, board, cur, cse.np, cse.diff, rng);
        if (!mv) break;
        board = eng.simulateMove(board, mv.x, mv.y, cur, i >= cse.np).board;
        cur = (cur + 1) % cse.np;
    }
    const state = {
        size: cse.size,
        numPlayers: cse.np,
        cpuCount: cse.cpu,
        difficulty: cse.diff,
        currentPlayer: cur,
        moved: new Set([...Array(cse.np).keys()]),
        eliminated: new Set([1].filter((p) => p < cse.np)),
        board,
    };
    const code = encodeState(state);
    const back = decodeState(code);
    assert(back !== null, `decode returned null for ${JSON.stringify(cse)}`);
    if (back) {
        assert(back.size === state.size, "size mismatch");
        assert(back.numPlayers === state.numPlayers, "numPlayers mismatch");
        assert(back.cpuCount === state.cpuCount, "cpuCount mismatch");
        assert(back.difficulty === state.difficulty, "difficulty mismatch");
        assert(back.currentPlayer === state.currentPlayer, "currentPlayer mismatch");
        assert([...back.moved].sort().join() === [...state.moved].sort().join(), "moved mismatch");
        assert(
            [...back.eliminated].sort().join() === [...state.eliminated].sort().join(),
            "eliminated mismatch",
        );
        assert(boardsEqual(back.board, state.board, cse.cols, cse.rows), "board mismatch");
        // URL-safe: no chars needing escaping
        assert(/^[A-Za-z0-9\-_]+$/.test(code), "code is not URL-safe");
        const flatLen = 10 + cse.cols * cse.rows;
        console.log(
            `  ${cse.cols}x${cse.rows} np${cse.np} -> ${code.length} chars (flat would be ${flatLen}), round-trip OK`,
        );
    }
}

// dense board must still round-trip (falls back to flat when sparse is larger)
{
    const eng = makeEngine(9, 16);
    const b = eng.newBoard();
    for (let x = 0; x < 9; x++)
        for (let y = 0; y < 16; y++) b[x][y] = { count: (x + y) % 4 === 0 ? 0 : 1 + ((x + y) % 3), owner: (x + y) % 2 };
    const state = {
        size: 1,
        numPlayers: 2,
        cpuCount: 0,
        difficulty: "Hard",
        currentPlayer: 1,
        moved: new Set([0, 1]),
        eliminated: new Set(),
        board: b,
    };
    const code = encodeState(state);
    const back = decodeState(code);
    assert(back && boardsEqual(back.board, b, 9, 16), "dense board round-trip failed");
    console.log(`  dense 9x16 -> ${code.length} chars, round-trip OK`);
}

// corrupt input must decode to null, not throw
for (const bad of ["", null, "@@@@", "AAAA", "zzz"]) {
    let threw = false;
    let r;
    try {
        r = decodeState(bad);
    } catch (e) {
        threw = true;
    }
    assert(!threw, `decode threw on bad input ${JSON.stringify(bad)}`);
    assert(r === null, `bad input ${JSON.stringify(bad)} should decode to null`);
}

if (failures === 0) {
    console.log("STATE ALL PASS ✅");
    process.exit(0);
} else {
    console.error(`${failures} FAILURES ❌`);
    process.exit(1);
}
