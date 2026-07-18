// On-device stats screen: games, win-rate per CPU difficulty, and the two
// records (longest chain reaction, biggest cascade). Reachable from the menu's
// "Stats" button. All values come from src/stats.js (localStorage).
import { k, FONT_BOLD } from "../k.js";
import { UI } from "../theme.js";
import { makeButton, fadeIn, blend } from "../ui.js";
import { getStats, resetStats } from "../stats.js";

k.scene("stats", () => {
    fadeIn();
    const cx = k.width() / 2;

    const title = k.add([
        k.text("STATS", { size: 52, letterSpacing: 8, font: FONT_BOLD }),
        k.pos(cx, 104),
        k.anchor("center"),
        k.color(UI.text),
    ]);
    title.onUpdate(() => (title.color = k.hsl2rgb((k.time() * 0.05) % 1, 0.55, 0.7)));
    k.add([
        k.text("your records on this device", { size: 20 }),
        k.pos(cx, 158),
        k.anchor("center"),
        k.color(UI.textDim),
    ]);

    const pct = (w, p) => (p > 0 ? `${Math.round((100 * w) / p)}%` : "—");

    // (re)build the table; tagged "srow" so a reset can redraw it in place
    function build() {
        k.destroyAll("srow");
        const Lx = cx - 280;
        const Rx = cx + 280;
        let y = 250;
        const header = (t) => {
            k.add([
                k.text(t, { size: 20, letterSpacing: 3, font: FONT_BOLD }),
                k.pos(cx, y),
                k.anchor("center"),
                k.color(UI.textDim),
                "srow",
            ]);
            y += 56;
        };
        const row = (label, value, valCol) => {
            k.add([k.text(label, { size: 26 }), k.pos(Lx, y), k.anchor("left"), k.color(UI.text), "srow"]);
            k.add([
                k.text(String(value), { size: 26, font: FONT_BOLD }),
                k.pos(Rx, y),
                k.anchor("right"),
                k.color(valCol || UI.text),
                "srow",
            ]);
            y += 54;
        };

        const s = getStats();
        header("OVERALL");
        row("Games played", s.games);
        row("Games you won", `${s.wins}  (${pct(s.wins, s.games)})`, UI.good);
        y += 20;
        header("WIN RATE vs CPU");
        for (const d of ["Easy", "Medium", "Hard"]) {
            const b = s.byDiff[d];
            row(d, `${b.w} / ${b.p}   (${pct(b.w, b.p)})`);
        }
        y += 20;
        header("RECORDS");
        row("Longest chain reaction", `${s.longestChain} waves`, UI.accent);
        row("Biggest cascade", `${s.biggestCascade} bursts`, UI.accent);
    }
    build();

    // reset (two-tap confirm) + back
    let confirming = false;
    const resetBtn = makeButton("Reset Stats", cx - 150, 1400, 264, 74, {
        size: 26,
        outline: blend(UI.border, UI.danger, 0.5),
        textColor: blend(UI.text, UI.danger, 0.5),
    });
    resetBtn.onClick(() => {
        const lbl = resetBtn.children[0];
        if (!confirming) {
            confirming = true;
            lbl.text = "Confirm reset?";
            k.wait(2.5, () => {
                if (resetBtn.exists() && confirming) {
                    confirming = false;
                    lbl.text = "Reset Stats";
                }
            });
            return;
        }
        confirming = false;
        resetStats();
        build();
        lbl.text = "Cleared ✓";
        k.wait(1.2, () => {
            if (resetBtn.exists()) lbl.text = "Reset Stats";
        });
    });

    const backBtn = makeButton("Back", cx + 150, 1400, 264, 74, {
        size: 30,
        base: UI.accent,
        textColor: k.rgb(10, 14, 22),
        outline: k.rgb(150, 195, 255),
    });
    backBtn.onClick(() => k.go("menu"));
    k.onKeyPress("escape", () => k.go("menu"));
});
