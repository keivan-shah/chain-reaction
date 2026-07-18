// PWA wiring: service-worker registration (with active update checks) + the
// in-menu install prompt.
//
// The SW is built with registerType:'autoUpdate' (skipWaiting + clientsClaim), so
// when a new version is deployed the fresh SW takes over and the page reloads
// automatically. On its own that only happens the next time the app is *opened*;
// the periodic + focus/online checks below make an already-open (or installed)
// app notice a new deploy and update itself without a manual refresh. Because the
// game auto-saves to the URL/localStorage every move, an update-reload resumes
// exactly where it left off.
import { registerSW } from "virtual:pwa-register";

const UPDATE_INTERVAL = 60 * 60 * 1000; // re-check for a new deploy hourly

if (typeof window !== "undefined") {
    registerSW({
        immediate: true,
        onRegisteredSW(swUrl, r) {
            if (!r) return;
            const check = () => {
                if (!document.hidden) r.update();
            };
            setInterval(check, UPDATE_INTERVAL);
            // also check the moment the app is brought back to the foreground /
            // reconnects — that's when a redeploy is most likely to have landed
            window.addEventListener("visibilitychange", check);
            window.addEventListener("online", check);
        },
        onRegisterError() {
            /* offline support unavailable — the game still runs normally */
        },
    });
}

// ---- install prompt ----
// The browser fires `beforeinstallprompt` only in an installable context
// (HTTPS/localhost, valid manifest + SW, not already installed). We stash the
// event so the in-menu "Install" button can trigger the native prompt on demand.
let deferredInstallPrompt = null;
let installAvailable = false;

if (typeof window !== "undefined") {
    window.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault();
        deferredInstallPrompt = e;
        installAvailable = true;
    });
    window.addEventListener("appinstalled", () => {
        deferredInstallPrompt = null;
        installAvailable = false;
    });
}

export function isInstallAvailable() {
    return installAvailable;
}

export async function triggerInstall() {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    try {
        await deferredInstallPrompt.userChoice;
    } catch (e) {
        /* dismissed */
    }
    deferredInstallPrompt = null;
    installAvailable = false;
}
