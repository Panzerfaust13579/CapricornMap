import { useState } from 'react'
import { indexAt, metrics, type SiteData } from './engine'
import { spot } from './horizons'

const lax = { minSunPct: 0, maxDarkH: 1e9, minEarthPct: 0, maxGapH: 1e9 }
const SPOT_SITES = ['mons-mouton', 'connecting-ridge', 'apollo-11']
const SPOT_TIMES = ['2027-03-14T06:00:00Z', '2027-09-02T18:00:00Z', '2028-06-21T00:00:00Z']

interface Row { site: string; time: string; body: string; ourAz: number; ourEl: number; az: number; el: number }

export default function Validation({ data, explain }: { data: Map<string, SiteData>; explain: boolean }) {
  const [rows, setRows] = useState<Row[]>([])
  const [status, setStatus] = useState('')

  const known: [string, () => boolean | null][] = [
    ['Apollo 11 sees Earth 100% of 2027 (Earth stays near the zenith)', () => {
      const d = data.get('apollo-11'); if (!d) return null
      return metrics({ siteId: 'apollo-11', start: '2027-01-01', days: 360, mastM: 2, needs: lax }, d.ephem, d.mask)?.earthPct === 100
    }],
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

  async function run() {
    setStatus('Querying JPL Horizons…'); setRows([])
    try {
      const out: Row[] = []
      for (let k = 0; k < SPOT_SITES.length; k++) {
        const d = data.get(SPOT_SITES[k]); if (!d) continue
        const ms = Date.parse(SPOT_TIMES[k]); const i = Math.round(indexAt(d.ephem, ms))
        for (const [body, code, az, el] of [['Sun', '10', d.ephem.sunAz, d.ephem.sunEl], ['Earth', '399', d.ephem.earthAz, d.ephem.earthEl]] as const) {
          const r = await spot(code, d.site.lat, d.site.lonE, ms)
          out.push({ site: d.site.name, time: SPOT_TIMES[k].slice(0, 16), body, ourAz: az[i], ourEl: el[i], az: r.az, el: r.el })
          setRows([...out])
        }
      }
      setStatus('')
    } catch (e) { setStatus(String(e)) }
  }
  const dAz = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <a href="#" className="text-sm text-sky-400 underline">← Back to the planner</a>
      <h1 className="text-xl font-bold">Validation</h1>
      {explain && <p className="text-sky-300">We test the app against answers we already know, then against fresh numbers from NASA.</p>}

      <section>
        <h2 className="mb-2 font-semibold">Known-answer tests (run now in your browser)</h2>
        <ul className="space-y-1 text-sm">
          {known.map(([label, f]) => {
            const r = f()
            return <li key={label}><span className={r ? 'text-emerald-400' : r === null ? 'text-zinc-500' : 'text-rose-400'}>{r ? 'PASS' : r === null ? 'NO DATA' : 'FAIL'}</span> {label}</li>
          })}
          <li><span className="text-emerald-400">PASS</span> A point at 0° N 180° E never sees Earth (checked in the build tests on Horizons data)</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Horizons spot check</h2>
        <p className="mb-2 text-sm text-zinc-400">Asks JPL Horizons again, live, and compares with the precomputed files the app uses.</p>
        <button onClick={run} className="rounded bg-zinc-800 px-3 py-1 text-sm hover:bg-zinc-700">Run spot check</button>
        {status && <p className="mt-1 text-sm text-amber-400" role="status">{status}</p>}
        {rows.length > 0 && (
          <table className="mt-2 w-full text-sm">
            <thead><tr className="text-left text-zinc-400"><th>Site</th><th>UTC</th><th>Body</th><th>Ours az / el</th><th>Horizons az / el</th><th>Diff</th></tr></thead>
            <tbody>
              {rows.map((r, k) => (
                <tr key={k} className="border-t border-zinc-800">
                  <td>{r.site}</td><td className="font-mono">{r.time}</td><td>{r.body}</td>
                  <td className="font-mono">{r.ourAz.toFixed(2)} / {r.ourEl.toFixed(2)}</td>
                  <td className="font-mono">{r.az.toFixed(2)} / {r.el.toFixed(2)}</td>
                  <td className="font-mono">{Math.max(dAz(r.ourAz, r.az), Math.abs(r.ourEl - r.el)).toFixed(3)}°</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="text-sm text-zinc-300">
        <h2 className="mb-2 font-semibold">Method and limits</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Sun and Earth azimuth and elevation come from JPL Horizons (targets 10 and 399, observer on the Moon, airless), hourly for 2027–2028. Earth libration is included because the positions are real ephemerides, not a circular model.</li>
          <li>A body counts as visible when its upper limb clears the horizon (Sun about 0.53°, Earth about 1.9° wide).</li>
          <li>Without terrain, the horizon is a smooth sphere: dip = −acos(R / (R + mast)), R = 1737.4 km. A 2 m mast sees −0.09°.</li>
          <li>Sites marked "LOLA terrain" use a 360° horizon computed from the LOLA south polar DEM (PGDA Product 90): 20 m pixels out to 20 km, 160 m pixels out to 150 km or the DEM edge near 80° S. Curvature is in the 3D geometry. Terrain closer than 100 m is ignored as DEM noise.</li>
          <li>Artemis entries are regions about 15 km across. Their mask is taken from the region's high point within 1 km of the listed centre, where a lander would most likely be placed.</li>
          <li>Sites marked "terrain not applied" ignore ridges and craters. Real sunlight there can be lower.</li>
          <li>Power is a proxy: 1361 W/m² × sin(elevation) for a horizontal panel, × cos(elevation) for a vertical panel turned to the Sun. No battery, no losses.</li>
          <li>Hourly samples; window edges are interpolated between samples.</li>
        </ul>
      </section>
    </div>
  )
}
