// Entry point. Boots the kaplay engine (via ./k.js side effects), registers the
// scenes, then starts once assets (fonts) have loaded — resuming a ?s=<code>
// link if present, otherwise showing the menu.
import { k } from "./k.js";
import { loadPrefs } from "./prefs.js";
import { loadStats } from "./stats.js";
import { resumeFromUrl, writeSaveSlot, hasSeenHowto } from "./storage.js";
import { encodeState } from "./state.js";
import "./scenes/menu.js";
import "./scenes/game.js";
import "./scenes/winner.js";
import "./scenes/howto.js";
import "./scenes/stats.js";
import "./pwa.js"; // registers the service worker + update checks

k.onLoad(() => {
    loadPrefs();
    loadStats();
    const urlResume = resumeFromUrl();
    if (urlResume) {
        writeSaveSlot(encodeState(urlResume)); // also stash locally so Continue works after refresh
        k.go("game", { saved: urlResume });
    } else if (!hasSeenHowto()) {
        k.go("howto"); // first visit → show the tutorial, then it returns to the menu
    } else {
        k.go("menu");
    }
});
