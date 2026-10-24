/*

Raycasting: walk a first-person maze drawn one screen column at a time, with a CRT finish.
@description A Wolfenstein-style raycaster: walk a maze in first person, drawn one vertical line per column.

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics
  - Primitives: https://demos.blit386.dev/primitives
  - PipBoy CRT: https://demos.blit386.dev/crt-pipboy

Live version: https://demos.blit386.dev/raycasting

Guides:
  - Input: https://blit386.dev/docs/guides/input#keyboard
  - Post-Process Effects: https://blit386.dev/docs/guides/post-process-effects#display-tier-effects

---

WHAT YOU WILL SEE
-----------------

A first-person view of a small maze, in the style of early 1990s shooters. The top half of
the screen is a slate ceiling, the bottom half a brown floor, and the walls in between come
in three colors: gray stone, red brick, and blue tile. Walls grow dimmer the farther away
they are, and walls facing north or south are a little darker than walls facing east
or west, which is what makes the corners readable.

A minimap in the top-left corner shows the whole maze from above, with you as a yellow dot
and the exit as a green cell. Walk into the exit and "LEVEL CLEAR" appears; two seconds
later you are back at the start.

When WebGPU is active, the finished frame goes through a gentle CRT chain: barrel
curvature, chromatic aberration, a bright band rolling slowly down the screen, scanlines,
an RGB mask, grain, vignette, and bloom.

WHAT YOU WILL LEARN
-------------------

- Raycasting: for each of the 320 screen columns, send one ray from the player into a grid
  map, find the first wall it hits, and draw a vertical line whose height shrinks with the
  distance. 320 lines make the whole 3D-looking picture.
- The DDA grid walk (Digital Differential Analyzer), which steps a ray from one grid line to
  the next, so it never skips a wall and never tests the same cell twice.
- Why the distance has to be "perpendicular" (measured straight out from the camera) rather
  than the true ray length, to avoid a curved fisheye look.
- Distance shading done entirely with palette slots: each wall color is stored eight times,
  from bright to dark, and the renderer just picks a slot.
- BT.getAxis() with AXIS_LEFT_X / AXIS_RIGHT_X to turn and AXIS_LEFT_Y / AXIS_RIGHT_Y to
  walk, so both gamepad sticks steer the same way, mixed with the all-or-nothing keys and
  D-pads and clamped back to full speed.
- Axis-separated collision, which lets the player slide along a wall instead of sticking.
- configure() flags: keyboardLayout 'single' so WASD and the arrows both drive player 0, and
  a drawingBufferSize four times the display size so display-tier effects have room.
- BT.effectClear() to start init() from an empty chain, so a hot reload never stacks a
  second CRT chain on the first.
- BT.effectAdd() / BT.effectRemove() to switch the CRT chain on and off at runtime, and
  onReducedMotionChange() to drop the moving grain and rolling band when the player asks
  for less motion.

HOW DOES THE RAYCASTER WORK?
----------------------------

Picture standing in the maze holding a flashlight that only shines in a thin vertical
slice. Sweep it from the left edge of your view to the right edge, 320 slices in all. Each
slice tells you how far away the wall in that direction is. A close wall fills most of the
screen height; a far one is a short sliver near the horizon. Drawing those slices side by
side gives the illusion of depth, even though the maze itself is just a flat grid of
letters.

TRY THIS
--------

- Walk with W / S or the up and down arrows; turn with A / D or the left and right arrows.
- On a gamepad, use the D-pad or either stick: left and right turns, up and down walks.
  Push a stick a little to go slowly, all the way for full speed.
- On a phone or tablet, hold the D-pad keys in the bottom-right corner, or swipe left or
  right for a quick quarter turn.
- Press C to switch the CRT effects off and on, and R to go back to the start.
- Find the green exit on the minimap and walk into it.
- Add ?backend=software to the URL to see the maze without the CRT chain.

*/

import {
    BarrelDistortion,
    Bloom,
    bootstrap,
    BT,
    ChromaticAberration,
    Color32,
    Noise,
    Rect2i,
    RGBMask,
    RollLine,
    Scanlines,
    Vector2i,
    Vignette,
} from 'blit386';

import { isAvailable } from './shared/post-process-backend.js';
import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */
/** @typedef {import('blit386').Effect} Effect */

// The game draws into a 320x240 picture.
const SCREEN_W = 320;
const SCREEN_H = 240;

