/*

Music Playback: crossfade between two tracks and loop a third from a chosen point.
@description Crossfade two looping tracks with different fade profiles, plus a third with a seamless loop point.
@pageTitle BLIT386 Demo – Music Playback
@ogScale integer

Part of the BLIT386 demo series.

Prerequisites:
  - Audio Basics: https://demos.blit386.dev/audio-basics

Live version: https://demos.blit386.dev/music

Guides:
  - Audio: https://blit386.dev/docs/guides/audio#playing-music

Reference:
  - Audio: https://blit386.dev/docs/api/audio#playback-music
  - Overlay: https://blit386.dev/docs/api/overlay#audio-meters-optional

---

WHAT YOU WILL SEE
-----------------

The engine overlay is open from the start: white bars along the top with live audio level
meters, and a hint bar along the bottom. Between them, one centered line of text reads
"Click or press a key to enable sound" in warm orange until you click or press a key;
after that it turns into a dim reminder: "Press 1, 2, or 3 to switch tracks."

Two panels of the same height sit side by side under that line. "Tracks" on the left has
three buttons, "1 - A: calm", "2 - B: upbeat", and "3 - Intro + loop", the one playing
lit green, and a "Playing" row naming it.

"Crossfade" on the right draws the switch that brought the current track in: a dark chart
where time runs left to right and volume bottom to top. The old track's dim "out" line
falls from full volume to silence, and the new track's green "in" line rises. Every
profile uses the same time scale, so a longer fade really looks longer. While a switch is
still fading, an amber line moves across the chart to show how far along it is. Under the
chart, "Fade", "Overlap", "Curve", and "Loop" rows list the numbers behind it.

Track A starts playing on its own the moment sound is unlocked - you never have to press
its button first.

WHAT YOU WILL LEARN
-------------------

- BT.musicPlay(clip, options) drives one music player. Calling it again crossfades from
  the current track into the new one instead of layering the two.
- fadeMs sets how long each side of a crossfade takes, and overlap sets how the two sides
  line up: 1 fades both at the same time, 0 starts the fade-in exactly when the fade-out
  ends, and -1 leaves a silent gap of fadeMs between them.
- easeIn and easeOut pick an easing curve for each side ('linear' or 'ease-in-out' here).
  applyEasing(t, curve) gives the same curve as a number, which is how the chart draws it.
- loop: true repeats the whole track; loopStart and loopEnd (in seconds) repeat only a
  region, so an intro plays once and the rest loops forever.
- BT.musicPlay() called before sound is unlocked is remembered and starts the instant the
  first click or key press arrives - unlike BT.soundPlay(), which drops early sounds.
- Promise.all() loads three clips at once instead of one after another.
- isOverlayAudioMetersEnabled: true adds live bus level bars to the engine overlay, and
  overlayStyle / overlayAudioMeterStyle pick its colors from the palette.

HOW THE THREE PROFILES DIFFER
-----------------------------

Sound effects are short one-shot clips: press a key, hear a blip, done. Music is meant to
loop in the background, and switching tracks should not just cut off with a click. Each
button here uses a different crossfade recipe:

  1. To Track A: fadeMs 800, overlap -1, linear curves. The old track fades out over
     800 ms, there is 800 ms of silence, then Track A fades in over 800 ms. Listen for
     the gap in the middle.
  2. To Track B: fadeMs 1200, overlap 1, ease-in-out curves. The old track fades out
     while Track B fades in, both at the same time, so the music blends with no gap. The
     curve starts and ends gently instead of moving at one constant speed.
  3. To Loop Demo: fadeMs 600, overlap 1, linear curves - a quick, plain overlap. This
     track also sets loopStart 1.5 and loopEnd 7.9, so its intro plays once and then the
     1.5-7.9 second region repeats, like the opening jingle of a game level settling into
     its main tune.

TRY THIS
--------

- Click anywhere, or press any key, to unlock sound. Track A starts by itself.
- Press 1, 2, or 3 (or tap a button) to switch tracks. Pressing the button of the track
  that is already playing does nothing.
- Switch from Track B back to Track A: the chart shows the gap between the two lines, and
  you hear the short silence in the middle. Switch to Track B again and both happen at
  once - no gap.
- Play Loop Demo and wait: the intro only ever plays once, then the loop region repeats
  without a seam.
- Watch the overlay's music level bar during a crossfade: it dips and rises just like the
  lines in the chart. Press the backquote key (`) or click the small icon in the
  bottom-left corner to hide or show the overlay.

*/

