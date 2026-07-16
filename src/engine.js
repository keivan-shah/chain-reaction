// ================================================================
//  Chain Reaction — pure game logic (no rendering, no kaplay).
//  Isolated here so it can be unit-tested in Node and reused by the
//  renderer and the AI. This is the module that fixes the original
//  crash: the cascade is resolved iteratively with a guaranteed
//  termination bound instead of unbounded recursion.
// ================================================================

export function makeEngine(COLS, ROWS) {
    // critical mass of a cell = number of orthogonal in-bounds neighbours
    const mass = [];
    const neigh = [];
    for (let x = 0; x < COLS; x++) {
        mass[x] = [];
        neigh[x] = [];
        for (let y = 0; y < ROWS; y++) {
            const ns = [];
            if (x > 0) ns.push({ x: x - 1, y });
            if (x < COLS - 1) ns.push({ x: x + 1, y });
            if (y > 0) ns.push({ x, y: y - 1 });
            if (y < ROWS - 1) ns.push({ x, y: y + 1 });
            neigh[x][y] = ns;
            mass[x][y] = ns.length;
        }
    }

    function newBoard() {
        const b = [];
        for (let x = 0; x < COLS; x++) {
            b[x] = [];
            for (let y = 0; y < ROWS; y++) b[x][y] = { count: 0, owner: -1 };
        }
        return b;
    }

    function cloneBoard(b) {
        const nb = [];
        for (let x = 0; x < COLS; x++) {
            nb[x] = [];
            for (let y = 0; y < ROWS; y++)
                nb[x][y] = { count: b[x][y].count, owner: b[x][y].owner };
        }
        return nb;
    }

    function ownersWithOrbs(b) {
        const s = new Set();
        for (let x = 0; x < COLS; x++)
            for (let y = 0; y < ROWS; y++) if (b[x][y].count > 0) s.add(b[x][y].owner);
        return s;
    }

    function orbTotals(b, numPlayers) {
        const t = new Array(numPlayers).fill(0);
        for (let x = 0; x < COLS; x++)
            for (let y = 0; y < ROWS; y++) {
                const c = b[x][y];
                if (c.owner >= 0 && c.owner < numPlayers) t[c.owner] += c.count;
            }
        return t;
    }

    // Apply one move on a COPY of the board, resolving the cascade
    // iteratively as BFS "waves". Returns { board, waves, winner }.
    //
    // `waves` is an ordered list of explosion steps (each an array of
    // {x,y}) so the renderer can play the chain reaction back with a
    // stagger. `winner` is set only when `allowWin` is true and the move
    // ends the game.
    //
    // Termination: the cascade stops as soon as a single owner holds
    // every orb on the board — which is the ONLY state in which cells
    // could keep exploding forever — so the win check doubles as the
    // loop bound. An absolute iteration cap backstops it regardless.
    function simulateMove(board, x, y, player, allowWin) {
        const b = cloneBoard(board);
        b[x][y].count += 1;
        b[x][y].owner = player;

        const waves = [];
        let winner = null;
        const cap = COLS * ROWS * 8;
        let iter = 0;

        // only track cells that could currently be at/over critical mass
        let active = new Set([x * ROWS + y]);

        while (active.size > 0 && iter++ < cap) {
            const explode = [];
            for (const key of active) {
                const cx = Math.floor(key / ROWS);
                const cy = key % ROWS;
                if (b[cx][cy].count >= mass[cx][cy]) explode.push({ x: cx, y: cy });
            }
            if (explode.length === 0) break;

            waves.push(explode.map((e) => ({ x: e.x, y: e.y })));

            const next = new Set();
            for (const e of explode) b[e.x][e.y].count -= mass[e.x][e.y];
            for (const e of explode) {
                for (const n of neigh[e.x][e.y]) {
                    b[n.x][n.y].count += 1;
                    b[n.x][n.y].owner = player;
                    next.add(n.x * ROWS + n.y);
                }
            }
            for (const e of explode) {
                if (b[e.x][e.y].count > 0) {
                    b[e.x][e.y].owner = player;
                    next.add(e.x * ROWS + e.y);
                } else {
                    b[e.x][e.y].owner = -1;
                }
            }
            active = next;

            if (allowWin) {
                const owners = ownersWithOrbs(b);
                if (owners.size <= 1) {
                    winner = owners.size === 1 ? [...owners][0] : null;
                    break;
                }
            }
        }

        if (allowWin && winner === null) {
            const owners = ownersWithOrbs(b);
            if (owners.size === 1) winner = [...owners][0];
        }

        return { board: b, waves, winner };
    }

    return {
        COLS,
        ROWS,
        mass,
        neigh,
        newBoard,
        cloneBoard,
        ownersWithOrbs,
        orbTotals,
        simulateMove,
    };
}

