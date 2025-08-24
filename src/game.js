import kaplay from "kaplay";

const k = kaplay({
    width: 900, // 9*100
    height: 1600, // 16*100
    canvas: document.getElementById("game"),
    letterbox: true,
    background: [0, 0, 0],
    debug: false,
});

let numPlayers = 2;
let randomOn = false;
let hdGrid = false;



// ---------------- MENU SCENE ----------------
k.scene("menu", () => {
    numPlayers = 2; // Always start at 2
    let dragging = false;

    k.add([k.text("Chain Reaction!", { size: 64 }), k.pos(k.width() / 2, 150), k.anchor("center"), k.color(255, 255, 255)]);

    // Slider display
    k.add([k.text("Select # Players", { size: 36 }), k.pos(k.width() / 2, 420), k.anchor("center"), k.color(255,255,255)]);
    // Slider track
    const track = k.add([k.rect(400, 8), k.pos(k.width() / 2, 500), k.anchor("center"), k.color(100,100,100)]);
    // Slider handle
    const handle = k.add([k.rect(16, 48), k.pos(k.width() / 2 - 200, 500), k.anchor("center"), k.color(0,200,255), k.area()]);
    // Display text
    const label = k.add([k.text(`Players: ${numPlayers}`, { size: 48 }), k.anchor("center"), k.pos(k.width() / 2, 620)]);

    k.onMouseDown(() => {
        if (handle.isClicked()) {
            dragging = true;
        }
    });
    k.onMouseRelease(() => (dragging = false));

    k.onUpdate(() => {
        if (dragging) {
            let x = k.mousePos().x;
            x = Math.max(250, Math.min(650, x)); // clamp to track
            handle.pos.x = x;

            // Map to range 2–10
            const ratio = (x - 250) / (650 - 250);
            numPlayers = 2 + Math.round(ratio * 8);
            label.text = `Players: ${numPlayers}`;
        }
    });

    function getStatusColor(b)
    {
        return b ? k.rgb(0, 200, 0) : k.rgb(200, 0, 0);
    }

    // Checkboxes
    const randomBox = k.add([k.rect(300, 50), k.pos(k.width() / 2, 800), k.anchor("center"), k.color(getStatusColor(randomOn)), k.area(), "music"]);
    randomBox.add([k.text("Random", { size: 40 }), k.pos(0 , 0), k.anchor("center")]);
    randomBox.onClick(() => {
        randomOn = !randomOn;
        randomBox.color = getStatusColor(randomOn);
    });

    const gridBox = k.add([k.rect(300, 40), k.pos(k.width() / 2, 900), k.anchor("center"), k.color(getStatusColor(hdGrid)), k.area(), "grid"]);
    gridBox.add([k.text("HD Grid", { size: 40 }), k.pos(0, 0), k.anchor("center")]);
    gridBox.onClick(() => {
        hdGrid = !hdGrid;
        gridBox.color = getStatusColor(hdGrid);
    });

    // Play Button
    const playBtn = k.add([
        // k.rect(120, 40),
        k.pos(k.width() / 2, 1100),
        k.anchor("center"),
        k.color(0, 255, 0),
        k.area(),
        k.text("▶ Play", { size: 64 }),
    ]);

    playBtn.onClick(() => {
        k.go("game", { numPlayers, randomOn, hdGrid });
    });
});



