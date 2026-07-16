import { k, FONT_BOLD } from "../k.js";
import { colors, UI } from "../theme.js";
import { makeButton, fadeIn, dim, mix, blend } from "../ui.js";
import { makeEngine, pickAIMove, randomFill } from "../engine.js";
import { encodeState } from "../state.js";
import { GRID_SIZES, clampSize } from "../grids.js";
import { writeSaveSlot, buildResumeUrl, clearSavedGame, showSaveModal, removeSaveModal } from "../storage.js";
import * as audio from "../audio.js";

k.scene("game", (opts) => {
    fadeIn();
    const saved = opts.saved || null;
    const numPlayers = saved ? saved.numPlayers : opts.numPlayers;
    const cpuCount = saved ? saved.cpuCount : opts.cpuCount;
    const difficulty = saved ? saved.difficulty : opts.difficulty;
    const size = clampSize(saved ? saved.size : opts.size);
    const randomOn = saved ? false : opts.randomOn;
    const GS = GRID_SIZES[size];
    const CELL_SIZE = GS.cell;
    const COLS = GS.cols;
    const ROWS = GS.rows;
    const RADIUS = GS.radius;
    const ORBIT_RADIUS = GS.orbit;

    const eng = makeEngine(COLS, ROWS);
    let board = eng.newBoard();
    // time each cell was last hit by a blast, for a reactive "pop" on receipt
    const impactAt = Array.from({ length: COLS }, () => new Array(ROWS).fill(-99));

    // which players are CPU (humans fill the first slots)
    const isCPU = [];
    for (let i = 0; i < numPlayers; i++) isCPU[i] = i >= numPlayers - cpuCount;
    const hasHuman = isCPU.some((v) => !v);

    let currentPlayer = 0;
    const moved = new Set();          // players who have taken their first turn
    const eliminated = new Set();     // players knocked out
    let resolving = false;            // true while a cascade animates / CPU thinks
    let inExitOverlay = false;
    let gameOver = false;
    let paused = false;               // freezes all progression while the menu overlay is open
    const undoStack = [];             // snapshots taken before each move, for Undo

    // opt-in debug hook (only with ?debug in the URL) used by automated tests
    const DEBUG = (() => {
        try {
            return new URLSearchParams(location.search).has("debug");
        } catch (e) {
            return false;
        }
    })();
    let moveCount = 0;
    if (DEBUG) {
        window.__cr = {
            get moves() {
                return moveCount;
            },
            get paused() {
                return paused;
            },
            get gameOver() {
                return gameOver;
            },
            get undoLen() {
                return undoStack.length;
            },
            get canUndo() {
                return canUndo();
            },
            undo: () => undo(),
        };
    }

    const allMoved = () => moved.size >= numPlayers;

    // a wait that holds while paused, so opening the overlay truly freezes the
    // game (incl. all-CPU watch mode) instead of playing on behind the popup
    function pausableWait(t, fn) {
        k.wait(t, function run() {
            if (paused) {
                k.wait(0.1, run);
                return;
            }
            fn();
        });
    }

    // ----- grid geometry: projected cell centres + depth-shaded wireframe -----
    // Cells live on the middle plane (wz = 0) so tap targets stay put; front and
    // back planes are extruded in Z to give the board real 3D depth, and each
    // segment carries a shade (near = bright, far = dim) for a lit look.
    const centers = [];   // centers[x][y] = vec2 (screen)
    const flat = [];      // [{x,y,p}]
    const wireBack = [];  // far plane grid  (dim)
    const wireFront = []; // near plane grid (bright)
    const wireConn = [];  // depth connectors
    let hitRadius = 40;
    (function buildGeometry() {
        const cellSize = CELL_SIZE;
        const fov = 60;
        const camDist = 900;
        const depth = cellSize * 1.5; // Z extent of the box
        const f = (k.height() / 2) / Math.tan((fov * Math.PI / 180) / 2);
        const center = k.vec2(k.width() / 2, k.height() / 2 + 40);
        const halfX = (COLS * cellSize) / 2;
        const halfY = (ROWS * cellSize) / 2;
        const halfZ = depth / 2;
        hitRadius = (cellSize * f) / camDist * 0.62;

        const wx = (ix) => ix * cellSize - halfX;
        const wy = (iy) => iy * cellSize - halfY;
        function proj(px, py, pz) {
            const Z = pz + camDist;
            const invZ = 1 / Math.max(1, Z);
            return k.vec2(center.x + f * px * invZ, center.y + f * py * invZ);
        }

        for (let x = 0; x < COLS; x++) {
            centers[x] = [];
            for (let y = 0; y < ROWS; y++) {
                const p = proj(wx(x + 0.5), wy(y + 0.5), 0); // middle plane
                centers[x][y] = p;
                flat.push({ x, y, p });
            }
        }
        function planeGrid(z, arr) {
            for (let iy = 0; iy <= ROWS; iy++) arr.push([proj(wx(0), wy(iy), z), proj(wx(COLS), wy(iy), z)]);
            for (let ix = 0; ix <= COLS; ix++) arr.push([proj(wx(ix), wy(0), z), proj(wx(ix), wy(ROWS), z)]);
        }
        planeGrid(-halfZ, wireFront); // near
        planeGrid(+halfZ, wireBack);  // far
        // Depth connectors only along the border + a sparse interior lattice.
        // (A connector at every grid point looks cluttered and is many extra
        // draw calls per frame — costly on low-end phones.)
        for (let ix = 0; ix <= COLS; ix++)
            for (let iy = 0; iy <= ROWS; iy++) {
                const border = ix === 0 || ix === COLS || iy === 0 || iy === ROWS;
                const lattice = ix % 3 === 0 && iy % 3 === 0;
                if (border || lattice)
                    wireConn.push([proj(wx(ix), wy(iy), -halfZ), proj(wx(ix), wy(iy), +halfZ)]);
            }
    })();

    // ----- initial board: resume a saved game, random fill, or empty -----
    if (saved) {
        board = saved.board;
        currentPlayer = saved.currentPlayer;
        saved.moved.forEach((p) => moved.add(p));
        saved.eliminated.forEach((p) => eliminated.add(p));
    } else if (randomOn) {
        // a densely-filled, balanced, fair-corner random board (everyone's in)
        board = randomFill(eng, numPlayers);
        for (let p = 0; p < numPlayers; p++) moved.add(p);
    }

    // snapshot current match into a resume code
    function currentSaveCode() {
        return encodeState({
            size,
            numPlayers,
            cpuCount,
            difficulty,
            currentPlayer,
            moved,
            eliminated,
            board,
        });
    }

    // Keep the browser URL (and local save) in sync with the live game after
    // every move, so simply copying the address bar resumes exactly here.
    function syncSave() {
        try {
            const code = currentSaveCode();
            writeSaveSlot(code);
            const u = new URLSearchParams(location.search);
            u.set("s", code);
            window.history.replaceState(null, "", location.pathname + "?" + u.toString());
        } catch (e) {
            /* ignore */
        }
    }

    // ----- undo -----
    function pushHistory() {
        undoStack.push({
            board: eng.cloneBoard(board),
            currentPlayer,
            moved: new Set(moved),
            eliminated: new Set(eliminated),
            moveCount,
        });
        if (undoStack.length > 150) undoStack.shift();
    }
    function canUndo() {
        return hasHuman && !resolving && !gameOver && !inExitOverlay && undoStack.length > 0;
    }
    function undo() {
        if (!canUndo()) return;
        // Revert to the previous human decision point (also unwinding any CPU
        // replies that followed the last human move).
        let snap = undoStack.pop();
        while (isCPU[snap.currentPlayer] && undoStack.length > 0) snap = undoStack.pop();
        board = snap.board;
        currentPlayer = snap.currentPlayer;
        moved.clear();
        snap.moved.forEach((p) => moved.add(p));
        eliminated.clear();
        snap.eliminated.forEach((p) => eliminated.add(p));
        moveCount = snap.moveCount;
        syncSave();
        if (isCPU[currentPlayer]) maybeCPU(); // safety: never strand on a CPU turn
    }

    // ----- effects -----
    // an expanding, fading stroke ring (a clean shockwave rather than a blob)
    function ringFx(pos, col, opt = {}) {
        const { startR = RADIUS * 0.6, speed = 240, life = 0.34, width = 2.5, alpha = 0.85 } = opt;
        const fx = k.add([k.pos(pos), k.z(6), { r: startR, t: 0 }]);
        fx.onUpdate(() => {
            fx.t += k.dt();
            fx.r += speed * k.dt();
            if (fx.t >= life) fx.destroy();
        });
        fx.onDraw(() => {
            const a = Math.max(0, alpha * (1 - fx.t / life));
            k.drawCircle({
                pos: k.vec2(0, 0),
                radius: fx.r,
                fill: false,
                outline: { width, color: col },
                opacity: a,
            });
        });
        return fx;
    }

    // explosion: a brief core flash, a shockwave ring, and directional sparks
    function spawnBurst(cx, cy, player) {
        const p = centers[cx][cy];
        const col = colors[player];

        const flash = k.add([
            k.circle(RADIUS * 1.1),
            k.color(mix(col, 0.55)),
            k.pos(p),
            k.anchor("center"),
            k.opacity(0.9),
            k.lifespan(0.16, { fade: 0.14 }),
            k.scale(0.5),
            k.z(6),
        ]);
        k.tween(0.5, 1.7, 0.16, (v) => (flash.scale = k.vec2(v)), k.easings.easeOutQuad);

        ringFx(p, col, { speed: 300, life: 0.36, width: 3 });

        for (const d of eng.neigh[cx][cy]) {
            const dir = k.vec2(d.x - cx, d.y - cy);
            const spark = k.add([
                k.circle(RADIUS * 0.72),
                k.color(col),
                k.pos(p),
                k.anchor("center"),
                k.opacity(1),
                k.scale(1),
                k.z(5),
            ]);
            const dist = CELL_SIZE * 1.5;
            k.tween(p, p.add(dir.scale(dist)), 0.42, (v) => (spark.pos = v), k.easings.easeOutCubic);
            k.tween(1, 0.05, 0.42, (v) => (spark.scale = k.vec2(v)), k.easings.easeOutCubic);
            k.tween(1, 0, 0.42, (v) => (spark.opacity = v), k.easings.easeOutQuad);
            k.wait(0.44, () => spark.destroy());
        }
    }

    // subtle ring pulse when an orb is placed
    function spawnPop(cx, cy, player) {
        ringFx(centers[cx][cy], colors[player], { startR: RADIUS * 0.4, speed: 150, life: 0.28, width: 2 });
    }

    // ----- turn / elimination bookkeeping -----
    function updateEliminations() {
        if (!allMoved()) return;
        const totals = eng.orbTotals(board, numPlayers);
        for (let p = 0; p < numPlayers; p++) {
            if (!eliminated.has(p) && totals[p] === 0) eliminated.add(p);
        }
    }

    function nextPlayer() {
        let p = currentPlayer;
        for (let i = 0; i < numPlayers; i++) {
            p = (p + 1) % numPlayers;
            if (!eliminated.has(p)) return p;
        }
        return currentPlayer;
    }

    // ----- the move pipeline (shared by humans + AI) -----
    function applyMove(mx, my, player) {
        if (resolving || gameOver) return;
        resolving = true;
        pushHistory(); // snapshot for Undo before we mutate anything

        const result = eng.simulateMove(board, mx, my, player, allMoved());
        moved.add(player);

        // place the orb live with a pop
        board[mx][my].count += 1;
        board[mx][my].owner = player;
        impactAt[mx][my] = k.time();
        spawnPop(mx, my, player);
        audio.playClick();

        let i = 0;
        const WAVE_DELAY = result.waves.length > 40 ? 0.05 : 0.09;

        function step() {
            if (i >= result.waves.length) {
                board = result.board; // ensure exact final state
                finishMove(result, player);
                return;
            }
            const wave = result.waves[i++];
            const now = k.time();
            for (const e of wave) {
                board[e.x][e.y].count -= eng.mass[e.x][e.y];
                spawnBurst(e.x, e.y, player);
                for (const n of eng.neigh[e.x][e.y]) {
                    board[n.x][n.y].count += 1;
                    board[n.x][n.y].owner = player;
                    impactAt[n.x][n.y] = now; // neighbour reacts to the blast
                }
            }
            for (const e of wave) {
                board[e.x][e.y].owner = board[e.x][e.y].count > 0 ? player : -1;
            }
            audio.playBurst(); // one explosion sound per wave, not per cell
            pausableWait(WAVE_DELAY, step);
        }

        if (result.waves.length > 0) pausableWait(WAVE_DELAY, step);
        else finishMove(result, player);
    }

    function finishMove(result, player) {
        updateEliminations();
        resolving = false;
        moveCount++;

        if (allMoved() && result.winner !== null && !eliminated.has(result.winner)) {
            gameOver = true;
            clearSavedGame(); // finished — no resume link to leave behind
            const totals = eng.orbTotals(board, numPlayers);
            k.wait(0.3, () =>
                k.go("winner", {
                    winner: result.winner,
                    numPlayers,
                    isCPU,
                    totals,
                }),
            );
            return;
        }

        currentPlayer = nextPlayer();
        syncSave(); // keep the URL + local save current after every move
        maybeCPU();
    }

    // ----- AI turn scheduling -----
    function maybeCPU() {
        if (gameOver || resolving) return;
        if (!isCPU[currentPlayer]) return;
        resolving = true; // lock input while CPU "thinks"
        pausableWait(0.45, () => {
            resolving = false;
            const mv = pickAIMove(eng, board, currentPlayer, numPlayers, difficulty);
            if (mv) applyMove(mv.x, mv.y, currentPlayer);
            else {
                // no legal move (shouldn't happen unless eliminated) -> skip
                currentPlayer = nextPlayer();
                maybeCPU();
            }
        });
    }

    // ----- human input -----
    function handleClick() {
        if (resolving || gameOver || inExitOverlay) return;
        if (isCPU[currentPlayer]) return;
        const mp = k.mousePos();
        let best = null;
        let bestDist = Infinity;
        for (const c of flat) {
            const d = mp.dist(c.p);
            if (d < bestDist) {
                bestDist = d;
                best = c;
            }
        }
        if (best && bestDist < hitRadius) {
            const cell = board[best.x][best.y];
            if (cell.owner === -1 || cell.owner === currentPlayer) {
                applyMove(best.x, best.y, currentPlayer);
            }
        }
    }
    k.onMousePress(() => handleClick());

    // steel base for the grid, subtly tinted toward the current player's colour
    const wireSteel = k.rgb(70, 78, 96);
    // plain shaded line (far plane + connectors — cheap)
    function shadeLine(a, b, col, shade) {
        k.drawLine({ p1: a, p2: b, width: 1.5, color: col, opacity: 0.34 * shade });
    }
    // near-plane line with a soft glow underlay
    function glowLine(a, b, col, shade) {
        k.drawLine({ p1: a, p2: b, width: 5, color: col, opacity: 0.045 * shade });
        k.drawLine({ p1: a, p2: b, width: 1.8, color: col, opacity: 0.46 * shade });
    }
    // A shaded sphere built from offset layers lit from the upper-left:
    // ambient glow → dark rim → mid body → lit cap → specular hotspot.
    const BLACK = k.rgb(0, 0, 0);
    const WHITE = k.rgb(255, 255, 255);
    function orb(p, col, r) {
        k.drawCircle({ pos: p, radius: r * 1.5, color: col, opacity: 0.1 }); // ambient glow
        k.drawCircle({ pos: p, radius: r, color: blend(col, BLACK, 0.42) }); // dark rim
        k.drawCircle({ pos: p.add(k.vec2(-r * 0.16, -r * 0.18)), radius: r * 0.85, color: col }); // body
        k.drawCircle({
            pos: p.add(k.vec2(-r * 0.26, -r * 0.3)),
            radius: r * 0.5,
            color: blend(col, WHITE, 0.26),
        }); // lit cap
        k.drawCircle({
            pos: p.add(k.vec2(-r * 0.32, -r * 0.36)),
            radius: r * 0.16,
            color: blend(col, WHITE, 0.7),
            opacity: 0.95,
        }); // specular
    }

    // ----- rendering -----
    k.onDraw(() => {
        const t = k.time();
        const wireCol = blend(wireSteel, colors[currentPlayer], 0.4); // desaturated tint

        // depth-shaded wireframe box
        for (const [a, b] of wireBack) shadeLine(a, b, wireCol, 0.5);
        for (const [a, b] of wireConn) shadeLine(a, b, wireCol, 0.7);
        for (const [a, b] of wireFront) glowLine(a, b, wireCol, 1.0);

        // orbs
        for (let x = 0; x < COLS; x++) {
            for (let y = 0; y < ROWS; y++) {
                const cell = board[x][y];
                if (cell.count === 0) continue;
                const col = colors[cell.owner] || k.rgb(200, 200, 200);
                const p = centers[x][y];
                const m = eng.mass[x][y];
                const critical = cell.count >= m - 1;
                const shakeX = critical ? Math.sin(t * 22 + x) * 2 : 0;
                const shakeY = critical ? Math.cos(t * 22 + y) * 2 : 0;
                // reactive pop when a blast just landed here (overshoot -> settle)
                const dt = t - impactAt[x][y];
                const pop = dt >= 0 && dt < 0.3 ? Math.sin((dt / 0.3) * Math.PI) * 0.45 : 0;
                const r = RADIUS * (1 + pop);

                if (cell.count === 1) {
                    orb(p.add(k.vec2(shakeX, shakeY)), col, r);
                } else {
                    for (let i = 0; i < cell.count; i++) {
                        const ang = t * 2 + (i * Math.PI * 2) / cell.count;
                        const off = k.vec2(
                            Math.cos(ang) * ORBIT_RADIUS + shakeX,
                            Math.sin(ang) * ORBIT_RADIUS * 0.6 + shakeY,
                        );
                        orb(p.add(off), col, r);
                    }
                }
            }
        }
    });

    // ----- turn indicator (drawn on top) -----
    // The banner is centred but sized to sit clear of the Undo (left) and Exit
    // (right) corner buttons, so nothing overlaps at any player count.
    k.onDraw(() => {
        const curCol = colors[currentPlayer];
        const cx = k.width() / 2;
        const baseLabel = isCPU[currentPlayer]
            ? `Player ${currentPlayer + 1} · CPU`
            : `Player ${currentPlayer + 1}`;
        const label = gameOver
            ? "…"
            : resolving && isCPU[currentPlayer]
              ? baseLabel + " · thinking…"
              : baseLabel;
        const bannerW = 430;
        k.drawRect({
            pos: k.vec2(cx, 60),
            width: bannerW,
            height: 66,
            anchor: "center",
            radius: 12,
            color: UI.panel,
            outline: { width: 1.5, color: blend(UI.border, curCol, 0.6) },
        });
        // colour chip + label, kept as a centred group inside the banner
        k.drawCircle({ pos: k.vec2(cx - bannerW / 2 + 30, 60), radius: 9, color: curCol });
        k.drawText({
            text: label,
            pos: k.vec2(cx + 16, 60),
            size: 27,
            width: bannerW - 90,
            anchor: "center",
            font: FONT_BOLD,
            color: blend(UI.text, curCol, 0.35),
        });
        // player dots (spacing shrinks so a full 8-player row still fits)
        const totals = eng.orbTotals(board, numPlayers);
        const gap = Math.min(60, Math.floor(760 / numPlayers));
        const startX = cx - ((numPlayers - 1) * gap) / 2;
        for (let p = 0; p < numPlayers; p++) {
            const px = startX + p * gap;
            const py = 124;
            const out = eliminated.has(p);
            const isCur = p === currentPlayer && !gameOver;
            k.drawCircle({
                pos: k.vec2(px, py),
                radius: isCur ? 17 : 13,
                color: out ? dim(colors[p], 0.25) : colors[p],
                outline: isCur ? { width: 2, color: UI.text } : undefined,
            });
            k.drawText({
                text: out ? "✕" : String(totals[p]),
                pos: k.vec2(px, py),
                size: 15,
                anchor: "center",
                color: k.rgb(12, 14, 20),
            });
        }
    });

    // ----- top-bar corner buttons (clear of the centred banner) -----
    // Exit: right corner.
    const exitBtn = makeButton("✕", k.width() - 62, 60, 64, 56, { size: 30, layer: "ui" });
    exitBtn.onClick(() => {
        if (!inExitOverlay && !gameOver) showConfirmOverlay();
    });

    // Undo: left corner (only for games with a human player).
    if (hasHuman) {
        const undoBtn = makeButton("↶ Undo", 96, 60, 128, 56, { size: 22, layer: "ui" });
        undoBtn.onClick(() => {
            if (canUndo()) undo();
        });
        undoBtn.onUpdate(() => {
            undoBtn.hidden = !(undoStack.length > 0 && !gameOver);
            // full strength only when a move can actually be taken back
            undoBtn.opacity = canUndo() ? 1 : 0.35;
        });
    }

    let overlayObjs = [];
    function showConfirmOverlay() {
        inExitOverlay = true;
        paused = true; // freeze the game while the menu is open
        exitBtn.hidden = true;
        const totals = eng.orbTotals(board, numPlayers);
        const cy = k.height() / 2;
        const h = 470 + numPlayers * 44;

        overlayObjs.push(
            k.add([
                k.rect(k.width(), k.height()),
                k.opacity(0.78),
                k.color(0, 0, 0),
                k.pos(0, 0),
                k.layer("overlay"),
            ]),
        );
        const box = k.add([
            k.rect(660, h, { radius: 16 }),
            k.color(UI.panel),
            k.pos(k.width() / 2, cy),
            k.anchor("center"),
            k.outline(1.5, UI.border),
            k.layer("overlay"),
        ]);
        overlayObjs.push(box);
        box.add([
            k.text("Paused", { size: 38, font: FONT_BOLD }),
            k.color(UI.text),
            k.pos(0, -h / 2 + 46),
            k.anchor("center"),
        ]);
        for (let p = 0; p < numPlayers; p++) {
            box.add([
                k.text(`Player ${p + 1}${isCPU[p] ? " · CPU" : ""}: ${totals[p]}`, { size: 25 }),
                k.color(blend(UI.text, colors[p], 0.55)),
                k.pos(0, -h / 2 + 100 + p * 42),
                k.anchor("center"),
            ]);
        }

        // Save to device  |  Copy shareable link — two independent actions
        box.add([
            k.text("Save to this device, or copy a link to continue anywhere", {
                size: 20,
                width: 580,
                align: "center",
            }),
            k.color(UI.textDim),
            k.pos(0, h / 2 - 250),
            k.anchor("center"),
        ]);
        const saveBtn = makeButton("Save", k.width() / 2 - 150, cy + h / 2 - 190, 260, 60, {
            base: UI.panelHi,
            outline: UI.good,
            textColor: UI.good,
            size: 26,
            layer: "overlay",
        });
        saveBtn.onClick(() => {
            writeSaveSlot(currentSaveCode());
            const lbl = saveBtn.children[0];
            lbl.text = "Saved ✓";
            k.wait(1.3, () => {
                if (lbl.exists()) lbl.text = "Save";
            });
        });
        overlayObjs.push(saveBtn);
        const copyBtn = makeButton("⤴  Copy Link", k.width() / 2 + 150, cy + h / 2 - 190, 260, 60, {
            base: UI.panelHi,
            outline: UI.accent,
            textColor: UI.accent,
            size: 26,
            layer: "overlay",
        });
        copyBtn.onClick(() => {
            const code = currentSaveCode();
            writeSaveSlot(code);
            showSaveModal(buildResumeUrl(code));
        });
        overlayObjs.push(copyBtn);

        // Quit / Resume
        const yes = makeButton("Quit to Menu", k.width() / 2 - 150, cy + h / 2 - 55, 260, 64, {
            base: UI.panel,
            outline: blend(UI.border, UI.danger, 0.5),
            textColor: blend(UI.text, UI.danger, 0.5),
            size: 25,
            layer: "overlay",
        });
        yes.onClick(() => {
            removeSaveModal();
            k.go("menu");
        });
        overlayObjs.push(yes);
        const no = makeButton("Resume", k.width() / 2 + 150, cy + h / 2 - 55, 260, 64, {
            base: UI.good,
            textColor: k.rgb(10, 16, 12),
            outline: blend(UI.good, k.rgb(255, 255, 255), 0.3),
            size: 27,
            layer: "overlay",
        });
        no.onClick(() => destroyOverlay());
        overlayObjs.push(no);
    }
    function destroyOverlay() {
        removeSaveModal();
        overlayObjs.forEach((o) => o.destroy());
        overlayObjs = [];
        inExitOverlay = false;
        paused = false; // resume the game
        exitBtn.hidden = false;
    }

    k.onKeyPress("escape", () => {
        if (inExitOverlay) destroyOverlay();
        else if (!gameOver) showConfirmOverlay();
    });

    // kick things off (in case player 0 is a CPU / all-CPU watch mode)
    maybeCPU();
});
