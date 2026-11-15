# Data contract

Every seat codes against these three file shapes. Change them only with the whole team.

## `public/data/sites.json`

```json
[{ "id": "mons-mouton", "name": "Mons Mouton Plateau", "lat": -84.232, "lonE": 29.926,
   "group": "Artemis", "terrain": "lola", "source": "https://..." }]
```

- `lonE`: east longitude, 0 to 360.
- `group`: `Artemis`, `CLPS`, `ISRO` or `Apollo`. The app adds `Custom`.
- `terrain`: `lola` when `horizon/<id>.json` exists, otherwise `sphere`.

## `public/data/ephem/<id>.json`

Hourly, UTC, airless, from JPL Horizons (`pipeline/fetch_ephem.py`).

```json
{ "id": "mons-mouton", "t0": "2027-01-01T00:00:00Z", "stepMin": 60, "n": 17545,
  "sunAz": [], "sunEl": [], "earthAz": [], "earthEl": [],
  "sunDiamDeg": 0.53, "earthDiamDeg": 1.9 }
```

Sample `i` is at `t0 + i * stepMin`. Angles are in degrees, rounded to 0.01. Azimuth runs clockwise from north.

## `public/data/horizon/<id>.json`

From the LOLA DEMs (`pipeline/horizon_mask.py`).

```json
{ "id": "mons-mouton", "mastM": 2, "elevDeg": [/* 360 values */],
  "elevDegByMast": { "2": [/* 360 */], "5": [/* 360 */], "10": [/* 360 */], "20": [/* 360 */] },
  "dem": "LDEM_80S_20MPP_ADJ.TIF", "rangeKm": 150,
  "siteHeightM": 5316, "observerLat": -84.2638, "observerLonE": 29.8506, "snapKm": 1,
  "nearPixelM": 20, "farPixelM": 160, "minDistM": 100 }
```

- `elevDeg[k]` is the horizon elevation at azimuth `k` degrees, clockwise from north, for a 2 m mast.
- `elevDegByMast` holds the same mask for other mast heights (metres). `elevDeg` equals its `"2"` entry.
  The app interpolates between heights and uses the nearest one outside them. Optional: older files have only `elevDeg`.

A site's altitude moves the Sun and Earth by less than 0.001°, so the ephemeris ignores it. Altitude matters only inside the mask.

## `public/data/crosscheck.json`

NASA's long-term averages at each polar site, sampled from PGDA Product 69 (`pipeline/crosscheck_p69.py`).

```json
{ "product": "PGDA Product 69 ...", "url": "https://pgda.gsfc.nasa.gov/products/69", "averagedOverYears": 18.6,
  "sites": [{ "id": "mons-mouton", "map": "AVGVISIB_75S_120M_201608", "pixelM": 120, "lat": -84.2638, "lonE": 29.8506,
              "sunPct": 49.3, "sunPctRange": [44.9, 53.7], "earthPct": 100.0, "earthPctRange": [100.0, 100.0] }] }
```

- `sunPct`: share of the Sun's disc in view, averaged over time, at the pixel under the site's observer point.
- `earthPct`: share of time any part of Earth is in view.
- `...Range`: lowest and highest value among that pixel and its 8 neighbours.

## `public/data/southpole.webp` and `southpole.json`

Shaded relief of 80° S to the pole for the site map (`pipeline/hillshade.py`).

```json
{ "image": "southpole.webp", "halfWidthM": 304000, "dem": "LDEM_80S_20MPP_ADJ.TIF", "pixelM": 640,
  "sites": [{ "id": "mons-mouton", "x": 87330.5, "y": 151712.9 }] }
```

The image is a square in south polar stereographic metres, `-halfWidthM` to `+halfWidthM` on both axes, longitude 0 pointing up.
`sites` are map positions from pyproj. The app's own projection (`src/engine/geo.ts`) is tested against them.
