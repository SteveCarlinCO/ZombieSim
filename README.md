# ZOMBIE OUTBREAK SIMULATION

1,000 humans. One patient zero. A moonlit city from above. Pick a number and bet on the last human standing.

## How to play

1. Set the human count (2–1000) and enter your pick.
2. Click **Lock in guess & start** — patient zero is released.
3. Infection spreads on sustained contact (~0.7s). Buildings block movement and line-of-sight.
4. Your pick gets a pulsing gold ring. Last human standing wins — and takes the rooftop.

## Features

**Simulation**
- Up to 1,000 autonomous humans with flee AI, building avoidance, and panic (adrenaline) sprint
- Patient zero hunts the nearest human; the horde grows and accelerates
- Sustained-contact infection model with 4-second incubation (new zombies glow yellow-green, can't infect yet)
- Buildings block movement, infection line-of-sight, and zombie vision
- Frenzy tiers: 2× zombie speed below 20% survivors, 4× at 5 or fewer
- Stall breaker: 30s with no infections doubles zombie speed
- Runner zombies: 5% of the turned get 2× speed for ~10s, then burn out

**City**
- Procedurally generated 3D city: extruded buildings with windows, rooftop equipment, antennas, satellite dishes
- Each building gets a unique muted moonlight color
- 160 trees, 20 parked cars, 2 emergency vehicles with flashing light bars
- 3 burning buildings with drifting smoke, steam vents, streetlights, puddles, barricades, cones, bus stops, dumpsters, manholes, grime
- Persistent blood splatters where infections happen (toggleable, never on buildings)

**Presentation**
- Full procedural Web Audio soundscape: sirens, city hum, wind, fire crackle, heartbeat (55→140 BPM), horde moans, infection squelches, radio static, victory sting — no audio files
- Screen shake on mass-infection frames
- Sim speed toggle (1×/2×/4×), persistent mute and blood toggles
- Realtime stats table: humans alive, zombies, % infected, your pick's survival odds
- Health bar: blue survivor bar drains over a blood-red background
- Timer, flashing survivor rings under 10 remaining, Special Elite typewriter font throughout

## Files

| File | Contents |
|------|----------|
| `index.html` | Page structure, UI, canvas |
| `zombie_styles.css` | All styling |
| `zombie_script.js` | Simulation, AI, city generator, sound engine, rendering |

No build step, no dependencies. Serve the folder statically (e.g. GitHub Pages) and open `index.html`.

## Tuning

Key constants in `zombie_script.js`:

| Constant | Default | Effect |
|----------|---------|--------|
| `HEALTHY_MAX` | 1.35 | Healthy top speed (×1.5 with adrenaline) |
| `INFECTED_MAX` | 1.22 | Zombie base top speed (+0.6 max from horde scaling) |
| `CELL` | 26 | Spatial hash cell size (performance) |
