import { k, FONT_BOLD } from "../k.js";
import { colors, UI, isColorblind } from "../theme.js";
import { makeButton, fadeIn, dim, mix, blend, drawOrb, playerName } from "../ui.js";
import { makeEngine, pickAIMove, randomFill, legalMoves } from "../engine.js";
import { encodeState } from "../state.js";
import { GRID_SIZES, clampSize } from "../grids.js";
import { TIMER_OFF, timerSeconds, timerLabel, clampTimer } from "../timer.js";
import { cfg, savePrefs } from "../prefs.js";
import { writeSaveSlot, buildResumeUrl, clearSavedGame, showSaveModal, removeSaveModal } from "../storage.js";
import { removeNameModal } from "../namedialog.js";
import { removeMusicModal } from "../musicmodal.js";
import { removeCreditFooter } from "../credits.js";
import { botName } from "../bots.js";
import { recordMove, recordGameEnd } from "../stats.js";
import { buzzBurst, buzzWin } from "../haptics.js";
import * as audio from "../audio.js";

k.scene("game", (opts) => {
    fadeIn();
    removeNameModal(); // never let a menu dialog linger into the game
    removeMusicModal();
    removeCreditFooter();
    const saved = opts.saved || null;
    const numPlayers = saved ? saved.numPlayers : opts.numPlayers;
    const cpuCount = saved ? saved.cpuCount : opts.cpuCount;
    const difficulty = saved ? saved.difficulty : opts.difficulty;
    const size = clampSize(saved ? saved.size : opts.size);
    const randomOn = saved ? false : opts.randomOn;
    // custom names are device-local: use the ones passed in, else this device's
    // saved names (covers resume-from-link, which doesn't carry names)
    const names = opts.names || cfg.names || [];
    const reduceMotion =
        typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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

    // ----- optional per-turn timer -----
    // A live global pref (also settable from the pause panel), deliberately NOT
    // baked into the save code — a resumed game adopts your current timer setting.
    // `timerSecs === 0` = Off. While a human is on the clock it counts down; when
    // it hits zero we auto-play a random legal move (which may set off a cascade).
    let timerIdx = clampTimer(opts.timer != null ? opts.timer : cfg.timer);
    let timerSecs = timerSeconds(timerIdx);
    let timeLeft = timerSecs;         // seconds remaining on the current turn
    // don't run the clock during the opening fade-in — otherwise the first human
    // turn silently loses ~0.4s before the board is really interactive
    const readyAt = k.time() + 0.4;

    // peak orb count each player has held at any single point this game (a fun
    // "high-water mark" stat shown in the pause panel and final scoreboard). It's
    // a per-session mark — resuming a saved game reseeds it from the board.
    const peakOrbs = new Array(numPlayers).fill(0);
    function trackPeak() {
        const totals = eng.orbTotals(board, numPlayers);
        for (let p = 0; p < numPlayers; p++) if (totals[p] > peakOrbs[p]) peakOrbs[p] = totals[p];
    }

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
        // 0.72 so a tap anywhere inside a cell's square (corner ≈ 0.707 of the
        // spacing from centre) still lands, without bleeding far past the board
        hitRadius = (cellSize * f) / camDist * 0.72;

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
    trackPeak(); // seed the high-water mark from the opening position

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
            peakOrbs: peakOrbs.slice(), // keep the high-water stat consistent with undo
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
        if (snap.peakOrbs) for (let p = 0; p < numPlayers; p++) peakOrbs[p] = snap.peakOrbs[p];
        moveCount = snap.moveCount;
        timeLeft = timerSecs; // don't punish the restored player with a stale clock
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

    // Explosion FX (flash + shockwave ring + directional sparks). Each effect is
    // a live game object with per-frame callbacks, so a huge multi-wave cascade
    // could spawn thousands at once and stutter. We cap the number of *rich*
    // effects on screen; beyond that, cells still get a cheap flash (and the
    // board/impact-pop still animate), so it stays lively but smooth.
    let heavyFx = 0;
    const FX_CAP = 44;
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

        if (heavyFx >= FX_CAP) return; // saturated -> keep just the cheap flash
        heavyFx++;
        k.wait(0.5, () => (heavyFx = Math.max(0, heavyFx - 1)));

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

    // a distinct double-ring "time's up" ping so an auto-placed orb reads clearly
    // as the clock firing rather than a move the player made
    function spawnTimeoutFlash(cx, cy) {
        const p = centers[cx][cy];
        ringFx(p, UI.danger, { startR: RADIUS * 0.5, speed: 260, life: 0.42, width: 3.5, alpha: 0.95 });
        ringFx(p, mix(UI.danger, 0.5), { startR: RADIUS * 0.5, speed: 170, life: 0.5, width: 2.5, alpha: 0.7 });
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
    let comboFx = null; // live "×N CHAIN!" popup during a cascade (fixed, off the shake)
    function applyMove(mx, my, player) {
        if (resolving || gameOver) return;
        resolving = true;
        pushHistory(); // snapshot for Undo before we mutate anything

        const result = eng.simulateMove(board, mx, my, player, allMoved());
        moved.add(player);

        // haptic accent on a cascade (never in all-CPU watch mode)
        if (hasHuman && result.waves.length > 0) {
            let cells = 0;
            for (const w of result.waves) cells += w.length;
            buzzBurst(cells);
        }

        // start a "×N CHAIN!" popup for a real chain reaction (fixed so it stays
        // steady while the board shakes); step() counts it up and fades it out
        if (comboFx) {
            comboFx.destroy();
            comboFx = null;
        }
        if (result.waves.length >= 3) {
            comboFx = k.add([
                k.text("", { size: 54, font: FONT_BOLD }),
                k.pos(k.width() / 2, k.height() / 2 - 120),
                k.anchor("center"),
                k.color(colors[player]),
                k.opacity(0),
                k.scale(0.6),
                k.fixed(),
                k.layer("overlay"),
                k.z(1200),
            ]);
        }

        // place the orb live with a pop
        board[mx][my].count += 1;
        board[mx][my].owner = player;
        impactAt[mx][my] = k.time();
        spawnPop(mx, my, player);
        audio.playPlace();

        let i = 0;
        const WAVE_DELAY = result.waves.length > 40 ? 0.05 : 0.09;

        function step() {
            if (i >= result.waves.length) {
                board = result.board; // ensure exact final state
                if (comboFx) {
                    const c = comboFx; // pop + fade out the chain popup
                    comboFx = null;
                    if (!reduceMotion) k.tween(1.0, 1.4, 0.28, (v) => c.exists() && (c.scale = k.vec2(v)), k.easings.easeOutQuad);
                    k.tween(1, 0, 0.35, (v) => c.exists() && (c.opacity = v), k.easings.easeOutQuad);
                    k.wait(0.4, () => c.exists() && c.destroy());
                }
                finishMove(result, player);
                return;
            }
            const wave = result.waves[i++];
            const now = k.time();
            // screen shake scaled to the wave (k.shake accumulates across waves,
            // so keep each call small); skip under reduced-motion
            if (!reduceMotion && wave.length >= 2) k.shake(Math.min(4, 0.6 + wave.length * 0.35));
            // count the chain popup up as it ripples (starts showing at ×2)
            if (comboFx && i >= 2) {
                const cf = comboFx; // capture: comboFx is nulled at cascade end
                cf.text = `×${i} CHAIN!`;
                cf.opacity = 1;
                if (!reduceMotion)
                    k.tween(1.25, 1.0, 0.16, (v) => cf.exists() && (cf.scale = k.vec2(v)), k.easings.easeOutQuad);
            }
            let waveFx = 0; // cap burst effects per wave so dense waves stay smooth
            for (const e of wave) {
                board[e.x][e.y].count -= eng.mass[e.x][e.y];
                if (waveFx++ < 16) spawnBurst(e.x, e.y, player);
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
        trackPeak(); // update each player's high-water orb count
        if (!isCPU[player]) recordMove(result.waves); // records reflect the human's own moves
        resolving = false;
        moveCount++;

        if (allMoved() && result.winner !== null && !eliminated.has(result.winner)) {
            gameOver = true;
            clearSavedGame(); // finished — no resume link to leave behind
            // only count games you actually played (skip all-CPU watch mode)
            if (hasHuman) {
                recordGameEnd({ difficulty, hadCPU: cpuCount > 0, youWon: result.winner === 0 });
                buzzWin();
            }
            const totals = eng.orbTotals(board, numPlayers);
            k.wait(0.3, () =>
                k.go("winner", {
                    winner: result.winner,
                    numPlayers,
                    isCPU,
                    totals,
                    peaks: peakOrbs.slice(),
                    // setup echoed back so the winner screen can offer a Rematch
                    cpuCount,
                    difficulty,
                    size,
                    randomOn,
                    timer: timerIdx,
                    names,
                }),
            );
            return;
        }

        currentPlayer = nextPlayer();
        timeLeft = timerSecs; // fresh countdown for whoever is up next
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

    // ----- per-turn timer -----
    // The clock only runs on a live human turn: never while a cascade resolves,
    // a CPU is thinking, the game is paused/over, or the exit panel is open.
    function timerActive() {
        return (
            timerSecs > 0 &&
            k.time() >= readyAt &&
            !paused &&
            !inExitOverlay &&
            !gameOver &&
            !resolving &&
            !isCPU[currentPlayer]
        );
    }

    // time's up → drop the current player's orb on a random legal cell. This is
    // deliberately unfiltered: it can land on a near-critical cell and kick off a
    // chain reaction that bursts other players (or the player's own) cells.
    function autoPlaceRandom() {
        if (resolving || gameOver || paused || inExitOverlay) return;
        const moves = legalMoves(eng, board, currentPlayer);
        if (moves.length === 0) {
            // no legal cell (only if somehow eliminated) — pass the turn on
            currentPlayer = nextPlayer();
            timeLeft = timerSecs;
            maybeCPU();
            return;
        }
        const mv = moves[Math.floor(Math.random() * moves.length)];
        spawnTimeoutFlash(mv.x, mv.y);
        applyMove(mv.x, mv.y, currentPlayer);
    }

    k.onUpdate(() => {
        if (!timerActive()) return;
        timeLeft -= k.dt();
        if (timeLeft <= 0) {
            timeLeft = 0;
            autoPlaceRandom();
        }
    });

    // change / disable the timer live (from the pause panel). We update state
    // every frame during a drag but defer the localStorage write to drag-release
    // (persistTimerPref) so we don't hammer it ~60x/sec.
    let timerDirty = false;
    function setTimerIdx(idx) {
        timerIdx = clampTimer(idx);
        timerSecs = timerSeconds(timerIdx);
        timeLeft = timerSecs; // apply to the current turn immediately
        cfg.timer = timerIdx;
        timerDirty = true;
    }
    function persistTimerPref() {
        if (!timerDirty) return;
        timerDirty = false;
        savePrefs();
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
    // Orbs use the shared, memoised drawOrb (see ui.js) so the board and the
    // how-to-play diagrams look identical and the per-frame shading is cached.
    const orb = drawOrb;

    // Colour-blind numerals: pre-lay-out each digit ONCE (a glyph + a dark
    // shadow) so the per-frame board render just blits cached quads instead of
    // re-shaping text for every occupied cell (that per-cell drawText was the
    // colour-blind-mode lag). Positioned per cell with a cheap transform push.
    const NUM_SIZE = Math.max(11, RADIUS * 1.25);
    const cbGlyph = [];
    for (let d = 0; d < 8; d++) {
        cbGlyph[d] = k.formatText({
            text: String(d + 1),
            size: NUM_SIZE,
            anchor: "center",
            font: FONT_BOLD,
            color: UI.text, // light fill…
            outline: { width: Math.max(3, NUM_SIZE * 0.22), color: k.rgb(0, 0, 0) }, // …with a bold dark outline
        });
    }

    // ----- rendering -----
    k.onDraw(() => {
        const t = k.time();
        const cbMode = isColorblind(); // stamp a player numeral on each cell
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
                    // cap the orbiting orbs at critical mass — during a cascade a
                    // cell transiently holds more than that for a few frames before
                    // it explodes, and drawing 5-7 orbs there just burns draw calls
                    const n = Math.min(cell.count, m);
                    for (let i = 0; i < n; i++) {
                        const ang = t * 2 + (i * Math.PI * 2) / n;
                        const off = k.vec2(
                            Math.cos(ang) * ORBIT_RADIUS + shakeX,
                            Math.sin(ang) * ORBIT_RADIUS * 0.6 + shakeY,
                        );
                        orb(p.add(off), col, r);
                    }
                }
            }
        }

        // colour-blind aid: player numerals in a SEPARATE pass so all the glyph
        // quads batch together instead of forcing a texture switch (shapes <->
        // font atlas) on every cell — that interleaving was the remaining lag.
        if (cbMode) {
            for (let x = 0; x < COLS; x++) {
                for (let y = 0; y < ROWS; y++) {
                    const cell = board[x][y];
                    if (cell.count === 0) continue;
                    const p = centers[x][y];
                    k.pushTransform();
                    k.pushTranslate(p.x, p.y);
                    k.drawFormattedText(cbGlyph[cell.owner]);
                    k.popTransform();
                }
            }
        }
    });

    // ----- turn indicator (drawn on top) -----
    // The banner is centred but sized to sit clear of the Undo (left) and Exit
    // (right) corner buttons, so nothing overlaps at any player count.
    const BANNER_W = 460;
    const BANNER_MAXW = 388; // inner width available for the label group
    // Fit the label into the banner: shrink the font, then truncate if it's still
    // too wide (long custom names + bot persona + "thinking…"). Memoised by string
    // so we only re-measure when the label actually changes.
    let _bLabel = null;
    let _bFit = null;
    function fitBannerLabel(label) {
        if (label === _bLabel) return _bFit;
        let size = 27;
        let text = label;
        let ft = k.formatText({ text, size, font: FONT_BOLD });
        while (ft.width > BANNER_MAXW && size > 15) {
            size -= 1;
            ft = k.formatText({ text, size, font: FONT_BOLD });
        }
        if (ft.width > BANNER_MAXW) {
            while (text.length > 1 && k.formatText({ text: text + "…", size, font: FONT_BOLD }).width > BANNER_MAXW) {
                text = text.slice(0, -1);
            }
            text += "…";
            ft = k.formatText({ text, size, font: FONT_BOLD });
        }
        _bLabel = label;
        _bFit = { text, size, width: ft.width };
        return _bFit;
    }
    k.onDraw(() => {
        const curCol = colors[currentPlayer];
        const cx = k.width() / 2;
        const baseLabel = isCPU[currentPlayer]
            ? `${playerName(names, currentPlayer)} · ${botName(difficulty)}`
            : playerName(names, currentPlayer);
        const label = gameOver
            ? "…"
            : resolving && isCPU[currentPlayer]
              ? baseLabel + " · thinking…"
              : baseLabel;
        k.drawRect({
            pos: k.vec2(cx, 60),
            width: BANNER_W,
            height: 66,
            anchor: "center",
            radius: 12,
            color: UI.panel,
            outline: { width: 1.5, color: blend(UI.border, curCol, 0.6) },
        });
        // colour chip + label as a single centred group, auto-fitted to the banner
        const fit = fitBannerLabel(label);
        k.drawText({
            text: fit.text,
            pos: k.vec2(cx + 12, 60),
            size: fit.size,
            anchor: "center",
            font: FONT_BOLD,
            color: blend(UI.text, curCol, 0.35),
        });
        k.drawCircle({ pos: k.vec2(cx + 12 - fit.width / 2 - 16, 60), radius: 9, color: curCol });
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

    // ----- countdown clock (only when the timer is enabled) -----
    // A depleting pie that empties clockwise from the top, tinted to the current
    // player and flushing red in the final seconds. Sits under the Exit button on
    // the right, mirroring the Undo button on the left, clear of the board.
    k.onDraw(() => {
        if (timerSecs <= 0 || gameOver || inExitOverlay || resolving) return;
        if (isCPU[currentPlayer]) return; // no clock on CPU turns
        const cx = k.width() - 62;
        const cy = 132;
        const curCol = colors[currentPlayer];
        const frac = Math.max(0, Math.min(1, timeLeft / timerSecs));
        const low = timeLeft <= 3 && !paused;
        const ringCol = low ? UI.danger : curCol;
        const pulse = low ? 1 + Math.sin(k.time() * 12) * 0.05 : 1;
        const R = 34 * pulse;
        // face
        k.drawCircle({
            pos: k.vec2(cx, cy),
            radius: R,
            color: UI.panel,
            outline: { width: 2, color: blend(UI.border, ringCol, 0.7) },
        });
        // depleting wedge (start at top, sweep clockwise)
        if (frac > 0.001) {
            k.drawCircle({
                pos: k.vec2(cx, cy),
                radius: R - 5,
                color: ringCol,
                opacity: 0.3,
                start: -90,
                end: -90 + 360 * frac,
            });
        }
        // remaining whole seconds
        k.drawText({
            text: String(Math.ceil(timeLeft)),
            pos: k.vec2(cx, cy),
            size: 26,
            anchor: "center",
            font: FONT_BOLD,
            color: blend(UI.text, ringCol, 0.4),
        });
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

    // The pause panel carries a live timer slider. Its drag handlers are wired
    // once here and act only while the panel (and thus the handle) is on screen,
    // so repeated pause/resume cycles don't stack up stale listeners.
    let timerHandle = null;     // the draggable knob (exists only while paused)
    let timerSliderGeom = null; // { startX, w, place }
    let timerDragging = false;
    k.onMouseDown(() => {
        if (!inExitOverlay || !timerSliderGeom || !timerHandle || !timerHandle.exists()) return;
        if (timerHandle.isHovering()) timerDragging = true;
        if (!timerDragging) return;
        const { startX, w } = timerSliderGeom;
        const x = Math.max(startX, Math.min(startX + w, k.mousePos().x));
        setTimerIdx(Math.round(((x - startX) / w) * TIMER_OFF));
        timerSliderGeom.place();
    });
    k.onMouseRelease(() => {
        timerDragging = false;
        persistTimerPref(); // write the chosen timer to prefs once, on release
    });

    function showConfirmOverlay() {
        inExitOverlay = true;
        paused = true; // freeze the game while the menu is open
        exitBtn.hidden = true;
        const totals = eng.orbTotals(board, numPlayers);
        const cy = k.height() / 2;
        // sequential vertical offsets (from the box top) so everything is evenly
        // spaced regardless of player count — avoids a gap in the middle
        const rowsEnd = 128 + (numPlayers - 1) * 40; // last stats row
        const oTimer = rowsEnd + 58; // timer slider label
        const oHint = oTimer + 70 + 46; // save/continue hint (after label+track+caption)
        const oSave = oHint + 52; // Save / Copy row
        const oRestart = oSave + 76; // Restart row
        const oQuit = oRestart + 76; // Quit / Resume row
        const h = oQuit + 74;
        const yAbs = (o) => cy - h / 2 + o; // absolute screen y for offset o
        const boxY = (o) => o - h / 2; // box-relative y for offset o

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
            k.pos(0, boxY(46)),
            k.anchor("center"),
        ]);
        // stats table (box-relative coords): colour dot + name (left), orbs and
        // peak right-aligned into fixed columns so every row lines up
        const xDot = -250;
        const xName = -228;
        const xOrbs = 150;
        const xPeak = 250;
        box.add([
            k.text("ORBS", { size: 15, letterSpacing: 1, font: FONT_BOLD }),
            k.color(UI.textDim),
            k.pos(xOrbs, boxY(96)),
            k.anchor("right"),
        ]);
        box.add([
            k.text("PEAK", { size: 15, letterSpacing: 1, font: FONT_BOLD }),
            k.color(UI.textDim),
            k.pos(xPeak, boxY(96)),
            k.anchor("right"),
        ]);
        for (let p = 0; p < numPlayers; p++) {
            const ry = boxY(128 + p * 40);
            box.add([
                k.circle(8),
                k.pos(xDot, ry),
                k.anchor("center"),
                k.color(eliminated.has(p) ? dim(colors[p], 0.4) : colors[p]),
            ]);
            box.add([
                k.text(`${playerName(names, p)}${isCPU[p] ? " · " + botName(difficulty) : ""}`, { size: 23 }),
                k.color(blend(UI.text, colors[p], 0.5)),
                k.pos(xName, ry),
                k.anchor("left"),
            ]);
            box.add([
                k.text(String(totals[p]), { size: 23, font: FONT_BOLD }),
                k.color(UI.text),
                k.pos(xOrbs, ry),
                k.anchor("right"),
            ]);
            box.add([
                k.text(String(peakOrbs[p]), { size: 23 }),
                k.color(UI.textDim),
                k.pos(xPeak, ry),
                k.anchor("right"),
            ]);
        }

        // ---- live turn-timer slider (change or disable mid-game) ----
        {
            const cx = k.width() / 2;
            const w = 460;
            const startX = cx - w / 2;
            const yLabel = yAbs(oTimer);
            const yTrack = yLabel + 42;
            const label = k.add([
                k.text("", { size: 24, font: FONT_BOLD }),
                k.color(UI.text),
                k.pos(cx, yLabel),
                k.anchor("center"),
                k.layer("overlay"),
            ]);
            overlayObjs.push(label);
            overlayObjs.push(
                k.add([
                    k.rect(w, 6, { radius: 3 }),
                    k.pos(cx, yTrack),
                    k.anchor("center"),
                    k.color(UI.border),
                    k.layer("overlay"),
                ]),
            );
            const fill = k.add([
                k.rect(1, 6, { radius: 3 }),
                k.pos(startX, yTrack),
                k.anchor("left"),
                k.color(UI.accent),
                k.layer("overlay"),
            ]);
            overlayObjs.push(fill);
            const handle = k.add([
                k.circle(16),
                k.pos(startX, yTrack),
                k.anchor("center"),
                k.color(UI.accent),
                k.outline(2, UI.bg),
                k.area(),
                k.layer("overlay"),
            ]);
            handle.onHover(() => k.setCursor("pointer"));
            handle.onHoverEnd(() => k.setCursor("default"));
            overlayObjs.push(handle);
            overlayObjs.push(
                k.add([
                    k.text("when it runs out, a random orb is auto-placed for you", { size: 17 }),
                    k.color(UI.textDim),
                    k.pos(cx, yTrack + 28),
                    k.anchor("center"),
                    k.layer("overlay"),
                ]),
            );
            function place() {
                const r = timerIdx / TIMER_OFF;
                handle.pos.x = startX + r * w;
                fill.width = Math.max(1, r * w);
                label.text = `Turn Timer: ${timerLabel(timerIdx)}`;
            }
            timerHandle = handle;
            timerSliderGeom = { startX, w, place };
            place();
        }

        // Save to device  |  Copy shareable link — two independent actions
        box.add([
            k.text("Save to this device, or copy a link to continue anywhere", {
                size: 20,
                width: 580,
                align: "center",
            }),
            k.color(UI.textDim),
            k.pos(0, boxY(oHint)),
            k.anchor("center"),
        ]);
        const saveBtn = makeButton("Save", k.width() / 2 - 150, yAbs(oSave), 260, 60, {
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
        const copyBtn = makeButton("⤴  Copy Link", k.width() / 2 + 150, yAbs(oSave), 260, 60, {
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

        // Restart the same match from scratch — two taps to confirm
        let restartArmed = false;
        const restartBtn = makeButton("Restart game", k.width() / 2, yAbs(oRestart), 420, 60, {
            base: UI.panel,
            outline: blend(UI.border, UI.danger, 0.5),
            textColor: blend(UI.text, UI.danger, 0.4),
            size: 25,
            layer: "overlay",
        });
        restartBtn.onClick(() => {
            const lbl = restartBtn.children[0];
            if (!restartArmed) {
                restartArmed = true;
                lbl.text = "Tap again to restart";
                k.wait(2.5, () => {
                    if (restartBtn.exists() && restartArmed) {
                        restartArmed = false;
                        lbl.text = "Restart game";
                    }
                });
                return;
            }
            removeSaveModal();
            clearSavedGame(); // abandon the current match's save
            k.go("game", { numPlayers, cpuCount, difficulty, size, randomOn, timer: timerIdx, names });
        });
        overlayObjs.push(restartBtn);

        // Quit / Resume
        const yes = makeButton("Quit to Menu", k.width() / 2 - 150, yAbs(oQuit), 260, 64, {
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
        const no = makeButton("Resume", k.width() / 2 + 150, yAbs(oQuit), 260, 64, {
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
        persistTimerPref(); // safety: make sure a timer change is saved on close
        overlayObjs.forEach((o) => o.destroy());
        overlayObjs = [];
        timerHandle = null; // slider knob is gone; drag handlers go dormant
        timerSliderGeom = null;
        timerDragging = false;
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
