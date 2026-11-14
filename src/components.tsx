import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { indexAt, margins, maskAt, windows, type Body, type Ephem, type Metrics, type PlanBOption } from './engine'

export const h = (x: number | null) => (x === null ? '—' : x >= 48 ? `${(x / 24).toFixed(1)} d` : `${x.toFixed(0)} h`)
export const pct = (x: number) => `${x.toFixed(0)}%`
export const slipLabel = (d: number) => `${d >= 0 ? '+' : '−'}${Math.abs(d)} d`
export const btn = 'rounded bg-zinc-800 px-3 py-1 text-sm hover:bg-zinc-700'

export function Panel({ title, caption, explain, children, aside }: { title: string; caption: string; explain: boolean; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{title}</h2>
        {aside}
      </div>
      {children}
      {explain && <p className="mt-2 text-sm text-sky-300">{caption}</p>}
    </section>
  )
}

/** Marks anything that is an idea shown on screen, not a computed result. */
export const Concept = () => <span className="rounded border border-violet-500/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-300">Concept</span>

/** Width of an element in CSS pixels, so charts can keep their labels readable on a phone. */
export function useWidth<T extends Element>(fallback = 720) {
  const ref = useRef<T>(null)
  const [w, setW] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver !== 'function') return
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/** Hours until the body next sets or rises, looking up to 30 days ahead from sample i. */
export function countdown(e: Ephem, mask: number[], body: Body, i: number) {
  const i1 = Math.min(e.sunEl.length - 1, i + Math.round((720 * 60) / e.stepMin))
  const runs = windows(margins(e, mask, body, i, i1), e.stepMin)
  return { up: runs[0].visible, inH: runs.length > 1 ? runs[0].endH : null }
}

