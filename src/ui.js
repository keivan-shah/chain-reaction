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