// Palette slots for the scene. Slot 0 is reserved as transparent, so colors start at 1.
const COLOR_CEILING = 1;
const COLOR_FLOOR = 2;
const COLOR_MAP_WALL = 3;
const COLOR_MAP_FLOOR = 4;
const COLOR_MAP_PLAYER = 5;
const COLOR_MAP_EXIT = 6;

// The walls use a block of 3 kinds x 2 sides x 8 distance shades = 48 slots, starting
// here.
const WALL_BASE = 16;
const SHADES = 8;

// The map letters that mean a wall, in the same order as WALL_COLORS below. Any other
// wall letter (such as '#') falls back to the first color.
const WALL_KINDS = '#AB';
const WALL_COLORS = [new Color32(215, 215, 225), new Color32(235, 100, 80), new Color32(90, 135, 245)];

// How much of a wall's brightness the far distance bands lose: 0 would be no fading at
// all, 1 would fade all the way to black.
const WALL_FADE = 0.65;

// The maze, drawn as text: one string per row, one letter per cell. '#', 'A', and 'B' are
// walls of different colors, '.' is floor, 'P' is where the player starts, and 'X' is the
// exit. The outer ring is all wall, so a ray can never leave the map.
const MAP = [
    '################',
    '#P.....#.......#',
    '#.###..#.A..B..#',
    '#.#A#..#.A..B..#',
    '#.#.#..#.......#',
    '#.#.......BBB..#',
    '#.#.####.......#',
    '#......#.AAAA..#',
    '#.####.#.......#',
    '#.#....#.###...#',
    '#.#.##.#...#.B.#',
    '#.#..#.######..#',
    '#.#..#......#..#',
    '#.##.####.#.#..#',
    '#....A....#...X#',
    '################',
];

// The letters a player can stand on. Everything else in MAP is solid.
const FLOOR_CELLS = '.XP';
const CELL_EXIT = 'X';
const CELL_SPAWN = 'P';

// Minimap size and position: each map cell becomes a 3x3 pixel square.
const MAP_CELL = 3;
const MAP_ORIGIN = new Vector2i(4, 4);

// How fast the player moves, in map cells per tick (60 ticks make one second), and how
// fast they turn, in radians per tick (a full circle is about 6.28 radians).
const MOVE_SPEED = 0.05;
const TURN_SPEED = 0.04;

// A quick quarter turn for a swipe: a quarter of a full circle.
const QUARTER_TURN = Math.PI / 2;

// How close the player may get to a wall, in cells, so the camera never pokes through it.
const PLAYER_RADIUS = 0.2;

// Half the width of the camera "window" in front of the player. 0.66 gives about 66
// degrees of view, the classic value.
const FOV_PLANE = 0.66;

// How long "LEVEL CLEAR" stays on screen before the player goes back to the start.
const CLEAR_TICKS = 120;

// The rolling band's brightness (0 is invisible) and how fast it scrolls down the screen.
const ROLL_AMOUNT = 0.26;
const ROLL_SPEED = 0.92;

// Is the map cell under the point (x, y) solid? Positions are in cells and can have
// fractions: (2.5, 3.7) is inside the cell at column 2, row 3. Math.floor() cuts off the
// fraction to find that cell. A point outside the map counts as wall, which is what stops
// a runaway ray.
function isWall(x, y) {
    const row = MAP[Math.floor(y)];
    const cell = row?.[Math.floor(x)];

    return cell === undefined || !FLOOR_CELLS.includes(cell);
}

