"""Terrain horizon masks from NASA's LOLA south polar elevation maps (PGDA Product 90).

Usage: python pipeline/horizon_mask.py [site-id ...]   (default: every site south of 65.5 S)
       python pipeline/horizon_mask.py --test
Each site uses the finest map that still reaches 150 km north of it:
  south of 85 S or so  LDEM_80S_20MPP_ADJ.TIF, 20 m pixels (also used down to 80.5 S, clipped at the map edge)
  80.5 S to 75.5 S     LDEM_75S_30MPP_ADJ.TIF, 30 m pixels
  75.5 S to 65.5 S     LDEM_60S_60MPP_ADJ.TIF, 60 m pixels
Fetches only the tiles a site needs from the PGDA server (cloud-optimised GeoTIFFs), about 30 to 80 MB per site,
into pipeline/raw/dem/. To work from full local copies instead, set MOONSLIP_DEM_DIR to their folder.
Writes public/data/horizon/<id>.json and sets that site's terrain to "lola" in sites.json.
"""
import http.client
import json
import os
import sys
import time
import urllib.error
import urllib.request
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
URL_BASE = "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/"
CACHE = ROOT / "pipeline/raw/dem"  # git-ignored
HEADER_BYTES = 4 << 20  # these files are cloud-optimised: the tile index sits at the start
R = 1737400.0
NEAR_KM, FAR_PIXEL_M = 20, 160  # full resolution out to 20 km, then the overview with pixels of at most 160 m
MIN_PIXELS = 5  # shortcut: ignores terrain closer than 5 pixels (100 m on the 20 m map), where the DEM is mostly noise
MASTS_M = (2, 5, 10, 20)  # one mask per mast height; the app interpolates between them


def dem_for(lat):
    """(file, pixel size) of the map used for a site at this latitude, or None north of every map."""
    return next(((name, px) for limit, name, px in DEMS if lat <= limit), None)


