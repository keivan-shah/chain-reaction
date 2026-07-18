// Small UI helpers: colour math, scene fade, and the shared button widget.
import { k, FONT_BOLD } from "./k.js";
import { UI } from "./theme.js";
import * as audio from "./audio.js";

export function dim(c, f = 0.28) {
    return k.rgb(Math.round(c.r * f), Math.round(c.g * f), Math.round(c.b * f));
}

// blend a colour toward white (f in 0..1)
export function mix(c, f = 0.5) {
    return k.rgb(
        Math.round(c.r + (255 - c.r) * f),
        Math.round(c.g + (255 - c.g) * f),
        Math.round(c.b + (255 - c.b) * f),
    );
}

// linear blend from a to b (t in 0..1)
export function blend(a, b, t) {
    return k.rgb(
        Math.round(a.r + (b.r - a.r) * t),
        Math.round(a.g + (b.g - a.g) * t),
        Math.round(a.b + (b.b - a.b) * t),
    );
}

// A shaded sphere lit from the upper-left: ambient glow → dark rim → mid body →
// lit cap → specular hotspot. Shared by the board renderer and the how-to-play
// diagrams so orbs look identical everywhere. Call inside an onDraw.
const _BLACK = k.rgb(0, 0, 0);
const _WHITE = k.rgb(255, 255, 255);
// The rim/cap/specular tints depend only on the player colour, so memoise them
// (there are ~8 colours) instead of running 3 blends -> 3 new k.rgb per orb, per
// frame — the board can draw hundreds of orbs a frame on the Large grid.
const _shadeCache = new Map();
function orbShades(col) {
    const key = (col.r << 16) | (col.g << 8) | col.b;
    let s = _shadeCache.get(key);
    if (!s) {
        s = { rim: blend(col, _BLACK, 0.42), cap: blend(col, _WHITE, 0.26), spec: blend(col, _WHITE, 0.7) };
        _shadeCache.set(key, s);
    }
    return s;
}
export function drawOrb(p, col, r) {
    const s = orbShades(col);
    k.drawCircle({ pos: p, radius: r * 1.5, color: col, opacity: 0.1 }); // ambient glow
    k.drawCircle({ pos: p, radius: r, color: s.rim }); // dark rim
    k.drawCircle({ pos: p.add(k.vec2(-r * 0.16, -r * 0.18)), radius: r * 0.85, color: col }); // body
    k.drawCircle({ pos: p.add(k.vec2(-r * 0.26, -r * 0.3)), radius: r * 0.5, color: s.cap }); // lit cap
    k.drawCircle({
        pos: p.add(k.vec2(-r * 0.32, -r * 0.36)),
        radius: r * 0.16,
        color: s.spec,
        opacity: 0.95,
    }); // specular
}

// A player's display name: their custom name if set, else "Player N". Shared by
// the HUD, pause panel and winner scoreboard so the fallback is consistent.
export function playerName(names, i) {
    const n = names && names[i] != null ? String(names[i]).trim() : "";
    return n || `Player ${i + 1}`;
}

// A quick fade-in used on every scene for a polished transition.
export function fadeIn(dur = 0.35) {
    const cover = k.add([
        k.rect(k.width(), k.height()),
        k.color(0, 0, 0),
        k.opacity(1),
        k.pos(0, 0),
        k.layer("overlay"),
        k.z(1000),
        k.fixed(),
    ]);
    k.tween(1, 0, dur, (v) => (cover.opacity = v), k.easings.easeOutQuad);
    k.wait(dur, () => cover.destroy());
}

// Reusable button with a restrained, professional look: flat dark fill, a thin
// border, and subtle hover feedback. Returns the root game object.
export function makeButton(label, x, y, w, h, opts = {}) {
    const {
        base = UI.panel,
        textColor = UI.text,
        size = 30,
        radius = 10,
        outline = UI.border,
        layer = "ui",
    } = opts;

    const btn = k.add([
        k.rect(w, h, { radius }),
        k.pos(x, y),
        k.anchor("center"),
        k.color(base),
        k.area(),
        k.scale(1),
        k.opacity(1),
        k.layer(layer),
        k.outline(1.5, outline),
        "ui-button",
    ]);
    btn._base = base;
    btn.add([
        k.text(label, { size, align: "center", font: FONT_BOLD }),
        k.color(textColor),
        k.anchor("center"),
        k.pos(0, 0),
    ]);

    btn.onHover(() => {
        k.setCursor("pointer");
        k.tween(btn.scale.x, 1.03, 0.1, (v) => (btn.scale = k.vec2(v)), k.easings.easeOutQuad);
    });
    btn.onHoverEnd(() => {
        k.setCursor("default");
        k.tween(btn.scale.x, 1.0, 0.12, (v) => (btn.scale = k.vec2(v)), k.easings.easeOutQuad);
    });
    btn.onClick(() => {
        audio.playClick();
        k.tween(0.96, 1.0, 0.14, (v) => (btn.scale = k.vec2(v)), k.easings.easeOutQuad);
    });
    return btn;
}
