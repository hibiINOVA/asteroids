# AGENTS.md

## Project

Single-file HTML5 Canvas game (`game.js`, ~420 lines). No build system, no bundler, no dependencies, no tests, no linting. Canvas is hardcoded to 800x600.

## Run

Open `index.html` in a browser, or `npx serve .` then visit `localhost:3000`.

## Code conventions

- All game logic lives in `game.js`. Everything is in the global scope (no modules).
- Constants are defined as arrays indexed by asteroid size (1=small, 2=medium, 3=large) in `RADII`, `SPEEDS`, `POINTS`.
- Screen wrapping uses the `wrap()` utility (toroidal space).
- Game states: `'playing'`, `'dead'` (respawn timer), `'gameover'`.
- UI text and code comments are in Spanish.
- `'use strict'` at top. No semicolons on some lines, mixed style — match the surrounding code.

## Gotchas

- `justPressed` is consumed by `pressed()` — calling it more than once per frame loses the event.
- dt is clamped to 0.05s max in the main loop to prevent physics explosions on tab-switch.
- Ship collision radius uses `a.radius * 0.82` multiplier (slightly forgiving).
- `nextLevel()` clears bullets and particles but keeps the asteroid count based on `level`.
- `spawnAsteroids` enforces a 130px safe zone from center.
