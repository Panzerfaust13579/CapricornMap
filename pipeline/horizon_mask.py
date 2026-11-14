"""Terrain horizon masks from NASA's LOLA south polar elevation maps (PGDA Product 90).

Usage: python pipeline/horizon_mask.py [site-id ...]   (default: every site south of 65.5 S)
       python pipeline/horizon_mask.py --test
Each site uses the finest map that still reaches 150 km north of it:
  south of 85 S or so  LDEM_80S_20MPP_ADJ.TIF, 20 m pixels (also used down to 80.5 S, clipped at the map edge)
  80.5 S to 75.5 S     LDEM_75S_30MPP_ADJ.TIF, 30 m pixels
  75.5 S to 65.5 S     LDEM_60S_60MPP_ADJ.TIF, 60 m pixels
Reads only the windows it needs, straight from the PGDA server (tiled GeoTIFFs with overviews).
If the server cuts those reads short, download the files once and set MOONSLIP_DEM_DIR to their folder.
Writes public/data/horizon/<id>.json and sets that site's terrain to "lola" in sites.json.
"""
import json
import os
import sys
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.windows import from_bounds

ROOT = Path(__file__).resolve().parent.parent
SITES = ROOT / "public/data/sites.json"
OUT = ROOT / "public/data/horizon"
# (northern limit for sites in degrees, file, pixel size in metres); first match wins
DEMS = [(-80.5, "LDEM_80S_20MPP_ADJ.TIF", 20), (-75.5, "LDEM_75S_30MPP_ADJ.TIF", 30), (-65.5, "LDEM_60S_60MPP_ADJ.TIF", 60)]
LOCAL = os.environ.get("MOONSLIP_DEM_DIR")
R = 1737400.0
# PGDA answers sidecar probes and merged multi-range requests badly; read plain single ranges with retries.
GDAL_HTTP = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".TIF", GDAL_HTTP_MULTIRANGE="SINGLE",
                 GDAL_HTTP_MERGE_CONSECUTIVE_RANGES="NO", GDAL_HTTP_MAX_RETRY="6", GDAL_HTTP_RETRY_DELAY="3", VSI_CACHE="TRUE")
NEAR_KM, FAR_PIXEL_M = 20, 160  # full resolution out to 20 km, then pixels of about 160 m
MIN_PIXELS = 5  # shortcut: ignores terrain closer than 5 pixels (100 m on the 20 m map), where the DEM is mostly noise
MASTS_M = (2, 5, 10, 20)  # one mask per mast height; the app interpolates between them


def dem_for(lat):
    """(file, pixel size) of the map used for a site at this latitude, or None north of every map."""
    return next(((name, px) for limit, name, px in DEMS if lat <= limit), None)


def dem_path(name):
    return str(Path(LOCAL) / name) if LOCAL else "/vsicurl/https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/" + name


def cart(lat, lon, h):
    la, lo = np.radians(lat), np.radians(lon)
    r = R + h
    return np.stack([r * np.cos(la) * np.cos(lo), r * np.cos(la) * np.sin(lo), r * np.sin(la)], -1)


def mask_from_points(lat, lon, h, site_lat, site_lon, site_h, mast_m, min_dist_m=100.0):
    """360 horizon elevations (deg) seen from mast_m above (site_lat, site_lon, site_h). Curvature is in the geometry."""
    la, lo = np.radians(site_lat), np.radians(site_lon)
    E = np.array([-np.sin(lo), np.cos(lo), 0])
    N = np.array([-np.sin(la) * np.cos(lo), -np.sin(la) * np.sin(lo), np.cos(la)])
    U = np.array([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)])
    v = cart(lat, lon, h) - cart(site_lat, site_lon, site_h + mast_m)
    e, n, u = v @ E, v @ N, v @ U
    d = np.hypot(e, n)
    keep = d > min_dist_m
    az = np.degrees(np.arctan2(e[keep], n[keep])) % 360
    el = np.degrees(np.arctan2(u[keep], d[keep]))
    m = np.full(360, -np.inf)
    np.maximum.at(m, np.rint(az).astype(int) % 360, el)
    ok = np.isfinite(m)
    if not ok.all():  # fill empty bins by circular interpolation
        k = np.arange(360)
        m = np.interp(k, k[ok], m[ok], period=360)
    return np.round(m, 2)


