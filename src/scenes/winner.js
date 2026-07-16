import { k, FONT_BOLD } from "../k.js";
import { colors, UI } from "../theme.js";
import { fadeIn, blend } from "../ui.js";

k.scene("winner", ({ winner, numPlayers, isCPU, totals }) => {
    fadeIn(0.5);
    const winColor = colors[winner];
    k.setCursor("default");

    k.add([
        k.text(`Player ${winner + 1}${isCPU && isCPU[winner] ? " · CPU" : ""}`, {
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

    // final scoreboard
    if (totals) {
        const order = totals
            .map((v, i) => ({ v, i }))
            .sort((a, b) => b.v - a.v);
        order.forEach((o, rank) => {
            k.add([
                k.text(
                    `${rank + 1}.   Player ${o.i + 1}${isCPU && isCPU[o.i] ? " · CPU" : ""}    ${o.v}`,
                    { size: 28 },
                ),
                k.pos(k.width() / 2, k.height() / 2 + 20 + rank * 44),
                k.anchor("center"),
                k.color(o.i === winner ? blend(UI.text, winColor, 0.5) : UI.textDim),
            ]);
        });
    }

    k.add([
        k.text("tap to play again", { size: 30 }),
        k.pos(k.width() / 2, k.height() - 200),
        k.anchor("center"),
        k.color(UI.textDim),
    ]);

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
    const timer = k.add([k.timer()]);
    timer.loop(1.8, () => burstConfetti(80));

    k.onMousePress(() => k.go("menu"));
    k.onKeyPress("space", () => k.go("menu"));
});
