// Headless browser smoke test: loads the running dev server, drives some
// clicks, switches scenes, and fails if the page logs any error / throws.
// Requires the dev server on http://localhost:5173 and system chromium.
import puppeteer from "puppeteer-core";

const URL = process.env.URL || "http://localhost:5173/";
const errors = [];

const browser = await puppeteer.launch({
    executablePath: "/usr/bin/chromium",
    headless: "new",
    args: [
        "--no-sandbox",
        "--enable-unsafe-swiftshader",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--ignore-gpu-blocklist",
    ],
});
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 1600, deviceScaleFactor: 1 });

page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // ignore dev-only PWA manifest noise (not served as JSON by `vite` dev)
    if (/Manifest/i.test(t)) return;
    errors.push("console.error: " + t);
});
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("requestfailed", (r) =>
    errors.push("requestfailed: " + r.url() + " " + (r.failure()?.errorText || "")),
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
await sleep(1500); // let kaplay boot + menu render

// canvas is the whole play surface; kaplay letterboxes a 900x1600 world into it
const box = await page.$eval("#game", (c) => {
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
});
// map world (900x1600) coords -> screen inside the letterboxed canvas
const scale = Math.min(box.w / 900, box.h / 1600);
const ox = box.x + (box.w - 900 * scale) / 2;
const oy = box.y + (box.h - 1600 * scale) / 2;
const at = (wx, wy) => ({ x: ox + wx * scale, y: oy + wy * scale });

async function click(wx, wy) {
    const p = at(wx, wy);
    await page.mouse.click(p.x, p.y);
    await sleep(120);
}

// --- MENU: pick "All CPU (watch)" so the game auto-plays to a winner, then Play ---
await click(450, 580); // "All CPU (watch)" preset button
await sleep(150);
await click(450, 1380); // PLAY
await sleep(1500); // enter game scene

// let the all-CPU match run for a while; it should progress and possibly finish
await sleep(9000);

// scene sanity: read the kaplay debug scene name if exposed; otherwise just
// ensure no errors accumulated and canvas still present
const stillThere = await page.$("#game");
if (!stillThere) errors.push("canvas disappeared");

// --- also exercise a human game + a manual move + exit overlay ---
// go back to menu by clicking (winner scene) or wait; then start a 2-player game
await sleep(1000);
await page.mouse.click(ox + 450 * scale, oy + 800 * scale); // tap (dismiss winner if shown)
await sleep(800);
await click(450, 490); // "2 Players" preset (top-right area) approx
await sleep(150);
await click(450, 1380); // PLAY
await sleep(1200);
// make a few human moves near the board centre
await click(450, 840);
await click(470, 860);
await click(430, 820);
await sleep(500);
// open exit overlay (x button top-right) then keep playing
await click(860, 60);
await sleep(400);

await browser.close();

if (errors.length) {
    console.error("BROWSER ERRORS ❌");
    for (const e of errors) console.error("  " + e);
    process.exit(1);
} else {
    console.log("browser smoke: no console/page errors ✅");
    process.exit(0);
}
