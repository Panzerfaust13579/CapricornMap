import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { bottleneck, calendar, discFraction, type Metrics, longRun, maskForMast, mastRange, metrics, planB, sphereDipDeg, sphereMask, windows, maskAt, type Ephem, type Horizon, type Scenario, type SiteData, type Site } from './index'
import { distKm, polarLatLon, polarXY, quickmapUrl } from './geo'
import { DEFAULTS, decode, encode } from '../share'
import farSide from './far-side.json'

const load = (id: string): Ephem => JSON.parse(readFileSync(`public/data/ephem/${id}.json`, 'utf8'))
const sites: Site[] = JSON.parse(readFileSync('public/data/sites.json', 'utf8'))
const lax = { minSunPct: 0, maxDarkH: 1e9, minEarthPct: 0, maxGapH: 1e9 }
const scen = (siteId: string, start = '2027-03-01', days = 14): Scenario => ({ siteId, start, days, mastM: 2, needs: lax })

describe('geometry', () => {
  it('2 m mast on a smooth Moon sees about -0.09 deg', () => {
    expect(sphereDipDeg(2)).toBeCloseTo(-0.087, 3)
  })
  it('mask interpolates and wraps at 360', () => {
    const m = Array(360).fill(0); m[359] = 10
    expect(maskAt(m, 359.5)).toBeCloseTo(5)
    expect(maskAt(m, -0.5)).toBeCloseTo(5)
  })
  it('window edges land on the zero crossing', () => {
    const r = windows([1, 1, -1, -3, 1], 60)
    expect(r.map(x => x.visible)).toEqual([true, false, true])
    expect(r[0].endH).toBeCloseTo(1.5)
    expect(r[1].endH).toBeCloseTo(3.75)
  })
})

describe('known answers on real Horizons data', () => {
  it('Earth is always visible at Apollo 11', () => {
    const m = metrics(scen('apollo-11', '2027-01-01', 700), load('apollo-11'), sphereMask(2))!
    expect(m.earthPct).toBe(100)
    expect(m.longestCommsGapH).toBe(0)
  })
  it('Earth is never visible at 0 N 180 E', () => {
    const m = metrics(scen('far-side', '2027-01-01', 30), farSide as Ephem, sphereMask(2))!
    expect(m.earthPct).toBe(0)
  })
  it('a 90 deg wall everywhere gives no sunlight and NO-GO', () => {
    const s = { ...scen('mons-mouton'), needs: { ...lax, minSunPct: 10 } }
    const m = metrics(s, load('mons-mouton'), Array(360).fill(90))!
    expect(m.sunPct).toBe(0)
    expect(m.verdict).toBe('NO-GO')
    expect(m.failed).toHaveLength(1)
  })
  it('dates outside the ephemeris return null', () => {
    expect(metrics(scen('apollo-11', '2030-01-01'), load('apollo-11'), sphereMask(2))).toBeNull()
  })
  it('mission-averaged power drops when a launch slip loses sunlight at Mons Mouton', () => {
    const e = load('mons-mouton')
    const hz: Horizon = JSON.parse(readFileSync('public/data/horizon/mons-mouton.json', 'utf8'))
    const mask = maskForMast(hz, 2)
    const go = metrics(scen('mons-mouton', '2027-03-12', 14), e, mask)!
    const slip14 = metrics(scen('mons-mouton', '2027-03-26', 14), e, mask)!
    expect(go.meanVertWm2).toBeGreaterThan(go.meanHorizWm2 * 10)
    expect(slip14.meanVertWm2).toBeLessThan(go.meanVertWm2)
    expect(slip14.meanHorizWm2).toBeLessThan(go.meanHorizWm2)
  })
})

