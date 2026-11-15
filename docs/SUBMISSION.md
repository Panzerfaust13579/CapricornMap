# Submission text (draft)

Draft text for the NASA Space Apps submission form, written to match the live build feature by feature.
Everything here can be checked on the live link. Fields marked **TEAM** need the team's own input.

## Project name

MoonSlip

## High-level summary

When a lunar mission slips, MoonSlip tells a planner in seconds whether a South Pole landing site still has the sunlight and Earth contact the lander needs, and which date or site rescues the plan. It shows the Sun and Earth against the real lunar horizon from NASA laser altimetry, gives a GO or NO-GO verdict against the planner's own thresholds, and ranks the rescue options with what each one gains and loses. Planners get numbers. Classrooms get Explain mode. Every result is checked on screen against NASA data.

## Detailed description

**The problem.** At the Moon's South Pole the Sun never climbs more than a few degrees above the horizon, and Earth hangs low and rocks with the Moon's libration. One ridge can take away power or radio contact for days. A launch delay of two weeks can turn a good site into a dead one.

**What MoonSlip does, on one screen:**

- **Site picker.** Ten curated sites: six NASA Artemis III candidate regions, the two NASA CLPS landers IM-1 Odysseus and IM-2 Athena, ISRO's Chandrayaan-3, and Apollo 11 as a reference. Pick from a list or from pins on a shaded-relief map of the South Pole built from LOLA data. Any custom latitude and longitude is looked up live from NASA JPL Horizons.
- **Sky Ribbon.** The whole 360° horizon unrolled, with the terrain silhouette, the Sun and Earth drawn to scale, and their paths. Play one lunar day or scrub through it.
- **Window timeline.** Two bars under the ribbon show when the Sun and Earth are in view, with the mission window marked.
- **Verdict.** GO or NO-GO against four needs the planner sets: minimum sunlight, longest night, minimum Earth visibility, longest communication gap. Failed needs are written out. Countdowns show the time to the next sunset and Earthset.
- **Metrics.** Sunlit share, longest night, Earth-visible hours, longest comms gap, Sun and Earth elevation, and mean power for a horizontal panel and for a vertical panel turned to the Sun.
- **Launch-slip stepper and Plan B Finder.** Move the landing date from 7 days early to 28 days late. MoonSlip ranks the rescues: the same site on other dates, and every other site on the new date. Each option says in one sentence what it gains and loses. The verdict strip names the best one and can apply it.
- **Comparator.** Two plans side by side with a difference column.
- **Landing calendar.** Every landing date in 2027–2028 for the chosen site, coloured by sunlight, Earth visibility or verdict.
- **Mast height.** Terrain horizons are computed for masts of 2 to 20 m, so the planner can see what a taller mast buys.
- **Explain mode.** Plain-language captions under every panel and an Earth-versus-Moon card.
- **Shareable links.** The address bar holds the whole scenario.
- **Relay fallback card.** A concept, labelled "Concept" on screen. No relay satellite is modelled.

**A worked example, from the live build.** Mons Mouton Plateau, landing 12 March 2027, 14-day mission: **GO**, 86% sunlight, longest night 45 hours, Earth in view 100% of the time. Slip the launch 14 days: **NO-GO**, 17% sunlight, longest night 280 hours. No other curated site and no date within 28 days of the original meets every need. MoonSlip names the next good date at the site: 10 April 2027, 29 days after the original, with 82% sunlight.

**How it works.** A Python pipeline runs once. It asks NASA JPL Horizons for the Sun's and Earth's direction and height at each site, hourly for 2027–2028, with no atmosphere. It computes a 360° terrain horizon at each site from NASA's LOLA elevation maps, with the Moon's curvature in the geometry. The results are small static files. The browser then does every comparison at once, with no server: visibility of each disc's upper edge against the horizon, windows, countdowns, metrics, verdict and ranking are pure, tested functions.

**How we know it is right.** The Validation page runs, in the judge's own browser:

- Known-answer tests: Apollo 11 always sees Earth; a far-side point never does; a wall on every side gives 0% sunlight.
- A live spot check against JPL Horizons. Stored positions match fresh ones to 0.005°.
- A cross-check against NASA's own long-term illumination maps (PGDA Product 69), an independent calculation. At the nine sites with terrain, Earth visibility agrees within 4.3 percentage points. Sunlight agrees within 4.5 points at seven. The other two sit on narrow ridge crests, where NASA's own map changes by 20 to 40 points within 500 m; the page shows this.
- The same table shows what the app would say without terrain. At IM-2 Athena, a smooth Moon gives Earth in view 81% of the time. With LOLA terrain it is 93%. NASA's map says 93%.

**Limits, stated on the page.** Apollo 11 and custom points use a smooth horizon and are marked "terrain not applied". Artemis entries are regions; we use the high point within 1 km of the listed centre. Power is a geometric estimate with no battery model and no link budget. Data covers 2027–2028 at hourly steps.

