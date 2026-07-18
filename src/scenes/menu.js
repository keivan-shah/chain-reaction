import { k, FONT_BOLD } from "../k.js";
import { colors, MAX_PLAYERS, UI, setColorblind } from "../theme.js";
import { makeButton, fadeIn } from "../ui.js";
import { cfg, savePrefs } from "../prefs.js";
import { saveSlotExists, readSaveSlot, savedAtLabel, removeSaveModal, clearUrl } from "../storage.js";
import { showNameModal, removeNameModal } from "../namedialog.js";
import { showMusicModal, removeMusicModal } from "../musicmodal.js";
import { isInstallAvailable, triggerInstall } from "../pwa.js";
import { GRID_SIZES, clampSize } from "../grids.js";
import { TIMER_OFF, timerLabel, clampTimer } from "../timer.js";
import { isHapticsOn, setHaptics } from "../haptics.js";
import { botName } from "../bots.js";
import * as audio from "../audio.js";

k.scene("menu", () => {
    removeSaveModal();
    removeNameModal();
    removeMusicModal();
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

    // How-to-Play button (top-right corner); tutorial is always one tap away
    const helpBtn = makeButton("?", k.width() - 58, 58, 62, 62, {
        size: 36,
        textColor: UI.accent,
        outline: UI.accent,
    });
    helpBtn.onClick(() => k.go("howto"));

    // Stats button (top-left corner)
    const statsBtn = makeButton("Stats", 96, 58, 132, 62, {
        size: 26,
        textColor: UI.textDim,
        outline: UI.border,
    });
    statsBtn.onClick(() => k.go("stats"));

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

    // Clickable colour-palette swatch (left of the player preview): the dots show
    // the live palette; tapping it switches to the alternate palette. An invisible
    // area handles the click while the chip + dots are drawn in immediate mode so
    // they always reflect the current palette.
    const paletteHit = k.add([
        k.rect(150, 46),
        k.pos(140, 250),
        k.anchor("center"),
        k.area(),
        k.opacity(0),
        k.layer("ui"),
    ]);
    paletteHit.onHover(() => k.setCursor("pointer"));
    paletteHit.onHoverEnd(() => k.setCursor("default"));
    paletteHit.onClick(() => {
        cfg.colorblind = !cfg.colorblind;
        setColorblind(cfg.colorblind);
        audio.playClick();
        commit();
    });
    k.onDraw(() => {
        k.drawRect({
            pos: k.vec2(140, 250),
            width: 150,
            height: 46,
            anchor: "center",
            radius: 10,
            color: paletteHit.isHovering() ? UI.panelHi : UI.panel,
            outline: { width: 1.5, color: UI.border },
        });
        for (let i = 0; i < 5; i++) {
            k.drawCircle({ pos: k.vec2(140 + (i - 2) * 22, 250), radius: 7, color: colors[i] });
        }
    });

    const namesBtn = makeButton("Names ✎", 760, 250, 150, 44, {
        size: 22,
        textColor: UI.textDim,
        outline: UI.border,
    });
    namesBtn.onClick(() =>
        showNameModal(cfg.numPlayers, cfg.names, (arr) => {
            cfg.names = arr;
            savePrefs();
        }),
    );

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
    // CPU presets name the opponent by its difficulty persona (Rookie/Tactician/
    // Mastermind), updated live when the difficulty changes.
    const bot = () => botName(cfg.difficulty);
    const presets = [
        { label: () => `Solo vs ${bot()}`, np: 2, cpu: 1 },
        { label: () => "2 Players", np: 2, cpu: 0 },
        { label: () => "4 Players", np: 4, cpu: 0 },
        { label: () => `You + 3 ${bot()}s`, np: 4, cpu: 3 },
    ];
    const presetBtns = presets.map((p, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const bx = k.width() / 2 + (col === 0 ? -160 : 160);
        const by = 400 + row * 90;
        const b = makeButton(p.label(), bx, by, 290, 70, { size: 24 });
        b.onClick(() => {
            cfg.numPlayers = p.np;
            cfg.cpuCount = p.cpu;
            commit();
        });
        return { b, label: p.label };
    });
    const allCpuBtn = makeButton("", k.width() / 2, 580, 290, 60, { size: 24 });
    allCpuBtn.onClick(() => {
        cfg.cpuCount = cfg.numPlayers;
        commit();
    });
    // keep the CPU-preset labels in sync with the chosen difficulty
    function syncPresetLabels() {
        presetBtns.forEach(({ b, label }) => (b.children[0].text = label()));
        allCpuBtn.children[0].text = `All ${bot()}s (watch)`;
    }

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
        // grab on the initial press only — using onMouseDown (every held frame)
        // would let a drag latch onto another slider's handle it passes over
        k.onMousePress(() => {
            if (handle.isHovering()) dragging = true;
        });
        // persist once when the drag ends rather than ~60x/sec while dragging
        k.onMouseRelease(() => {
            if (dragging) {
                dragging = false;
                savePrefs();
            }
        });
        handle.onUpdate(() => {
            if (dragging) {
                const x = Math.max(startX, Math.min(startX + trackW, k.mousePos().x));
                const ratio = (x - startX) / trackW;
                setVal(min + Math.round(ratio * (max - min)));
                refresh(); // visual only (no save) — see savePrefs() on release
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
        770,
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
        870,
        () => cfg.cpuCount,
        (v) => {
            cfg.cpuCount = Math.min(v, cfg.numPlayers);
        },
        0,
        MAX_PLAYERS,
    );
    uiRefs.size = makeSlider(
        () => `Grid Size: ${GRID_SIZES[cfg.size].label}`,
        965,
        () => cfg.size,
        (v) => (cfg.size = clampSize(v)),
        0,
        GRID_SIZES.length - 1,
    );
    uiRefs.timer = makeSlider(
        () => `Turn Timer: ${timerLabel(cfg.timer)}`,
        1058,
        () => cfg.timer,
        (v) => (cfg.timer = clampTimer(v)),
        0,
        TIMER_OFF,
    );

    // ---- Difficulty picker ----
    k.add([
        k.text("CPU DIFFICULTY", { size: 20, letterSpacing: 3, font: FONT_BOLD }),
        k.pos(k.width() / 2, 1128),
        k.anchor("center"),
        k.color(UI.textDim),
    ]);
    const diffs = ["Easy", "Medium", "Hard"];
    const diffBtns = diffs.map((d, i) => {
        const bx = k.width() / 2 + (i - 1) * 200;
        const b = makeButton(d, bx, 1180, 180, 58, { size: 30 });
        b.onClick(() => {
            cfg.difficulty = d;
            commit();
        });
        return b;
    });

    // ---- Options row: Random / Sound / Haptics (volume, SFX + music all live in
    // the Sound popup now, which keeps this page uncluttered) ----
    function compactToggle(name, x, y, w, get, set) {
        const b = makeButton("", x, y, w, 56, { size: 23 });
        b._sync = () => {
            const on = get();
            b.children[0].text = `${name}: ${on ? "On" : "Off"}`;
            b.color = on ? UI.panelHi : UI.panel;
            b._base = b.color;
            b.children[0].color = on ? UI.good : UI.textDim;
        };
        b.onClick(() => {
            set(!get());
            commit();
        });
        return b;
    }
    const tY = 1290;
    const tX = (i) => k.width() / 2 + (i - 1) * 224;
    const randomToggle = compactToggle("Random", tX(0), tY, 210, () => cfg.randomOn, (v) => (cfg.randomOn = v));
    // Sound button opens a popup with every audio option (volume, SFX, music, track)
    const soundBtn = makeButton("Sound", tX(1), tY, 210, 56, { size: 24, outline: UI.border, textColor: UI.text });
    soundBtn.onClick(() => showMusicModal(() => savePrefs()));
    const hapticsToggle = compactToggle("Haptics", tX(2), tY, 210, () => isHapticsOn(), (v) => setHaptics(v));

    // ---- Play button ----
    const playBtn = makeButton("PLAY", k.width() / 2, 1400, 340, 84, {
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
    const installBtn = makeButton("⤓  Install App", k.width() / 2, 1490, 340, 54, {
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
        uiRefs.timer.place();
        diffBtns.forEach((b, i) => {
            const active = diffs[i] === cfg.difficulty;
            b.color = active ? UI.panelHi : UI.panel;
            b._base = b.color;
            b.children[0].color = active ? UI.accent : UI.textDim;
        });
        randomToggle._sync();
        hapticsToggle._sync();
        syncPresetLabels();
    }
    // discrete changes (button taps) update the UI and persist immediately;
    // slider drags call refresh() alone and persist on release (see makeSlider)
    function commit() {
        refresh();
        savePrefs();
    }
    refresh();
});
