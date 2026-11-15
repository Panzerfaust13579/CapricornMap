# MoonSlip

**Your launch just slipped 14 days. Is your landing site at the Moon's South Pole still alive?**

MoonSlip answers that question in seconds. Pick a landing site, a date and what your lander needs. MoonSlip shows the Sun and Earth against the real lunar horizon and gives a **GO** or **NO-GO** verdict. If the plan fails, it names the best way out and ranks the rest: land on another day, or land at another site.

Try it with the plan the app opens on. Mons Mouton Plateau, landing 12 March 2027, is **GO** with 86% sunlight. Slip it 14 days and it is **NO-GO**: 17% sunlight and a 280-hour night. MoonSlip's answer: the next good date is 10 April.

Built for the NASA Space Apps Challenge 2026, challenge **Lunar Landing Site Navigator**.

Source code: <https://github.com/oscarzt20/CapricornMap> (also linked from the app header and footer).

---

## The problem

A lander needs two things to survive:

1. **Sunlight**, for power from its solar panels.
2. **Earth in view**, for direct radio contact with mission control.

At the lunar South Pole, both are fragile. The Moon's axis is tilted only about 1.5°, so near the pole the Sun never climbs more than a few degrees above the horizon. It circles the sky at a low angle all month. A single ridge or crater wall can hide the Sun for days. Earth also hangs low, and it wobbles up and down in the sky (libration). So Earth can drop behind the terrain too.

Small changes matter. A few days' delay, or a site a few kilometres away, can be the difference between a lander that works and one that freezes in the dark. The IM-1 Odysseus and IM-2 Athena landers, both carrying NASA payloads, ended their missions early near the South Pole.

Existing tools can compute Sun and Earth positions, but they are hard to use for a quick decision. MoonSlip is built for one moment: **the plan just changed, and you need the best Plan B now.**

## Who it is for

- **Mission planners.** Check whether a site and date meet the lander's needs, and compare alternatives.
- **Educators and students.** Explain mode adds plain-language captions to every panel.
- **Anyone curious** about why the lunar South Pole is such a hard place to land.

---

## How to use it

### 0. Find your way around

- **Header**: the GO / NO-GO pill, one tab per section (keys **1–5**, **0** for the overview), **Validation & NASA Data**, the **Planner / Explain** switch, **GitHub** and **Share**.
- **Overview**: the planner sits in a side panel on the left. Drag its edge (or focus it and use the arrow keys) to resize it between 545 and 720 px, or collapse it with the ‹ button. The Sky ribbon and Plan B finder fill the rest of the screen.
- **A tab** opens that one section full screen. In Explain mode the captions move to a column on the right.
- On phones and tablets the panels stack in one column, planner first.

### 1. Pick a site

Choose one of the ten curated sites from the list, or tap its pin on the **South Pole map**:

| Group | Sites |
|---|---|
| NASA Artemis III candidate regions | Connecting Ridge, Malapert Massif, Mons Mouton Plateau, Nobile Rim 1, Haworth, de Gerlache Rim 2 |
| NASA CLPS commercial landers | IM-2 Athena, IM-1 Odysseus |
| ISRO (partner agency) | Chandrayaan-3 (Shiv Shakti point) |
| Apollo | Apollo 11 (Tranquility Base), as an equator reference |

You can also type any latitude and longitude, or tap the ground on the map, and press **Look up**. MoonSlip asks NASA JPL Horizons live for that point.

Under the site name you will find:
- A badge for the horizon in use. **LOLA terrain**: the real horizon, computed from NASA laser altimetry (nine of the ten sites). **terrain not applied**: a smooth Moon with no hills (Apollo 11 and custom points).
- **Open in LROC QuickMap**: the same spot in NASA's lunar map viewer.

### 2. Describe the mission

- **Landing date** and **mission days**.
- **Mast height**: how high the solar panels or antenna sit above the ground. A taller mast sees over nearby terrain. At Nobile Rim 1, going from 2 m to 20 m raises the number of GO landing dates in 2027–2028 from 75 to 97 (14-day mission, default needs).
- **Four needs**, set with sliders:
  - minimum sunlight (% of the mission),
  - maximum night (longest dark period, in hours),
  - minimum Earth visibility (% of the mission),
  - maximum comms gap (longest time without Earth, in hours).