class Mirror:
    """A local sparse copy of one remote map: its header, plus each tile fetched the first time a site needs it.

    The PGDA server refuses bursts of small requests, and GDAL then hands back empty tiles without an error.
    So the tiles are fetched here, one request at a time with back-off, and GDAL only ever reads the local copy.
    """

    def __init__(self, name):
        self.url, self.path, self.log = URL_BASE + name, CACHE / name, CACHE / (name + ".tiles.json")
        self.have = set(json.loads(self.log.read_text())) if self.log.exists() else set()
        if not self.path.exists():
            CACHE.mkdir(parents=True, exist_ok=True)
            size = int(urllib.request.urlopen(urllib.request.Request(self.url, method="HEAD"), timeout=60).headers["Content-Length"])
            with open(self.path, "wb") as f:
                f.truncate(size)  # sparse: takes no disk space until tiles are written
            self.write(0, self.fetch(0, min(size, HEADER_BYTES) - 1))

    def fetch(self, start, end, tries=8):
        for k in range(tries):
            try:
                req = urllib.request.Request(self.url, headers={"Range": f"bytes={start}-{end}"})
                with urllib.request.urlopen(req, timeout=180) as r:
                    data = r.read()
                if len(data) == end - start + 1:
                    return data
            except (urllib.error.URLError, http.client.HTTPException, OSError) as e:
                print(f"  fetch failed ({str(e)[:60]}), retry {k + 1}", flush=True)
            time.sleep(2 * (k + 1))
        raise SystemExit(f"Could not fetch bytes {start}-{end} of {self.url}. Download the file and set MOONSLIP_DEM_DIR.")

    def write(self, offset, data):
        with open(self.path, "r+b") as f:
            f.seek(offset)
            f.write(data)

    def ensure(self, level, cx, cy, half_m):
        """Fetch every tile of this overview level (None: full resolution) that the window around (cx, cy) touches."""
        with rasterio.open(self.path, **({} if level is None else {"overview_level": level})) as ds:
            win = window(ds, cx, cy, half_m)
            bh, bw = ds.block_shapes[0]
            need = []
            for by in range(int(win.row_off) // bh, (int(win.row_off + win.height) - 1) // bh + 1):
                for bx in range(int(win.col_off) // bw, (int(win.col_off + win.width) - 1) // bw + 1):
                    off, size = (ds.get_tag_item(f"BLOCK_{k}_{bx}_{by}", "TIFF", bidx=1) for k in ("OFFSET", "SIZE"))
                    if off is None or size is None:
                        raise SystemExit(f"{self.path.name}: tile index is not in the first {HEADER_BYTES} bytes. Download the file and set MOONSLIP_DEM_DIR.")
                    if int(size) and f"{off}+{size}" not in self.have:
                        need.append((int(off), int(size)))
        need.sort()
        runs = []  # neighbouring tiles in one request
        for off, size in need:
            if runs and off - (runs[-1][0] + runs[-1][1]) < 65536 and runs[-1][1] < 8_000_000:
                runs[-1] = (runs[-1][0], off + size - runs[-1][0], runs[-1][2] + [(off, size)])
            else:
                runs.append((off, size, [(off, size)]))
        for n, (off, size, tiles) in enumerate(runs):
            print(f"  fetching tiles {n + 1}/{len(runs)} ({size / 1e6:.1f} MB)", flush=True)
            self.write(off, self.fetch(off, off + size - 1))
            self.have.update(f"{o}+{z}" for o, z in tiles)
            self.log.write_text(json.dumps(sorted(self.have)))
            time.sleep(0.5)


def cart(lat, lon, h):
    la, lo = np.radians(lat), np.radians(lon)
    r = R + h
    return np.stack([r * np.cos(la) * np.cos(lo), r * np.cos(la) * np.sin(lo), r * np.sin(la)], -1)


def mask_from_points(lat, lon, h, site_lat, site_lon, site_h, mast_m, min_dist_m=100.0, pixel_m=0.0):
    """360 horizon elevations (deg) seen from mast_m above (site_lat, site_lon, site_h). Curvature is in the geometry.

    Each point raises the bin its azimuth rounds to. With pixel_m set, a pixel close enough to span more than
    one degree also raises every whole-degree direction that passes through it, so near terrain leaves no gaps.
    Bins no point reaches are -inf; combine masks with np.maximum and finish with fill().
    """
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
    centre = np.rint(az)
    m = np.full(360, -np.inf)
    np.maximum.at(m, centre.astype(int) % 360, el)
    if pixel_m:
        half = np.degrees(np.arctan2(pixel_m / 2, d[keep]))  # half the angle the pixel spans
        wide = half > 0.5
        az, el, centre, half = az[wide], el[wide], centre[wide], half[wide]
        for off in range(1, int(np.ceil(half.max())) + 1 if wide.any() else 0):
            for o in (off, -off):
                hit = np.abs(centre + o - az) <= half
                np.maximum.at(m, (centre[hit] + o).astype(int) % 360, el[hit])
    return m


def fill(m):
    """Fill bins no point reached by circular interpolation, and round to 0.01 degrees."""
    ok = np.isfinite(m)
    if not ok.all():
        k = np.arange(360)
        m = np.interp(k, k[ok], m[ok], period=360)
    return np.round(m, 2)


def window(ds, cx, cy, half_m):
    b = ds.bounds
    win = from_bounds(max(b.left, cx - half_m), max(b.bottom, cy - half_m), min(b.right, cx + half_m), min(b.top, cy + half_m), ds.transform)
    return win.round_offsets().round_lengths()


def read(ds, cx, cy, half_m):
    """x, y, height of every valid pixel within half_m of (cx, cy)."""
    win = window(ds, cx, cy, half_m)
    z = ds.read(1, window=win)
    cols, rows = np.meshgrid(np.arange(int(win.width)) + 0.5, np.arange(int(win.height)) + 0.5)
    x, y = ds.window_transform(win) * (cols, rows)
    good = np.isfinite(z)
    return x[good], y[good], z[good].astype(float)


def horizon_mask(lat, lon_e, dem, pixel_m, masts=MASTS_M, range_km=150, snap_km=0.0):
    """Masks for every mast height in masts, from one read of the DEM. Returns ({mast: mask}, site_h, lat, lon_e, far pixel m)."""
    mirror = None if LOCAL else Mirror(dem)
    path = str(Path(LOCAL) / dem) if LOCAL else str(mirror.path)
    with rasterio.open(path) as ds:
        print("CRS:", ds.crs.to_string()[:80], "| units: m above 1737.4 km sphere | nodata:", ds.nodata)
        to_xy = Transformer.from_crs(ds.crs.geodetic_crs, ds.crs, always_xy=True)
        to_ll = Transformer.from_crs(ds.crs, ds.crs.geodetic_crs, always_xy=True)
        cx, cy = to_xy.transform(lon_e, lat)
        # far field: the file's own overview nearest to FAR_PIXEL_M, never coarser
        factors = ds.overviews(1)
        level = max(k for k, f in enumerate(factors) if f * pixel_m <= FAR_PIXEL_M)
    if mirror:
        mirror.ensure(None, cx, cy, NEAR_KM * 1000)
        mirror.ensure(level, cx, cy, range_km * 1000)
    with rasterio.open(path) as ds:
        near = read(ds, cx, cy, NEAR_KM * 1000)
    with rasterio.open(path, overview_level=level) as ov:
        far = read(ov, cx, cy, range_km * 1000)
    if not len(near[2]) or np.hypot(near[0] - cx, near[1] - cy).min() > 2 * pixel_m:
        raise SystemExit("The map has no data at the site itself.")
    nx, ny, nz = near
    if snap_km:  # region, not a point: stand on its local high point, where a planner would put the lander
        k = np.where(np.hypot(nx - cx, ny - cy) <= snap_km * 1000, nz, -np.inf).argmax()
        cx, cy = nx[k], ny[k]
        lon_e, lat = to_ll.transform(cx, cy)
    site_h = float(nz[np.argmin(np.hypot(nx - cx, ny - cy))])
    # Coarse pixels only where the fine grid does not reach: up close, one coarse pixel spans several degrees.
    fx, fy, fz = far
    beyond = (fx < nx.min()) | (fx > nx.max()) | (fy < ny.min()) | (fy > ny.max())
    fx, fy, fz = fx[beyond], fy[beyond], fz[beyond]
    (nlo, nla), (flo, fla) = to_ll.transform(nx, ny), to_ll.transform(fx, fy)
    by_mast = {}
    for m in masts:
        fine = mask_from_points(nla, nlo, nz, lat, lon_e, site_h, float(m), MIN_PIXELS * pixel_m, pixel_m)
        coarse = mask_from_points(fla, flo, fz, lat, lon_e, site_h, float(m))
        by_mast[m] = fill(np.maximum(fine, coarse))
    return by_mast, site_h, lat, lon_e, pixel_m * factors[level]


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
    m = fill(mask_from_points(np.degrees(p2).ravel(), np.degrees(l2).ravel(), np.zeros(D.size), lat0, lon0, 0.0, 2.0))
    ok = np.allclose(m, -0.09, atol=0.01)
    print("PASS" if ok else "FAIL", "flat sphere, 2 m mast:", m.min(), m.max())
    # A taller mast sees further over the curve: 20 m gives -acos(R / (R + 20)) = -0.27 deg.
    m20 = fill(mask_from_points(np.degrees(p2).ravel(), np.degrees(l2).ravel(), np.zeros(D.size), lat0, lon0, 0.0, 20.0))
    ok20 = np.allclose(m20, -0.27, atol=0.01)
    print("PASS" if ok20 else "FAIL", "flat sphere, 20 m mast:", m20.min(), m20.max())
    # One 20 m pixel standing 100 m high, 200 m due east: it spans 5.7 deg, so it must block 88..92 deg and nothing else.
    wall = mask_from_points(np.array([lat0]), np.array([lon0 + np.degrees(200 / R / np.cos(np.radians(lat0)))]), np.array([100.0]),
                            lat0, lon0, 0.0, 2.0, 100.0, 20.0)
    hit = np.flatnonzero(np.isfinite(wall))
    ok_wall = hit.min() == 88 and hit.max() == 92 and abs(wall[90] - 26.1) < 0.1
    print("PASS" if ok_wall else "FAIL", "a near pixel fills every direction it spans:", hit.min(), "to", hit.max(), "deg, elevation", round(float(wall[90]), 1))
    return ok and ok20 and ok_wall


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
        by_mast, site_h, la, lo, far_px = horizon_mask(s["lat"], s["lonE"], dem, pixel_m, snap_km=snap)
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
