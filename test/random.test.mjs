// Verifies the random-start fill: dense, balanced, fair corners, stable (no
// critical cell at start), and no opening move that instantly wins.
// Run: node test/random.test.mjs
import { makeEngine, randomFill, legalMoves } from "../src/engine.js";

let failures = 0;
const assert = (c, m) => {
    if (!c) {
        failures++;
        console.error("  ✗ " + m);
    }
};

function mulberry32(a) {
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const boards = [
    [7, 12],
    [9, 16],
    [15, 25],
];
const players = [2, 3, 4, 6];

for (const [C, R] of boards) {
    for (const np of players) {
        for (let seed = 0; seed < 6; seed++) {
            const eng = makeEngine(C, R);
            const rng = mulberry32(seed * 131 + C * 7 + np);
            const board = randomFill(eng, np, { rng });

            const orbs = new Array(np).fill(0);
            let filled = 0;
            let anyCritical = false;
            const corners = [
                [0, 0],
                [C - 1, 0],
                [C - 1, R - 1],
                [0, R - 1],
            ];
            const cornerOwned = new Array(np).fill(0);

            for (let x = 0; x < C; x++)
                for (let y = 0; y < R; y++) {
                    const cell = board[x][y];
                    if (cell.count > 0) {
                        filled++;
                        orbs[cell.owner] += cell.count;
                        if (cell.count >= eng.mass[x][y]) anyCritical = true;
                    }
                }
            for (const [x, y] of corners) {
                const c = board[x][y];
                if (c.owner >= 0) cornerOwned[c.owner]++;
            }

            const orbSpread = Math.max(...orbs) - Math.min(...orbs);
            const cornerSpread = Math.max(...cornerOwned) - Math.min(...cornerOwned);
            const density = filled / (C * R);

            assert(orbSpread <= 4, `${C}x${R} np${np}: orb totals not balanced (spread ${orbSpread})`);
            assert(cornerSpread <= 1, `${C}x${R} np${np}: corners not fair (spread ${cornerSpread})`);
            assert(!anyCritical, `${C}x${R} np${np}: a cell starts at critical mass`);
            assert(density > 0.6 && density < 0.72, `${C}x${R} np${np}: density ${density.toFixed(2)} off`);

            // no opening move (for the starting player) should instantly win
            let instant = false;
            for (const mv of legalMoves(eng, board, 0)) {
                const r = eng.simulateMove(board, mv.x, mv.y, 0, true);
                if (r.winner !== null) {
                    instant = true;
                    break;
                }
            }
            assert(!instant, `${C}x${R} np${np} seed${seed}: an opening move instantly wins`);
        }
    }
}

if (failures === 0) {
    console.log("RANDOM FILL ALL PASS ✅");
    process.exit(0);
} else {
    console.error(`${failures} FAILURES ❌`);
    process.exit(1);
}
