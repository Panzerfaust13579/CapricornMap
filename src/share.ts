// The whole scenario as a URL query string, so a plan can be shared as a link. Pure functions.
import type { Needs } from './engine'

export interface Shared {
  site: string; date: string; days: number; mast: number; slip: number; needs: Needs; explain: boolean
  /** Custom coordinates, present when site is 'custom'. */
  lat?: number; lon?: number
  /** Plan B loaded in the comparator. */
  b?: { siteId: string; start: string }
}

export const DEFAULTS: Shared = {
  site: 'mons-mouton', date: '2027-03-12', days: 14, mast: 2, slip: 0, explain: false,
  needs: { minSunPct: 60, maxDarkH: 72, minEarthPct: 50, maxGapH: 96 },
}
export const DATE_MIN = '2027-01-08', DATE_MAX = '2028-11-15'

const NEED_KEYS: [string, keyof Needs, number][] = [['sun', 'minSunPct', 100], ['night', 'maxDarkH', 360], ['earth', 'minEarthPct', 100], ['gap', 'maxGapH', 360]]
const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))
const num = (s: string | null, lo: number, hi: number, fallback: number) => {
  const v = s === null || s === '' ? NaN : Number(s)
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback
}

/** Query string for a scenario, with only the values that differ from the defaults. '' for the default scenario. */
export function encode(s: Shared): string {
  const p = new URLSearchParams()
  if (s.site !== DEFAULTS.site) p.set('site', s.site)
  if (s.site === 'custom' && s.lat !== undefined && s.lon !== undefined) { p.set('lat', String(s.lat)); p.set('lon', String(s.lon)) }
  if (s.date !== DEFAULTS.date) p.set('date', s.date)
  if (s.days !== DEFAULTS.days) p.set('days', String(s.days))
  if (s.mast !== DEFAULTS.mast) p.set('mast', String(s.mast))
  if (s.slip !== DEFAULTS.slip) p.set('slip', String(s.slip))
  for (const [k, key] of NEED_KEYS) if (s.needs[key] !== DEFAULTS.needs[key]) p.set(k, String(s.needs[key]))
  if (s.b) p.set('b', `${s.b.siteId}@${s.b.start}`)
  if (s.explain) p.set('explain', '1')
  const q = p.toString()
  return q ? '?' + q : ''
}

/** Scenario from a query string. Anything missing or out of range falls back to the default, so a bad link still opens. */
export function decode(search: string): Shared {
  const p = new URLSearchParams(search)
  const date = p.get('date')
  const needs = { ...DEFAULTS.needs }
  for (const [k, key, max] of NEED_KEYS) needs[key] = Math.round(num(p.get(k), 0, max, DEFAULTS.needs[key]))
  const out: Shared = {
    site: p.get('site') || DEFAULTS.site,
    date: isDate(date) && date >= DATE_MIN && date <= DATE_MAX ? date : DEFAULTS.date,
    days: Math.round(num(p.get('days'), 1, 60, DEFAULTS.days)),
    mast: num(p.get('mast'), 0, 50, DEFAULTS.mast),
    slip: Math.round(num(p.get('slip'), -7, 28, DEFAULTS.slip)),
    needs, explain: p.get('explain') === '1',
  }
  if (out.site === 'custom') {
    const lat = num(p.get('lat'), -90, 90, NaN), lon = num(p.get('lon'), -360, 360, NaN)
    if (Number.isFinite(lat) && Number.isFinite(lon)) { out.lat = lat; out.lon = ((lon % 360) + 360) % 360 }
    else out.site = DEFAULTS.site
  }
  const [bSite, bStart] = (p.get('b') ?? '').split('@')
  if (bSite && isDate(bStart)) out.b = { siteId: bSite, start: bStart }
  return out
}