// Casts one ray from the player at (px, py) in the direction (dx, dy) and writes what it
// hit into `hit`: the distance to the wall, which side of the cell it struck (0 for an
// east or west face, 1 for a north or south face), and the wall's map letter. Reusing the
// same `hit` box for all 320 rays means no new objects are made every frame.
function castRay(px, py, dx, dy, hit) {
    // The cell the ray starts in.
    let mapX = Math.floor(px);
    let mapY = Math.floor(py);

    // How far the ray has to travel to cross one whole cell sideways (deltaX) or one
    // whole cell up or down (deltaY). A ray going nearly straight up crosses vertical
    // grid lines very rarely, so its deltaX is huge. Math.abs() makes a number positive.
    // A direction of exactly 0 never crosses those lines at all, so it gets Infinity.
    const deltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
    const deltaY = dy === 0 ? Infinity : Math.abs(1 / dy);

    // Which way to step through the grid: -1 for left or up, +1 for right or down.
    const stepX = dx < 0 ? -1 : 1;
    const stepY = dy < 0 ? -1 : 1;

    // How far the ray travels before it reaches the first vertical grid line (sideX) and
    // the first horizontal one (sideY). The player usually stands somewhere inside a
    // cell, so this first stretch is shorter than a full delta.
    let sideX = dx < 0 ? (px - mapX) * deltaX : (mapX + 1 - px) * deltaX;
    let sideY = dy < 0 ? (py - mapY) * deltaY : (mapY + 1 - py) * deltaY;
    let side = 0;

    // The DDA walk: always step across whichever grid line is closer, one cell at a time,
    // until the cell we land in is a wall. Like walking a checkerboard and always taking
    // the nearer edge, so no square is ever skipped. The solid outer ring of MAP (and
    // isWall() treating "outside" as wall) guarantees this loop ends.
    while (!isWall(mapX, mapY)) {
        if (sideX < sideY) {
            sideX += deltaX;
            mapX += stepX;
            side = 0;
        } else {
            sideY += deltaY;
            mapY += stepY;
            side = 1;
        }
    }

    // We went one delta past the wall face, so step back one to get the distance to the
    // face itself. Because the ray direction includes the camera plane, this is already
    // the perpendicular distance: measured straight out from the camera, not along the
    // slanted ray. The slanted length would make flat walls bulge like a fisheye lens.
    hit.dist = side === 0 ? sideX - deltaX : sideY - deltaY;
    hit.side = side;
    hit.cell = MAP[mapY]?.[mapX] ?? '#';
}

// Finds the 'P' cell and returns its center. indexOf() returns the position of a letter
// in a string, or -1 if it is not there. Adding 0.5 puts the player in the middle of the
// cell rather than on its corner.
function findSpawn() {
    for (let y = 0; y < MAP.length; y++) {
        const x = MAP[y].indexOf(CELL_SPAWN);

        if (x >= 0) {
            return { x: x + 0.5, y: y + 0.5 };
        }
    }

    throw new Error('MAP has no P spawn cell');
}

// Builds a gentler CRT chain than the PipBoy CRT demo uses: its interference tears thin
// wall columns apart. Order matters: curvature goes first so everything else bends with
// it, and bloom goes last so its glow spreads over the RGB mask.
function buildCrt() {
    const curve = new BarrelDistortion();
    curve.curvature = 0.04;

    const fringe = new ChromaticAberration();
    fringe.aberration = 0.6;

    // A soft bright band that slowly scrolls from top to bottom, like an old TV whose
    // picture is not quite in sync. Same settings as the Sprite Effects demo.
    const roll = new RollLine();
    roll.amount = ROLL_AMOUNT;
    roll.speed = ROLL_SPEED;

    const lines = new Scanlines();
    lines.amount = 0.3;
    lines.strength = -7;

    const mask = new RGBMask();
    mask.intensity = 0.12;
    mask.size = 6;
    mask.border = 0.4;

    const grain = new Noise();
    grain.amount = 0.015;

    const edges = new Vignette();
    edges.amount = 0.15;

    const glow = new Bloom();
    glow.spread = 2.5;
    glow.glow = 0.15;

    return [curve, fringe, roll, lines, mask, grain, edges, glow];
}

// Which palette slot holds a wall color: `kind` picks the color (0-2), `side` the
// brightness of the face (0 or 1), and `shade` how far away it is (0 bright to 7 dark).
// The slots sit in one tidy block, like rows and columns in a table.
function wallSlot(kind, side, shade) {
    return WALL_BASE + kind * SHADES * 2 + side * SHADES + shade;
}