describe('Plan B', () => {
  const data = new Map<string, SiteData>(sites.map(site => [site.id, { site, ephem: load(site.id), mask: sphereMask(2) }]))
  it('ranks GO first, then by sunlight, and explains each option', () => {
    const base = { ...scen('mons-mouton'), needs: { ...lax, minSunPct: 60 } }
    const r = planB(base, 14, data)!
    expect(r.options).toHaveLength(35 + 9)
    const v = r.options.map(o => o.m.verdict)
    expect(v.lastIndexOf('GO')).toBeLessThan(v.indexOf('NO-GO') === -1 ? Infinity : v.indexOf('NO-GO'))
    for (let i = 1; i < r.options.length; i++)
      if (r.options[i].m.verdict === r.options[i - 1].m.verdict) expect(r.options[i].m.sunPct).toBeLessThanOrEqual(r.options[i - 1].m.sunPct)
    expect(r.options.every(o => o.sentence.length > 0)).toBe(true)
  })
  it('marks each option as a new date or a new site', () => {
    const r = planB(scen('mons-mouton'), 14, data)!
    expect(r.options.filter(o => o.kind === 'date')).toHaveLength(35)
    expect(r.options.filter(o => o.kind === 'site').every(o => o.siteId !== 'mons-mouton' && o.slipDays === 14)).toBe(true)
  })
})

describe('calendar', () => {
  const e = load('mons-mouton'), mask = sphereMask(2)
  it('scores every landing date and agrees with metrics()', () => {
    const cal = calendar(scen('mons-mouton'), e, mask, '2027-01-01', '2028-12-31')
    expect(cal).toHaveLength(731)
    expect(cal[59].date).toBe('2027-03-01')
    expect(cal[59].m).toEqual(metrics(scen('mons-mouton', '2027-03-01'), e, mask))
  })
  it('is null where the mission runs past the data', () => {
    const cal = calendar(scen('mons-mouton'), e, mask, '2028-12-01', '2028-12-31')
    expect(cal[0].m).not.toBeNull()
    expect(cal[cal.length - 1].m).toBeNull()
  })
})

describe('mast height on terrain', () => {
  const hz: Horizon = { id: 'x', mastM: 2, elevDeg: Array(360).fill(4), elevDegByMast: { 2: Array(360).fill(4), 10: Array(360).fill(2), 20: Array(360).fill(1) } }
  it('interpolates between the computed heights and holds outside them', () => {
    expect(maskForMast(hz, 2)[0]).toBe(4)
    expect(maskForMast(hz, 6)[0]).toBeCloseTo(3)
    expect(maskForMast(hz, 15)[0]).toBeCloseTo(1.5)
    expect(maskForMast(hz, 0)[0]).toBe(4)
    expect(maskForMast(hz, 50)[0]).toBe(1)
    expect(mastRange(hz)).toEqual([2, 20])
  })
  it('falls back to the single mask of older files', () => {
    const old: Horizon = { id: 'x', mastM: 2, elevDeg: Array(360).fill(4) }
    expect(maskForMast(old, 10)).toBe(old.elevDeg)
    expect(mastRange(old)).toBeNull()
  })
  it('every committed mask gets lower, never higher, as the mast grows', () => {
    for (const s of sites.filter(s => s.terrain === 'lola')) {
      const h: Horizon = JSON.parse(readFileSync(`public/data/horizon/${s.id}.json`, 'utf8'))
      if (!h.elevDegByMast) continue
      expect(h.elevDegByMast[2]).toEqual(h.elevDeg)
      const m2 = maskForMast(h, 2), m20 = maskForMast(h, 20)
      expect(m20.every((v, i) => v <= m2[i] + 0.011)).toBe(true)
    }
  })
})

describe('long-run shares', () => {
  it('disc fraction is 0 below, 1 above, half at the centre line', () => {
    expect(discFraction(-0.1, 0.53)).toBe(0)
    expect(discFraction(0.53, 0.53)).toBeCloseTo(1)
    expect(discFraction(0.265, 0.53)).toBeCloseTo(0.5)
    expect(discFraction(0.1325, 0.53)).toBeCloseTo(0.1955, 3) // a quarter of the diameter shows 19.6% of the area
  })
  it('a smooth Moon near the pole is sunlit about half the time', () => {
    const r = longRun(load('haworth'), sphereMask(2))
    expect(r.sunDiscPct).toBeGreaterThan(45)
    expect(r.sunDiscPct).toBeLessThan(55)
  })
})