const W = 720, PAD = 24
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export function SkyRibbon({ e, mask, dip, startMs, hours, scrubH, setScrubH, terrain, children }: {
  e: Ephem; mask: number[]; dip: number; startMs: number; hours: number; scrubH: number; setScrubH: (h: number) => void; terrain: string; children?: ReactNode
}) {
  const [playing, setPlaying] = useState(false)
  const [box, width] = useWidth<HTMLDivElement>()
  // The drawing is 720 units wide whatever the screen. On a narrow screen, grow the text and the height to stay readable.
  const k = Math.max(1, Math.min(2.1, W / width)), H = width < 520 ? 400 : 260
  const PL = 26 * k, PB = 12 + 11 * k
  useEffect(() => {
    if (!playing) return
    // Reduced motion: one jump of a day at a time instead of a smooth sweep.
    const [step, every] = reducedMotion() ? [24, 700] : [3, 40]
    const t = setInterval(() => setScrubH(scrubH + step > hours ? 0 : scrubH + step), every)
    return () => clearInterval(t)
  }, [playing, scrubH, hours, setScrubH])

  const i0 = Math.round(indexAt(e, startMs))
  const i1 = Math.min(e.sunEl.length - 1, i0 + Math.round((hours * 60) / e.stepMin))
  if (i0 < 0 || i0 >= e.sunEl.length) return <p className="text-sm text-amber-400">No ephemeris for this date. Data covers 2027–2028.</p>
  const iNow = Math.min(i1, i0 + Math.round((scrubH * 60) / e.stepMin))

  const tracks = (az: number[], el: number[]) => az.slice(i0, i1 + 1).map((a, k) => [a, el[i0 + k]] as const)
  const sun = tracks(e.sunAz, e.sunEl), earth = tracks(e.earthAz, e.earthEl)
  const els = [...sun, ...earth].map(p => p[1]).concat(mask)
  const yMin = Math.max(-10, Math.min(...mask, dip) - 2)
  const yMax = Math.min(90, Math.max(...els) + 1.5)
  const x = (az: number) => PL + (az / 360) * (W - PL - PAD)
  const y = (el: number) => H - PB - ((el - yMin) / (yMax - yMin)) * (H - PB - PAD)
  const kx = (W - PL - PAD) / 360, ky = (H - PB - PAD) / (yMax - yMin)

  // Split a track where azimuth wraps through north so lines don't cross the whole ribbon.
  const path = (pts: readonly (readonly [number, number])[]) =>
    pts.map(([a, el], k) => `${k && Math.abs(a - pts[k - 1][0]) < 180 ? 'L' : 'M'}${x(a).toFixed(1)},${y(el).toFixed(1)}`).join('')
  const ground = `M${x(0)},${H - PB}` + mask.map((m, a) => `L${x(a)},${y(m)}`).join('') + `L${x(360)},${y(mask[0])}L${x(360)},${H - PB}Z`
  const ticks = Array.from({ length: 6 }, (_, k) => yMin + ((yMax - yMin) * k) / 5)
  const disc = (az: number, el: number, d: number, fill: string, label: string) => (
    <g>
      <ellipse cx={x(az)} cy={y(el)} rx={Math.max(2, (d / 2) * kx)} ry={Math.max(2, (d / 2) * ky)} fill={fill} />
      <text x={x(az) + 8} y={y(el) - 8} fontSize={11 * k} fill={fill}>{label}</text>
    </g>
  )
  const when = new Date(Date.parse(e.t0) + iNow * e.stepMin * 60000).toISOString().slice(0, 16).replace('T', ' ')
  // Where each body stands now: centre height, and how far its top edge clears the horizon in its direction.
  const stand = (name: string, az: number, el: number, d: number) => {
    const m = el + d / 2 - maskAt(mask, az)
    return <span><b className="font-semibold text-zinc-200">{name} elevation {el.toFixed(2).replace('-', '−')}°</b>, top edge {Math.abs(m).toFixed(2)}° {m > 0 ? 'above' : 'below'} the horizon{m > 0 ? '' : ' (hidden)'}</span>
  }

  return (
    <div ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg bg-[#05070c]" role="img"
        aria-label={`Sky ribbon: Sun at elevation ${e.sunEl[iNow].toFixed(1)} degrees, Earth at ${e.earthEl[iNow].toFixed(1)} degrees, against the ${terrain} horizon`}>
        <defs><clipPath id="sky"><rect x={PL} y={PAD} width={W - PL - PAD} height={H - PB - PAD} /></clipPath></defs>
        {ticks.map(t => (
          <g key={t}>
            <line x1={PL} x2={W - PAD} y1={y(t)} y2={y(t)} stroke="#1f2430" />
            <text x={PL - 4} y={y(t) + 3 * k} fontSize={9 * k} fill="#8b8b93" textAnchor="end">{t.toFixed(1)}°</text>
          </g>
        ))}
        {[0, 90, 180, 270, 360].map((a, i) => (
          <text key={a} x={x(a)} y={H - 6} fontSize={10 * k} fill="#a1a1aa" textAnchor="middle">{'NESWN'[i]}</text>
        ))}
        <g clipPath="url(#sky)">
          <path d={path(sun)} stroke="#facc15" strokeOpacity="0.5" fill="none" />
          <path d={path(earth)} stroke="#60a5fa" strokeOpacity="0.5" fill="none" />
          {disc(e.sunAz[iNow], e.sunEl[iNow], e.sunDiamDeg, '#facc15', 'Sun')}
          {disc(e.earthAz[iNow], e.earthEl[iNow], e.earthDiamDeg, '#60a5fa', 'Earth')}
          <path d={ground} fill="#3f3f46" />
          <line x1={PL} x2={W - PAD} y1={y(dip)} y2={y(dip)} stroke="#a1a1aa" strokeDasharray="4 4" />
        </g>
      </svg>
      {children}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <button onClick={() => setPlaying(!playing)} className={btn + ' whitespace-nowrap'} aria-pressed={playing}>
          {playing ? 'Pause' : 'Play lunar day'}
        </button>
        <input type="range" min={0} max={hours} value={scrubH} onChange={ev => setScrubH(+ev.target.value)} className="min-w-0 flex-1" aria-label="Time since landing" />
        <span className="basis-full text-right font-mono text-xs text-zinc-400 sm:basis-auto">{when} UTC</span>
      </div>
      <p className="mt-1 flex flex-wrap gap-x-4 text-xs text-zinc-400" aria-live="off">
        {stand('Sun', e.sunAz[iNow], e.sunEl[iNow], e.sunDiamDeg)}
        {stand('Earth', e.earthAz[iNow], e.earthEl[iNow], e.earthDiamDeg)}
      </p>
      <p className="mt-1 text-xs text-zinc-500">Grey: {terrain} horizon. Dashed: smooth-Moon horizon. Discs drawn to scale.</p>
    </div>
  )
}

export type Chip = { up: boolean; inH: number | null }

export interface Rescue { option: PlanBOption; lead: string }

export function VerdictStrip({ m, sun, earth, rescue, onCompare, onUse }: {
  m: Metrics; sun: Chip; earth: Chip
  /** The best way out, shown when the plan fails. */
  rescue?: Rescue | null; onCompare?: (o: PlanBOption) => void; onUse?: (o: PlanBOption) => void
}) {
  const go = m.verdict === 'GO'
  const chip = (c: Chip, set: string, rise: string) => (
    <span className="rounded-full bg-zinc-800 px-3 py-1 text-sm">
      {c.inH === null ? (c.up ? `${set} not within 30 d` : `${rise} not within 30 d`) : `${c.up ? set : rise} in ${h(c.inH)}`}
    </span>
  )
  const best = rescue?.option
  return (
    <div className={`rounded-xl border p-3 ${go ? 'border-emerald-600 bg-emerald-950/40' : 'border-rose-600 bg-rose-950/40'}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`text-3xl font-black ${go ? 'text-emerald-400' : 'text-rose-400'}`}>{m.verdict}</span>
        <span className="min-w-0 basis-full text-sm text-zinc-300 sm:basis-0 sm:flex-1">{go ? 'All needs met for the mission window.' : m.failed.join('; ')}</span>
        {chip(sun, 'Sunset', 'Sunrise')}
        {chip(earth, 'Earthset', 'Earthrise')}
      </div>
      {!go && best && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-rose-900 pt-3 text-sm">
          <span className="min-w-0 flex-1 basis-64">
            <span className="text-zinc-400">{rescue.lead} </span>
            <b className="font-semibold">{best.kind === 'date' ? `land ${best.start} (${slipLabel(best.slipDays)})` : `${best.siteName}, ${best.start}`}</b>
            <span className={best.m.verdict === 'GO' ? ' text-emerald-400' : ' text-rose-400'}> {best.m.verdict}</span>
            <span className="text-zinc-300">. {best.sentence[0].toUpperCase() + best.sentence.slice(1)}.</span>
          </span>
          <span className="flex gap-2">
            <button className={btn} onClick={() => onCompare?.(best)}>Compare</button>
            <button className="rounded bg-emerald-700 px-3 py-1 text-sm font-semibold hover:bg-emerald-600" onClick={() => onUse?.(best)}>Use this plan</button>
          </span>
        </div>
      )}
    </div>
  )
}

const ROWS: [string, (m: Metrics) => number, (x: number) => string][] = [
  ['Sunlit', m => m.sunPct, pct],
  ['Longest night', m => m.longestDarkH, h],
  ['Earth visible', m => m.earthPct, pct],
  ['Earth contact', m => m.earthH, h],
  ['Longest comms gap', m => m.longestCommsGapH, h],
  ['Horizontal panel, mean W/m²', m => m.meanHorizWm2, x => x.toFixed(0)],
  ['Vertical panel, mean W/m²', m => m.meanVertWm2, x => x.toFixed(0)],
]

export function Comparator({ a, b, la, lb, onUse }: { a: Metrics | null; b: Metrics | null; la: string; lb: string; onUse?: () => void }) {
  return (
    <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-sm">
      <thead>
        <tr className="text-left text-zinc-400">
          <th className="font-normal" />
          <th className="font-normal">{la}</th>
          <th className="font-normal">{lb}</th>
          <th className="font-normal">B − A</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="text-zinc-400">Verdict</td>
          {[a, b].map((m, k) => <td key={k} className={m?.verdict === 'GO' ? 'text-emerald-400' : 'text-rose-400'}>{m?.verdict ?? 'no data'}</td>)}
          <td>{onUse && b && <button className="rounded bg-emerald-700 px-2 py-0.5 text-xs font-semibold hover:bg-emerald-600" onClick={onUse}>Use plan B</button>}</td>
        </tr>
        {ROWS.map(([label, f, fmt]) => (
          <tr key={label} className="border-t border-zinc-800">
            <td className="py-1 text-zinc-400">{label}</td>
            <td>{a ? fmt(f(a)) : '—'}</td>
            <td>{b ? fmt(f(b)) : '—'}</td>
            <td className="font-mono">{a && b ? `${f(b) - f(a) >= 0 ? '+' : '−'}${fmt(Math.abs(f(b) - f(a)))}` : ''}</td>
          </tr>
        ))}
      </tbody>
    </table></div>
  )
}

export function PlanBPanel({ options, onPick }: { options: PlanBOption[]; onPick: (o: PlanBOption) => void }) {
  const [all, setAll] = useState(false)
  const shown = all ? options : options.slice(0, 6)
  if (!options.length) return <p className="text-sm text-zinc-500">No other option in reach. Try the calendar below for later dates.</p>
  return (
    <div>
      <ol className="grid gap-2 sm:grid-cols-2">
        {shown.map((o, k) => (
          <li key={o.siteId + o.start}>
            <button onClick={() => onPick(o)} className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-left hover:border-zinc-500">
              <div className="flex justify-between gap-2 text-sm">
                <span>#{k + 1} {o.siteName}</span>
                <span className={o.m.verdict === 'GO' ? 'text-emerald-400' : 'text-rose-400'}>{o.m.verdict}</span>
              </div>
              <div className="text-xs text-zinc-400">
                <span className="mr-1 rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">{o.kind === 'date' ? 'new date' : 'new site'}</span>
                {o.start} · slip {slipLabel(o.slipDays)} · {pct(o.m.sunPct)} sun, {pct(o.m.earthPct)} Earth
              </div>
              <div className="text-sm text-zinc-200">{o.sentence}</div>
            </button>
          </li>
        ))}
      </ol>
      {options.length > 6 && (
        <button onClick={() => setAll(!all)} className="mt-2 text-sm text-sky-400 underline">{all ? 'Show top 6' : `Show all ${options.length}`}</button>
      )}
    </div>
  )
}
