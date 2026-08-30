# Nova Drift

A small endless-arcade game in the browser: drift through a glowing ring tunnel, dodge red obstacles, collect cyan orbs, and survive as long as you can while the speed keeps ramping up. Built with [Three.js](https://threejs.org/) and real bloom post-processing.

**[Play](https://furkiozknn.github.io/nova-drift/)**

## Controls

- Mouse / touch-drag — the ship follows your pointer
- Arrow keys / WASD — nudge the ship left/right/up/down
- Space / Enter — start or restart

## How it works

- The ship stays put while the tunnel (rings, obstacles, orbs, starfield) scrolls toward the camera; speed ramps up the longer you survive
- Obstacles and orbs spawn from an object pool and recycle once they pass behind the ship — no per-frame allocation
- Score = distance survived + a bonus per orb collected; best score persists in `localStorage`

## Run locally

```bash
npx serve .
```

Needs to be served over HTTP (not opened via `file://`) since it loads Three.js as an ES module.

## Stack

Plain HTML/CSS/JS, Three.js via import map from a CDN — no build step.
