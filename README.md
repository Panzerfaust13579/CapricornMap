# MoonSlip

**Your launch just slipped 14 days. Is your landing site at the Moon's South Pole still alive?**

MoonSlip answers that question in seconds. Pick a landing site, a date and what your lander needs. MoonSlip shows the Sun and Earth against the real lunar horizon and gives a **GO** or **NO-GO** verdict. If the plan fails, it ranks your rescue options: land on another day, or land at another site.

Built for the NASA Space Apps Challenge 2026, challenge **Lunar Landing Site Navigator**.

---

## The problem

A lander needs two things to survive:

1. **Sunlight**, for power from its solar panels.
2. **Earth in view**, for direct radio contact with mission control.

At the lunar South Pole, both are fragile. The Moon's axis is tilted only about 1.5°, so near the pole the Sun never climbs more than a few degrees above the horizon. It circles the sky at a low angle all month. A single ridge or crater wall can hide the Sun for days. Earth also hangs low, and it wobbles up and down in the sky (libration). So Earth can drop behind the terrain too.

Small changes matter. A few days' delay, or a site a few kilometres away, can be the difference between a lander that works and one that freezes in the dark. NASA's IM-1 Odysseus and IM-2 Athena landers both ended their missions early near the South Pole.

Existing tools can compute Sun and Earth positions, but they are hard to use for a quick decision. MoonSlip is built for one moment: **the plan just changed, and you need the best Plan B now.**

## Who it is for

- **Mission planners.** Check whether a site and date meet the lander's needs, and compare alternatives.
- **Educators and students.** Explain mode adds plain-language captions to every panel.
- **Anyone curious** about why the lunar South Pole is such a hard place to land.

---

## How to use it

### 1. Pick a site

Choose one of the ten curated sites:

| Group | Sites |
|---|---|
| NASA Artemis III candidate regions | Connecting Ridge, Malapert Massif, Mons Mouton Plateau, Nobile Rim 1, Haworth, de Gerlache Rim 2 |
| NASA CLPS commercial landers | IM-2 Athena, IM-1 Odysseus |
| ISRO (partner agency) | Chandrayaan-3 (Shiv Shakti point) |
| Apollo | Apollo 11 (Tranquility Base), as an equator reference |

You can also type any latitude and longitude and press **Look up**. MoonSlip asks NASA JPL Horizons live for that point.

A badge under the site tells you which horizon is used:
- **LOLA terrain**: the real horizon, computed from NASA laser altimetry of the Moon's surface.
- **terrain not applied**: a smooth Moon with no hills, a simpler estimate.

### 2. Describe the mission

- **Landing date** and **mission days**.
- **Mast height**: how high the solar panels or antenna sit above the ground.
- **Four needs**, set with sliders:
  - minimum sunlight (% of the mission),
  - maximum night (longest dark period, in hours),
  - minimum Earth visibility (% of the mission),
  - maximum comms gap (longest time without Earth, in hours).

### 3. Read the verdict

The **verdict strip** shows:
- **GO** if every need is met, or **NO-GO** with the needs that failed, written out. For example: "sunlight 8% is below 60%".
- Two countdowns, such as **"Sunset in 4.2 d"** and **"Earthset in 64 h"**, measured from the time shown on the sky ribbon.

### 4. Look at the sky ribbon

The sky ribbon is the whole horizon unrolled into a strip:

- **Left to right**: compass direction, N → E → S → W → N.
- **Bottom to top**: height above the horizon, in degrees.
- **Grey shape**: the terrain horizon (mountains, crater rims).
- **Dashed line**: where the horizon would be on a perfectly smooth Moon.
- **Yellow line and disc**: the Sun's path and its position now.
- **Blue line and disc**: Earth's path and its position now.

Press **Play lunar day** to watch one full lunar day (about 29.5 Earth days), or drag the time slider. When the Sun's disc slips behind the grey terrain, the lander loses power. When Earth's disc does, it loses contact.

### 5. The launch slipped: use the Plan B finder

Use the **Launch slipped** stepper (from −7 to +28 days) to move the landing date. The verdict updates at once. The **Plan B finder** ranks every rescue:

- the **same site** on every other date from 7 days early to 28 days late, and
- **every other site** on the new, slipped date.

Options are ranked GO first, then by sunlight, then by Earth contact. Each card says in one sentence what you gain and lose compared with the current plan. For example:

> +86% sunlight, 3 fewer days of Earth contact, longest night 288 h shorter

### 6. Compare two plans

Click any Plan B card to load it into the **comparator**. It shows the current plan (A) next to the option (B) and adds a **B − A** column. Rows:

- verdict, sunlit %, longest night, Earth visible %, total Earth contact, longest comms gap
- mean power for a **horizontal** solar panel and for a **vertical** panel that turns to face the Sun

The power rows show why polar landers use vertical panels. With the Sun 1.5° above the horizon, a flat panel gets about 37 W/m². A vertical panel facing the Sun gets about 1360 W/m².

### 7. Check the science

Open **Validation** (top right) to see:

- **Known-answer tests**, run live in your browser. Apollo 11 always sees Earth, a far-side point never does, and a wall of terrain on every side gives 0% sunlight.
- **Horizons spot check**: press the button and MoonSlip asks NASA JPL Horizons again, live. It compares the answers with the data the app uses.
- **Method and limits** in plain words.

