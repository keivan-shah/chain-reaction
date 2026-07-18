// An animated "How to Play" tutorial. Instead of static screenshots it uses live
// mini-board diagrams drawn with the same orb/cell style as the game, so every
// illustration is always accurate and crisp at any resolution. Shown on first run
// and from the menu's "?" button.
import { k, FONT_BOLD } from "../k.js";
import { colors, UI } from "../theme.js";
import { makeButton, fadeIn, blend, dim, drawOrb } from "../ui.js";
import { markHowtoSeen } from "../storage.js";
import { BOT_LIST } from "../bots.js";

k.scene("howto", () => {
    fadeIn();
    markHowtoSeen();

    const cx = k.width() / 2;
    const AMBER = colors[0];
    const BLUE = colors[1];

    // ---------- shared mini-board drawing ----------
    const S = 46; // mini cell size
    const R = 9; // orb radius
    const ORB = 9; // orbit radius for multi-orb cells

    function miniCell(px, py, tint, alpha = 1) {
        k.drawRect({
            pos: k.vec2(px, py),
            width: S - 4,
            height: S - 4,
            anchor: "center",
            radius: 7,
            color: UI.panel,
            opacity: 0.55 * alpha,
        });
        k.drawRect({
            pos: k.vec2(px, py),
            width: S - 4,
            height: S - 4,
            anchor: "center",
            radius: 7,
            fill: false,
            outline: { width: 1.5, color: tint },
            opacity: alpha,
        });
    }
    function cellOrbs(px, py, count, col, t, extra = 0) {
        if (count <= 0) return;
        const r = R * (1 + extra);
        if (count === 1) {
            drawOrb(k.vec2(px, py), col, r);
            return;
        }
        for (let i = 0; i < count; i++) {
            const ang = t * 2 + (i * Math.PI * 2) / count;
            drawOrb(k.vec2(px + Math.cos(ang) * ORB, py + Math.sin(ang) * ORB * 0.6), col, r);
        }
    }
    function ring(px, py, prog, col, maxR) {
        const a = Math.max(0, 1 - prog);
        k.drawCircle({
            pos: k.vec2(px, py),
            radius: 6 + prog * maxR,
            fill: false,
            outline: { width: 3, color: col },
            opacity: 0.9 * a,
        });
    }
    const gx = (col) => 195 + (col - 1) * S; // 3x3 grid helpers around x=195
    const critPulse = (t) => 0.5 + 0.5 * Math.sin(t * 7);

    // ---------- the four step illustrations ----------
    // 1) tap to place an orb
    function illPlace(cy, t) {
        const L = 2.6;
        const p = (t % L) / L;
        for (let i = 0; i < 3; i++)
            for (let j = 0; j < 3; j++) miniCell(gx(i), cy + (j - 1) * S, UI.border);
        if (p < 0.4) {
            const prog = 1 - (p / 0.4); // rings contract toward the cell
            ring(gx(1), cy, prog, blend(UI.text, AMBER, 0.4), 26);
        } else {
            const pop = Math.min(1, (p - 0.4) / 0.18);
            cellOrbs(gx(1), cy, 1, AMBER, t, (1 - pop) * 0.7);
        }
    }

    // 2) each cell's capacity = its neighbour count
    function illCapacity(cy, t) {
        const specs = [
            { n: 2, label: "corner" },
            { n: 3, label: "edge" },
            { n: 4, label: "centre" },
        ];
        const dx = [-96, 0, 96];
        const pl = critPulse(t);
        specs.forEach((s, i) => {
            const px = 195 + dx[i];
            miniCell(px, cy, blend(UI.border, UI.danger, 0.25 + 0.45 * pl));
            cellOrbs(px, cy, s.n, AMBER, t);
            k.drawText({
                text: String(s.n),
                pos: k.vec2(px, cy + S / 2 + 18),
                size: 22,
                anchor: "center",
                font: FONT_BOLD,
                color: blend(UI.text, AMBER, 0.4),
            });
            k.drawText({
                text: s.label,
                pos: k.vec2(px, cy + S / 2 + 42),
                size: 15,
                anchor: "center",
                color: UI.textDim,
            });
        });
    }

    // 3) a critical cell bursts into its neighbours and captures them
    function illBurst(cy, t) {
        const L = 3.4;
        const p = t % L;
        const neighbours = [
            [1, 0],
            [0, 1],
            [2, 1],
            [1, 2],
        ];
        // phase state
        let centerN, neighN, neighCol, bursting = 0, crit = false;
        if (p < 1.3) {
            centerN = 4;
            neighN = 1;
            neighCol = BLUE;
            crit = true;
        } else if (p < 1.75) {
            bursting = (p - 1.3) / 0.45;
            centerN = 0;
            neighN = 2;
            neighCol = AMBER;
        } else {
            centerN = 0;
            neighN = 2;
            neighCol = AMBER;
        }
        // frames
        for (let i = 0; i < 3; i++)
            for (let j = 0; j < 3; j++) {
                const isCenter = i === 1 && j === 1;
                const isNeigh = neighbours.some(([a, b]) => a === i && b === j);
                const tint = isCenter && crit ? blend(UI.border, UI.danger, 0.3 + 0.5 * critPulse(t)) : UI.border;
                miniCell(gx(i), cy + (j - 1) * S, tint);
                if (isCenter) cellOrbs(gx(i), cy + (j - 1) * S, centerN, AMBER, t);
                else if (isNeigh) cellOrbs(gx(i), cy + (j - 1) * S, neighN, neighCol, t);
            }
        if (bursting > 0) {
            ring(gx(1), cy, bursting, AMBER, 40);
            for (const [a, b] of neighbours) ring(gx(a), cy + (b - 1) * S, bursting, AMBER, 20);
        }
    }

    // 4) chain reaction sweeping across a row
    function illChain(cy, t) {
        const N = 5;
        const L = 4.0;
        const p = t % L;
        const x0 = 195 - ((N - 1) / 2) * S;
        for (let i = 0; i < N; i++) {
            const px = x0 + i * S;
            const bt = 0.5 + i * 0.5; // this cell bursts at bt
            const dtb = p - bt;
            const fired = p > bt;
            const tint = dtb >= 0 && dtb < 0.4 ? blend(UI.border, AMBER, 0.7) : UI.border;
            miniCell(px, cy, tint);
            // loaded (blue) before the wave reaches it, captured (amber) after
            cellOrbs(px, cy, 2, fired ? AMBER : BLUE, t);
            if (dtb >= 0 && dtb < 0.45) ring(px, cy, dtb / 0.45, AMBER, 26);
        }
        const capA = Math.max(0, Math.min(1, (p - (0.5 + N * 0.5)) / 0.5));
        if (capA > 0)
            k.drawText({
                text: "chain reaction!",
                pos: k.vec2(195, cy + S / 2 + 34),
                size: 20,
                anchor: "center",
                font: FONT_BOLD,
                color: blend(UI.textDim, AMBER, capA * 0.6),
                opacity: capA,
            });
    }

    // ---------- page layout (two pages: How to play / Meet the bots) ----------
    let page = 0;
    const title = k.add([
        k.text("", { size: 46, letterSpacing: 6, font: FONT_BOLD }),
        k.pos(cx, 74),
        k.anchor("center"),
        k.color(UI.text),
    ]);
    title.onUpdate(() => (title.color = k.hsl2rgb((k.time() * 0.05) % 1, 0.55, 0.7)));
    const subtitle = k.add([
        k.text("", { size: 21, width: 800, align: "center" }),
        k.pos(cx, 132),
        k.anchor("center"),
        k.color(UI.textDim),
    ]);

    const steps = [
        {
            n: 1,
            title: "Drop an orb",
            body: "Tap any empty cell — or one of your own — to add an orb. You can never place on an opponent's cell.",
            draw: illPlace,
        },
        {
            n: 2,
            title: "Fill to capacity",
            body: "A cell's capacity is its number of neighbours: 2 in a corner, 3 on an edge, 4 in the centre.",
            draw: illCapacity,
        },
        {
            n: 3,
            title: "Burst & capture",
            body: "One more orb makes a full cell burst — sending an orb into each neighbour and flipping them to your colour.",
            draw: illBurst,
        },
        {
            n: 4,
            title: "Chain reaction",
            body: "Those neighbours can burst too, rippling across the board. Knock out every opponent to win.",
            draw: illChain,
        },
    ];
    const rowY = [270, 530, 790, 1050];

    // the animated diagrams only play on page 0
    k.onDraw(() => {
        if (page !== 0) return;
        const t = k.time();
        steps.forEach((s, idx) => s.draw(rowY[idx], t));
    });

    function buildHowTo() {
        steps.forEach((s, idx) => {
            const cy = rowY[idx];
            k.add([k.circle(20), k.pos(350, cy - 66), k.anchor("center"), k.color(blend(UI.panel, UI.accent, 0.3)), k.outline(2, UI.accent), "pg"]);
            k.add([k.text(String(s.n), { size: 22, font: FONT_BOLD }), k.pos(350, cy - 66), k.anchor("center"), k.color(UI.accent), "pg"]);
            k.add([k.text(s.title, { size: 30, font: FONT_BOLD }), k.pos(384, cy - 66), k.anchor("left"), k.color(UI.text), "pg"]);
            k.add([k.text(s.body, { size: 21, width: 480, lineSpacing: 4 }), k.pos(350, cy - 34), k.anchor("topleft"), k.color(UI.textDim), "pg"]);
        });
        k.add([
            k.text("In a game:  ↶ Undo   ·   ✕ Pause, Save & share a link   ·   optional turn timer", { size: 19, width: 820, align: "center" }),
            k.pos(cx, 1175),
            k.anchor("center"),
            k.color(UI.textDim),
            "pg",
        ]);
        // offline / no-internet note
        k.add([
            k.text("Works fully offline — no internet needed. Install it from your browser and play anywhere.", { size: 20, width: 780, align: "center", font: FONT_BOLD }),
            k.pos(cx, 1240),
            k.anchor("center"),
            k.color(blend(UI.textDim, UI.good, 0.6)),
            "pg",
        ]);
    }

    function buildBots() {
        const diffCol = { Easy: UI.good, Medium: colors[0], Hard: UI.danger };
        const Lx = cx - 300;
        BOT_LIST.forEach((b, i) => {
            const cy = 300 + i * 270;
            const col = diffCol[b.diff];
            // tier pips (top-right): filled up to this bot's tier
            for (let p = 0; p < 3; p++) {
                k.add([k.circle(9), k.pos(cx + 210 + p * 30, cy - 34), k.anchor("center"), k.color(p < b.tier ? col : dim(col, 0.3)), "pg"]);
            }
            k.add([k.text(b.name, { size: 36, font: FONT_BOLD }), k.pos(Lx, cy - 42), k.anchor("left"), k.color(col), "pg"]);
            k.add([k.text(b.diff.toUpperCase(), { size: 20, letterSpacing: 2, font: FONT_BOLD }), k.pos(Lx, cy - 4), k.anchor("left"), k.color(UI.textDim), "pg"]);
            k.add([k.text(b.blurb, { size: 21, width: 610, lineSpacing: 4 }), k.pos(Lx, cy + 26), k.anchor("topleft"), k.color(UI.text), "pg"]);
        });
        k.add([
            k.text("Pick a difficulty in the menu — every computer player in the game uses it.", { size: 19, width: 760, align: "center" }),
            k.pos(cx, 1170),
            k.anchor("center"),
            k.color(UI.textDim),
            "pg",
        ]);
    }

    function build() {
        k.destroyAll("pg");
        if (page === 0) {
            title.text = "HOW TO PLAY";
            subtitle.text = "Reach critical mass to capture your opponents — own the whole board to win.";
            buildHowTo();
        } else {
            title.text = "MEET THE BOTS";
            subtitle.text = "Your computer opponents, from easiest to toughest.";
            buildBots();
        }
        navBtn.children[0].text = page === 0 ? "Meet the bots  ›" : "‹  How to play";
    }

    const navBtn = makeButton("", cx - 165, 1420, 300, 80, { size: 26, outline: UI.border, textColor: UI.text });
    navBtn.onClick(() => {
        page = page === 0 ? 1 : 0;
        build();
    });
    const playBtn = makeButton("Let's play", cx + 165, 1420, 300, 80, {
        size: 30,
        base: UI.accent,
        textColor: k.rgb(10, 14, 22),
        outline: k.rgb(150, 195, 255),
    });
    playBtn.onClick(() => k.go("menu"));
    k.onKeyPress("escape", () => k.go("menu"));

    build();
});