### 3. Read the verdict

The **verdict strip** shows:
- **GO** if every need is met, or **NO-GO** with the needs that failed, written out. For example: "sunlight 17% is below 60%".
- Two countdowns, such as **"Sunset in 2.4 d"** and **"Earthset in 64 h"**, measured from the time shown on the sky ribbon.
- On NO-GO, the **best way out** in one line, with two buttons: **Compare** puts it next to your plan, **Use this plan** switches to it.

A small GO or NO-GO pill stays in the page header while you scroll.

### 4. Look at the sky ribbon

The sky ribbon is the whole horizon unrolled into a strip:

- **Left to right**: compass direction, N → E → S → W → N.
- **Bottom to top**: height above the horizon, in degrees.
- **Grey shape**: the terrain horizon (mountains, crater rims).
- **Dashed line**: where the horizon would be on a perfectly smooth Moon.
- **Yellow line and disc**: the Sun's path and its position now.
- **Blue line and disc**: Earth's path and its position now.

Press **Play lunar day** to watch one full lunar day (about 29.5 Earth days), or drag the time slider. When the Sun's disc slips behind the grey terrain, the lander loses power. When Earth's disc does, it loses contact.

Under the ribbon, two bars show **when** the Sun and Earth are in view across the lunar day, with the mission window marked. Tap or drag on them to move the time. A line of text gives the Sun's and Earth's elevation at that moment and how far each clears the horizon.

### 5. The launch slipped: use the Plan B finder

Use the **Launch slipped** stepper (from −7 to +28 days) to move the landing date. The verdict updates at once. The **Plan B finder** ranks every rescue:

- the **same site** on other dates, up to 28 days after the original date, and
- **every other site** on the new, slipped date.

After a slip, dates before the new landing date are left out, because you cannot land before you arrive. Tick "include dates before" to see them. Options are ranked GO first, then by sunlight, then by Earth contact. Each card says whether it is a new date or a new site, and in one sentence what you gain and lose compared with the current plan. For example:

> +82% sunlight, 6 fewer days of Earth contact, longest night 274 h shorter

If nothing in that window works, the verdict strip looks further ahead and names the next good date at your site.

### 6. Compare two plans

Click any Plan B card to load it into the **comparator**. It shows the current plan (A) next to the option (B) and adds a **B − A** column. Rows:

- verdict, sunlit %, longest night, Earth visible %, total Earth contact, longest comms gap
- mean power for a **horizontal** solar panel and for a **vertical** panel that turns to face the Sun

The power rows are averaged over the full mission and weighted by the visible solar disc fraction. They show why polar landers use vertical panels: when sunlit at 1.5° elevation, a flat panel gets about 36 W/m², while a vertical panel facing the Sun gets about 1360 W/m².

### 7. Find the good dates: the landing calendar

**When to land** shows every landing date in 2027–2028 for the chosen site as a grid of squares, one row per month. Colour it by sunlight, by Earth visibility or by verdict. Good dates come in waves, about once a month, and shift with the lunar seasons. Tap a date to compare it with your plan. A table view lists GO dates per month.

### 8. Share a plan

The address bar always holds the whole scenario. **Copy link** gives you a link that reopens the same site, date, slip, needs and comparison.

### 9. Explain mode

Switch **Planner mode** to **Explain mode** for plain-language captions under every panel, and an **Earth versus Moon** card that compares a day on Earth with a day at the chosen site, using that site's own numbers.

### 10. Check the science

Open **Validation and data** (top right) to see:

- **Known-answer tests**, run live in your browser. Apollo 11 always sees Earth, a far-side point never does, and a wall of terrain on every side gives 0% sunlight.
- **Horizons spot check**: press the button and MoonSlip asks NASA JPL Horizons again, live. It compares the answers with the data the app uses. They agree to 0.005°.
- **Cross-check against NASA's illumination maps** (PGDA Product 69). For each of the nine terrain sites, NASA's 18.6-year average sunlight and Earth visibility next to ours. Earth visibility agrees within 4.3 points at all nine. Sunlight agrees within 4.5 points at seven. The other two are narrow ridge crests, where NASA's own map changes by 20 to 40 points within 500 m. The table also shows what we would get without terrain.
- **Data sources**: every dataset and what it does in the app.
- **Method and limits** in plain words.

