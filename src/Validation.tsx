import { useEffect, useMemo, useState } from 'react'
import { btn, Panel } from './components'
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
  sites: { id: string; map: string; pixelM: number; sunPct: number; sunPctBest: number; earthPct: number; earthPctBest: number }[]
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

export default function Validation({
  data, horizons, explain, onToggleExplain,
}: {
  data: Map<string, SiteData>; horizons: Map<string, Horizon>; explain: boolean; onToggleExplain?: () => void
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [busySpot, setBusySpot] = useState(false)
  const [status, setStatus] = useState('')
  const [p69, setP69] = useState<P69 | null>(null)
  useEffect(() => { fetch('/data/crosscheck.json').then(r => (r.ok ? r.json() : null)).then(setP69, () => {}) }, [])

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

  const knownResults = known.map(([label, f]) => [label, f()] as const)
  const knownPassed = knownResults.filter(([, r]) => r === true).length
  const knownFailed = knownResults.some(([, r]) => r === false)
  const knownLoaded = knownResults.filter(([, r]) => r !== null).length

  // Our two-year averages at a 2 m mast, in the same terms as NASA's maps.
  const cross = useMemo(() => (p69?.sites ?? []).flatMap(s => {
    const d = data.get(s.id); if (!d) return []
    const hz = horizons.get(s.id)
    const smooth = longRun(d.ephem, sphereMask(2))
    return [{ ...s, name: d.site.name, terrain: !!hz, ...(hz ? longRun(d.ephem, hz.elevDeg) : smooth), smooth }]
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
    if (busySpot) return
    setBusySpot(true)
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
    } catch (e) { setStatus(e instanceof Error ? e.message : String(e)) }
    finally { setBusySpot(false) }
  }
  const dAz = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)
  const maxSpotDiff = rows.length > 0 ? Math.max(...rows.map(r => Math.max(dAz(r.ourAz, r.az), Math.abs(r.ourEl - r.el)))) : null
  const th = 'pb-2 pr-3 font-medium'

  return (
    <div className="mx-auto max-w-7xl space-y-3 p-3 sm:p-4">
      <header className="sticky top-0 z-20 -mx-3 border-b border-zinc-800/80 bg-[#090b10]/95 px-3 py-2.5 backdrop-blur sm:-mx-4 sm:px-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-extrabold tracking-tight text-white sm:text-xl">MoonSlip</h1>
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
              knownFailed
                ? 'bg-rose-950 text-rose-300 ring-1 ring-rose-700/70'
                : knownLoaded === known.length
                  ? 'bg-emerald-950 text-emerald-300 ring-1 ring-emerald-700/70'
                  : 'bg-zinc-900 text-zinc-300 ring-1 ring-zinc-700/70'
            }`}>
              {knownFailed ? 'CHECK FAILED' : knownLoaded === known.length ? `${knownPassed}/${known.length} VERIFIED` : `${knownLoaded}/${known.length} LOADED`}
            </span>
          </div>
          <span className="hidden text-xs text-zinc-400 xl:inline">Validation &amp; NASA Data · Independent Truth Cross-Check</span>

          <nav className="ml-auto flex flex-wrap items-center gap-1.5" aria-label="Workspace navigation">
            <a href="#" className={btn}>Mission Planner</a>
            <a href="#validation" className="rounded-md bg-zinc-200 px-2.5 py-1 text-xs font-semibold text-zinc-950">Validation &amp; NASA Data</a>
            {onToggleExplain && (
              <div className="inline-flex rounded-md border border-zinc-700/80 bg-zinc-900 p-0.5 text-xs" role="group" aria-label="Audience mode">
                <button onClick={() => explain && onToggleExplain()} aria-pressed={!explain}
                  className={`rounded px-2 py-0.5 font-medium transition-colors ${!explain ? 'bg-zinc-200 text-zinc-950' : 'text-zinc-300 hover:text-white'}`}>
                  Planner
                </button>
                <button onClick={() => !explain && onToggleExplain()} aria-pressed={explain}
                  className={`rounded px-2 py-0.5 font-medium transition-colors ${explain ? 'bg-sky-400 text-zinc-950' : 'text-zinc-300 hover:text-white'}`}>
                  Explain
                </button>
              </div>
            )}
          </nav>
        </div>
      </header>

      {explain && (
        <p className="rounded-xl border border-sky-900/70 bg-sky-950/30 px-3.5 py-2.5 text-sm leading-relaxed text-sky-200">
          We test the app against answers we already know, then against fresh numbers from NASA JPL Horizons, then against NASA&apos;s own long-term LOLA illumination maps.
        </p>
      )}

      {/* 4-card scientific verification strip */}
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-800/90 bg-zinc-900/70 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Known-Answer Checks</div>
          <div className={`mt-1 text-2xl font-extrabold tabular-nums ${knownFailed ? 'text-rose-300' : knownLoaded === known.length ? 'text-emerald-300' : 'text-zinc-200'}`}>
            {knownPassed}/{known.length} PASS
          </div>
          <div className="mt-1 text-xs text-zinc-400">Apollo 11 Earth lock · Far side 0% Earth · Polar tilt</div>
        </div>

        <div className="rounded-xl border border-zinc-800/90 bg-zinc-900/70 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Horizons Live Spot Check</div>
          <div className={`mt-1 text-2xl font-extrabold tabular-nums ${maxSpotDiff !== null ? (maxSpotDiff <= 0.05 ? 'text-emerald-300' : 'text-amber-300') : 'text-sky-300'}`}>
            {maxSpotDiff !== null ? `Δ ${maxSpotDiff.toFixed(3)}°` : 'Ready'}
          </div>
          <div className="mt-1 text-xs text-zinc-400">
            {rows.length > 0 ? `${rows.length}/6 live JPL Horizons vectors compared` : 'Click Run spot check below to verify live API'}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800/90 bg-zinc-900/70 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Product 69 Earth Match</div>
          <div className="mt-1 text-2xl font-extrabold tabular-nums text-emerald-300">
            {p69 && terr.length > 0 ? `≤ ${worst(terr, c => c.earthAnyPct - c.earthPct).toFixed(1)} pts` : 'Loading…'}
          </div>
          <div className="mt-1 text-xs text-zinc-400">
            {p69 ? `Max diff across ${terr.length} terrain sites vs 18.6-yr NASA map` : 'Loading PGDA Product 69 data…'}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800/90 bg-zinc-900/70 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Real LOLA DEM Horizons</div>
          <div className="mt-1 text-2xl font-extrabold tabular-nums text-amber-300">
            {horizons.size} sites
          </div>
          <div className="mt-1 text-xs text-zinc-400">PGDA Product 90 at 20 m, 30 m &amp; 60 m polar resolution</div>
        </div>
      </div>

      <Panel
        title="Known-answer tests (run live in your browser)"
        caption="Sanity checks on physics and geometry: Earth visibility on Apollo 11 and the far side, maximum polar solar elevation set by the Moon's 1.54° axial tilt, and zero sunlight inside an infinite wall."
        explain={explain}
        badge={
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
            knownFailed ? 'bg-rose-950 text-rose-300' : knownLoaded === known.length ? 'bg-emerald-950 text-emerald-300' : 'bg-zinc-800 text-zinc-300'
          }`}>
            {knownPassed}/{known.length} passing
          </span>
        }
      >
        <ul className="divide-y divide-zinc-800/80 text-sm">
          {knownResults.map(([label, r]) => (
            <li key={label} className="flex flex-wrap items-center gap-2.5 py-2 first:pt-0 last:pb-0">
              <span className={`w-16 shrink-0 rounded px-1.5 py-0.5 text-center font-mono text-[11px] font-bold ${
                r === true ? 'bg-emerald-950 text-emerald-300' : r === null ? 'bg-zinc-800 text-zinc-400' : 'bg-rose-950 text-rose-300'
              }`}>
                {r === true ? 'PASS' : r === null ? 'LOADING' : 'FAIL'}
              </span>
              <span className="text-zinc-200">{label}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        title="Horizons live spot check"
        caption="Asks NASA JPL Horizons live right now for three sites and timestamps, then compares Sun and Earth azimuth and elevation against the bundled ephemeris files."
        explain={explain}
        aside={
          <button onClick={run} disabled={busySpot} className={`${btn} ${busySpot ? 'cursor-wait opacity-60' : ''}`}>
            {busySpot ? 'Querying Horizons…' : rows.length > 0 ? 'Re-run spot check' : 'Run spot check'}
          </button>
        }
      >
        <p className="mb-2 text-xs text-zinc-400">Asks JPL Horizons again, live, and compares with the precomputed files the app uses.</p>
        {status && <p className="mb-2 text-xs text-amber-300" role="status">{status}</p>}
        {rows.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[580px] text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-xs text-zinc-400">
                    <th className={th}>Site</th>
                    <th className={th}>UTC</th>
                    <th className={th}>Body</th>
                    <th className={th}>Ours az / el</th>
                    <th className={th}>Horizons az / el</th>
                    <th className={th}>Diff</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {rows.map((r, k) => {
                    const err = Math.max(dAz(r.ourAz, r.az), Math.abs(r.ourEl - r.el))
                    return (
                      <tr key={k} className="border-t border-zinc-800/80">
                        <td className="py-1.5 pr-3">
                          <a className="text-sky-400 underline hover:text-sky-300" href={quickmapUrl(r.lat, r.lonE)} target="_blank" rel="noreferrer noopener">{r.site}</a>
                        </td>
                        <td className="py-1.5 pr-3 font-mono text-xs text-zinc-300">{r.time}</td>
                        <td className="py-1.5 pr-3 text-zinc-200">{r.body}</td>
                        <td className="py-1.5 pr-3 font-mono text-xs text-zinc-300">{r.ourAz.toFixed(2)}° / {r.ourEl.toFixed(2)}°</td>
                        <td className="py-1.5 pr-3 font-mono text-xs text-zinc-300">{r.az.toFixed(2)}° / {r.el.toFixed(2)}°</td>
                        <td className={`py-1.5 font-mono text-xs font-semibold ${err <= 0.05 ? 'text-emerald-400' : 'text-amber-300'}`}>{err.toFixed(3)}°</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-zinc-500">Each site name opens that spot in LROC QuickMap, where you can compare the shadows in real images.</p>
          </>
        )}
      </Panel>

      <Panel
        title="Cross-check against NASA's illumination maps (PGDA Product 69)"
        caption="Compares our 2027–2028 terrain-masked averages with NASA's independent 18.6-year LOLA illumination map (Mazarico et al. 2011). Comparing 'Ours' with 'Ours, no terrain' shows how much real topography matters."
        explain={explain}
        badge={p69 ? <span className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300 tabular-nums">{p69.averagedOverYears}-yr baseline</span> : undefined}
      >
        <p className="mb-3 text-xs leading-relaxed text-zinc-400">
          NASA&apos;s LOLA team published maps of average sunlight and Earth visibility at the lunar poles (<a className="text-sky-400 underline hover:text-sky-300" href="https://pgda.gsfc.nasa.gov/products/69" target="_blank" rel="noreferrer noopener">PGDA Product 69</a>).
          They are independent of this app: a different horizon method, on an earlier elevation map. Below, their value at each site next to ours.
        </p>
        {p69 && cross.length === p69.sites.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-xs text-zinc-400">
                    <th className={th} rowSpan={2}>Site</th>
                    <th className={th} rowSpan={2}>Our horizon</th>
                    <th className={`${th} border-l border-zinc-800 pl-3`} colSpan={5}>Sunlight, % of full Sun</th>
                    <th className={`${th} border-l border-zinc-800 pl-3`} colSpan={4}>Earth in view, % of time</th>
                  </tr>
                  <tr className="border-b border-zinc-800 text-left text-xs text-zinc-400">
                    <th className={`${th} border-l border-zinc-800 pl-3`}>NASA, at point</th>
                    <th className={th}>NASA, best ≤{p69.bestWithinM} m</th>
                    <th className={th}>Ours</th>
                    <th className={th}>Diff</th>
                    <th className={th}>No terrain</th>
                    <th className={`${th} border-l border-zinc-800 pl-3`}>NASA</th>
                    <th className={th}>Ours</th>
                    <th className={th}>Diff</th>
                    <th className={th}>No terrain</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {cross.map(c => {
                    const sd = sunD(c)
                    const ed = c.earthAnyPct - c.earthPct
                    return (
                      <tr key={c.id} className="border-t border-zinc-800/80 hover:bg-zinc-800/30">
                        <td className="py-1.5 pr-3 font-medium text-zinc-200">{c.name}</td>
                        <td className="py-1.5 pr-3">
                          <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${c.terrain ? 'bg-emerald-950 text-emerald-300' : 'bg-amber-950 text-amber-300'}`}>
                            {c.terrain ? 'LOLA terrain' : 'smooth Moon'}
                          </span>
                        </td>
                        <td className="border-l border-zinc-800/70 py-1.5 pl-3 pr-3 font-mono text-xs">{c.sunPct.toFixed(1)}</td>
                        <td className="py-1.5 pr-3 font-mono text-xs text-zinc-300">{c.sunPctBest.toFixed(1)}</td>
                        <td className="py-1.5 pr-3 font-mono text-xs font-semibold text-amber-200">{c.sunDiscPct.toFixed(1)}</td>
                        <td className={`py-1.5 pr-3 font-mono text-xs ${Math.abs(sd) <= CLOSE ? 'text-emerald-400' : 'text-amber-300'}`}>{diff(sd)}</td>
                        <td className="py-1.5 pr-3 font-mono text-xs text-zinc-500">{c.smooth.sunDiscPct.toFixed(1)}</td>
                        <td className="border-l border-zinc-800/70 py-1.5 pl-3 pr-3 font-mono text-xs">{c.earthPct.toFixed(1)}</td>
                        <td className="py-1.5 pr-3 font-mono text-xs font-semibold text-sky-200">{c.earthAnyPct.toFixed(1)}</td>
                        <td className={`py-1.5 pr-3 font-mono text-xs ${Math.abs(ed) <= CLOSE ? 'text-emerald-400' : 'text-amber-300'}`}>{diff(ed)}</td>
                        <td className="py-1.5 pr-3 font-mono text-xs text-zinc-500">{c.smooth.earthAnyPct.toFixed(1)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-zinc-500">Diff is ours minus NASA&apos;s value at our point. &ldquo;No terrain&rdquo; is what we would show on a smooth Moon.</p>
            <div className="mt-3 space-y-2 rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3 text-sm text-zinc-300">
              <p>
                Across the {terr.length} sites where we apply terrain: Earth visibility differs from NASA&apos;s by at most <b className="text-white">{worst(terr, c => c.earthAnyPct - c.earthPct).toFixed(1)} points</b>.
                {' '}Sunlight is within <b className="text-white">{worst(near, sunD).toFixed(1)} points</b> at {near.length} of the {terr.length}.
              </p>
              {ridges.length > 0 && (
                <p>
                  The {ridges.length === 1 ? 'exception is' : 'exceptions are'} {ridges.map(c => c.name).join(' and ')}, where we stand on a narrow crest or summit.
                  {' '}NASA&apos;s own map changes steeply there: {ridges.map(c => `at ${c.name} from ${c.sunPct.toFixed(0)}% under our point to ${c.sunPctBest.toFixed(0)}% within ${p69.bestWithinM} m, against our ${c.sunDiscPct.toFixed(0)}%`).join('; ')}.
                  {' '}A lander a few hundred metres off the crest can lose half its sunlight, which is why the exact spot matters.
                </p>
              )}
              {terr.length > 0 && sunGain.g > 1 && earthGain.g > 1 && (
                <p>
                  Terrain is what makes the numbers agree. On a smooth Moon, {sunGain.c.name} would read {sunGain.c.smooth.sunDiscPct.toFixed(0)}% sunlight; with LOLA terrain it reads {sunGain.c.sunDiscPct.toFixed(0)}%, and NASA&apos;s map says {sunGain.c.sunPct.toFixed(0)}%.
                  {' '}{earthGain.c.name} would see Earth {earthGain.c.smooth.earthAnyPct.toFixed(0)}% of the time; with terrain it is {earthGain.c.earthAnyPct.toFixed(0)}%, and NASA&apos;s map says {earthGain.c.earthPct.toFixed(0)}%.
                </p>
              )}
              <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-zinc-400">
                <li>The numbers should be close, not equal. NASA averages {p69.averagedOverYears} years; we average 2027–2028. NASA&apos;s value is for a map pixel 60 to 240 m wide, at ground level; ours is for one point, 2 m above the ground.</li>
                <li>At Artemis regions we stand on the highest point within 1 km of the listed centre. NASA&apos;s map and ours come from different elevation models, so the crest can sit a pixel or two apart in the two.</li>
                {cross.some(c => !c.terrain) && <li>Sites marked &ldquo;smooth Moon&rdquo; ignore terrain in our numbers. The gap to NASA&apos;s value there is the error from leaving terrain out.</li>}
                <li>&ldquo;Sunlight&rdquo; here is the share of the Sun&apos;s disc above the horizon, averaged over time, which is how NASA&apos;s map counts it. The planner&apos;s &ldquo;sunlit %&rdquo; counts any part of the Sun in view, so it reads a little higher.</li>
              </ul>
            </div>
          </>
        ) : <p className="text-sm text-zinc-500">Loading…</p>}
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel
          title="NASA & partner data sources"
          caption="Every number in MoonSlip comes directly from NASA JPL Horizons, NASA LRO LOLA elevation and illumination products, LROC QuickMap, and official landing site coordinates."
          explain={explain}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-400">
                  <th className={th}>Source</th>
                  <th className={th}>What it does in MoonSlip</th>
                </tr>
              </thead>
              <tbody>
                {SOURCES.map(([name, role, url]) => (
                  <tr key={name} className="border-t border-zinc-800/80 align-top">
                    <td className="py-2 pr-3">
                      <a className="font-medium text-sky-400 underline hover:text-sky-300" href={url} target="_blank" rel="noreferrer noopener">{name}</a>
                    </td>
                    <td className="py-2 text-xs leading-relaxed text-zinc-300">{role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          title="Method and limits"
          caption="Exact assumptions used in our calculations so engineers know where terrain interpolation, pixel spacing, or thermal/power proxies apply."
          explain={explain}
        >
          <ul className="list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-zinc-300">
            <li>Sun and Earth azimuth and elevation come from JPL Horizons (targets 10 and 399, observer on the Moon, airless), hourly for 2027–2028. Earth libration is included because the positions are real ephemerides, not a circular model.</li>
            <li>A body counts as visible when its upper limb clears the horizon (Sun about 0.53°, Earth about 1.9° wide).</li>
            <li>Without terrain, the horizon is a smooth sphere: dip = −acos(R / (R + mast)), R = 1737.4 km. A 2 m mast sees −0.09°.</li>
            <li>Sites marked &ldquo;LOLA terrain&rdquo; use a 360° horizon computed from NASA&apos;s LOLA south polar elevation maps (PGDA Product 90): the 20 m map south of 80.5° S, the 30 m map for IM-1 Odysseus and the 60 m map for Chandrayaan-3. Full resolution out to 20 km, then pixels of 120 to 160 m out to 150 km or the edge of the map. Curvature is in the 3D geometry.</li>
            <li>Terrain closer than 5 pixels (100 m on the 20 m map) is ignored as noise. A nearby pixel wide enough to span several degrees blocks every direction it spans.</li>
            <li>Terrain horizons are computed for masts of 2, 5, 10 and 20 m and interpolated between them. Below 2 m or above 20 m the nearest one is used.</li>
            <li>Artemis entries are regions about 15 km across. Their mask is taken from the region&apos;s high point within 1 km of the listed centre, where a lander would most likely be placed.</li>
            <li>Apollo 11 and custom coordinates are marked &ldquo;terrain not applied&rdquo;: they ignore ridges and craters. Real sunlight at a custom polar point can be lower, and the &ldquo;no terrain&rdquo; columns above show by how much.</li>
            <li>Power is a geometric proxy averaged over the mission: 1361 W/m² × visible solar disc fraction × sin(elevation) for a horizontal panel, or × cos(elevation) for a vertical panel turned to the Sun. No battery, no conversion losses.</li>
            <li>Hourly samples; window edges are interpolated between samples.</li>
            <li>The relay card is a concept. No relay satellite is modelled.</li>
          </ul>
        </Panel>
      </div>
    </div>
  )
}