// A first-person maze. update() reads the controls and moves the player through the grid;
// render() casts one ray per screen column and draws the minimap.
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // The player's position in map cells, and the direction they face in radians. Angle 0
    // looks right along the map; the angle grows clockwise on screen.
    x = 0;
    y = 0;
    angle = 0;

    // True while "LEVEL CLEAR" is showing, and how many ticks are left before the
    // respawn.
    levelClear = false;
    clearTimer = 0;

    // True when WebGPU is running, so the CRT chain can be used at all.
    effectsAvailable = false;

    // Whether the player wants the CRT chain on. The C key flips it.
    crtOn = true;

    // The CRT effects, built once in init() when WebGPU is available.
    /** @type {Effect[]} */
    crt = [];

    // Scratch objects reused every frame so render() makes no new objects (no "litter"
    // for the browser to clean up later).
    hit = { dist: 0, side: 0, cell: '#' };
    lineTop = new Vector2i(0, 0);
    lineBottom = new Vector2i(0, 0);
    rect = new Rect2i(0, 0, 0, 0);

    configure() {
        return {
            displaySize: new Vector2i(SCREEN_W, SCREEN_H),

            // The CRT effects run on the final, upscaled picture. Giving them four times
            // as many pixels lets scanlines and the RGB mask look smooth instead of
            // blocky.
            drawingBufferSize: new Vector2i(SCREEN_W * 4, SCREEN_H * 4),

            // 'single' maps both WASD and the arrow keys to player 0, so either hand
            // works.
            keyboardLayout: 'single',

            // Arrow keys normally scroll the page. This stops the page moving while you
            // walk.
            isCapturingKeyboardScroll: true,
        };
    }

    async init() {
        this.palette = BT.paletteCreate(256);

        // Scene colors: ceiling, floor, and the four minimap colors.
        this.palette.set(COLOR_CEILING, new Color32(75, 80, 100));
        this.palette.set(COLOR_FLOOR, new Color32(125, 110, 92));
        this.palette.set(COLOR_MAP_WALL, new Color32(220, 220, 230));
        this.palette.set(COLOR_MAP_FLOOR, new Color32(45, 45, 55));
        this.palette.set(COLOR_MAP_PLAYER, new Color32(255, 220, 60));
        this.palette.set(COLOR_MAP_EXIT, new Color32(60, 220, 90));

        // Each wall color is stored 16 times: two faces (the north and south faces at 80
        // percent brightness) times eight distance bands that fade toward a dim version
        // of the color. `k` is the brightness multiplier, from 1 for a close, bright face
        // down to about 0.43 for the farthest band, so distant walls stay readable.
        // forEach() runs the code once for each color in the list, with its position.
        WALL_COLORS.forEach((base, kind) => {
            for (let side = 0; side < 2; side++) {
                for (let shade = 0; shade < SHADES; shade++) {
                    const k = (side === 0 ? 1 : 0.8) * (1 - (shade / SHADES) * WALL_FADE);

                    this.palette.set(
                        wallSlot(kind, side, shade),
                        new Color32(Math.floor(base.r * k), Math.floor(base.g * k), Math.floor(base.b * k)),
                    );
                }
            }
        });

        // The shared UI kit draws the touch D-pad and the "LEVEL CLEAR" caption, and
        // needs its colors in the palette. They go into slots 240 and up, far from the
        // scene.
        applyTheme(this.palette);

        BT.paletteSet(this.palette);

        // Post-process effects only exist on WebGPU. In the Canvas 2D fallback the maze
        // still works; it just has no CRT look.
        this.effectsAvailable = isAvailable();

        if (this.effectsAvailable) {
            // Start from an empty chain. During development the engine re-runs init()
            // when this file is edited, and without this the new CRT chain would be
            // stacked on top of the old one, which the C toggle would then never remove.
            BT.effectClear();

            this.crt = buildCrt();
            this.applyEffects();
        }

        this.respawn();

        return true;
    }

    update() {
        // First line: lets the kit latch key presses, touches, swipes, and the D-pad.
        ui.tick();

        this.handleShortcuts();

        // While "LEVEL CLEAR" is showing, the player cannot move. Count down, then
        // restart.
        if (this.levelClear) {
            this.clearTimer -= 1;

            if (this.clearTimer <= 0) {
                this.respawn();
            }

            return;
        }

        // How hard the player wants to turn and walk, each from -1 to +1. On a gamepad
        // both sticks work the same way: left and right turns, up and down walks.
        // BT.getAxis() returns 0 when a stick rests in the middle and up to 1 when it is
        // pushed all the way, with in-between values for a gentle push. The two sticks
        // are added together. Stick Y is negative when pushed up, so we flip it to make
        // "up" mean forward.
        let turn = BT.getAxis(BT.AXIS_LEFT_X, 0) + BT.getAxis(BT.AXIS_RIGHT_X, 0);
        let walk = -(BT.getAxis(BT.AXIS_LEFT_Y, 0) + BT.getAxis(BT.AXIS_RIGHT_Y, 0));

        // Keys, the gamepad D-pad, and the on-screen touch D-pad are all-or-nothing: held
        // means full speed. BT.isDown() is true every tick a key or gamepad button is
        // held (it reads both at once), and ui.dpad.isDown() does the same for the touch
        // D-pad.
        if (BT.isDown(BT.BTN_LEFT, 0) || ui.dpad.isDown('left')) {
            turn -= 1;
        }

        if (BT.isDown(BT.BTN_RIGHT, 0) || ui.dpad.isDown('right')) {
            turn += 1;
        }

        if (BT.isDown(BT.BTN_UP, 0) || ui.dpad.isDown('up')) {
            walk += 1;
        }

        if (BT.isDown(BT.BTN_DOWN, 0) || ui.dpad.isDown('down')) {
            walk -= 1;
        }

        // Holding a key while also pushing a stick (or both sticks at once) must not go
        // faster than full speed. Math.min() and Math.max() clamp each value back into
        // the -1 to +1 range.
        turn = Math.max(-1, Math.min(1, turn));
        walk = Math.max(-1, Math.min(1, walk));

        this.angle += turn * TURN_SPEED;

        // A swipe left or right snaps a quarter turn, handy for touch players at corners.
        const swipe = ui.swipe();

        if (swipe === 'left') {
            this.angle -= QUARTER_TURN;
        } else if (swipe === 'right') {
            this.angle += QUARTER_TURN;
        }

        // Walking: the step is positive forward, negative backward, and zero standing
        // still.
        const step = walk * MOVE_SPEED;

        // Math.cos() and Math.sin() turn the facing angle into how much of the step goes
        // right (x) and how much goes down (y), like splitting a diagonal walk into its
        // across and down parts.
        if (step !== 0) {
            this.moveBy(Math.cos(this.angle) * step, Math.sin(this.angle) * step);
        }

        // Standing on the exit cell wins the level.
        if (MAP[Math.floor(this.y)][Math.floor(this.x)] === CELL_EXIT) {
            this.levelClear = true;
            this.clearTimer = CLEAR_TICKS;
        }
    }

    render() {
        // Top half ceiling, bottom half floor. The walls are drawn on top of both.
        this.rect.set(0, 0, SCREEN_W, SCREEN_H / 2);
        BT.drawRectFill(this.rect, COLOR_CEILING);
        this.rect.set(0, SCREEN_H / 2, SCREEN_W, SCREEN_H / 2);
        BT.drawRectFill(this.rect, COLOR_FLOOR);

        // The direction the player faces, as an arrow one cell long (dirX, dirY), and the
        // camera plane: a short line at right angles to it (planeX, planeY). Think of the
        // plane as a window held in front of your face; every ray passes through one
        // point of that window.
        const dirX = Math.cos(this.angle);
        const dirY = Math.sin(this.angle);
        const planeX = -dirY * FOV_PLANE;
        const planeY = dirX * FOV_PLANE;

        for (let col = 0; col < SCREEN_W; col++) {
            // Where this column sits on the window: -1 at the left edge, 0 in the middle,
            // +1 at the right edge. The ray goes forward plus that much of the plane.
            const cameraX = (2 * col) / SCREEN_W - 1;
            castRay(this.x, this.y, dirX + planeX * cameraX, dirY + planeY * cameraX, this.hit);

            // A wall one cell away fills the whole screen height; twice as far, half as
            // tall. Math.max() keeps the distance from reaching zero, which would divide
            // by zero.
            const height = Math.floor(SCREEN_H / Math.max(this.hit.dist, 0.01));

            // Center the line on the horizon and clip it to the screen.
            const top = Math.max(0, Math.floor((SCREEN_H - height) / 2));
            const bottom = Math.min(SCREEN_H - 1, top + height);

            // Pick the palette slot: which wall color, which face, and how far away. Each
            // whole cell of distance is one shade darker, up to the darkest shade.
            const kind = Math.max(0, WALL_KINDS.indexOf(this.hit.cell));
            const shade = Math.min(SHADES - 1, Math.floor(this.hit.dist));

            this.lineTop.set(col, top);
            this.lineBottom.set(col, bottom);
            BT.drawLine(this.lineTop, this.lineBottom, wallSlot(kind, this.hit.side, shade));
        }

        this.renderMinimap();

        // Some effects (the grain and the rolling band) animate, so they need the current
        // time each frame. `'time' in fx` asks whether this effect has a time setting at
        // all.
        for (const fx of this.crt) {
            if ('time' in fx) {
                fx.time = BT.timeSeconds;
            }
        }

        // The win message, centered over the view with the shared caption style.
        if (this.levelClear) {
            ui.caption(SCREEN_W / 2 - 33, SCREEN_H / 2 - 7, 'LEVEL CLEAR', { color: 'accent' });
        }

        // Without WebGPU there is no CRT chain, so say why the C key does nothing. The
        // shared note is too wide for this 320-pixel screen, so this is a short version,
        // placed just above the engine's small overlay hint in the bottom-left corner.
        if (!this.effectsAvailable) {
            ui.caption(4, SCREEN_H - 24, 'CRT needs WebGPU', { color: 'warm' });
        }

        // The touch D-pad for walking and turning. It appears after the first touch.
        ui.dpadWidget();
    }

    // Draws the maze from above in the top-left corner, then the player as a 2x2 dot.
    renderMinimap() {
        for (let y = 0; y < MAP.length; y++) {
            for (let x = 0; x < MAP[y].length; x++) {
                let color = COLOR_MAP_FLOOR;

                if (MAP[y][x] === CELL_EXIT) {
                    color = COLOR_MAP_EXIT;
                } else if (isWall(x, y)) {
                    color = COLOR_MAP_WALL;
                }

                this.rect.set(MAP_ORIGIN.x + x * MAP_CELL, MAP_ORIGIN.y + y * MAP_CELL, MAP_CELL, MAP_CELL);
                BT.drawRectFill(this.rect, color);
            }
        }

        // The player's position in cells times the cell size gives minimap pixels. The -1
        // centers the 2x2 dot on that spot.
        this.rect.set(
            MAP_ORIGIN.x + Math.floor(this.x * MAP_CELL) - 1,
            MAP_ORIGIN.y + Math.floor(this.y * MAP_CELL) - 1,
            2,
            2,
        );
        BT.drawRectFill(this.rect, COLOR_MAP_PLAYER);
    }

    // Moves the player by (dx, dy) without walking into walls. The trick is to try the
    // two directions one at a time: if the sideways part is blocked but the forward part
    // is not, the player still slides along the wall instead of stopping dead.
    // Math.sign() is -1, 0, or +1, so the radius is added on the side we are moving
    // toward.
    moveBy(dx, dy) {
        const nx = this.x + dx;

        if (!isWall(nx + Math.sign(dx) * PLAYER_RADIUS, this.y)) {
            this.x = nx;
        }

        const ny = this.y + dy;

        if (!isWall(this.x, ny + Math.sign(dy) * PLAYER_RADIUS)) {
            this.y = ny;
        }
    }

    // Keyboard shortcuts: C switches the CRT look, R goes back to the start.
    // BT.isKeyPressed() is true only on the tick a key goes down, so holding C does not
    // flicker the CRT on and off. C only matters on WebGPU, where the CRT chain exists.
    handleShortcuts() {
        if (BT.isKeyPressed('KeyC') && this.effectsAvailable) {
            this.crtOn = !this.crtOn;
            this.applyEffects();
        }

        if (BT.isKeyPressed('KeyR')) {
            this.respawn();
        }
    }

    // Puts the player back on the start cell, facing right.
    respawn() {
        const spawn = findSpawn();

        this.x = spawn.x;
        this.y = spawn.y;
        this.angle = 0;
        this.levelClear = false;
        this.clearTimer = 0;
    }

    // Takes every CRT effect off, then puts back the ones that should run: none when the
    // CRT is switched off, and all but the moving grain and rolling band when the player
    // prefers reduced motion. Removing first keeps the chain in its original order.
    applyEffects() {
        for (const fx of this.crt) {
            BT.effectRemove(fx);
        }

        if (!this.crtOn) {
            return;
        }

        for (const fx of this.crt) {
            if (BT.isReducedMotionPreferred && (fx instanceof Noise || fx instanceof RollLine)) {
                continue;
            }

            BT.effectAdd(fx);
        }
    }

    // The engine calls this when the reduced-motion preference changes while the demo
    // runs.
    onReducedMotionChange() {
        this.applyEffects();
    }
}

bootstrap(Demo);
