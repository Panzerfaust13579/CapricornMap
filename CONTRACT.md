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

From the LOLA DEM (`pipeline/horizon_mask.py`).

```json
{ "id": "mons-mouton", "mastM": 2, "elevDeg": [/* 360 values */],
  "dem": "LDEM_80S_20MPP_ADJ.TIF", "rangeKm": 150,
  "siteHeightM": 5316, "observerLat": -84.2638, "observerLonE": 29.8506, "snapKm": 1, "farPixelM": 160 }
```

`elevDeg[k]` is the horizon elevation at azimuth `k` degrees, clockwise from north.

A site's altitude moves the Sun and Earth by less than 0.001°, so the ephemeris ignores it. Altitude matters only inside the mask.
