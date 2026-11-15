"""Fetch hourly Sun and Earth az/el for every curated site from JPL Horizons.

Usage: python pipeline/fetch_ephem.py [site-id ...]
Writes public/data/ephem/<id>.json (data contract in CONTRACT.md) and raw text in pipeline/raw/.
Stdlib only, so it runs anywhere Python 3 does.
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITES = ROOT / "public/data/sites.json"
OUT = ROOT / "public/data/ephem"
RAW = ROOT / "pipeline/raw"
API = "https://ssd.jpl.nasa.gov/api/horizons.api"
T0, T1 = "2027-01-01", "2029-01-01"


def query(body: str, lat: float, lon_e: float, start=T0, stop=T1, step="1 h") -> str:
    params = {
        "format": "text", "MAKE_EPHEM": "YES", "EPHEM_TYPE": "OBSERVER",
        "COMMAND": f"'{body}'", "CENTER": "'coord@301'", "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon_e},{lat},0'", "START_TIME": f"'{start}'", "STOP_TIME": f"'{stop}'",
        "STEP_SIZE": f"'{step}'", "QUANTITIES": "'4,13,20'", "APPARENT": "'AIRLESS'",
        "CSV_FORMAT": "'YES'", "ANG_FORMAT": "'DEG'",
    }
    url = API + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=300) as r:
        return r.read().decode()


def parse(text: str):
    """Return (times, az, el, angdiam_arcsec) from Horizons CSV text; columns found by header name."""
    lines = text.splitlines()
    try:
        soe = lines.index("$$SOE")
        eoe = lines.index("$$EOE")
    except ValueError:
        raise SystemExit("No $$SOE/$$EOE in Horizons response:\n" + text[:3000])
    header = [h.strip() for h in lines[soe - 2].split(",")]
    col = lambda prefix: next(i for i, h in enumerate(header) if h.startswith(prefix))
    i_t, i_az, i_el, i_d = col("Date"), col("Azi"), col("Elev"), col("Ang-diam")
    t, az, el, d = [], [], [], []
    for row in lines[soe + 1:eoe]:
        f = [x.strip() for x in row.split(",")]
        t.append(f[i_t]); az.append(round(float(f[i_az]), 2)); el.append(round(float(f[i_el]), 2)); d.append(float(f[i_d]))
    return t, az, el, d


def fetch_site(site: dict, start=T0, stop=T1) -> dict:
    out = {"id": site["id"], "t0": start + "T00:00:00Z", "stepMin": 60}
    for body, key in (("10", "sun"), ("399", "earth")):
        text = query(body, site["lat"], site["lonE"], start, stop)
        (RAW / f"{site['id']}-{key}.txt").write_text(text)
        t, az, el, d = parse(text)
        out[key + "Az"], out[key + "El"] = az, el
        out[key + "DiamDeg"] = round(sum(d) / len(d) / 3600, 3)
        time.sleep(1)
    out["n"] = len(out["sunAz"])
    assert out["n"] == len(out["earthAz"]), "Sun and Earth series differ in length"
    return out


def self_tests():
    def load(i):
        p = OUT / f"{i}.json"
        return json.loads(p.read_text()) if p.exists() else None
    a11 = load("apollo-11")
    if a11:
        print("PASS" if min(a11["earthEl"]) > 50 else "FAIL", "Apollo 11: Earth elevation stays above 50 deg", min(a11["earthEl"]))
    far = parse(query("399", 0, 180, T0, "2027-02-01", "6 h"))[2]
    print("PASS" if max(far) < 0 else "FAIL", "Far side 0N 180E: Earth always below horizon", max(far))
    sites = json.loads(SITES.read_text())
    for s in sites:
        e = load(s["id"])
        if e and s["lat"] < -85:
            print("PASS" if max(e["sunEl"]) <= 8 else "FAIL", f"{s['id']}: Sun elevation never exceeds 8 deg", max(e["sunEl"]))


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True); RAW.mkdir(parents=True, exist_ok=True)
    wanted = set(sys.argv[1:])
    for s in json.loads(SITES.read_text()):
        if wanted and s["id"] not in wanted:
            continue
        print("fetching", s["id"], flush=True)
        (OUT / f"{s['id']}.json").write_text(json.dumps(fetch_site(s), separators=(",", ":")))
    # Far-side known-answer fixture for the engine tests (one month is enough).
    (ROOT / "src/engine/far-side.json").write_text(json.dumps(fetch_site({"id": "far-side", "lat": 0, "lonE": 180}, T0, "2027-02-01"), separators=(",", ":")))
    self_tests()