import { applyEasing, AudioClip, bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

import {
    applyTheme,
    FONT_W,
    litRimColor,
    THEME_OVERLAY_AUDIO_METER_STYLE,
    THEME_OVERLAY_STYLE,
    ui,
} from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */

const DISPLAY_W = 320;
const DISPLAY_H = 240;

// These two numbers come straight out of public/audio/music-intro-loop.loop.json,
// generated by scripts/generate-audio-loops.mjs. They mark where the short intro ends and
// where the repeating loop section begins and ends inside that one audio file, in
// seconds.
const INTRO_LOOP_START_SECONDS = 1.5;
const INTRO_LOOP_END_SECONDS = 7.9;

// Fading to Track A: the old track fades all the way out first, then - after a silent gap
// as long as the fade itself - Track A fades in. `overlap: -1` is what creates that gap.
const PROFILE_TO_A = { fadeMs: 800, overlap: -1, easeIn: 'linear', easeOut: 'linear' };

// Fading to Track B: the new track fades in at the same time as the old one fades out
// (`overlap: 1`), and both fades use an ease-in-out curve so the volume change starts and
// ends gently instead of moving at one constant speed the whole way through.
const PROFILE_TO_B = { fadeMs: 1200, overlap: 1, easeIn: 'ease-in-out', easeOut: 'ease-in-out' };

// Fading into the loop-point track: a plain, fairly quick overlapping crossfade.
const PROFILE_TO_LOOP = { fadeMs: 600, overlap: 1, easeIn: 'linear', easeOut: 'linear' };

// One entry per track button: which track it plays, the button text (it starts with the
// number key the kit binds to it), the name shown once it plays, its crossfade profile,
// and a short word for that profile's overlap.
const TRACKS = [
    {
        trackId: 'A',
        label: '1 - A: calm',
        name: 'A: calm',
        keyCode: 'Digit1',
        profile: PROFILE_TO_A,
        overlapNote: 'gap',
    },
    {
        trackId: 'B',
        label: '2 - B: upbeat',
        name: 'B: upbeat',
        keyCode: 'Digit2',
        profile: PROFILE_TO_B,
        overlapNote: 'blend',
    },
    {
        trackId: 'loop',
        label: '3 - Intro + loop',
        name: 'Intro + loop',
        keyCode: 'Digit3',
        profile: PROFILE_TO_LOOP,
        overlapNote: 'blend',
    },
];

// Screen layout, in display pixels. The engine overlay is open from the start: its bars
// cover the top 56 rows and its hint bar the bottom 14, so everything sits in the band
// between them. The status line comes first, then two panels side by side, equally tall.
const STATUS_Y = 64;
const PANEL_Y = 76;
const LEFT_PANEL_X = 4;
const LEFT_PANEL_W = 140;
const RIGHT_PANEL_X = 148;
const RIGHT_PANEL_W = 168;

// Panel metrics from the UI kit: content starts 22 pixels below a panel's top edge
// (under its title) and 9 pixels in from its left edge, and is 20 pixels narrower than
// the panel.
const PANEL_CONTENT_TOP = 22;
const PANEL_CONTENT_X = 9;
const PANEL_CONTENT_SHRINK = 20;

// The track buttons fill the panel's width. The one playing is lit in the same green the
// Keyboard Diagnostic demo lights a held key with, rimmed with a lighter shade of it
// (written in init()). The shared UI kit owns slots 240-251, so these sit far below.
const TRACK_BUTTON_W = LEFT_PANEL_W - PANEL_CONTENT_SHRINK;
const C_LIT = 1;
const C_LIT_RIM = 2;
const LIT_BUTTON = { fill: C_LIT, rim: C_LIT_RIM };

// The left panel's rows are shorter than the right panel's, so this much empty space
// before its "Playing" row makes both panels end on the same line.
const LEFT_PANEL_FILLER = 4;

// The crossfade chart at the top of the right panel: two volume lines over time, the old
// track fading out and the new one fading in, drawn for the profile in use.
const CHART_H = 65;
const CHART_RECT = new Rect2i(
    RIGHT_PANEL_X + PANEL_CONTENT_X,
    PANEL_Y + PANEL_CONTENT_TOP,
    RIGHT_PANEL_W - PANEL_CONTENT_SHRINK,
    CHART_H,
);

// Gap between the chart and the rows under it.
const CHART_GAP = 4;

// The plot inside the chart's border: full volume on the top row, silence on the bottom
// row, and room above it for the "out" and "in" labels.
const PLOT_INSET_X = 6;
const PLOT_TOP = CHART_RECT.y + 14;
const PLOT_BOTTOM = CHART_RECT.y + CHART_H - 5;
const PLOT_LEFT = CHART_RECT.x + PLOT_INSET_X;
const PLOT_RIGHT = CHART_RECT.x + CHART_RECT.width - 1 - PLOT_INSET_X;

// Every profile is drawn on the same time scale, so a longer fade really looks longer.
// The chart spans this many milliseconds: a short stretch at full volume before the fade,
// the slowest profile's crossfade (800 ms out, 800 ms gap, 800 ms in), and the same
// stretch after it.
const CHART_LEAD_MS = 200;
const CHART_SPAN_MS = 2400 + 2 * CHART_LEAD_MS;

// The crossfade panel's value column starts after this many characters, so the longest
// key, "Overlap", keeps a space after it.
const FADE_KV_COLS = 9;

// Keeps `value` from going below `min` or above `max`.
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

// The x to print `text` at so its letters are centered on column `centerX`. The last
// character's empty spacing column is left out, so the visible letters are what centers.
function centeredTextX(centerX, text) {
    return centerX - Math.floor((text.length * FONT_W - 1) / 2);
}

// How long a profile's whole crossfade takes, in milliseconds. The fade-in starts
// fadeMs * (1 - overlap) after the fade-out does: right away for overlap 1, when the
// fade-out ends for 0, and one fadeMs after that (a silent gap) for -1.
function crossfadeMs(profile) {
    return profile.fadeMs * (2 - profile.overlap);
}

// The volumes of the old and the new track `ms` milliseconds after a switch, from 0 to 1,
// using the same easing curves BT.musicPlay() uses. Writes them into `out` so the chart
// can ask about every column without making new objects.
function crossfadeVolumes(profile, ms, out) {
    const inStartMs = profile.fadeMs * (1 - profile.overlap);
    const outT = clamp(ms / profile.fadeMs, 0, 1);
    const inT = clamp((ms - inStartMs) / profile.fadeMs, 0, 1);

    out.old = 1 - applyEasing(outT, profile.easeOut);
    out.new = applyEasing(inT, profile.easeIn);
}

// Three buttons, each starting a different music track with a different crossfade
// profile, and a chart that draws what that crossfade does to both tracks' volume.
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // Palette slots of the shared UI theme colors, filled by applyTheme() in init().
    theme = null;

    /** @type {AudioClip | null} */
    calmClip = null;

    /** @type {AudioClip | null} */
    upbeatClip = null;

    /** @type {AudioClip | null} */
    introLoopClip = null;

    // Which button's track is playing: 'A', 'B', 'loop', or null before the first play.
    /** @type {string | null} */
    activeTrackId = null;

    // The tick of the last track switch, so the chart can move a marker along the
    // crossfade while it plays. Null for the first track, which has nothing to fade from.
    /** @type {number | null} */
    switchTick = null;

    // Scratch object crossfadeVolumes() writes into, reused for every chart column.
    volumes = { old: 0, new: 0 };

    // Sets the logical display size and opens the overlay with its audio meters, colored
    // from the shared UI theme.
    configure() {
        return {
            displaySize: new Vector2i(DISPLAY_W, DISPLAY_H),

            // Live per-bus level bars and a voices/steal/drop readout in the overlay. Off
            // by default.
            isOverlayAudioMetersEnabled: true,
            isOverlayVisibleAtStart: true,

            // The overlay's default colors live in palette slots 1 and 2, which this demo
            // never fills - they would draw solid black. These two shared styles point
            // the bars, text, and meters at the theme's colors instead.
            overlayStyle: THEME_OVERLAY_STYLE,
            overlayAudioMeterStyle: THEME_OVERLAY_AUDIO_METER_STYLE,
        };
    }

    // Loads all three music clips, sets up the shared UI theme, and starts Track A.
    async init() {
        // Load all three tracks at once - Promise.all waits for the slowest fetch, not
        // the sum of three downloads one after another.
        [this.calmClip, this.upbeatClip, this.introLoopClip] = await Promise.all([
            AudioClip.load('/audio/music-calm.wav'),
            AudioClip.load('/audio/music-upbeat.wav'),
            AudioClip.load('/audio/music-intro-loop.wav'),
        ]);

        this.palette = BT.paletteCreate(256);

        // applyTheme() installs the twelve shared UI colors (into high palette slots, far
        // from any scene colors) and hands back where they landed, so render() can clear
        // the screen and draw the chart in theme colors.
        this.theme = applyTheme(this.palette);

        // The playing track's button: green, with a rim worked out from the theme so it
        // stands out as much as a resting button's rim does.
        this.palette.set(C_LIT, new Color32(75, 210, 120));
        this.palette.set(C_LIT_RIM, litRimColor(this.palette, this.palette.get(C_LIT)));

        BT.paletteSet(this.palette);

        // Start with Track A so there is always music, even before you press anything.
        // BT.musicPlay() called before the page is unlocked is remembered and starts for
        // real the instant you click or press a key - unlike BT.soundPlay(), which drops
        // sounds played too early.
        this.playTrack('A');

        return true;
    }

    // Once-per-tick housekeeping for the UI kit.
    //
    // ui.tick() is what safely catches the number-key shortcuts bound to the buttons in
    // render(). Keyboard presses can only be read reliably here in update(), never in
    // render() - the engine clears "was this just pressed?" flags once per tick, and that
    // tick always finishes before this frame's render() runs (keyboard-input explains
    // this in more detail). The kit latches the presses now so the buttons can answer
    // later, during render().
    update() {
        ui.tick();
    }

    // Clears the screen and declares the whole UI: the status line, the track panel, and
    // the crossfade panel with its chart.
    //
    // With the immediate-mode kit there is no separate "handle input" step: ui.button()
    // returns true on the frame it was clicked, tapped, or its number key was pressed, so
    // the track switch happens right where the button is declared.
    render() {
        BT.clear(this.theme.bg);

        this.renderStatusLine();

        // The track panel goes first: its buttons may switch tracks this very frame, and
        // everything drawn after them should already show the new one.
        this.renderTrackPanel();

        const active = this.activeTrack();

        this.renderFadePanel(active);
        this.renderChart(active.profile);
    }

    // The TRACKS entry of the track playing now. Array.find() walks the list and returns
    // the first entry the test function says yes to.
    activeTrack() {
        return TRACKS.find((track) => track.trackId === this.activeTrackId);
    }

    // One centered line just under the overlay bars: the shared unlock reminder in warm
    // orange until sound is unlocked, then a dim reminder of the controls.
    renderStatusLine() {
        const isLocked = !BT.isAudioUnlocked;
        const text = isLocked ? 'Click or press a key to enable sound' : 'Press 1, 2, or 3 to switch tracks.';
        const x = centeredTextX(Math.floor(DISPLAY_W / 2), text);

        ui.caption(x, STATUS_Y, text, { color: isLocked ? 'warm' : 'dim' });
    }

    // Left-hand panel: one button per track, the one playing lit green, and its name in
    // the last row.
    renderTrackPanel() {
        ui.begin('topLeft', { x: LEFT_PANEL_X, y: PANEL_Y, width: LEFT_PANEL_W });
        ui.panel('Tracks');
        ui.label('Keys 1, 2, 3 or tap', { color: 'dim' });
        ui.spacer(4);

        // Each button fires on a click, a tap, or its number key - the kit binds the key
        // and treats all three the same.
        for (const track of TRACKS) {
            const lit = track.trackId === this.activeTrackId ? LIT_BUTTON : undefined;

            if (ui.button(track.label, { key: track.keyCode, width: TRACK_BUTTON_W, lit })) {
                this.playTrack(track.trackId);
            }
        }

        // Looked up after the buttons, so a switch made just now already shows.
        const active = this.activeTrack();

        ui.spacer(LEFT_PANEL_FILLER);
        ui.kv('Playing', active.name);
        ui.end();
    }

    // Right-hand panel: room for the chart, then the numbers behind it - the fade length,
    // the overlap, the easing curve, and what part of the track loops.
    renderFadePanel(active) {
        const { profile } = active;
        const overlapSign = profile.overlap > 0 ? '+' : '';
        const loopText =
            active.trackId === 'loop' ? `${INTRO_LOOP_START_SECONDS}s - ${INTRO_LOOP_END_SECONDS}s` : 'whole track';

        ui.begin('topLeft', { x: RIGHT_PANEL_X, y: PANEL_Y, width: RIGHT_PANEL_W, kvCols: FADE_KV_COLS });
        ui.panel('Crossfade');

        // An empty row as tall as the chart: renderChart() paints the chart into this gap
        // after the panel is drawn, so it lands on top.
        ui.spacer(CHART_H + CHART_GAP);

        ui.kv('Fade', `${profile.fadeMs}ms`);
        ui.kv('Overlap', `${overlapSign}${profile.overlap} (${active.overlapNote})`);
        ui.kv('Curve', profile.easeIn);
        ui.kv('Loop', loopText);
        ui.end();
    }

    // The crossfade chart: time runs left to right, volume bottom to top. The old track's
    // line (dim) falls from full to silent, the new track's line (green) rises. While a
    // switch is still fading, a marker shows how far along it is.
    renderChart(profile) {
        ui.drawRectFill(CHART_RECT, this.theme.shadow);
        ui.drawRect(CHART_RECT, this.theme.border);

        // Faint guides for full volume and silence.
        ui.drawRectFill(new Rect2i(PLOT_LEFT, PLOT_TOP, PLOT_RIGHT - PLOT_LEFT + 1, 1), this.theme.panel);
        ui.drawRectFill(new Rect2i(PLOT_LEFT, PLOT_BOTTOM, PLOT_RIGHT - PLOT_LEFT + 1, 1), this.theme.panel);

        // The marker goes first, so the two lines draw over it.
        this.renderChartMarker(profile);

        this.renderChartLine(profile, 'old', this.theme.dim);
        this.renderChartLine(profile, 'new', this.theme.accent);

        // "out" above the old line where it starts, "in" above the new line where it
        // ends. A caption's letters start 1 pixel above the y it is placed at.
        const labelY = CHART_RECT.y + 5;

        ui.caption(PLOT_LEFT, labelY, 'out', { color: 'dim' });
        ui.caption(PLOT_RIGHT - (2 * FONT_W - 1) + 1, labelY, 'in', { color: 'accent' });
    }

    // One volume line across the chart, `which` being 'old' or 'new'. Each column gets a
    // 1-pixel-wide bar from its own height to the previous column's, so the line stays
    // connected even where it drops steeply. Flat stretches are gathered into one wide
    // bar instead of one draw per column.
    renderChartLine(profile, which, slot) {
        let prevY = null;
        let runStart = PLOT_LEFT;

        for (let col = PLOT_LEFT; col <= PLOT_RIGHT + 1; col++) {
            const lineY = col <= PLOT_RIGHT ? this.lineY(profile, which, col) : null;

            // Still flat: keep growing the current run.
            if (lineY !== null && lineY === prevY) {
                continue;
            }

            // The line moved (or the chart ended): draw the finished flat run...
            if (prevY !== null) {
                ui.drawRectFill(new Rect2i(runStart, prevY, col - runStart, 1), slot);
            }

            // ...and a bar joining it to the new height, so a steep drop has no holes.
            if (lineY !== null && prevY !== null) {
                const top = Math.min(lineY, prevY);

                ui.drawRectFill(new Rect2i(col, top, 1, Math.abs(lineY - prevY) + 1), slot);
            }

            runStart = col;
            prevY = lineY;
        }
    }

    // Which row the 'old' or 'new' volume line sits on in chart column `col`.
    lineY(profile, which, col) {
        crossfadeVolumes(profile, this.columnMs(col) - CHART_LEAD_MS, this.volumes);

        return Math.round(PLOT_BOTTOM - this.volumes[which] * (PLOT_BOTTOM - PLOT_TOP));
    }

    // A vertical line at how far the current crossfade has got, shown only while it is
    // still fading. Nothing fades before sound is unlocked, so no marker then either.
    renderChartMarker(profile) {
        if (this.switchTick === null || !BT.isAudioUnlocked) {
            return;
        }

        const elapsedMs = ((BT.ticks - this.switchTick) / BT.targetFPS) * 1000;

        if (elapsedMs >= crossfadeMs(profile)) {
            return;
        }

        const col = PLOT_LEFT + Math.round(((elapsedMs + CHART_LEAD_MS) / CHART_SPAN_MS) * (PLOT_RIGHT - PLOT_LEFT));

        ui.drawRectFill(new Rect2i(col, PLOT_TOP, 1, PLOT_BOTTOM - PLOT_TOP + 1), this.theme.header);
    }

    // The time, in milliseconds from the chart's left edge, that chart column `col`
    // shows.
    columnMs(col) {
        return ((col - PLOT_LEFT) / (PLOT_RIGHT - PLOT_LEFT)) * CHART_SPAN_MS;
    }

    // Starts the given track ('A', 'B', or 'loop') with its matching crossfade profile,
    // unless it is already playing - pressing the same button twice does nothing new.
    playTrack(trackId) {
        if (trackId === this.activeTrackId) {
            return;
        }

        if (trackId === 'A') {
            BT.musicPlay(this.calmClip, { volume: 1, loop: true, ...PROFILE_TO_A });
        } else if (trackId === 'B') {
            BT.musicPlay(this.upbeatClip, { volume: 1, loop: true, ...PROFILE_TO_B });
        } else {
            // No `loop: true` here: giving loopStart and loopEnd is what makes the region
            // repeat, and the engine ignores `loop` whenever both of them are set.
            BT.musicPlay(this.introLoopClip, {
                volume: 1,
                loopStart: INTRO_LOOP_START_SECONDS,
                loopEnd: INTRO_LOOP_END_SECONDS,
                ...PROFILE_TO_LOOP,
            });
        }

        // The very first track has nothing to fade from, so its chart gets no marker.
        this.switchTick = this.activeTrackId === null ? null : BT.ticks;
        this.activeTrackId = trackId;
    }
}

bootstrap(Demo);
