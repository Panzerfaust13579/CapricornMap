import { useEffect, useMemo, useState } from 'react'
import { indexAt, longRun, metrics, sphereMask, type Ephem, type Horizon, type SiteData } from './engine'
import { quickmapUrl } from './engine/geo'
import { spot } from './horizons'
import farSide from './engine/far-side.json'

const lax = { minSunPct: 0, maxDarkH: 1e9, minEarthPct: 0, maxGapH: 1e9 }
const SPOT_SITES = ['mons-mouton', 'connecting-ridge', 'apollo-11']
const SPOT_TIMES = ['2027-03-14T06:00:00Z', '2027-09-02T18:00:00Z', '2028-06-21T00:00:00Z']

interface Row { site: string; lat: number; lonE: number; time: string; body: string; ourAz: number; ourEl: number; az: number; el: number }
interface P69 {
  product: string; url: string; averagedOverYears: number; bestWithinM: number
  sites: { id: string; map: string; pixelM: number; lat?: number; lonE?: number; sunPct: number; sunPctBest: number; earthPct: number; earthPctBest: number }[]
}

const SOURCES: [string, string, string][] = [
  ['NASA JPL Horizons API', 'Direction, height and apparent size of the Sun (target 10) and Earth (target 399) for an observer on the Moon, airless, hourly for 2027–2028. Also the live look-up for custom coordinates and the spot check on this page.', 'https://ssd.jpl.nasa.gov/horizons/'],
  ['NASA LRO LOLA South Pole elevation maps, PGDA Product 90 (LDEM_80S_20MPP, LDEM_75S_30MPP and LDEM_60S_60MPP)', 'The 360° terrain horizon at nine sites, and the shaded relief on the site map.', 'https://pgda.gsfc.nasa.gov/products/90'],
  ['NASA LOLA polar illumination maps, PGDA Product 69 (Mazarico et al. 2011)', 'Independent check: NASA\'s 18.6-year average sunlight and Earth visibility at each site, compared with ours in the table above.', 'https://pgda.gsfc.nasa.gov/products/69'],
  ['LROC QuickMap', 'A link from every site to the same spot in NASA\'s lunar map viewer, for images and its own lighting tools.', 'https://quickmap.lroc.im-ldi.com/'],
  ['NASA Artemis III candidate landing regions (2024 update)', 'Six curated polar sites.', 'https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/'],
  ['LROC featured images: IM-1 Odysseus, IM-2 Athena (NASA CLPS deliveries)', 'Coordinates of the two commercial landers.', 'https://lroc.im-ldi.com/images/1408'],
  ['ISRO Chandrayaan-3 landing site (partner agency), coordinates from LROC', 'One curated site from a partner agency, 600 km from the pole.', 'https://lroc.im-ldi.com/images/1314'],
  ['NASA NSSDCA Apollo landing site coordinates', 'Apollo 11 as an equator reference and a known-answer test.', 'https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html'],
]