def read(ds, cx, cy, half_m, decim):
    b = ds.bounds
    win = from_bounds(max(b.left, cx - half_m), max(b.bottom, cy - half_m), min(b.right, cx + half_m), min(b.top, cy + half_m), ds.transform)
    win = win.round_offsets().round_lengths()
    shape = (max(1, int(win.height // decim)), max(1, int(win.width // decim)))
    z = ds.read(1, window=win, out_shape=shape)
    t = ds.window_transform(win) * rasterio.Affine.scale(win.width / shape[1], win.height / shape[0])
    cols, rows = np.meshgrid(np.arange(shape[1]) + 0.5, np.arange(shape[0]) + 0.5)
    x, y = t * (cols, rows)
    good = np.isfinite(z)
    return x[good], y[good], z[good].astype(float)


def horizon_mask(lat, lon_e, dem, pixel_m, masts=MASTS_M, range_km=150, snap_km=0.0, decim=None):
    """Masks for every mast height in masts, from one read of the DEM. Returns ({mast: mask}, site_h, lat, lon_e, far pixel m)."""
    decim = decim or max(1, round(FAR_PIXEL_M / pixel_m))
    with rasterio.Env(**GDAL_HTTP), rasterio.open(dem_path(dem)) as ds:
        print("CRS:", ds.crs.to_string()[:80], "| units: m above 1737.4 km sphere | nodata:", ds.nodata)
        to_xy = Transformer.from_crs(ds.crs.geodetic_crs, ds.crs, always_xy=True)
        to_ll = Transformer.from_crs(ds.crs, ds.crs.geodetic_crs, always_xy=True)
        cx, cy = to_xy.transform(lon_e, lat)
        near = read(ds, cx, cy, NEAR_KM * 1000, 1)
        far = read(ds, cx, cy, range_km * 1000, decim)
        nx, ny, nz = near
        if snap_km:  # region, not a point: stand on its local high point, where a planner would put the lander
            k = np.where(np.hypot(nx - cx, ny - cy) <= snap_km * 1000, nz, -np.inf).argmax()
            cx, cy = nx[k], ny[k]
            lon_e, lat = to_ll.transform(cx, cy)
    x, y, z = (np.concatenate(p) for p in zip(near, far))
    site_h = float(z[np.argmin(np.hypot(x - cx, y - cy))])
    lo, la = to_ll.transform(x, y)
    by_mast = {m: mask_from_points(la, lo, z, lat, lon_e, site_h, float(m), MIN_PIXELS * pixel_m) for m in masts}
    return by_mast, site_h, lat, lon_e, pixel_m * decim


def self_test():
    # Constant-height Moon on a dense polar grid: a 2 m mast sees about -0.09 deg everywhere.
    d = np.linspace(150, 20000, 400)
    a = np.radians(np.arange(0, 360, 0.5))
    D, A = np.meshgrid(d, a)
    lat0, lon0 = -85.0, 30.0
    # walk distance D along bearing A on the sphere
    p1, l1, s = np.radians(lat0), np.radians(lon0), D / R
    p2 = np.arcsin(np.sin(p1) * np.cos(s) + np.cos(p1) * np.sin(s) * np.cos(A))
    l2 = l1 + np.arctan2(np.sin(A) * np.sin(s) * np.cos(p1), np.cos(s) - np.sin(p1) * np.sin(p2))
    m = mask_from_points(np.degrees(p2).ravel(), np.degrees(l2).ravel(), np.zeros(D.size), lat0, lon0, 0.0, 2.0)
    ok = np.allclose(m, -0.09, atol=0.01)
    print("PASS" if ok else "FAIL", "flat sphere, 2 m mast:", m.min(), m.max())
    # A taller mast sees further over the curve: 20 m gives -acos(R / (R + 20)) = -0.27 deg.
    m20 = mask_from_points(np.degrees(p2).ravel(), np.degrees(l2).ravel(), np.zeros(D.size), lat0, lon0, 0.0, 20.0)
    ok20 = np.allclose(m20, -0.27, atol=0.01)
    print("PASS" if ok20 else "FAIL", "flat sphere, 20 m mast:", m20.min(), m20.max())
    return ok and ok20


if __name__ == "__main__":
    if "--test" in sys.argv:
        sys.exit(0 if self_test() else 1)
    OUT.mkdir(parents=True, exist_ok=True)
    sites = json.loads(SITES.read_text())
    wanted = set(sys.argv[1:])
    for s in sites:
        pick = dem_for(s["lat"])
        if (wanted and s["id"] not in wanted) or not pick:
            continue
        dem, pixel_m = pick
        print("mask", s["id"], "from", dem, flush=True)
        snap = 1.0 if s["group"] == "Artemis" else 0.0
        # PGDA sometimes truncates a tile; retry, then fall back to another overview level for the far field
        for decim in (None, None, 16, 4):
            try:
                by_mast, site_h, la, lo, far_px = horizon_mask(s["lat"], s["lonE"], dem, pixel_m, snap_km=snap, decim=decim)
                break
            except rasterio.errors.RasterioIOError as e:
                print("  read failed, retrying:", str(e)[:80])
        else:
            raise SystemExit(f"Giving up on {s['id']}")
        m = by_mast[2]
        print(f"  observer {la:.4f}, {lo % 360:.4f}E, height {site_h:.0f} m, mask {m.min():.2f}..{m.max():.2f} deg, median {np.median(m):.2f}")
        print("  mean change of the horizon per mast:", {k: round(float(np.mean(v - m)), 3) for k, v in by_mast.items()})
        (OUT / f"{s['id']}.json").write_text(json.dumps(
            {"id": s["id"], "mastM": 2, "elevDeg": m.tolist(), "elevDegByMast": {str(k): v.tolist() for k, v in by_mast.items()},
             "dem": dem, "rangeKm": 150, "siteHeightM": round(site_h), "observerLat": round(la, 5), "observerLonE": round(lo % 360, 5),
             "snapKm": snap, "nearPixelM": pixel_m, "farPixelM": far_px, "minDistM": MIN_PIXELS * pixel_m}, separators=(",", ":")))
        s["terrain"] = "lola"
        # saved per site, so a later failure keeps the masks already done
        SITES.write_text("[\n" + ",\n".join("  " + json.dumps(x) for x in sites) + "\n]\n")
