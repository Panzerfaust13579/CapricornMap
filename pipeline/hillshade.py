"""Shaded-relief picture of the lunar South Pole (80 S to the pole) for the site map.

Usage: python pipeline/hillshade.py
Reads the 640 m overview of the LOLA south polar DEM (PGDA Product 90); set MOONSLIP_DEM_DIR to a folder holding a local copy
if the server cuts the read short. Writes public/data/southpole.webp and public/data/southpole.json.
The JSON also lists each site's map position from pyproj, which the app's own projection is tested against.
"""
import json
import os
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from pyproj import Transformer

ROOT = Path(__file__).resolve().parent.parent
SITES = ROOT / "public/data/sites.json"
OUT = ROOT / "public/data"
DEM = "LDEM_80S_20MPP_ADJ.TIF"
LOCAL = os.environ.get("MOONSLIP_DEM_DIR")
URL = str(Path(LOCAL) / DEM) if LOCAL else "/vsicurl/https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/" + DEM
SIZE = 950  # the DEM's 1/32 overview: 640 m per pixel
EXAGGERATE = 2.5  # vertical stretch, so the relief reads at this scale
SUN_ALT = np.radians(35)  # light from the upper left, the convention for shaded relief


def shade(z: np.ndarray, pixel_m: float) -> np.ndarray:
    """Brightness 0..1 of each cell under a light from the upper left."""
    dz_down, dz_right = np.gradient(z, pixel_m)
    nx, ny, nz = -EXAGGERATE * dz_right, EXAGGERATE * dz_down, np.ones_like(z)  # surface normal; y points up the image
    light = np.array([-np.cos(SUN_ALT) / np.sqrt(2), np.cos(SUN_ALT) / np.sqrt(2), np.sin(SUN_ALT)])
    return np.clip((nx * light[0] + ny * light[1] + nz * light[2]) / np.sqrt(nx * nx + ny * ny + nz * nz), 0, 1)


if __name__ == "__main__":
    with rasterio.open(URL) as ds:
        z = ds.read(1, out_shape=(SIZE, SIZE)).astype(float)
        half = ds.bounds.right
        pixel_m = 2 * half / SIZE
        to_xy = Transformer.from_crs(ds.crs.geodetic_crs, ds.crs, always_xy=True)
    hole = ~np.isfinite(z)
    z[hole] = np.nanmean(z)
    # Mostly shading, with a little height tint so plateaus and basins differ; kept dark to sit under bright pins.
    tint = (z - np.nanpercentile(z, 2)) / (np.nanpercentile(z, 98) - np.nanpercentile(z, 2))
    grey = np.clip(0.82 * shade(z, pixel_m) + 0.18 * np.clip(tint, 0, 1), 0, 1) ** 1.15
    rgba = np.dstack([np.round(grey * 200 + 12).astype(np.uint8)] * 3 + [np.where(hole, 0, 255).astype(np.uint8)])
    Image.fromarray(rgba, "RGBA").save(OUT / "southpole.webp", quality=78, method=6)
    sites = []
    for s in json.loads(SITES.read_text()):
        x, y = to_xy.transform(s["lonE"], s["lat"])
        sites.append({"id": s["id"], "x": round(x, 1), "y": round(y, 1)})
    (OUT / "southpole.json").write_text(json.dumps(
        {"image": "southpole.webp", "halfWidthM": half, "dem": DEM, "pixelM": round(pixel_m), "sites": sites}, indent=1) + "\n")
    print("wrote southpole.webp", (OUT / "southpole.webp").stat().st_size, "bytes; half width", half, "m;", round(pixel_m), "m per pixel")