---

## How it works

```
 OFFLINE (Python)                                   IN THE BROWSER (TypeScript)
 ─────────────────                                  ───────────────────────────
 JPL Horizons API ──► Sun & Earth positions ──┐
   hourly, 2027–2028, every site              │
                                              ├──► static JSON ──► engine ──► verdict, countdowns,
 LOLA South Pole DEMs ─► 360° horizon mask ───┤                     (pure     metrics, Plan B ranking,
   (NASA laser altimetry)  at 4 mast heights  │                     functions) landing calendar
                                              │
 NASA illumination maps ► cross-check values ─┘
```

The heavy work runs once, ahead of time, and is saved as small JSON files (about 4.5 MB in total). The app appears as soon as the chosen site has loaded; the other sites load behind it. The browser then does every comparison instantly, with no server. Only custom coordinates and the spot check call NASA live.

### The science, step by step

1. **Where are the Sun and Earth?** NASA JPL Horizons gives their compass direction (azimuth) and height (elevation) for an observer standing at each site. The settings are airless, because the Moon has no atmosphere and so no refraction. Earth's wobble (libration) is included, because these are real ephemerides, not a circle approximation.
2. **Where is the horizon?** Each point of the LOLA elevation map is placed in 3D around the Moon (radius 1737.4 km plus the local height). From an observer on a mast above the ground, MoonSlip finds the highest terrain angle in each of the 360 compass directions. The Moon's curvature comes from the 3D geometry, so it is not corrected twice. Near terrain uses the map's full resolution (20 to 60 m pixels) out to 20 km. Far terrain uses 120 to 160 m pixels from there out to 150 km. A nearby pixel wide enough to span several degrees blocks every direction it spans. The mask is computed for masts of 2, 5, 10 and 20 m, and the app interpolates between them.
3. **Is it visible?** The Sun and Earth are discs, not points: the Sun is about 0.5° wide and Earth about 1.9°. A body counts as visible while its **top edge** is above the horizon at its compass direction.
4. **Windows and metrics.** Visibility is checked every hour. Each switch between visible and hidden is placed between samples by interpolation. That gives sunlit %, longest night, Earth contact, longest comms gap and the countdowns.
5. **Power.** Sunlight above the Moon carries 1361 W/m². Each hour's output is scaled by the visible fraction of the solar disc and averaged over the mission: 1361 × disc fraction × sin(Sun height) for a flat panel, or × cos(Sun height) for a vertical panel facing the Sun.
6. **Smooth-Moon fallback.** Where no terrain map is used, the horizon dips by −acos(R / (R + mast)) below flat. That is −0.09° for a 2 m mast.

---

## Limits (stated honestly)