describe('map geometry', () => {
  it('puts the pole at the origin and longitude 0 straight up', () => {
    expect(polarXY(-90, 123)[0]).toBeCloseTo(0)
    expect(polarXY(-90, 123)[1]).toBeCloseTo(0)
    const [x, y] = polarXY(-80, 0)
    expect(x).toBeCloseTo(0)
    expect(y / 1000).toBeCloseTo(304.0, 0) // the edge of the 80 S map
    expect(polarXY(-85, 90)[0]).toBeGreaterThan(0)
  })
  it('round-trips latitude and longitude', () => {
    const [lat, lon] = polarLatLon(...polarXY(-84.232, 29.926))
    expect(lat).toBeCloseTo(-84.232, 6)
    expect(lon).toBeCloseTo(29.926, 6)
    expect(polarLatLon(...polarXY(-88.23, 295.372))[1]).toBeCloseTo(295.372, 6)
  })
  it('measures great-circle distance on the lunar sphere', () => {
    expect(distKm(-90, 0, -80, 123)).toBeCloseTo((10 * Math.PI * 1737.4) / 180, 6) // 10 degrees of arc from the pole
    expect(distKm(-85, 10, -85, 10)).toBe(0)
    expect(distKm(0, 0, 0, 180)).toBeCloseTo(Math.PI * 1737.4, 6)
    expect(distKm(-84, 30, -86, 200)).toBeCloseTo(distKm(-86, 200, -84, 30), 9)
  })
  it('matches pyproj on the LOLA map grid for every site', () => {
    const fix: { sites: { id: string; x: number; y: number }[] } = JSON.parse(readFileSync('public/data/southpole.json', 'utf8'))
    for (const f of fix.sites.filter(f => sites.find(s => s.id === f.id)!.lat < -60)) {
      const s = sites.find(s => s.id === f.id)!
      const [x, y] = polarXY(s.lat, s.lonE)
      expect(Math.hypot(x - f.x, y - f.y)).toBeLessThan(1) // metres
    }
  })
  it('builds a QuickMap link in the polar view for polar sites and the cylindrical view elsewhere', () => {
    expect(quickmapUrl(-84.232, 29.926)).toBe('https://quickmap.lroc.im-ldi.com/?prjExtent=67331%2C131713%2C107331%2C171713&proj=27')
    expect(quickmapUrl(0.674, 23.473)).toContain('proj=16')
    expect(quickmapUrl(10, 350)).toContain('prjExtent=-3232')
  })
})

describe('bottleneck', () => {
  const day = (sunPct: number, longestDarkH: number) => ({ date: '2027-01-01', m: { sunPct, longestDarkH, earthPct: 100, longestCommsGapH: 0 } as Metrics })
  const needs = { minSunPct: 60, maxDarkH: 24, minEarthPct: 0, maxGapH: 1e9 }
  it('names the cheapest single relaxation and how many days it unlocks', () => {
    // Night is the only failure on two days; sunlight alone fails on one day by a lot.
    const b = bottleneck([day(70, 30.2), day(80, 40), day(20, 10)], needs)
    expect(b).toMatchObject({ key: 'maxDarkH', from: 24, to: 31, unlocks: 1 })
  })
  it('never suggests tightening a need that already passes', () => {
    // Day 2 already passes; counting it once proposed raising min sunlight from 60 to 70.
    expect(bottleneck([day(90, 30), day(70, 10)], needs)).toMatchObject({ key: 'maxDarkH', to: 30 })
  })
  it('is null when every day fails two needs', () => {
    expect(bottleneck([day(10, 100)], needs)).toBeNull()
  })
})

describe('share link', () => {
  it('is empty for the default plan and round-trips a changed one', () => {
    expect(encode(DEFAULTS)).toBe('')
    const s = { ...DEFAULTS, site: 'haworth', date: '2027-06-10', days: 21, mast: 10, slip: 14, explain: true, needs: { ...DEFAULTS.needs, minSunPct: 40 }, b: { siteId: 'mons-mouton', start: '2027-06-27' } }
    expect(decode(encode(s))).toEqual(s)
  })
  it('carries custom coordinates', () => {
    const s = { ...DEFAULTS, site: 'custom', lat: -85.5, lon: 45.25 }
    expect(decode(encode(s))).toEqual(s)
  })
  it('opens with defaults when the link is damaged', () => {
    expect(decode('?date=2031-99-99&days=abc&slip=400&sun=-5&site=custom')).toEqual({ ...DEFAULTS, slip: 28, needs: { ...DEFAULTS.needs, minSunPct: 0 } })
  })
})
