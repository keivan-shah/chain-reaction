import { k, FONT_BOLD } from "../k.js";
import { colors, UI } from "../theme.js";
import { fadeIn, blend, dim, makeButton, playerName } from "../ui.js";
import { botName } from "../bots.js";

k.scene("winner", ({ winner, numPlayers, isCPU, totals, peaks, cpuCount, difficulty, size, randomOn, timer, names }) => {
    fadeIn(0.5);
    const winColor = colors[winner];
    k.setCursor("default");

    k.add([
        k.text(`${playerName(names, winner)}${isCPU && isCPU[winner] ? " · " + botName(difficulty) : ""}`, {
            size: 84,
            letterSpacing: 2,
            font: FONT_BOLD,
        }),
        k.pos(k.width() / 2, k.height() / 2 - 150),
        k.anchor("center"),
        k.color(blend(UI.text, winColor, 0.55)),
    ]);
    k.add([
        k.text("WINS", { size: 44, letterSpacing: 12, font: FONT_BOLD }),
        k.pos(k.width() / 2, k.height() / 2 - 78),
        k.anchor("center"),
        k.color(UI.textDim),
    ]);

    // final scoreboard — a real table (fixed columns, right-aligned numbers) so
    // ranks/names/scores line up. Shows each player's final orb count and their
    // peak (high-water) count, so a knocked-out player's best moment still shows.
    if (totals) {
        const cx = k.width() / 2;
        const hasPeak = Array.isArray(peaks);
        // column x-anchors (name left-aligned; numbers right-aligned)
        const xDot = cx - 250;
        const xName = cx - 228;
        const xOrbs = hasPeak ? cx + 150 : cx + 240;
        const xPeak = cx + 258;
        const rowH = 46;
        const y0 = k.height() / 2 - 8; // header baseline
        const rowY = (rank) => y0 + 44 + rank * rowH;

        // header
        const head = (text, x, anchor) =>
            k.add([
                k.text(text, { size: 18, letterSpacing: 2, font: FONT_BOLD }),
                k.pos(x, y0),
                k.anchor(anchor),
                k.color(UI.textDim),
            ]);
        head("PLAYER", xName, "left");
        head("ORBS", xOrbs, "right");
        if (hasPeak) head("PEAK", xPeak, "right");

        const order = totals.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
        order.forEach((o, rank) => {
            const y = rowY(rank);
            const isWin = o.i === winner;
            // highlight the winner's row
            if (isWin) {
                k.add([
                    k.rect(560, 40, { radius: 9 }),
                    k.pos(cx, y),
                    k.anchor("center"),
                    k.color(blend(UI.panel, winColor, 0.16)),
                    k.outline(1.5, blend(UI.border, winColor, 0.5)),
                ]);
            }
            const rowCol = isWin ? blend(UI.text, winColor, 0.4) : UI.text;
            // colour dot
            k.add([
                k.circle(9),
                k.pos(xDot, y),
                k.anchor("center"),
                k.color(o.v > 0 ? colors[o.i] : dim(colors[o.i], 0.4)),
            ]);
            // rank + name (left)
            k.add([
                k.text(`${rank + 1}.  ${playerName(names, o.i)}${isCPU && isCPU[o.i] ? " · " + botName(difficulty) : ""}`, {
                    size: 26,
                }),
                k.pos(xName, y),
                k.anchor("left"),
                k.color(rowCol),
            ]);
            // orbs (right)
            k.add([
                k.text(String(o.v), { size: 26, font: FONT_BOLD }),
                k.pos(xOrbs, y),
                k.anchor("right"),
                k.color(rowCol),
            ]);
            // peak (right, dim)
            if (hasPeak) {
                k.add([
                    k.text(String(peaks[o.i]), { size: 26 }),
                    k.pos(xPeak, y),
                    k.anchor("right"),
                    k.color(UI.textDim),
                ]);
            }
        });
    }

    // ----- rematch (same setup) / menu -----
    const rematchSetup = { numPlayers, cpuCount, difficulty, size, randomOn, timer, names };
    const rematch = makeButton("↻  Rematch", k.width() / 2 - 150, k.height() - 200, 280, 84, {
        size: 34,
        base: UI.accent,
        textColor: k.rgb(10, 14, 22),
        outline: k.rgb(150, 195, 255),
    });
    rematch.onClick(() => k.go("game", rematchSetup));
    const toMenu = makeButton("Menu", k.width() / 2 + 150, k.height() - 200, 280, 84, {
        size: 34,
        base: UI.panel,
        textColor: UI.textDim,
        outline: UI.border,
    });
    toMenu.onClick(() => k.go("menu"));

    // ----- confetti -----
    function burstConfetti(n = 140) {
        for (let i = 0; i < n; i++) {
            const startX = k.rand(0, k.width());
            const p = k.add([
                k.pos(startX, k.rand(-40, k.height() * 0.3)),
                k.choose([k.rect(k.rand(6, 14), k.rand(6, 14)), k.circle(k.rand(4, 8))]),
                k.color(k.hsl2rgb(k.rand(0, 1), 0.62, 0.62)),
                k.opacity(1),
                k.lifespan(4, { fade: 1 }),
                k.scale(1),
                k.anchor("center"),
                k.rotate(k.rand(0, 360)),
                k.z(50),
            ]);
            let velX = k.rand(-120, 120);
            let velY = k.rand(-200, 100);
            const velA = k.rand(-220, 220);
            const spin = k.rand(3, 9);
            p.onUpdate(() => {
                velY += 700 * k.dt();
                p.pos.x += velX * k.dt();
                p.pos.y += velY * k.dt();
                p.angle += velA * k.dt();
                velX *= 0.99;
                p.scale.x = k.wave(-1, 1, k.time() * spin);
            });
        }
    }
    burstConfetti(110);
    const confettiTimer = k.add([k.timer()]);
    confettiTimer.loop(1.8, () => burstConfetti(80));

    // keyboard shortcuts: R replays, space/esc go to the menu
    k.onKeyPress("r", () => k.go("game", rematchSetup));
    k.onKeyPress("space", () => k.go("menu"));
    k.onKeyPress("escape", () => k.go("menu"));
});
