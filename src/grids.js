// Board size presets, shared by the renderer and the save codec. Index 1 is the
// original "standard" board and stays the default; 0 is a quicker small board,
// 2 is the dense "large" board (formerly "HD grid").
export const GRID_SIZES = [
    { label: "Small", cols: 7, rows: 12, cell: 62, radius: 18, orbit: 15 },
    { label: "Standard", cols: 9, rows: 16, cell: 48, radius: 13, orbit: 12 },
    { label: "Large", cols: 15, rows: 25, cell: 32, radius: 8, orbit: 6 },
];
export const DEFAULT_SIZE = 1;

export function clampSize(i) {
    return Math.max(0, Math.min(GRID_SIZES.length - 1, i | 0));
}
