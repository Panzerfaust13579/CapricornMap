// Pure functions over the data contract (CONTRACT.md). No React, no fetch.

export interface Site { id: string; name: string; lat: number; lonE: number; group: string; terrain: 'lola' | 'sphere'; source: string }
export interface Ephem {
  id: string; t0: string; stepMin: number
  sunAz: number[]; sunEl: number[]; earthAz: number[]; earthEl: number[]
  sunDiamDeg: number; earthDiamDeg: number
}
export interface Horizon {
  id: string; mastM: number; elevDeg: number[]
  /** Masks at other mast heights, keyed by height in metres. elevDeg is the 2 m one. */
  elevDegByMast?: Record<string, number[]>
  siteHeightM?: number; snapKm?: number; observerLat?: number; observerLonE?: number
}
export type Body = 'sun' | 'earth'
export interface Needs { minSunPct: number; maxDarkH: number; minEarthPct: number; maxGapH: number }
export interface Scenario { siteId: string; start: string; days: number; mastM: number; needs: Needs }
export interface Run { visible: boolean; startH: number; endH: number; hours: number }
export interface Metrics {
  sunPct: number; longestDarkH: number; earthH: number; earthPct: number; longestCommsGapH: number
  sunNow: boolean; earthNow: boolean; nextSunChangeH: number | null; nextEarthChangeH: number | null
  meanHorizWm2: number; meanVertWm2: number
  verdict: 'GO' | 'NO-GO'; failed: string[]
}
export interface SiteData { site: Site; ephem: Ephem; mask: number[] }

export const R_MOON_M = 1737400
export const SOLAR_WM2 = 1361
const DEG = Math.PI / 180
const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

/** Horizon dip for an observer mastM above a smooth sphere, in degrees (negative). */
export const sphereDipDeg = (mastM: number) => -Math.acos(R_MOON_M / (R_MOON_M + mastM)) / DEG
export const sphereMask = (mastM: number) => Array<number>(360).fill(sphereDipDeg(mastM))

/** Terrain mask for a mast height: linear between the precomputed heights, held constant outside them. */
export function maskForMast(h: Horizon, mastM: number): number[] {
  const by = h.elevDegByMast
  if (!by) return h.elevDeg
  const hs = Object.keys(by).map(Number).sort((a, b) => a - b)
  const k = hs.findIndex(x => x >= mastM)
  if (k === 0) return by[hs[0]]
  if (k < 0) return by[hs[hs.length - 1]]
  if (hs[k] === mastM) return by[hs[k]]
  const lo = by[hs[k - 1]], hi = by[hs[k]], f = (mastM - hs[k - 1]) / (hs[k] - hs[k - 1])
  return lo.map((v, i) => v * (1 - f) + hi[i] * f)
}
/** Mast heights a terrain mask really covers, or null when the mask is fixed at one height. */
export const mastRange = (h: Horizon): [number, number] | null => {
  const hs = Object.keys(h.elevDegByMast ?? {}).map(Number)
  return hs.length > 1 ? [Math.min(...hs), Math.max(...hs)] : null
}

/** Mask elevation at any azimuth, linear between whole-degree bins, wrapping at 360. */
export function maskAt(mask: number[], az: number): number {
  const a = ((az % 360) + 360) % 360
  const i = Math.floor(a)
  const f = a - i
  return mask[i % 360] * (1 - f) + mask[(i + 1) % 360] * f
}

/** Degrees by which the body's upper limb clears the mask; > 0 means visible. */
export const margin = (el: number, az: number, mask: number[], diamDeg: number) => el + diamDeg / 2 - maskAt(mask, az)
export const visible = (el: number, az: number, mask: number[], diamDeg: number) => margin(el, az, mask, diamDeg) > 0

/** Share of a disc's area above a straight horizon, 0 to 1, from the upper-limb margin. Exact circle-segment area. */
export function discFraction(marginDeg: number, diamDeg: number): number {
  const x = 1 - 2 * Math.min(1, Math.max(0, marginDeg / diamDeg))
  return (Math.acos(x) - x * Math.sqrt(1 - x * x)) / Math.PI
}

