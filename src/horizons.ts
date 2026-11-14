// Live JPL Horizons lookups for custom coordinates and spot checks (via the /horizons-api proxy).
import type { Ephem } from './engine'

const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ')

async function query(body: '10' | '399', lat: number, lonE: number, startMs: number, stopMs: number, step = '1 h') {
  const p = new URLSearchParams({
    format: 'text', MAKE_EPHEM: 'YES', EPHEM_TYPE: 'OBSERVER', COMMAND: `'${body}'`, CENTER: "'coord@301'",
    COORD_TYPE: "'GEODETIC'", SITE_COORD: `'${lonE},${lat},0'`, START_TIME: `'${fmt(startMs)}'`, STOP_TIME: `'${fmt(stopMs)}'`,
    STEP_SIZE: `'${step}'`, QUANTITIES: "'4,13,20'", APPARENT: "'AIRLESS'", CSV_FORMAT: "'YES'", ANG_FORMAT: "'DEG'",
  })
  const r = await fetch(`/horizons-api?${p}`)
  const text = await r.text()
  if (!r.ok) throw new Error(`Horizons HTTP ${r.status}`)
  return parse(text)
}

/** Columns found by header name, never by position. */
export function parse(text: string) {
  const lines = text.split(/\r?\n/)
  const soe = lines.indexOf('$$SOE'), eoe = lines.indexOf('$$EOE')
  if (soe < 0 || eoe < 0) throw new Error('Horizons: ' + (text.match(/^.*(error|cannot|no ).*$/im)?.[0] ?? 'no data in response'))
  const head = lines[soe - 2].split(',').map(s => s.trim())
  const col = (p: string) => head.findIndex(h => h.startsWith(p))
  const [iAz, iEl, iD] = [col('Azi'), col('Elev'), col('Ang-diam')]
  const rows = lines.slice(soe + 1, eoe).map(l => l.split(',').map(s => s.trim()))
  return { az: rows.map(r => +r[iAz]), el: rows.map(r => +r[iEl]), diamDeg: rows.reduce((s, r) => s + +r[iD], 0) / rows.length / 3600 }
}

export async function fetchEphem(id: string, lat: number, lonE: number, startMs: number, stopMs: number): Promise<Ephem> {
  const sun = await query('10', lat, lonE, startMs, stopMs)
  const earth = await query('399', lat, lonE, startMs, stopMs)
  return {
    id, t0: new Date(startMs).toISOString(), stepMin: 60,
    sunAz: sun.az, sunEl: sun.el, earthAz: earth.az, earthEl: earth.el, sunDiamDeg: sun.diamDeg, earthDiamDeg: earth.diamDeg,
  }
}

/** Fresh Horizons values for one hour, to compare against the precomputed files. */
export async function spot(body: '10' | '399', lat: number, lonE: number, ms: number) {
  const r = await query(body, lat, lonE, ms, ms + 3_600_000)
  return { az: r.az[0], el: r.el[0] }
}