// Build a lively, balanced random starting board so players can jump straight
// in without hand-filling the grid. It fills most of the board, gives every
// player an equal number of cells, and distributes the four corners fairly
// (diagonally opposite for a 2-player game). No cell starts at critical mass,
// so the opening is rich but not an instant landslide.
export function randomFill(eng, numPlayers, opts = {}) {
    const { density = 0.66, loadedChance = 0.35, rng = Math.random } = opts;
    const { COLS, ROWS, mass } = eng;
    const board = eng.newBoard();
    const total = COLS * ROWS;
    const orbsOf = new Array(numPlayers).fill(0); // total orbs per player (= strength)

    function place(x, y, owner) {
        const m = mass[x][y];
        // mostly single orbs, sometimes a "loaded" cell (still below critical)
        let count = 1;
        if (m > 2 && rng() < loadedChance) count = 1 + Math.floor(rng() * (m - 1));
        board[x][y] = { count, owner };
        orbsOf[owner] += count;
    }
    // hand the next cell to whoever is weakest so far -> balanced orb totals
    function weakestPlayer() {
        let owner = 0;
        for (let p = 1; p < numPlayers; p++) if (orbsOf[p] < orbsOf[owner]) owner = p;
        return owner;
    }

    // corners: order TL, TR, BR, BL so round-robin gives 2-player games opposite
    // diagonals; assign one-per-player round-robin for fairness.
    const corners = [
        { x: 0, y: 0 },
        { x: COLS - 1, y: 0 },
        { x: COLS - 1, y: ROWS - 1 },
        { x: 0, y: ROWS - 1 },
    ];
    corners.forEach((c, i) => place(c.x, c.y, i % numPlayers));
    const cornerKeys = new Set(corners.map((c) => c.x * ROWS + c.y));

    // shuffle the remaining cells
    const rest = [];
    for (let x = 0; x < COLS; x++)
        for (let y = 0; y < ROWS; y++) if (!cornerKeys.has(x * ROWS + y)) rest.push({ x, y });
    for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
    }

    // fill up to the target density, keeping orb totals balanced
    const target = Math.max(numPlayers, Math.round(total * density));
    let filled = corners.length;
    for (const c of rest) {
        if (filled >= target) break;
        place(c.x, c.y, weakestPlayer());
        filled++;
    }
    return board;
}

// ---- AI ----

export function legalMoves(eng, board, player) {
    const moves = [];
    for (let x = 0; x < eng.COLS; x++)
        for (let y = 0; y < eng.ROWS; y++) {
            const c = board[x][y];
            if (c.owner === -1 || c.owner === player) moves.push({ x, y });
        }
    return moves;
}

export function evalBoard(eng, board, me, numPlayers) {
    const totals = eng.orbTotals(board, numPlayers);
    const my = totals[me];
    let others = 0;
    for (let p = 0; p < numPlayers; p++) if (p !== me) others += totals[p];

    if (my > 0 && others === 0) return 1e6; // won
    if (my === 0 && others > 0) return -1e6; // lost

    let score = my - others;

    for (let x = 0; x < eng.COLS; x++)
        for (let y = 0; y < eng.ROWS; y++) {
            const c = board[x][y];
            if (c.owner !== me || c.count === 0) continue;
            const m = eng.mass[x][y];
            score += (4 - m) * 0.4; // corners/edges are more stable
            if (c.count === m - 1) {
                for (const n of eng.neigh[x][y]) {
                    const nb = board[n.x][n.y];
                    if (nb.owner !== me && nb.owner !== -1 && nb.count === eng.mass[n.x][n.y] - 1) {
                        score -= 3.0 * c.count; // an adjacent loaded enemy can capture us
                    }
                }
            }
        }
    return score;
}

export function pickAIMove(eng, board, player, numPlayers, difficulty, rng = Math.random) {
    const moves = legalMoves(eng, board, player);
    if (moves.length === 0) return null;

    if (difficulty === "Easy") {
        for (const mv of moves) {
            const r = eng.simulateMove(board, mv.x, mv.y, player, true);
            if (r.winner === player) return mv;
        }
        return moves[Math.floor(rng() * moves.length)];
    }

    const scored = moves.map((mv) => {
        const r = eng.simulateMove(board, mv.x, mv.y, player, true);
        if (r.winner === player) return { mv, s: 1e9, r };
        return { mv, s: evalBoard(eng, r.board, player, numPlayers), r };
    });
    scored.sort((a, b) => b.s - a.s);

    if (difficulty === "Medium") {
        const best = scored[0].s;
        const top = scored.filter((c) => c.s >= best - 0.001);
        return top[Math.floor(rng() * top.length)].mv;
    }

    // Hard: 2-ply. Assume the strongest opponent replies optimally; maximise
    // our worst-case eval over the top-K candidate moves.
    const K = 10;
    const cands = scored.slice(0, Math.min(K, scored.length));
    let bestMv = cands[0].mv;
    let bestScore = -Infinity;
    for (const c of cands) {
        if (c.s >= 1e9) return c.mv;
        const totals = eng.orbTotals(c.r.board, numPlayers);
        let opp = -1;
        let oppOrbs = -1;
        for (let p = 0; p < numPlayers; p++)
            if (p !== player && totals[p] > oppOrbs) {
                oppOrbs = totals[p];
                opp = p;
            }
        let worst = c.s;
        if (opp >= 0) {
            const oppMoves = legalMoves(eng, c.r.board, opp);
            let checked = 0;
            worst = Infinity;
            for (const om of oppMoves) {
                if (checked++ > 24) break;
                const rr = eng.simulateMove(c.r.board, om.x, om.y, opp, true);
                const e = rr.winner === opp ? -1e6 : evalBoard(eng, rr.board, player, numPlayers);
                if (e < worst) worst = e;
            }
            if (worst === Infinity) worst = c.s;
        }
        if (worst > bestScore) {
            bestScore = worst;
            bestMv = c.mv;
        }
    }
    return bestMv;
}