## NASA data

| Dataset | What it does in MoonSlip |
|---|---|
| NASA JPL Horizons API (targets 10 and 399, observer on the Moon, airless) | Sun and Earth azimuth, elevation and angular size at every site, hourly for 2027–2028. Live look-ups for custom coordinates. Live spot check on the Validation page. |
| NASA LRO LOLA South Pole elevation maps, PGDA Product 90 (`LDEM_80S_20MPP_ADJ`, `LDEM_75S_30MPP_ADJ`, `LDEM_60S_60MPP_ADJ`) | 360° terrain horizons at nine sites, for four mast heights. Shaded relief for the site map. |
| NASA LOLA polar illumination maps, PGDA Product 69 (Mazarico et al. 2011) | Independent cross-check of long-term sunlight and Earth visibility at each site. |
| LROC QuickMap | Deep link from every site to the same spot in the map viewer. |
| NASA Artemis III candidate landing regions (2024 update) | Six curated sites. |
| LROC featured images of IM-1 Odysseus and IM-2 Athena (NASA CLPS) | Coordinates of two curated sites. |
| NASA NSSDCA Apollo landing site coordinates | Apollo 11 reference site. |

## Space agency partner and other data

- **ISRO**: Chandrayaan-3 landing site (Shiv Shakti point), coordinates as published by LROC. It is one of the ten curated sites and has its own terrain horizon.
- **Software**: React, TypeScript, Vite, Tailwind CSS, Vitest; Python with rasterio, pyproj, NumPy and Pillow.

## References

- JPL Horizons System and API: https://ssd.jpl.nasa.gov/horizons/
- PGDA Product 90, A New View of the Lunar South Pole from LOLA: https://pgda.gsfc.nasa.gov/products/90
- PGDA Product 69, Lunar Polar Illumination: https://pgda.gsfc.nasa.gov/products/69
- Mazarico, E., et al. (2011). Illumination conditions of the lunar polar regions using LOLA topography. Icarus 211, 1066–1081.
- LROC QuickMap: https://quickmap.lroc.im-ldi.com/
- NASA, update on Artemis III Moon landing regions: https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/
- LROC, IM-2 Athena Seen Obliquely: https://lroc.im-ldi.com/images/1408
- LROC, IM-1 Odysseus landing site: https://lroc.im-ldi.com/images/1360
- LROC, Chandrayaan-3 Landing Site: https://lroc.im-ldi.com/images/1314
- NSSDCA, Apollo landing site coordinates: https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html

## Use of AI

The code, data pipeline and documentation were drafted with Claude Code (Anthropic), working from the team's execution plan, and reviewed and tested by the team. No AI-generated images are used; every picture in the app is drawn from NASA data. **TEAM: add each member's tool use from the AI-use log.**

## The 2-minute pitch (7 slides)

Every number below comes from the live build. Re-check them on the live link before recording.

| Slide | Time | Spoken |
|---|---|---|
| 1. Title and hook | 0:00–0:15 | "Your launch just slipped fourteen days. Is your landing site still alive? At the Moon's south pole the Sun stays a few degrees above the horizon, so one ridge can take away power and Earth contact for days." |
| 2. The product | 0:15–0:35 | "MoonSlip answers that in seconds. Pick a site and a date. See the Sun and Earth against the real horizon, a Go or No-Go verdict, and countdowns to sunset and Earthset." |
| 3. NASA data | 0:35–0:55 | "Positions come from JPL Horizons, with no atmosphere. The horizon comes from LOLA laser altimetry, at nine of our ten sites. We precompute both, so every comparison is instant." |
| 4. Plan B Finder | 0:55–1:20 | "Now the slip. Mons Mouton, landing March twelfth, is Go with eighty-six percent sunlight. Fourteen days late it is No-Go: seventeen percent sunlight and a night of two hundred and eighty hours. MoonSlip ranks the rescues, a new date or another site, each with what you gain and lose. Here nothing close works, so it names the next good date: April tenth." |
| 5. Validation | 1:20–1:40 | "We checked it. Apollo 11 always sees Earth. A far-side point never does. Our positions match fresh Horizons queries. And against NASA's own illumination maps, our Earth visibility agrees within about four points at all nine sites." |
| 6. Who it is for | 1:40–1:52 | "Planners get numbers. Classrooms get Explain mode." **TEAM: add one tester quote.** |
| 7. Close | 1:52–2:00 | "Open data, open code, live now." |

Slide 4's QR code can open the slipped plan directly: add `?slip=14` to the live URL.

## Still to do by the team

- Team name, member names and the AI-use log.
- Three user tests and one quote, with permission.
- The 7-slide deck and the 30-second video.
- Screenshots of QuickMap's own shadows for one or two sites, for the evidence folder. Each site in the app links to the right spot.
- Open every link in a private window before submitting.