- Nine sites use real LOLA terrain. Apollo 11 and custom points use the smooth-Moon horizon, and the app says so on screen.
- Artemis sites are **regions** about 15 km across. Their terrain horizon is taken from the region's highest point within 1 km of the listed centre, where a lander would most likely be placed. On a sharp ridge, a point a few hundred metres away can get half the sunlight.
- Terrain horizons are computed for masts of 2 to 20 m. Below or above that, the nearest one is used.
- Terrain closer than 5 pixels (100 m on the 20 m map) is ignored, because at that scale the map is mostly noise.
- IM-1 Odysseus uses the 30 m map and Chandrayaan-3 the 60 m map, because the 20 m map stops at 80° S.
- Curated data covers 2027–2028, sampled every hour.
- Power is a geometric estimate. There is no battery model and no radio link budget.
- The **Relay fallback** card is a concept, and is labelled so. No relay satellite is modelled: every number assumes a direct line to Earth.

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
pip install rasterio pyproj numpy pillow
python pipeline/horizon_mask.py --test   # self-tests: flat Moon, and a near pixel that spans several degrees
python pipeline/horizon_mask.py          # LOLA terrain horizons for every site south of 65.5 S
python pipeline/hillshade.py             # shaded relief for the site map
python pipeline/crosscheck_p69.py        # NASA's long-term averages at each site, for the Validation page
```

`fetch_ephem.py` finishes with known-answer checks. All pass on the committed data.

`horizon_mask.py` fetches only the map tiles each site needs from NASA's PGDA server, about 30 to 80 MB per site, into `pipeline/raw/dem/`. It asks for one range at a time and backs off on errors, because the server refuses bursts of requests. If you already have the full maps, set `MOONSLIP_DEM_DIR` to their folder. Both routes give identical files. `crosscheck_p69.py` downloads six maps of 20 to 85 MB once.

The data file formats are in [CONTRACT.md](CONTRACT.md).

### Project layout

```
src/main.tsx            entry point: mounts <App/>
src/App.tsx             the planner: data loading, state, header tabs, side panel and full-screen sections
src/components.tsx      shared UI: Panel, Tier, sky ribbon, verdict strip, slip bar, comparator, Plan B panel, small hooks
src/panels.tsx          site map, landing calendar, window timeline, Earth-vs-Moon and relay cards
src/Validation.tsx      validation and data page (#validation)
src/horizons.ts         live JPL Horizons lookups (custom sites, spot check)
src/share.ts            scenario <-> URL query string
src/engine/index.ts     pure calculation functions (no React, no DOM)
src/engine/geo.ts       polar map projection, distances, QuickMap links
src/engine/engine.test.ts  engine tests (Vitest)
src/index.css           design tokens (Tailwind @theme) and glass / well surfaces
pipeline/               Python scripts that build public/data/
public/data/            sites, Sun/Earth positions, terrain horizons, map, cross-check values
CONTRACT.md             format of every data file
docs/SUBMISSION.md      draft text for the submission form and the 2-minute pitch
```

## Code documentation

### Data flow

1. `App.tsx` fetches `public/data/sites.json`, then each site's ephemeris (`ephem/<id>.json`) and horizon (`horizon/<id>.json`). The chosen site loads first; the rest load behind it. Custom points call `horizons.ts` instead and use the smooth-Moon mask.
2. The scenario (site, date, mission days, mast, needs, slip, comparison) lives in React state and is mirrored to the URL by `share.ts` (`encode` / `decode`), so every view is a shareable link.
3. Every number on screen comes from the pure functions in `src/engine/`. Components only format and draw: all charts are hand-written SVG.

### Engine (`src/engine/index.ts`)

| Function | What it does |
|---|---|
| `maskForMast(horizon, mastM)` | Terrain horizon (360 elevations, 1 per degree) for any mast height, interpolated between the 2 / 5 / 10 / 20 m masks |
| `sphereMask(mastM)`, `sphereDipDeg` | Smooth-Moon horizon used when no terrain is available |
| `maskAt(mask, az)` | Horizon elevation at any azimuth, interpolated |
| `margin`, `visible` | How far the top edge of a disc (Sun or Earth) clears the horizon; visible when > 0 |
| `discFraction(margin, diam)` | Visible fraction of a partly hidden disc, used for power |
| `windows(margins, stepMin)` | Splits a margin series into visible / hidden runs, with crossing times interpolated between samples |
| `span(ephem, startMs, hours)`, `indexAt` | Sample indexes for a mission window |
| `metrics(scenario, ephem, mask)` | Sunlit %, longest night, Earth %, contact hours, longest comms gap, flat and vertical panel power |
| `planB(base, slipDays, data)` | Every rescue (same site on other dates, other sites on the slipped date), ranked GO first, then sunlight, then Earth |
| `gainLoss(m, ref)` | One-sentence comparison used on Plan B cards |
| `calendar(base, ephem, mask, from, to)` | Metrics for every landing date, for the calendar heatmap |
| `bottleneck(days, needs)` | The cheapest single need to relax, and how many landing days it would unlock |
| `longRun(ephem, mask)` | Sunlit and Earth-visible share over all the data, for the Validation cross-check |

`geo.ts` holds the polar stereographic projection used by the site map (`polarXY`, `polarLatLon`), great-circle distance (`distKm`) and `quickmapUrl`.

### UI building blocks

- `Panel` (components.tsx): titled glass card; shows its `caption` when Explain mode is on.
- `Tier`: numbered section header (01 Verdict, 02 Light & link, 03 Deep analysis).
- `SkyRibbon`, `Timeline`: horizon strip and visibility bars; both share the scrub time.
- `VerdictStrip`, `SlipBar`, `PlanBPanel`, `Comparator`: the decision flow.
- `PoleMap`, `CalendarHeatmap`: site map and landing calendar. `CalendarHeatmap` takes `fit` to size itself to the viewport.
- Hooks: `useEvent` (stable callback), `useTween` (animated numbers), `useWidth` (element width for SVG layout).

### Pipeline (`pipeline/`)

| Script | Output |
|---|---|
| `fetch_ephem.py` | `public/data/ephem/*.json`: hourly Sun and Earth azimuth, elevation and size from JPL Horizons, with known-answer checks |
| `horizon_mask.py` | `public/data/horizon/*.json`: 360° LOLA terrain horizon at 4 mast heights (`--test` runs self-tests) |
| `hillshade.py` | `public/data/southpole.webp` and `southpole.json`: shaded relief for the site map |
| `crosscheck_p69.py` | `public/data/crosscheck.json`: NASA PGDA Product 69 long-term averages for the Validation page |

### Tests and checks

`npm test` runs the engine tests in `src/engine/engine.test.ts`: known answers (Apollo 11 always sees Earth, a far-side point never does, a terrain wall gives 0% sunlight), window splitting, mast interpolation, Plan B ranking, the calendar, map projection (checked against pyproj), the bottleneck hint and share links. `npm run build` type-checks with `tsc` before bundling.

---

## NASA and partner data

| Source | What it does in the app |
|---|---|
| NASA JPL Horizons API | Sun and Earth direction, height and size at every site; live lookups for custom points and the spot check |
| NASA LRO LOLA South Pole DEMs, PGDA Product 90 (`LDEM_80S_20MPP_ADJ.TIF`, `LDEM_75S_30MPP_ADJ.TIF`, `LDEM_60S_60MPP_ADJ.TIF`) | Real terrain horizons at nine sites; shaded relief on the site map |
| NASA LOLA polar illumination maps, PGDA Product 69 (Mazarico et al. 2011) | Independent cross-check of sunlight and Earth visibility at each site |
| LROC QuickMap | A link from every site to the same spot in NASA's map viewer |
| NASA Artemis III candidate regions (2024 update) | Six curated polar sites |
| LROC featured images for IM-1 Odysseus and IM-2 Athena (NASA CLPS) | Coordinates of the two commercial landers |
| ISRO Chandrayaan-3 landing site, coordinates from LROC | Curated partner-agency site |
| NASA NSSDCA Apollo landing site coordinates | Apollo 11 reference site |

## Software

React, TypeScript, Vite, Tailwind CSS and Vitest for the app. Python with rasterio, pyproj, NumPy and Pillow for the data pipeline. No map library and no chart library: the map, ribbon, timeline and calendar are plain SVG.

## Use of AI

AI tools were used to build MoonSlip. Every AI-produced part was reviewed and tested by the team, and the science was checked against NASA data (see **Validation & NASA Data** in the app).

| Tool | Used for |
|---|---|
| Claude Code (Anthropic) | Drafting the TypeScript app (engine, components, layout), the Python data pipeline, the tests and this README; later UI work: resizable side panel, section tabs, full-screen sections, Explain column and the responsive layout for phones and tablets |
| Antigravity (Google) | Research and documentation |
| Gemini (Google) | Research and documentation |

What AI did **not** do:

- **No AI-generated data.** Sun and Earth positions come from NASA JPL Horizons; terrain from NASA LOLA; the cross-check from NASA PGDA Product 69.
- **No AI-generated images.** Every picture in the app is drawn from NASA data or plain SVG.
- **No AI at run time.** The app makes no calls to any AI service.

*Team: add each member's AI-tool use from the AI-use log before submitting.*