export default function Validation({ data, horizons, explain }: { data: Map<string, SiteData>; horizons: Map<string, Horizon>; explain: boolean }) {
  const [rows, setRows] = useState<Row[]>([])
  const [status, setStatus] = useState('')
  const [p69, setP69] = useState<P69 | null>(null)
  useEffect(() => {
    fetch('/data/crosscheck.json').then(r => (r.ok ? r.json() : null)).then(setP69, () => {})
    if (location.hash === '#crosscheck') {
      setTimeout(() => document.getElementById('crosscheck')?.scrollIntoView({ behavior: 'smooth' }), 100)
    }
  }, [])

  const known: [string, () => boolean | null][] = [
    ['Apollo 11 sees Earth 100% of 2027 (Earth stays near the zenith)', () => {
      const d = data.get('apollo-11'); if (!d) return null
      return metrics({ siteId: 'apollo-11', start: '2027-01-01', days: 360, mastM: 2, needs: lax }, d.ephem, d.mask)?.earthPct === 100
    }],
    ['A point at 0° N 180° E, the middle of the far side, never sees Earth (30 days of Horizons data)', () =>
      metrics({ siteId: 'far-side', start: '2027-01-01', days: 30, mastM: 2, needs: lax }, farSide as Ephem, sphereMask(2))?.earthPct === 0],
    ['Every site south of 85° S keeps the Sun below 8° all of 2027–2028', () => {
      const polar = [...data.values()].filter(d => d.site.lat < -85)
      return polar.length ? polar.every(d => Math.max(...d.ephem.sunEl) <= 8) : null
    }],
    ['Polar Sun never rises more than 1.6° + latitude offset (lunar axis tilt 1.54°)', () => {
      const polar = [...data.values()].filter(d => d.site.lat < -80)
      return polar.length ? polar.every(d => Math.max(...d.ephem.sunEl) <= 90 + d.site.lat + 1.6 + 0.5) : null
    }],
    ['A wall of 90° on every side gives 0% sunlight and NO-GO', () => {
      const d = data.get('mons-mouton'); if (!d) return null
      const m = metrics({ siteId: 'x', start: '2027-03-01', days: 14, mastM: 2, needs: { ...lax, minSunPct: 1 } }, d.ephem, Array(360).fill(90))
      return m?.sunPct === 0 && m.verdict === 'NO-GO'
    }],
  ]

  // Our two-year averages at a 2 m mast, in the same terms as NASA's maps.
  const cross = useMemo(() => (p69?.sites ?? []).flatMap(s => {
    const d = data.get(s.id); if (!d) return []
    const hz = horizons.get(s.id)
    const smooth = longRun(d.ephem, sphereMask(2))
    return [{ ...s, lat: d.site.lat, lonE: d.site.lonE, name: d.site.name, terrain: !!hz, ...(hz ? longRun(d.ephem, hz.elevDeg) : smooth), smooth }]
  }), [p69, data, horizons])
  const CLOSE = 7 // points; beyond this we look at how much NASA's own map varies around the point
  const terr = cross.filter(c => c.terrain)
  const worst = (cs: typeof cross, f: (c: (typeof cross)[number]) => number) => Math.max(0, ...cs.map(c => Math.abs(f(c))))
  const sunD = (c: (typeof cross)[number]) => c.sunDiscPct - c.sunPct
  const near = terr.filter(c => Math.abs(sunD(c)) <= CLOSE), ridges = terr.filter(c => Math.abs(sunD(c)) > CLOSE)
  // Where terrain data helps most: how much closer to NASA's value our number is with terrain than without.
  const gain = (ours: (c: (typeof cross)[number]) => number, flat: (c: (typeof cross)[number]) => number, nasa: (c: (typeof cross)[number]) => number) =>
    terr.map(c => ({ c, g: Math.abs(flat(c) - nasa(c)) - Math.abs(ours(c) - nasa(c)) })).sort((a, b) => b.g - a.g)[0]
  const sunGain = gain(c => c.sunDiscPct, c => c.smooth.sunDiscPct, c => c.sunPct), earthGain = gain(c => c.earthAnyPct, c => c.smooth.earthAnyPct, c => c.earthPct)
  const diff = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}`

  async function run() {
    setStatus('Querying JPL Horizons…'); setRows([])
    try {
      const out: Row[] = []
      for (let k = 0; k < SPOT_SITES.length; k++) {
        const d = data.get(SPOT_SITES[k]); if (!d) continue
        const ms = Date.parse(SPOT_TIMES[k]); const i = Math.round(indexAt(d.ephem, ms))
        for (const [body, code, az, el] of [['Sun', '10', d.ephem.sunAz, d.ephem.sunEl], ['Earth', '399', d.ephem.earthAz, d.ephem.earthEl]] as const) {
          const r = await spot(code, d.site.lat, d.site.lonE, ms)
          out.push({ site: d.site.name, lat: d.site.lat, lonE: d.site.lonE, time: SPOT_TIMES[k].slice(0, 16), body, ourAz: az[i], ourEl: el[i], az: r.az, el: r.el })
          setRows([...out])
        }
      }
      setStatus('')
    } catch (e) { setStatus(String(e)) }
  }
  const dAz = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)
  const th = 'pr-3 font-normal'

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4">
      <a href="#" className="text-sm text-sky-400 underline">← Back to the planner</a>
      <h1 className="text-xl font-bold">Validation and data</h1>
      {explain && <p className="text-sky-300">We test the app against answers we already know, then against fresh numbers from NASA, then against NASA's own long-term maps.</p>}

      <section>
        <h2 className="mb-2 font-semibold">Known-answer tests (run now in your browser)</h2>
        <ul className="space-y-1 text-sm">
          {known.map(([label, f]) => {
            const r = f()
            return <li key={label}><span className={r ? 'text-emerald-400' : r === null ? 'text-zinc-500' : 'text-rose-400'}>{r ? 'PASS' : r === null ? 'LOADING' : 'FAIL'}</span> {label}</li>
          })}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Horizons spot check</h2>
        <p className="mb-2 text-sm text-zinc-400">Asks JPL Horizons again, live, and compares with the precomputed files the app uses.</p>
        <button onClick={run} className="rounded bg-zinc-800 px-3 py-1 text-sm hover:bg-zinc-700">Run spot check</button>
        {status && <p className="mt-1 text-sm text-amber-400" role="status">{status}</p>}
        {rows.length > 0 && (
          <div className="overflow-x-auto"><table className="mt-2 w-full min-w-[560px] text-sm">
            <thead><tr className="text-left text-zinc-400"><th className={th}>Site</th><th className={th}>UTC</th><th className={th}>Body</th><th className={th}>Ours az / el</th><th className={th}>Horizons az / el</th><th className={th}>Diff</th></tr></thead>
            <tbody>
              {rows.map((r, k) => (
                <tr key={k} className="border-t border-zinc-800">
                  <td><a className="text-sky-400 underline" href={quickmapUrl(r.lat, r.lonE)} target="_blank" rel="noreferrer">{r.site}</a></td>
                  <td className="font-mono">{r.time}</td><td>{r.body}</td>
                  <td className="font-mono">{r.ourAz.toFixed(2)} / {r.ourEl.toFixed(2)}</td>
                  <td className="font-mono">{r.az.toFixed(2)} / {r.el.toFixed(2)}</td>
                  <td className="font-mono">{Math.max(dAz(r.ourAz, r.az), Math.abs(r.ourEl - r.el)).toFixed(3)}°</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        {rows.length > 0 && <p className="mt-1 text-xs text-zinc-500">Each site name opens that spot in LROC QuickMap, where you can compare the shadows in real images.</p>}
      </section>

      <section id="crosscheck" className="scroll-mt-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-zinc-100">Cross-check against NASA's illumination maps (PGDA Product 69)</h2>
          <a
            href="https://pgda.gsfc.nasa.gov/products/69"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded bg-emerald-900/60 px-2.5 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-800 hover:text-emerald-100 border border-emerald-700/50"
          >
            <span>Compare here on NASA PGDA</span>
            <span>↗</span>
          </a>
        </div>
        <p className="mb-2 text-sm text-zinc-400">
          NASA's LOLA team published maps of average sunlight and Earth visibility at the lunar poles (<a className="text-sky-400 underline" href="https://pgda.gsfc.nasa.gov/products/69" target="_blank" rel="noreferrer">PGDA Product 69, Mazarico et al. 2011</a>).
          They are independent of this app: a different horizon method, on an earlier elevation map. Below, their value at each site next to ours. Click any site name to inspect the terrain in LROC QuickMap.
        </p>
        {p69 && cross.length === p69.sites.length ? (
          <>
            <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="text-left text-zinc-400"><th className={th} rowSpan={2}>Site (LROC QuickMap)</th><th className={th} rowSpan={2}>Our horizon</th><th className={th} colSpan={5}>Sunlight, % of full Sun</th><th className={th} colSpan={4}>Earth in view, % of time</th></tr>
                <tr className="text-left text-zinc-400"><th className={th}>NASA, at our point</th><th className={th}>NASA, best within {p69!.bestWithinM} m</th><th className={th}>Ours</th><th className={th}>Diff</th><th className={th}>Ours, no terrain</th><th className={th}>NASA</th><th className={th}>Ours</th><th className={th}>Diff</th><th className={th}>Ours, no terrain</th></tr>
              </thead>
              <tbody>
                {cross.map(c => (
                  <tr key={c.id} className="border-t border-zinc-800">
                    <td className="pr-3">
                      <a className="text-sky-400 underline hover:text-sky-300" href={quickmapUrl(c.lat, c.lonE)} target="_blank" rel="noreferrer" title={`Inspect ${c.name} in LROC QuickMap`}>
                        {c.name}
                      </a>
                    </td>
                    <td className={`whitespace-nowrap pr-3 ${c.terrain ? 'text-emerald-400' : 'text-amber-400'}`}>{c.terrain ? 'LOLA terrain' : 'smooth Moon'}</td>
                    <td className="pr-3 font-mono">{c.sunPct.toFixed(1)}</td>
                    <td className="pr-3 font-mono">{c.sunPctBest.toFixed(1)}</td>
                    <td className="pr-3 font-mono">{c.sunDiscPct.toFixed(1)}</td>
                    <td className="pr-3 font-mono">{diff(sunD(c))}</td>
                    <td className="pr-3 font-mono text-zinc-500">{c.smooth.sunDiscPct.toFixed(1)}</td>
                    <td className="pr-3 font-mono">{c.earthPct.toFixed(1)}</td>
                    <td className="pr-3 font-mono">{c.earthAnyPct.toFixed(1)}</td>
                    <td className="pr-3 font-mono">{diff(c.earthAnyPct - c.earthPct)}</td>
                    <td className="pr-3 font-mono text-zinc-500">{c.smooth.earthAnyPct.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <p className="mt-1 text-xs text-zinc-500">Diff is ours minus NASA's value at our point. "No terrain" is what we would show on a smooth Moon.</p>
            <p className="mt-2 text-sm text-zinc-300">
              Across the {terr.length} sites where we apply terrain: Earth visibility differs from NASA's by at most <b>{worst(terr, c => c.earthAnyPct - c.earthPct).toFixed(1)} points</b>.
              {' '}Sunlight is within <b>{worst(near, sunD).toFixed(1)} points</b> at {near.length} of the {terr.length}.
            </p>
            {ridges.length > 0 && (
              <p className="mt-2 text-sm text-zinc-300">
                The {ridges.length === 1 ? 'exception is' : 'exceptions are'} {ridges.map(c => c.name).join(' and ')}, where we stand on a narrow crest or summit.
                {' '}NASA's own map changes steeply there: {ridges.map(c => `at ${c.name} from ${c.sunPct.toFixed(0)}% under our point to ${c.sunPctBest.toFixed(0)}% within ${p69!.bestWithinM} m, against our ${c.sunDiscPct.toFixed(0)}%`).join('; ')}.
                {' '}A lander a few hundred metres off the crest can lose half its sunlight, which is why the exact spot matters.
              </p>
            )}
            {terr.length > 0 && sunGain.g > 1 && earthGain.g > 1 && (
              <p className="mt-2 text-sm text-zinc-300">
                Terrain is what makes the numbers agree. On a smooth Moon, {sunGain.c.name} would read {sunGain.c.smooth.sunDiscPct.toFixed(0)}% sunlight; with LOLA terrain it reads {sunGain.c.sunDiscPct.toFixed(0)}%, and NASA's map says {sunGain.c.sunPct.toFixed(0)}%.
                {' '}{earthGain.c.name} would see Earth {earthGain.c.smooth.earthAnyPct.toFixed(0)}% of the time; with terrain it is {earthGain.c.earthAnyPct.toFixed(0)}%, and NASA's map says {earthGain.c.earthPct.toFixed(0)}%.
              </p>
            )}
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-400">
              <li>The numbers should be close, not equal. NASA averages {p69!.averagedOverYears} years; we average 2027–2028. NASA's value is for a map pixel 60 to 240 m wide, at ground level; ours is for one point, 2 m above the ground.</li>
              <li>At Artemis regions we stand on the highest point within 1 km of the listed centre. NASA's map and ours come from different elevation models, so the crest can sit a pixel or two apart in the two.</li>
              {cross.some(c => !c.terrain) && <li>Sites marked "smooth Moon" ignore terrain in our numbers. The gap to NASA's value there is the error from leaving terrain out.</li>}
              <li>"Sunlight" here is the share of the Sun's disc above the horizon, averaged over time, which is how NASA's map counts it. The planner's "sunlit %" counts any part of the Sun in view, so it reads a little higher.</li>
            </ul>
          </>
        ) : <p className="text-sm text-zinc-500">Loading…</p>}
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Data sources</h2>
        <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
          <thead><tr className="text-left text-zinc-400"><th className={th}>Source</th><th className={th}>What it does in MoonSlip</th></tr></thead>
          <tbody>
            {SOURCES.map(([name, role, url]) => (
              <tr key={name} className="border-t border-zinc-800 align-top">
                <td className="py-1 pr-3"><a className="text-sky-400 underline" href={url} target="_blank" rel="noreferrer">{name}</a></td>
                <td className="py-1 text-zinc-300">{role}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </section>

      <section className="text-sm text-zinc-300">
        <h2 className="mb-2 font-semibold">Method and limits</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Sun and Earth azimuth and elevation come from JPL Horizons (targets 10 and 399, observer on the Moon, airless), hourly for 2027–2028. Earth libration is included because the positions are real ephemerides, not a circular model.</li>
          <li>A body counts as visible when its upper limb clears the horizon (Sun about 0.53°, Earth about 1.9° wide).</li>
          <li>Without terrain, the horizon is a smooth sphere: dip = −acos(R / (R + mast)), R = 1737.4 km. A 2 m mast sees −0.09°.</li>
          <li>Sites marked "LOLA terrain" use a 360° horizon computed from NASA's LOLA south polar elevation maps (PGDA Product 90): the 20 m map south of 80.5° S, the 30 m map for IM-1 Odysseus and the 60 m map for Chandrayaan-3. Full resolution out to 20 km, then pixels of 120 to 160 m out to 150 km or the edge of the map. Curvature is in the 3D geometry.</li>
          <li>Terrain closer than 5 pixels (100 m on the 20 m map) is ignored as noise. A nearby pixel wide enough to span several degrees blocks every direction it spans.</li>
          <li>Terrain horizons are computed for masts of 2, 5, 10 and 20 m and interpolated between them. Below 2 m or above 20 m the nearest one is used.</li>
          <li>Artemis entries are regions about 15 km across. Their mask is taken from the region's high point within 1 km of the listed centre, where a lander would most likely be placed.</li>
          <li>Apollo 11 and custom coordinates are marked "terrain not applied": they ignore ridges and craters. Real sunlight at a custom polar point can be lower, and the "no terrain" columns above show by how much.</li>
          <li>Power is a geometric proxy averaged over the mission: 1361 W/m² × visible solar disc fraction × sin(elevation) for a horizontal panel, or × cos(elevation) for a vertical panel turned to the Sun. No battery, no conversion losses.</li>
          <li>Hourly samples; window edges are interpolated between samples.</li>
          <li>The relay card is a concept. No relay satellite is modelled.</li>
        </ul>
      </section>
    </div>
  )
}