// ---------------- GAME SCENE ----------------
k.scene("game", ({ numPlayers, randomOn, hdGrid }) => {
    const CELL_SIZE = hdGrid ? 32 : 48;
    const COLS = hdGrid ? 15 : 9;
    const ROWS = hdGrid ? 25 : 16;
    const RADIUS = hdGrid ? 9 : 14;
    const ORBIT_RADIUS = hdGrid ? 5 : 12;

    let centers = []
    let cells = []
    let currentPlayers = [...Array(numPlayers).keys()]

    class Cell {
        constructor(x, y, p, player = -1) {
            this.x = x;
            this.y = y;
            this.p = p;
            this.player = player;
            this.count = 0;

            // Properties
            this.color = k.rgb(255, 255, 255);
            this.neighbours = this.getNeighbours()
        }

        getNeighbours() {
            // Only 4 directions: up, down, left, right
            const directions = [
                [-1, 0], // up
                [1, 0],  // down
                [0, -1], // left
                [0, 1]   // right
            ];
            let neighbours = [];
            for (let [dx, dy] of directions) {
                let nx = this.x + dx;
                let ny = this.y + dy;

                if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) {
                    neighbours.push({x: nx, y: ny});
                }
            }
            return neighbours;
        }

        select(player, override = false)
        {
            console.log("Select called: ", player, this, cells);
            if (player !== this.player && this.player !== -1 && !override)
                return false;
            this.player = player;
            this.color = colors[currentPlayer];

            if (this.count < (this.neighbours.length - 1))
            {
                console.log("Selected", this.x, this.y, "Neigh", this.neighbours);
                this.count += 1;
                return true;
            }
            else if (this.count === (this.neighbours.length - 1))
            {
                // console.log("Bursting! ", this.x, this.y, this.count);
                this.count = 0;
                this.player = -1;
                this.burst();
                for(const n of this.neighbours)
                {
                    cells[n.x][n.y].select(player, true);
                }
                return true;
            }
            return false;
        }

        draw(t)
        {
            if (this.count === 0) return;

            // console.log("Drawing: ", this.x, this.y, this.p);

            const critical =  (this.count >= (this.neighbours.length - 1));
            const shakeX = critical ? Math.sin(t * CELL_SIZE / 2) * 2 : 0  // fast oscillation, ±2px
            const shakeY = critical ? Math.cos(t * CELL_SIZE / 2) * 2 : 0

            const color = colors[this.player];
            if (this.count === 1)
            {
                const off1 = k.vec2(shakeX, shakeY)
                k.drawCircle({pos: this.p.add(off1), radius: RADIUS, color: color})
            }
            else
            {
                // N orbiting circles
                for (let i = 0; i < this.count; i++) {
                    const angle = t + i * (Math.PI * 2) / this.count // evenly spaced
                    const off = k.vec2(
                        Math.cos(angle) * ORBIT_RADIUS + shakeX,
                        Math.sin(angle) * ORBIT_RADIUS * 0.5 + shakeY
                    )
                    k.drawCircle({
                        pos: this.p.add(off),
                        radius: RADIUS,
                        color: color, // different tint per circle
                    })
                }
            }
        }

        // when a cell is clicked the second time
        burst() {
            const dirs = [
                k.vec2(1, 0),
                k.vec2(-1, 0),
                k.vec2(0, 1),
                k.vec2(0, -1),
            ]

            for (const dir of dirs) {
                const orb = k.add([
                    k.circle(RADIUS),
                    k.color(this.color),
                    k.pos(this.p),
                    k.anchor("center"),
                    k.opacity(1),
                    k.lifespan(0.5, { fade: 0.2 }), // auto remove after 0.5s
                ])

                // tween position outward
                k.tween(
                    this.p,                               // from
                    this.p.add(dir.scale(CELL_SIZE * 1.5)),     // to
                    0.4,                          // duration
                    (p) => orb.pos = p,           // apply tween
                    k.easings.easeOutQuad
                )
            }
        }
    }

    let currentPlayerIdx = 0;
    let currentPlayer = currentPlayers[currentPlayerIdx];

    const colors = [
        k.rgb(255, 0, 0),
        k.rgb(0, 255, 0),
        k.rgb(0, 0, 255),
        k.rgb(255, 255, 0),
        k.rgb(255, 0, 255),
        k.rgb(0, 255, 255),
        k.rgb(255, 128, 0),
        k.rgb(128, 0, 255),
        k.rgb(0, 128, 255),
        k.rgb(128, 255, 0),
    ];

    // ---- Add a perspective wireframe grid that's adjustable ----
    function wireframeBox(opts = {}) {
        const {
            cols = COLS,         // grid divisions along X (width)
            rows = ROWS,      // grid divisions along Y (height)
            layers = 1,         // grid divisions along Z (depth)
            size = CELL_SIZE,        // spacing between grid lines (world units)
            rotX = 0.0,       // rotate box around X (radians)  ~ -32°
            rotY = 0.0,       // rotate box around Y (radians)
            rotZ = 0.0,       // rotate box around Z (radians)
            fov = 60,         // field of view (degrees)
            camDist = 900,    // camera distance from origin (world units)
            center = k.vec2(k.width() / 2, k.height() / 2 + 40), // screen anchor
            color = colors[currentPlayer], // neon green
            lineWidth = 2,
        } = opts

        // focal length from FOV & screen height
        const f = (k.height() / 2) / Math.tan((fov * Math.PI / 180) / 2)

        // precompute rotation cos/sin
        const cx = Math.cos(rotX), sx = Math.sin(rotX)
        const cy = Math.cos(rotY), sy = Math.sin(rotY)
        const cz = Math.cos(rotZ), sz = Math.sin(rotZ)

        function rotateAndProject(x, y, z) {
            // --- rotate (Rz * Ry * Rx) ---
            // Rx
            let y1 = y * cx - z * sx
            let z1 = y * sx + z * cx
            let x1 = x
            // Ry
            let x2 = x1 * cy + z1 * sy
            let z2 = -x1 * sy + z1 * cy
            let y2 = y1
            // Rz
            let x3 = x2 * cz - y2 * sz
            let y3 = x2 * sz + y2 * cz
            let z3 = z2

            // translate forward so Z is positive
            const Z = z3 + camDist
            const invZ = 1 / Math.max(1, Z)

            // perspective projection
            return k.vec2(
                center.x + (f * x3 * invZ),
                center.y + (f * y3 * invZ)
            )
        }

        const halfX = (cols * size) / 2
        const halfY = (rows * size) / 2
        const halfZ = (layers * size) / 2

        function world(ix, iy, iz) {
            // center the box at world origin before rotation
            return {
                x: ix * size - halfX,
                y: iy * size - halfY,
                z: iz * size - halfZ,
            }
        }

        if (centers.length === 0) // Do it only once
        {
            // store projected centers
            for (let ix = 0; ix < cols; ix++)
            {
                cells[ix] = [];
                for (let iy = 0; iy < rows; iy++)
                {
                    for (let iz = 0; iz < layers; iz++)
                    {
                        const c = world(ix + 0.5, iy + 0.5, iz + 0.5)
                        const p = rotateAndProject(c.x, c.y, c.z)
                        centers.push({x: ix, y: iy, p: p});
                        cells[ix][iy] = new Cell(ix, iy, p, -1);
                    }
                }
            }

            // Try to initialize if its random
            if (randomOn)
            {
                function randomIntFromInterval(min, max)
                { // min and max included
                    return Math.floor(Math.random() * (max - min + 1) + min);
                }

                const numCells = COLS * ROWS / numPlayers / 2;
                for (let p = 0; p < numPlayers; p++)
                {
                    let c = 0;
                    while(c < numCells)
                    {
                        const rx = randomIntFromInterval(0, COLS - 1);
                        const ry = randomIntFromInterval(0, ROWS - 1);
                        if (cells[rx][ry].select(p, true))
                        {
                            console.log(p, rx, ry)
                            c += 1;
                        }
                    }
                }
            }
        }

        // helper to draw a 3D line
        function line3D(a, b) {
            const p1 = rotateAndProject(a.x, a.y, a.z)
            const p2 = rotateAndProject(b.x, b.y, b.z)
            // kaboom/kaplay drawLine signature: drawLine(p1, p2, { width, color })
            k.drawLine({p1: p1, p2: p2, width: lineWidth, color: color, opacity: 0.8})
        }

        // X-direction lines (left-right across faces)
        for (let iy = 0; iy <= rows; iy++) {
            for (let iz = 0; iz <= layers; iz++) {
                line3D(world(0, iy, iz), world(cols, iy, iz))
            }
        }
        // Y-direction lines (vertical)
        for (let ix = 0; ix <= cols; ix++) {
            for (let iz = 0; iz <= layers; iz++) {
                line3D(world(ix, 0, iz), world(ix, rows, iz))
            }
        }
        // Z-direction lines (depth)
        for (let ix = 0; ix <= cols; ix++) {
            for (let iy = 0; iy <= rows; iy++) {
                line3D(world(ix, iy, 0), world(ix, iy, layers))
            }
        }
    }

    k.onMousePress(() => {
        const mx = k.mousePos().x;
        const my = k.mousePos().y;

        // find nearest cell center
        let best = null
        let bestDist = 9999999999
        for (const c of centers) {
            const d = k.vec2(mx, my).dist(c.p);
            if (d < bestDist) {
                bestDist = d
                best = c
            }
        }

        console.log("Got click: ", mx, my, bestDist, best)

        if (best && bestDist < 36)
        {
            const cell = cells[best.x][best.y];
            console.assert(cell !== undefined, "Undefined cell for best", {cells: cells, best: best});
            if (cell.select(currentPlayer))
            {
                const playersLeft = [...new Set(cells.flat().map((c) => c.player))];
                const count = cells.flat().map((c) => c.count).reduce((a, b) => a + b, 0);
                playersLeft.sort();
                if (playersLeft.length === 2 && count > numPlayers)
                {
                    const winner = playersLeft[1];
                    console.log(winner, "has won! ");
                    k.go("winner", { winner: winner + 1, winColor: colors[winner]});
                }
                else if (playersLeft.length === numPlayers && count > numPlayers)
                {
                    numPlayers -= 1;
                    currentPlayers = playersLeft.slice(1);
                    currentPlayerIdx = currentPlayers.indexOf(currentPlayer);
                }

                currentPlayerIdx = (currentPlayerIdx + 1) % numPlayers;
                currentPlayer = currentPlayers[currentPlayerIdx];
            }
        }
    })

    k.onUpdate(() => {
        // animated rotating circles
        const t = k.time()
        for (const row of cells)
        {
            for (const cell of row)
            {
                cell.draw(t);
            }
        }
    });

    k.onDraw(() => {
        wireframeBox();
    });

    // Play Button
    const exitBtn = k.add([
        k.pos(k.width(), 100),
        k.anchor("topright"),
        k.color(255, 255, 255),
        k.area(),
        k.text("×", { size: 64 }),
    ]);

    exitBtn.onClick(() => {
        k.go("menu");
    });

    // Back to menu with Esc
    k.onKeyPress("escape", () => k.go("menu"));
});



