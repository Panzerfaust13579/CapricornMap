import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { metrics, planB, sphereDipDeg, sphereMask, windows, maskAt, type Ephem, type Scenario, type SiteData, type Site } from './index'
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
})
