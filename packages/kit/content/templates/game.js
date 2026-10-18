// Your BLIT386 game, ready for your own code.
//
// Every BLIT386 game is one class with three required methods and a few optional hooks. This file keeps the
// required three plus one hook:
//   init()      - runs once at the start. Set up your palette and starting state here.
//   update()    - runs about 60 times a second. Read input and update your state here.
//   render()    - runs about 60 times a second. Draw everything here.
//   testState() - never called by the engine itself. In a dev build, `window.BT.testState()` (and `blit play`)
//                 read it, so a test or an AI assistant can check your game as numbers instead of pixels.
//
// Other optional hooks you can add later: configure() for screen settings or to turn off the BLIT386
// splash, onHotReload() to keep state across init() edits while the Vite plugin hot-reloads.
//
// We do not write a configure() method, so we get the default screen: 320 by 240 pixels at 60 frames per second.
// Want to learn more? Read AGENTS.md or the docs/ folder next to this file.

import { bootstrap } from 'blit386';

class Game {
    async init() {
        return true; // tell the engine that setup worked
    }

    update() {
        // Update your game state here.
    }

    render() {
        // Draw your game here.
    }

    testState() {
        // Return plain JSON a play-tester can read, for example { score: this.score, player: { x: 0, y: 0 } }.
        return {};
    }
}

// Hand the Game class to BLIT386. It builds one game, runs init() once, then update() and render() about 60 times a second.
bootstrap(Game);
