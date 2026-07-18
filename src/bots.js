// The computer opponents. Each difficulty has a persona whose name signals how
// tough it is (Rookie → Tactician → Mastermind), plus a blurb describing how it
// actually plays (matches the AI in engine.js: Easy = near-random, Medium =
// 1-ply greedy, Hard = 2-ply lookahead). Shown in-game in place of "CPU" and in
// the how-to "Meet the bots" page.
export const BOTS = {
    Easy: {
        name: "Rookie",
        tier: 1,
        blurb: "Plays almost at random — it grabs easy captures but doesn't think ahead. Perfect for learning the ropes.",
    },
    Medium: {
        name: "Tactician",
        tier: 2,
        blurb: "Weighs every move one step ahead — it takes captures when they're on offer and avoids the obvious traps.",
    },
    Hard: {
        name: "Mastermind",
        tier: 3,
        blurb: "Looks two moves ahead, anticipating your reply — it sets up long chains and carefully defends its corners.",
    },
};

// ordered list for the how-to page
export const BOT_LIST = [
    { diff: "Easy", ...BOTS.Easy },
    { diff: "Medium", ...BOTS.Medium },
    { diff: "Hard", ...BOTS.Hard },
];

// the in-game label for a CPU player of the given difficulty
export function botName(difficulty) {
    return (BOTS[difficulty] && BOTS[difficulty].name) || "CPU";
}
