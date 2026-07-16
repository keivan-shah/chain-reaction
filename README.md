# Chain Reaction

A webapp version of one of my favorite childhood games "ChainReaction". Trying to make it a PWA that does not any server, Everything is local!

## Features

- **Local multiplayer** for 2–8 players on one device.
- **Computer players** — quick-start presets (Solo vs CPU, You + 3 CPU, All CPU watch mode) plus a custom setup, with **Easy / Medium / Hard** AI.
- **Chain reactions animate wave-by-wave** so cascades ripple across the board, and cells visibly react to the blast.
- **Sound & music** — synthesized click/explosion SFX and a public-domain background tune ("Ode to Joy"), each toggleable. All generated in-browser, no audio assets.
- **Undo** your last move (unwinds the CPU's reply too).
- A depth-shaded **3D wireframe** board with glossy 3D orbs, rendered at the device's native resolution.
- **Pause** any game (including all-CPU) and **save your progress** — the address bar stays a live resume link, or continue from the menu (with a "last saved" time).
- **Three board sizes** (Small / Standard / Large) and a **Random Start** option.
- **Preferences persist** across restarts.
- **Installable PWA** — add it to your home screen and play offline (served over HTTPS).

## How to play

Tap a cell you own (or any empty cell) to drop an orb. When a cell reaches its
critical mass (number of neighbours) it explodes into its neighbours, capturing
them — which can trigger a chain reaction. Wipe every opponent off the board to
win.

## Setup

1. Install deps

```bash
npm ci
```

2. Run dev server

```bash
vite
```

Open http://localhost:5173

## Tests

The core game logic (cascade resolution + AI) lives in `src/engine.js` with no
rendering dependencies, so it can be tested in Node:

```bash
npm test
```

This plays hundreds of full games to completion and stress-tests the cascade
engine (the resolution is iterative with a guaranteed termination bound, fixing
a stack-overflow that used to crash near the end of a game), and round-trips the
save/resume codec.

## Project layout

The code is split into focused modules under `src/`:

| File | Responsibility |
| --- | --- |
| `game.js` | entry point — boots the engine, registers scenes, starts |
| `k.js` | shared kaplay instance + fonts |
| `engine.js` | pure game logic (cascade resolution) + AI — no rendering |
| `state.js` | compact URL-safe save/resume codec |
| `grids.js` | board size presets |
| `theme.js` | colour palette + UI tokens |
| `ui.js` | button widget, fades, colour helpers |
| `audio.js` | Web Audio SFX + music engine |
| `storage.js` | localStorage saves, resume links, save popup |
| `prefs.js` | persisted menu preferences |
| `pwa.js` | install-prompt wiring |
| `scenes/` | `menu.js`, `game.js`, `winner.js` |
