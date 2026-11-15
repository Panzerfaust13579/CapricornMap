"""Sample NASA's long-term illumination maps (PGDA Product 69) at every curated polar site.

Usage: python pipeline/crosscheck_p69.py
Writes public/data/crosscheck.json. The Validation page compares these values with the app's own.

The maps are Mazarico et al. (2011), 201608 release: the share of the Sun's disc in view, and
whether any part of Earth is in view, averaged hourly over 18.6 years on LOLA topography.
int16, scale 4e-05, so 25000 means 100%. Each file is 20 to 85 MB; set MOONSLIP_P69_DIR to a
folder that already holds them to skip the download.
"""
import json
import os
import urllib.request
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer

ROOT = Path(__file__).resolve().parent.parent
SITES = ROOT / "public/data/sites.json"
HORIZON = ROOT / "public/data/horizon"
OUT = ROOT / "public/data/crosscheck.json"
BASE = "https://pgda.gsfc.nasa.gov/data/MoonIllumination/"
CACHE = Path(os.environ.get("MOONSLIP_P69_DIR") or ROOT / "pipeline/raw/p69")
# (northern limit of the map in degrees, file stem, pixel size in metres); finest map first
MAPS = [(-85.0, "AVGVISIB_85S_060M_201608", 60), (-75.0, "AVGVISIB_75S_120M_201608", 120), (-65.0, "AVGVISIB_65S_240M_201608", 240)]


def local(stem: str) -> Path:
    p = CACHE / (stem + ".TIF")
    if not p.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        print("downloading", stem, flush=True)
        urllib.request.urlretrieve(BASE + stem + ".TIF", p)
    return p


NEAR_M = 500  # how far around the point to look for the best-lit pixel


def sample(stem: str, lat: float, lon_e: float, pixel_m: int):
    """Percent at the pixel under (lat, lon_e); the range over it and its 8 neighbours; the highest within NEAR_M."""
    with rasterio.open(local(stem)) as ds:
        x, y = Transformer.from_crs(ds.crs.geodetic_crs, ds.crs, always_xy=True).transform(lon_e, lat)
        r, c = ds.index(x, y)
        n = int(np.ceil(NEAR_M / pixel_m))
        w = ds.read(1, window=((r - n, r + n + 1), (c - n, c + n + 1))).astype(float)
        if (w == ds.nodata).any():
            raise SystemExit(f"{stem}: nodata at {lat}, {lon_e}")
        pct = w * ds.scales[0] * 100
        rr, cc = np.mgrid[-n:n + 1, -n:n + 1]
        near = pct[np.hypot(rr, cc) * pixel_m <= NEAR_M]
        box = pct[n - 1:n + 2, n - 1:n + 2]
        return round(float(pct[n, n]), 1), [round(float(box.min()), 1), round(float(box.max()), 1)], round(float(near.max()), 1)


if __name__ == "__main__":
    rows = []
    for s in json.loads(SITES.read_text()):
        pick = next(((stem, px) for limit, stem, px in MAPS if s["lat"] <= limit), None)
        if not pick:
            continue  # north of 65 S: outside every map
        stem, px = pick
        lat, lon = s["lat"], s["lonE"]
        hz = HORIZON / f"{s['id']}.json"
        if hz.exists():  # compare at the point the terrain mask was computed from
            h = json.loads(hz.read_text())
            lat, lon = h.get("observerLat", lat), h.get("observerLonE", lon)
        sun, sun_range, sun_best = sample(stem, lat, lon, px)
        earth, earth_range, earth_best = sample(stem + "_EARTH", lat, lon, px)
        rows.append({"id": s["id"], "map": stem, "pixelM": px, "lat": lat, "lonE": lon,
                     "sunPct": sun, "sunPctRange": sun_range, "sunPctBest": sun_best,
                     "earthPct": earth, "earthPctRange": earth_range, "earthPctBest": earth_best})
        print(f"{s['id']:18s} {stem}  Sun {sun:5.1f}% {sun_range} best {sun_best:5.1f}   Earth {earth:5.1f}% {earth_range} best {earth_best:5.1f}")
    OUT.write_text(json.dumps({
        "product": "PGDA Product 69, Lunar Polar Illumination (Mazarico et al. 2011), 201608 release",
        "url": "https://pgda.gsfc.nasa.gov/products/69",
        "averagedOverYears": 18.6,
        "bestWithinM": NEAR_M,
        "sites": rows,
    }, indent=1) + "\n")
