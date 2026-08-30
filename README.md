# Nova Drift

A small endless-arcade game in the browser: drift through a glowing ring tunnel, dodge red obstacles, collect cyan orbs, grab power-ups, and survive as long as you can while the speed keeps ramping up. Built with [Three.js](https://threejs.org/) and real bloom post-processing.

**[Play](https://furkiozknn.github.io/nova-drift/)**

## Controls

- Mouse / touch-drag — the ship follows your pointer; on touch it's a proper virtual joystick that appears where you touch
- Arrow keys / WASD — nudge the ship left/right/up/down
- Space / Enter — start or restart
- Escape / pause button — pause, freezing the scene exactly where it was

## Power-ups

- 🛡️ **Shield** — absorbs one collision instead of ending the run (stacks up to 2)
- 🧲 **Magnet** — pulls nearby orbs toward the ship for a few seconds
- ✨ **x2** — doubles all scoring for a few seconds

## Scoring

- Distance survived, plus a bonus per orb collected
- **Near-miss bonus**: skim past an obstacle without hitting it for a small bonus and a distinct chime — rewards flying close to the edge
- Top 5 scores persist locally (`localStorage`) and show on the start and game-over screens

## How it works

- The ship stays put while the tunnel (rings, obstacles, orbs, power-ups, starfield, a nebula backdrop) scrolls toward the camera; speed ramps up the longer you survive
- Obstacles, orbs, and power-ups spawn from object pools and recycle once they pass behind the ship — no per-frame allocation
- Sound effects are synthesized live with the Web Audio API (no audio files); a mute toggle persists in `localStorage`
- Screen shake and a colored flash on shield-block / crash, both skipped when the OS `prefers-reduced-motion` setting is on
- Ship art and the nebula backdrop are AI-generated images; game logic and rendering are hand-written

## Run locally

```bash
npx serve .
```

Needs to be served over HTTP (not opened via `file://`) since it loads Three.js as an ES module.

## Stack

Plain HTML/CSS/JS, Three.js via import map from a CDN — no build step.
