// Entry point. Boots the kaplay engine (via ./k.js side effects), registers the
// scenes, then starts once assets (fonts) have loaded — resuming a ?s=<code>
// link if present, otherwise showing the menu.
import { k } from "./k.js";
import { loadPrefs } from "./prefs.js";
import { resumeFromUrl, writeSaveSlot } from "./storage.js";
import { encodeState } from "./state.js";
import "./scenes/menu.js";
import "./scenes/game.js";
import "./scenes/winner.js";

k.onLoad(() => {
    loadPrefs();
    const urlResume = resumeFromUrl();
    if (urlResume) {
        writeSaveSlot(encodeState(urlResume)); // also stash locally so Continue works after refresh
        k.go("game", { saved: urlResume });
    } else {
        k.go("menu");
    }
});