// ---------------- END SCENE ----------------
k.scene("winner", ({ winner, winColor }) => {
    console.log(winner, "won the game!");

    k.add([
        k.text("Player " + winner + " won!", {
            size: 100,
            letterSpacing: 4,
            transform: (idx, ch) => ({
                pos: vec2(0, wave(-4, 4, time() * 4 + idx * 0.5)),
                scale: wave(1, 1.2, time() * 3 + idx),
                angle: wave(-9, 9, time() * 3 + idx),
            }),
        }),
        k.pos(k.width() / 2, k.height() / 2),
        k.anchor("center"),
        k.color(winColor)
    ]);

    function addConfetti()
    {
        const DEF_COUNT = 80;
        const DEF_GRAVITY = 800;
        const DEF_AIR_DRAG = 0.9;
        const DEF_VELOCITY = [1000, 4000];
        const DEF_ANGULAR_VELOCITY = [-200, 200];
        const DEF_FADE = 0.3;
        const DEF_SPREAD = 60;
        const DEF_SPIN = [2, 8];
        const DEF_SATURATION = 0.7;
        const DEF_LIGHTNESS = 0.6;

        const sample = (s) => typeof s === "function" ? s() : s;
        for (let i = 0; i < DEF_COUNT; i++) {
            const p = add([
                pos(sample(vec2(rand(0, k.width()), rand(0, k.height())))),
                choose([
                    rect(rand(5, 20), rand(5, 20)),
                    circle(rand(3, 10)),
                ]),
                color(
                    sample(hsl2rgb(rand(0, 1), DEF_SATURATION, DEF_LIGHTNESS)),
                ),
                opacity(1),
                lifespan(4),
                scale(1),
                anchor("center"),
                rotate(rand(0, 360)),
            ]);

            const spin = rand(DEF_SPIN[0], DEF_SPIN[1]);
            const gravity = DEF_GRAVITY;
            const airDrag = DEF_AIR_DRAG;
            const heading = sample(0) - 90;
            const spread = DEF_SPREAD;
            const head = heading + rand(-spread / 2, spread / 2);
            const fade = DEF_FADE;
            const vel = sample(
                rand(DEF_VELOCITY[0], DEF_VELOCITY[1]),
            );
            let velX = Math.cos(deg2rad(head)) * vel;
            let velY = Math.sin(deg2rad(head)) * vel;
            const velA = sample(
                rand(DEF_ANGULAR_VELOCITY[0], DEF_ANGULAR_VELOCITY[1]),
            );

            p.onUpdate(() => {
                velY += gravity * dt();
                p.pos.x += velX * dt();
                p.pos.y += velY * dt();
                p.angle += velA * dt();
                p.opacity -= fade * dt();
                velX *= airDrag;
                velY *= airDrag;
                p.scale.x = wave(-1, 1, time() * spin);
            });
        }
    }


    const timer = k.add([
        k.timer(),
    ])
    timer.loop(2, () => addConfetti());

    k.onMousePress(() => k.go("menu"));
});


// ---------------- START ----------------
k.go("menu");
// k.go("game", { numPlayers, randomOn, hdGrid });