---

## How it works

```
 OFFLINE (Python)                                   IN THE BROWSER (TypeScript)
 ─────────────────                                  ───────────────────────────
 JPL Horizons API ──► Sun & Earth positions ──┐
   hourly, 2027–2028, every site              │
                                              ├──► static JSON ──► engine ──► verdict, countdowns,
 LOLA South Pole DEM ──► 360° horizon mask ───┘                     (pure     metrics, Plan B ranking
   (NASA laser altimetry)  per polar site                           functions)
```

The heavy work runs once, ahead of time, and is saved as small JSON files (about 4 MB in total). The browser then does every comparison instantly, with no server. Only custom coordinates and the spot check call NASA live.

### The science, step by step

1. **Where are the Sun and Earth?** NASA JPL Horizons gives their compass direction (azimuth) and height (elevation) for an observer standing at each site. The settings are airless, because the Moon has no atmosphere and so no refraction. Earth's wobble (libration) is included, because these are real ephemerides, not a circle approximation.
2. **Where is the horizon?** Each point of the LOLA elevation map is placed in 3D around the Moon (radius 1737.4 km plus the local height). From an observer 2 m above the ground, MoonSlip finds the highest terrain angle in each of the 360 compass directions. The Moon's curvature comes from the 3D geometry, so it is not corrected twice. Near terrain uses 20 m pixels out to 20 km. Far terrain uses 160 m pixels out to 150 km.
3. **Is it visible?** The Sun and Earth are discs, not points: the Sun is about 0.5° wide and Earth about 1.9°. A body counts as visible while its **top edge** is above the horizon at its compass direction.
4. **Windows and metrics.** Visibility is checked every hour. Each switch between visible and hidden is placed between samples by interpolation. That gives sunlit %, longest night, Earth contact, longest comms gap and the countdowns.
5. **Power.** Sunlight above the Moon carries 1361 W/m². A flat panel collects that × sin(Sun height). A vertical panel facing the Sun collects that × cos(Sun height).
6. **Smooth-Moon fallback.** Where no terrain map is used, the horizon dips by −acos(R / (R + mast)) below flat. That is −0.09° for a 2 m mast.

---

## Limits (stated honestly)

- Six polar sites use real LOLA terrain. IM-2 Athena, IM-1 Odysseus, Chandrayaan-3, Apollo 11 and custom points use the smooth-Moon horizon, and the app says so on screen.
- Artemis sites are **regions** about 15 km across. Their terrain horizon is taken from the region's highest point within 1 km of the listed centre, where a lander would most likely be placed.
- The terrain horizon is fixed at a 2 m mast. The mast-height input changes only the smooth-Moon horizon.
- Terrain closer than 100 m is ignored, because at 20 m per pixel it is mostly map noise.
- Curated data covers 2027–2028, sampled every hour.
- Power is a geometric estimate. There is no battery model, no radio link budget and no relay satellites.

---

## Run it yourself

```sh
npm install
npm run dev      # start the app locally
npm test         # run the engine tests (Vitest)
npm run build    # production build in dist/
```

Deploy as a static site on Vercel. `vercel.json` forwards `/horizons-api` to JPL Horizons, because Horizons does not allow direct browser calls. The development server forwards the same path.

### Rebuild the data (optional)

```sh
python pipeline/fetch_ephem.py           # Sun and Earth positions for all sites (Python standard library only)
pip install rasterio pyproj numpy
python pipeline/horizon_mask.py --test   # self-test: flat Moon, 2 m mast gives -0.09 deg
python pipeline/horizon_mask.py          # LOLA terrain horizons for sites south of 80.5 S
```

`fetch_ephem.py` finishes with known-answer checks. All pass on the committed data. `horizon_mask.py` reads only the parts of NASA's 2.7 GB elevation map it needs, straight from the PGDA server. If the server rate-limits you, wait and rerun it with the site ids that are missing. The data file formats are in [CONTRACT.md](CONTRACT.md).

### Project layout

```
src/engine/       pure calculation functions and their tests
src/components.tsx  sky ribbon, verdict strip, comparator, Plan B panel
src/App.tsx       the one-screen planner
src/Validation.tsx  validation page
src/horizons.ts   live JPL Horizons lookups
pipeline/         Python scripts that build public/data/
public/data/      sites, Sun/Earth positions, terrain horizons (JSON)
```

---

## NASA and partner data

| Source | What it does in the app |
|---|---|
| NASA JPL Horizons API | Sun and Earth direction, height and size at every site; live lookups for custom points and the spot check |
| NASA LRO LOLA South Pole DEM, PGDA Product 90 (`LDEM_80S_20MPP_ADJ.TIF`) | Real terrain horizons |
| NASA Artemis III candidate regions | Curated polar sites |
| ISRO Chandrayaan-3 landing site | Curated partner-agency site |

## Software

React, TypeScript, Vite, Tailwind CSS and Vitest for the app. Python with rasterio, pyproj and NumPy for the data pipeline.

## Use of AI

The code, data pipeline and this README were drafted with Claude Code (Anthropic), working from the team's execution plan. The team reviewed and tested them. *Team: add each member's AI-tool use from the AI-use log before submitting.*