/** Runs of visible / not visible; each edge placed where the margin crosses zero between samples. */
export function windows(margins: ArrayLike<number>, stepMin: number): Run[] {
  const h = stepMin / 60
  const runs: Run[] = []
  if (!margins.length) return runs
  let cur = margins[0] > 0
  let start = 0
  for (let i = 1; i < margins.length; i++) {
    const v = margins[i] > 0
    if (v === cur) continue
    const a = margins[i - 1], b = margins[i]
    const edge = (i - 1 + a / (a - b)) * h
    runs.push({ visible: cur, startH: start, endH: edge, hours: edge - start })
    start = edge
    cur = v
  }
  const end = (margins.length - 1) * h
  runs.push({ visible: cur, startH: start, endH: end, hours: end - start })
  return runs
}

/** Sample index of a UTC time in the ephemeris (fractional). */
export const indexAt = (e: Ephem, ms: number) => (ms - Date.parse(e.t0)) / (e.stepMin * 60000)

// Margins for a whole ephemeris against one mask, computed once and reused by every date and slip.
const marginCache = new WeakMap<number[], Map<Ephem, Partial<Record<Body, Float64Array>>>>()
function allMargins(e: Ephem, mask: number[], body: Body): Float64Array {
  let byEphem = marginCache.get(mask)
  if (!byEphem) marginCache.set(mask, (byEphem = new Map()))
  let bodies = byEphem.get(e)
  if (!bodies) byEphem.set(e, (bodies = {}))
  let out = bodies[body]
  if (!out) {
    const az = body === 'sun' ? e.sunAz : e.earthAz
    const el = body === 'sun' ? e.sunEl : e.earthEl
    const d = body === 'sun' ? e.sunDiamDeg : e.earthDiamDeg
    out = bodies[body] = new Float64Array(el.length)
    for (let i = 0; i < el.length; i++) out[i] = margin(el[i], az[i], mask, d)
  }
  return out
}

/** Margins of one body for samples [i0, i1]. */
export const margins = (e: Ephem, mask: number[], body: Body, i0: number, i1: number) => allMargins(e, mask, body).subarray(i0, i1 + 1)

/** Sample range for [startMs, startMs + hours], or null if the ephemeris does not cover it. */
export function span(e: Ephem, startMs: number, hours: number): [number, number] | null {
  const i0 = Math.round(indexAt(e, startMs))
  const i1 = i0 + Math.round((hours * 60) / e.stepMin)
  return i0 >= 0 && i1 < e.sunEl.length ? [i0, i1] : null
}

const total = (runs: Run[], vis: boolean) => runs.filter(r => r.visible === vis).reduce((s, r) => s + r.hours, 0)
const longest = (runs: Run[], vis: boolean) => Math.max(0, ...runs.filter(r => r.visible === vis).map(r => r.hours))
const nextChange = (runs: Run[]) => (runs.length > 1 ? runs[0].endH : null)

export const shiftDate = (iso: string, days: number) => new Date(Date.parse(iso) + days * DAY_MS).toISOString().slice(0, 10)

export function metrics(s: Scenario, e: Ephem, mask: number[]): Metrics | null {
  const sp = span(e, Date.parse(s.start), s.days * 24)
  if (!sp) return null
  const [i0, i1] = sp
  const sunM = margins(e, mask, 'sun', i0, i1)
  const sunRuns = windows(sunM, e.stepMin)
  const earthRuns = windows(margins(e, mask, 'earth', i0, i1), e.stepMin)
  const hours = (i1 - i0) * (e.stepMin / 60)
  let horiz = 0, vert = 0, lit = 0
  for (let i = i0; i <= i1; i++) {
    if (!(sunM[i - i0] > 0)) continue
    lit++
    horiz += SOLAR_WM2 * Math.max(0, Math.sin(e.sunEl[i] * DEG))
    vert += SOLAR_WM2 * Math.cos(e.sunEl[i] * DEG) // vertical panel turned to face the Sun's azimuth
  }
  const sunPct = (100 * total(sunRuns, true)) / hours
  const earthH = total(earthRuns, true)
  const earthPct = (100 * earthH) / hours
  const longestDarkH = longest(sunRuns, false)
  const longestCommsGapH = longest(earthRuns, false)
  const n = s.needs
  const failed = [
    sunPct < n.minSunPct && `sunlight ${sunPct.toFixed(0)}% is below ${n.minSunPct}%`,
    longestDarkH > n.maxDarkH && `longest night ${longestDarkH.toFixed(0)} h exceeds ${n.maxDarkH} h`,
    earthPct < n.minEarthPct && `Earth visible ${earthPct.toFixed(0)}% is below ${n.minEarthPct}%`,
    longestCommsGapH > n.maxGapH && `longest comms gap ${longestCommsGapH.toFixed(0)} h exceeds ${n.maxGapH} h`,
  ].filter((x): x is string => !!x)
  return {
    sunPct, longestDarkH, earthH, earthPct, longestCommsGapH,
    sunNow: sunRuns[0].visible, earthNow: earthRuns[0].visible,
    nextSunChangeH: nextChange(sunRuns), nextEarthChangeH: nextChange(earthRuns),
    meanHorizWm2: lit ? horiz / lit : 0, meanVertWm2: lit ? vert / lit : 0,
    verdict: failed.length ? 'NO-GO' : 'GO', failed,
  }
}

