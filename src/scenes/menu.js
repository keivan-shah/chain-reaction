import { k, FONT_BOLD } from "../k.js";
import { colors, MAX_PLAYERS, UI } from "../theme.js";
import { makeButton, fadeIn } from "../ui.js";
import { cfg, savePrefs } from "../prefs.js";
import { saveSlotExists, readSaveSlot, savedAtLabel, removeSaveModal, clearUrl } from "../storage.js";
import { isInstallAvailable, triggerInstall } from "../pwa.js";
import { GRID_SIZES, clampSize } from "../grids.js";
import * as audio from "../audio.js";

k.scene("menu", () => {
    removeSaveModal();
    clearUrl(); // the home screen shouldn't carry a game's resume link
    fadeIn();
    let uiRefs = {};

    // clamp cpuCount whenever numPlayers changes
    function clampCpu() {
        cfg.cpuCount = Math.max(0, Math.min(cfg.numPlayers, cfg.cpuCount));
    }

    // soft ambient glows so the backdrop reads as designed depth, not flat black
    k.add([k.circle(560), k.pos(k.width() / 2, 210), k.anchor("center"), k.color(UI.accent), k.opacity(0.045), k.z(-100)]);
    k.add([k.circle(460), k.pos(k.width() / 2, 1440), k.anchor("center"), k.color(colors[3]), k.opacity(0.04), k.z(-100)]);

    // Title — with a gentle colour cycle for a bit of character
    const title = k.add([
        k.text("CHAIN REACTION", { size: 56, letterSpacing: 8, font: FONT_BOLD }),
        k.pos(k.width() / 2, 138),
        k.anchor("center"),
        k.color(UI.text),
    ]);
    title.onUpdate(() => {
        title.color = k.hsl2rgb((k.time() * 0.05) % 1, 0.55, 0.7);
    });
    k.add([
        k.text("place orbs • reach critical mass • take the board", {
            size: 22,
            width: 760,
            align: "center",
        }),
        k.pos(k.width() / 2, 200),
        k.anchor("center"),
        k.color(UI.textDim),
    ]);

    // Player color swatches preview
    function drawSwatches() {
        k.drawRect({
            pos: k.vec2(k.width() / 2, 250),
            width: cfg.numPlayers * 46,
            height: 40,
            anchor: "center",
            radius: 8,
            color: k.rgb(20, 22, 32),
        });
        for (let i = 0; i < cfg.numPlayers; i++) {
            const cx = k.width() / 2 - (cfg.numPlayers - 1) * 22 + i * 44;
            const isCpu = i >= cfg.numPlayers - cfg.cpuCount;
            k.drawCircle({ pos: k.vec2(cx, 250), radius: 15, color: colors[i] });
            if (isCpu) {
                k.drawText({
                    text: "AI",
                    pos: k.vec2(cx, 250),
                    size: 14,
                    anchor: "center",
                    color: k.rgb(0, 0, 0),
                });
            }
        }
    }
    k.onDraw(() => drawSwatches());

    // ---- Continue button (only when a saved game exists on this device) ----
    if (saveSlotExists()) {
        const cont = makeButton("▶  Continue Game", k.width() / 2, 56, 480, 74, {
            base: UI.panelHi,
            outline: UI.accent,
            textColor: UI.accent,
            size: 28,
        });
        cont.children[0].pos = k.vec2(0, -12);
        const when = savedAtLabel();
        if (when) {
            cont.add([
                k.text(when, { size: 16 }),
                k.color(UI.textDim),
                k.anchor("center"),
                k.pos(0, 16),
            ]);
        }
        cont.onClick(() => {
            const s = readSaveSlot();
            if (s) k.go("game", { saved: s });
        });
    }

    // ---- Quick-mode presets ----
    k.add([
        k.text("QUICK START", { size: 20, letterSpacing: 3, font: FONT_BOLD }),
        k.pos(k.width() / 2, 320),
        k.anchor("center"),
        k.color(UI.textDim),
    ]);
    const presets = [
        { label: "Solo vs CPU", np: 2, cpu: 1 },
        { label: "2 Players", np: 2, cpu: 0 },
        { label: "3 Players", np: 3, cpu: 0 },
        { label: "You + 3 CPU", np: 4, cpu: 3 },
    ];
    presets.forEach((p, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const bx = k.width() / 2 + (col === 0 ? -160 : 160);
        const by = 400 + row * 90;
        const b = makeButton(p.label, bx, by, 290, 70, { size: 27 });
        b.onClick(() => {
            cfg.numPlayers = p.np;
            cfg.cpuCount = p.cpu;
            refresh();
        });
    });
    const allCpuBtn = makeButton("All CPU (watch)", k.width() / 2, 580, 290, 60, { size: 26 });
    allCpuBtn.onClick(() => {
        cfg.cpuCount = cfg.numPlayers;
        refresh();
    });

    // ---- Custom sliders (players + cpu + grid size) ----
    function makeSlider(labelFn, y, getVal, setVal, min, max) {
        const trackW = 420;
        const startX = k.width() / 2 - trackW / 2;
        const label = k.add([
            k.text("", { size: 28 }),
            k.pos(k.width() / 2, y - 42),
            k.anchor("center"),
            k.color(UI.text),
        ]);
        k.add([
            k.rect(trackW, 6, { radius: 3 }),
            k.pos(k.width() / 2, y),
            k.anchor("center"),
            k.color(UI.border),
        ]);
        const handle = k.add([
            k.circle(18),
            k.pos(startX, y),
            k.anchor("center"),
            k.color(UI.accent),
            k.area(),
            k.outline(2, UI.bg),
        ]);
        let dragging = false;
        handle.onHover(() => k.setCursor("pointer"));
        handle.onHoverEnd(() => k.setCursor("default"));
        function place() {
            const ratio = (getVal() - min) / (max - min || 1);
            handle.pos.x = startX + ratio * trackW;
            label.text = labelFn();
        }
        k.onMouseDown(() => {
            if (handle.isHovering()) dragging = true;
        });
        k.onMouseRelease(() => (dragging = false));
        handle.onUpdate(() => {
            if (dragging) {
                const x = Math.max(startX, Math.min(startX + trackW, k.mousePos().x));
                const ratio = (x - startX) / trackW;
                setVal(min + Math.round(ratio * (max - min)));
                refresh();
            }
        });
        return { place, handle, label };
    }

    k.add([
        k.text("CUSTOM", { size: 20, letterSpacing: 3, font: FONT_BOLD }),
        k.pos(k.width() / 2, 680),
        k.anchor("center"),
        k.color(UI.textDim),
    ]);
    uiRefs.players = makeSlider(
        () => `Players: ${cfg.numPlayers}`,
        780,
        () => cfg.numPlayers,
        (v) => {
            cfg.numPlayers = v;
            clampCpu();
        },
        2,
        MAX_PLAYERS,
    );
    uiRefs.cpu = makeSlider(
        () => `Computer players: ${cfg.cpuCount}`,
        900,
        () => cfg.cpuCount,
        (v) => {
            cfg.cpuCount = Math.min(v, cfg.numPlayers);
        },
        0,
        MAX_PLAYERS,
    );
    uiRefs.size = makeSlider(
        () => `Grid Size: ${GRID_SIZES[cfg.size].label}`,
        990,
        () => cfg.size,
        (v) => (cfg.size = clampSize(v)),
        0,
        GRID_SIZES.length - 1,
    );

    // ---- Difficulty picker ----
    k.add([
        k.text("CPU DIFFICULTY", { size: 20, letterSpacing: 3, font: FONT_BOLD }),
        k.pos(k.width() / 2, 1080),
        k.anchor("center"),
        k.color(UI.textDim),
    ]);
    const diffs = ["Easy", "Medium", "Hard"];
    const diffBtns = diffs.map((d, i) => {
        const bx = k.width() / 2 + (i - 1) * 200;
        const b = makeButton(d, bx, 1140, 180, 60, { size: 30 });
        b.onClick(() => {
            cfg.difficulty = d;
            refresh();
        });
        return b;
    });

    // ---- Compact option toggles: Random / SFX / Music ----
    function compactToggle(name, x, get, set) {
        const b = makeButton("", x, 1245, 214, 58, { size: 24 });
        b._sync = () => {
            const on = get();
            b.children[0].text = `${name}: ${on ? "On" : "Off"}`;
            b.color = on ? UI.panelHi : UI.panel;
            b._base = b.color;
            b.children[0].color = on ? UI.good : UI.textDim;
        };
        b.onClick(() => {
            set(!get());
            refresh();
        });
        return b;
    }
    const randomToggle = compactToggle("Random", k.width() / 2 - 224, () => cfg.randomOn, (v) => (cfg.randomOn = v));
    const sfxToggle = compactToggle("SFX", k.width() / 2, () => audio.isSfxOn(), (v) => audio.setSfx(v));
    const musicToggle = compactToggle("Music", k.width() / 2 + 224, () => audio.isMusicOn(), (v) => audio.setMusic(v));

    // ---- Play button ----
    const playBtn = makeButton("PLAY", k.width() / 2, 1370, 340, 88, {
        size: 46,
        base: UI.accent,
        textColor: k.rgb(10, 14, 22),
        outline: k.rgb(150, 195, 255),
    });
    playBtn.onClick(() => {
        clampCpu();
        k.go("game", { ...cfg });
    });

    // ---- Install-as-app button (only shown when the browser allows it) ----
    const installBtn = makeButton("⤓  Install App", k.width() / 2, 1470, 340, 58, {
        size: 28,
        textColor: UI.accent,
        outline: UI.accent,
    });
    installBtn.hidden = true;
    installBtn.onClick(() => {
        if (isInstallAvailable()) triggerInstall();
    });
    installBtn.onUpdate(() => {
        // reflect live availability (the event can fire after the menu loads)
        const avail = isInstallAvailable();
        if (installBtn.hidden === avail) installBtn.hidden = !avail;
    });

    // ---- refresh(): reflect cfg into all controls, and persist prefs ----
    function refresh() {
        clampCpu();
        uiRefs.players.place();
        uiRefs.cpu.place();
        uiRefs.size.place();
        diffBtns.forEach((b, i) => {
            const active = diffs[i] === cfg.difficulty;
            b.color = active ? UI.panelHi : UI.panel;
            b._base = b.color;
            b.children[0].color = active ? UI.accent : UI.textDim;
        });
        randomToggle._sync();
        sfxToggle._sync();
        musicToggle._sync();
        savePrefs();
    }
    refresh();
});
