// PWA install-prompt wiring. The browser fires `beforeinstallprompt` only in an
// installable context (HTTPS/localhost, valid manifest + service worker, not
// already installed). We stash the event so the in-menu "Install" button can
// trigger the native prompt on demand.
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