export interface PlanBOption {
  siteId: string; siteName: string; start: string; slipDays: number; m: Metrics; sentence: string
  /** 'date': same site, another landing date. 'site': another site on the slipped date. */
  kind: 'date' | 'site'
}

/** One sentence on what plan m gains and loses against plan ref. */
export function gainLoss(m: Metrics, ref: Metrics): string {
  const parts: string[] = []
  const dSun = m.sunPct - ref.sunPct
  if (Math.abs(dSun) >= 1) parts.push(`${dSun > 0 ? '+' : '−'}${Math.abs(dSun).toFixed(0)}% sunlight`)
  const dE = m.earthH - ref.earthH
  const dDays = Math.abs(dE / 24).toFixed(0)
  if (Math.abs(dE) >= 24) parts.push(`${dDays} ${dE > 0 ? 'more' : 'fewer'} ${dDays === '1' ? 'day' : 'days'} of Earth contact`)
  else if (Math.abs(dE) >= 1) parts.push(`${Math.abs(dE).toFixed(0)} h ${dE > 0 ? 'more' : 'less'} Earth contact`)
  const dN = m.longestDarkH - ref.longestDarkH
  if (Math.abs(dN) >= 1) parts.push(`longest night ${Math.abs(dN).toFixed(0)} h ${dN > 0 ? 'longer' : 'shorter'}`)
  return parts.length ? parts.join(', ') : 'about the same as the current plan'
}

/** Rescue options for a plan that slipped by slipDays: other dates at the same site, other sites at the slipped date. */
export function planB(base: Scenario, slipDays: number, data: Map<string, SiteData>, slips = range(-7, 28)) {
  const here = data.get(base.siteId)
  if (!here) return null
  const now = { ...base, start: shiftDate(base.start, slipDays) }
  const current = metrics(now, here.ephem, here.mask)
  if (!current) return null
  const options: PlanBOption[] = []
  const add = (sd: SiteData, start: string, slip: number) => {
    const m = metrics({ ...base, siteId: sd.site.id, start }, sd.ephem, sd.mask)
    if (m) options.push({ siteId: sd.site.id, siteName: sd.site.name, start, slipDays: slip, m, sentence: gainLoss(m, current), kind: sd === here ? 'date' : 'site' })
  }
  for (const s of slips) if (s !== slipDays) add(here, shiftDate(base.start, s), s)
  for (const sd of data.values()) if (sd.site.id !== base.siteId) add(sd, now.start, slipDays)
  options.sort((a, b) => (a.m.verdict === b.m.verdict ? 0 : a.m.verdict === 'GO' ? -1 : 1) || b.m.sunPct - a.m.sunPct || b.m.earthH - a.m.earthH)
  return { current, options }
}

export const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

export interface Day { date: string; m: Metrics | null }

/** The same mission landed on every date from `from` to `to` (inclusive, UTC dates). m is null outside the ephemeris. */
export function calendar(base: Scenario, e: Ephem, mask: number[], from: string, to: string): Day[] {
  const out: Day[] = []
  for (let t = Date.parse(from), end = Date.parse(to); t <= end; t += DAY_MS) {
    const date = new Date(t).toISOString().slice(0, 10)
    out.push({ date, m: metrics({ ...base, start: date }, e, mask) })
  }
  return out
}

/** Long-run shares over a whole ephemeris, in the terms NASA's PGDA Product 69 maps use. */
export function longRun(e: Ephem, mask: number[]) {
  const sun = allMargins(e, mask, 'sun'), earth = allMargins(e, mask, 'earth')
  let disc = 0, seen = 0
  for (let i = 0; i < sun.length; i++) {
    disc += discFraction(sun[i], e.sunDiamDeg)
    if (earth[i] > 0) seen++
  }
  return { sunDiscPct: (100 * disc) / sun.length, earthAnyPct: (100 * seen) / earth.length }
}
