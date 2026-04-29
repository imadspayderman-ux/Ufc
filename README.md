# Octagon Fury — Arcade MMA

An arcade-style MMA / cage-fighting game built with vanilla HTML5 Canvas + JavaScript.
No build step, no dependencies — open `index.html` in a modern browser and play.

## Features

- 8 original fighters with distinct styles, stats, and special moves
- Punch, kick, uppercut, low kick, head kick, block, dodge, jump, crouch
- Per-fighter SPECIAL moves (unblockable finishers when meter is full)
- Health, stamina, and special meters with arcade HUD
- 3-round matches, KO and decision endings
- AI opponent with 4 difficulty levels (Rookie / Pro / Champion / Legend)
- Synthesized SFX (Web Audio API — no audio assets)
- Particle hit-sparks, screen shake, hitstop, freeze frames

## Controls

| Action | Key |
| --- | --- |
| Move left / right | A / D (or arrow keys) |
| Jump / step in | W |
| Crouch | S |
| Dash / dodge (i-frames) | Shift |
| Jab (light punch) | J |
| Cross / hook (heavy punch) | K |
| Uppercut (anti-crouch) | U |
| Kick (combine with S = low, W = head) | L |
| Block | I (hold) |
| Low kick / clinch shortcut | O |
| SPECIAL (full meter) | Space |
| Pause | P or Esc |

## How to run locally

The game uses ES modules so it must be served over HTTP (not opened with `file://`).

```bash
# any static server works - examples:
python3 -m http.server 8000
# or
npx http-server -p 8000
```

Then visit <http://localhost:8000>.

## Roster

All fighters are entirely fictional. None are based on or intended to depict any
real-world athlete, league, or fighting promotion.

| Name | Nickname | Style | Strength |
| --- | --- | --- | --- |
| KAI | "Thunder" | Striker | Balanced relentless |
| TONY | "Iron Fist" | Boxer | Heavy hands |
| HIRO | "Shadow Crane" | Karate | Speed & technique |
| BORIS | "The Bear" | Brawler | Heavyweight power |
| RAFA | "Mamba" | Grappler | Submission specialist |
| AMIR | "Desert Storm" | Muay Thai | Devastating elbows / knees |
| JIN | "Lightning" | Taekwondo | Blinding speed |
| DIANA | "Phoenix" | All-rounder | Comeback finisher |

## Tech

- Pure JS ES modules, single `index.html`, no bundler
- Canvas 2D for arena & fighter rendering (procedural — no copyrighted images)
- Web Audio API for synthesized SFX
- ~1500 LOC across `src/`

## Credits

Octagon Fury is original arcade-style content. Not affiliated with or endorsed by
any real-world fighting organization or athlete.
