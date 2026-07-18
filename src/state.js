// ================================================================
//  Compact, URL-safe encoding of a full game state so a match can be
//  saved into a link (or localStorage) and resumed later.
//
//  Header (each char is one 6-bit base64url digit):
//    [0] version
//    [1] flags        (bits0-1 = grid size index 0..2, bit2 = sparse body)
//    [2] numPlayers
//    [3] cpuCount
//    [4] difficulty   (0=Easy 1=Medium 2=Hard)
//    [5] currentPlayer
//    [6..7] movedMask      (low char first)
//    [8..9] eliminatedMask (low char first)
//    [10..] body
//
//  Body cell value = ownerCode*5 + count, where
//    ownerCode = owner<0 ? 0 : owner+1   (0..8), count 0..4  → 0..44.
//  Two encodings are produced and the shorter one is kept:
//    - flat:   one char per cell (row-major x-then-y)
//    - sparse: for each non-empty cell, a base-32 varint "gap" (number of
//              empty cells since the previous non-empty one) followed by the
//              value char. Boards are mostly empty, so this is much shorter.
// ================================================================

import { GRID_SIZES, clampSize } from "./grids.js";

const ALPH = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const enc1 = (n) => ALPH[n & 63];
const dec1 = (ch) => ALPH.indexOf(ch);
const enc2 = (n) => enc1(n) + enc1(n >> 6); // 12 bits, low char first
const DIFFS = ["Easy", "Medium", "Hard"];

// base-32 varint: 5 data bits per char, bit5 = "more follows"
function encVarint(n) {
    let s = "";
    for (;;) {
        const c = n & 31;
        n = Math.floor(n / 32);
        if (n > 0) s += enc1(c | 32);
        else {
            s += enc1(c);
            break;
        }
    }
    return s;
}
function readVarint(str, i) {
    let shift = 0;
    let val = 0;
    for (;;) {
        const c = dec1(str[i++]);
        if (c < 0) return [NaN, i];
        val += (c & 31) * Math.pow(2, shift);
        shift += 5;
        if (!(c & 32)) break;
    }
    return [val, i];
}

// s: { size, numPlayers, cpuCount, difficulty, currentPlayer, moved(Set|array),
//      eliminated(Set|array), board:[cols][rows]{count,owner} }
export function encodeState(s) {
    const size = clampSize(s.size);
    const dims = GRID_SIZES[size];
    const values = [];
    for (let x = 0; x < dims.cols; x++)
        for (let y = 0; y < dims.rows; y++) {
            const c = s.board[x][y];
            const ownerCode = c.owner < 0 ? 0 : c.owner + 1;
            values.push(ownerCode * 5 + Math.min(4, c.count));
        }

    let flat = "";
    for (const v of values) flat += enc1(v);

    let sparse = "";
    let gap = 0;
    for (const v of values) {
        if (v === 0) gap++;
        else {
            sparse += encVarint(gap) + enc1(v);
            gap = 0;
        }
    }

    const useSparse = sparse.length < flat.length;
    const flags = (size & 3) | (useSparse ? 4 : 0);
    const header =
        enc1(2) +
        enc1(flags) +
        enc1(s.numPlayers) +
        enc1(s.cpuCount) +
        enc1(Math.max(0, DIFFS.indexOf(s.difficulty))) +
        enc1(s.currentPlayer) +
        enc2(maskOf(s.moved)) +
        enc2(maskOf(s.eliminated));
    return header + (useSparse ? sparse : flat);
}

export function decodeState(str) {
    if (!str || typeof str !== "string" || str.length < 10) return null;
    try {
        if (dec1(str[0]) !== 2) return null;
        const flags = dec1(str[1]);
        const size = clampSize(flags & 3);
        const sparse = (flags & 4) === 4;
        const numPlayers = dec1(str[2]);
        const cpuCount = dec1(str[3]);
        const difficulty = DIFFS[dec1(str[4])] || "Medium";
        const currentPlayer = dec1(str[5]);
        const movedMask = dec1(str[6]) | (dec1(str[7]) << 6);
        const elimMask = dec1(str[8]) | (dec1(str[9]) << 6);
        const dims = GRID_SIZES[size];
        const total = dims.cols * dims.rows;
        if (numPlayers < 2 || numPlayers > 8) return null;
        // reject corrupt/edited codes rather than crashing the game scene later
        if (!(cpuCount >= 0 && cpuCount <= numPlayers)) return null;
        if (!(currentPlayer >= 0 && currentPlayer < numPlayers)) return null;

        const values = new Array(total).fill(0);
        const body = str.slice(10);
        if (sparse) {
            let i = 0;
            let idx = 0;
            while (i < body.length) {
                let gap;
                [gap, i] = readVarint(body, i);
                if (!Number.isFinite(gap)) return null;
                idx += gap;
                if (idx >= total || i >= body.length) return null;
                const v = dec1(body[i++]);
                if (v <= 0) return null;
                values[idx] = v;
                idx += 1;
            }
        } else {
            if (body.length !== total) return null;
            for (let j = 0; j < total; j++) {
                const v = dec1(body[j]);
                if (v < 0) return null;
                values[j] = v;
            }
        }

        const board = [];
        let k = 0;
        for (let x = 0; x < dims.cols; x++) {
            board[x] = [];
            for (let y = 0; y < dims.rows; y++) {
                const v = values[k++];
                const ownerCode = Math.floor(v / 5);
                const count = v % 5;
                const owner = ownerCode === 0 ? -1 : ownerCode - 1;
                if (owner >= numPlayers) return null; // orb owned by a nonexistent player
                board[x][y] = { count, owner };
            }
        }
        return {
            size,
            numPlayers,
            cpuCount,
            difficulty,
            currentPlayer,
            moved: bitsToSet(movedMask, numPlayers),
            eliminated: bitsToSet(elimMask, numPlayers),
            board,
            cols: dims.cols,
            rows: dims.rows,
        };
    } catch (e) {
        return null;
    }
}

function maskOf(setOrArr) {
    let m = 0;
    const it = setOrArr instanceof Set ? [...setOrArr] : setOrArr || [];
    for (const p of it) m |= 1 << p;
    return m;
}
function bitsToSet(mask, n) {
    const s = new Set();
    for (let p = 0; p < n; p++) if (mask & (1 << p)) s.add(p);
    return s;
}
