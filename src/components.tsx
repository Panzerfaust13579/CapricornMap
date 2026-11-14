import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { indexAt, margins, maskAt, windows, type Body, type Ephem, type Metrics, type Needs, type PlanBOption } from './engine'

export const h = (x: number | null) => (x === null ? '—' : x >= 48 ? `${(x / 24).toFixed(1)} d` : `${x.toFixed(0)} h`)
export const pct = (x: number) => `${x.toFixed(0)}%`
export const slipLabel = (d: number) => `${d >= 0 ? '+' : '−'}${Math.abs(d)} d`
export const btn = 'rounded-md border border-zinc-700/80 bg-zinc-800/90 px-2.5 py-1 text-xs font-medium text-zinc-100 transition-colors hover:bg-zinc-700'

export function Panel({ title, caption, explain, children, aside, badge }: {
  title: string; caption: string; explain: boolean; children: ReactNode; aside?: ReactNode; badge?: ReactNode
}) {
  return (
    <section className="rounded-xl border border-zinc-800/90 bg-zinc-900/65 p-3.5 shadow-sm">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">{title}</h2>
          {badge}
        </div>
        {aside}
      </div>
      {children}
      {explain && (
        <p className="mt-2.5 rounded-lg border border-sky-900/70 bg-sky-950/35 px-2.5 py-1.5 text-xs leading-relaxed text-sky-200">
          {caption}
        </p>
      )}
    </section>
  )
}

/** Marks anything that is an idea shown on screen, not a computed result. */
export const Concept = () => (
  <span className="rounded border border-violet-500/60 bg-violet-950/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-300">
    Concept
  </span>
)

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
const COMPASS: [number, string, string][] = [
  [0, 'N 0°', 'N'], [45, 'NE', ''], [90, 'E 90°', 'E'], [135, 'SE', ''],
  [180, 'S 180°', 'S'], [225, 'SW', ''], [270, 'W 270°', 'W'], [315, 'NW', ''], [360, 'N 360°', 'N'],
]
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export function SkyRibbon({ e, mask, dip, startMs, hours, scrubH, setScrubH, terrain, maskB, labelB, children }: {
  e: Ephem; mask: number[]; dip: number; startMs: number; hours: number; scrubH: number; setScrubH: (h: number) => void
  terrain: string; maskB?: number[]; labelB?: string; children?: ReactNode
}) {
  const [playing, setPlaying] = useState(false)
  const [hoverAz, setHoverAz] = useState<number | null>(null)
  const [box, width] = useWidth<HTMLDivElement>()
  // The drawing is 720 units wide whatever the screen. On a narrow screen, grow the text and height to stay readable.
  const k = Math.max(1, Math.min(2.1, W / width)), H = width < 520 ? 390 : 265
  const PL = 28 * k, PB = 14 + 12 * k
  useEffect(() => {
    if (!playing) return
    const [step, every] = reducedMotion() ? [24, 700] : [3, 40]
    const t = setInterval(() => setScrubH(scrubH + step > hours ? 0 : scrubH + step), every)
    return () => clearInterval(t)
  }, [playing, scrubH, hours, setScrubH])

  const i0 = Math.round(indexAt(e, startMs))
  const i1 = Math.min(e.sunEl.length - 1, i0 + Math.round((hours * 60) / e.stepMin))
  if (i0 < 0 || i0 >= e.sunEl.length) return <p className="text-sm text-amber-400">No ephemeris for this date. Data covers 2027–2028.</p>
  const iNow = Math.min(i1, i0 + Math.round((scrubH * 60) / e.stepMin))

  const tracks = (az: number[], el: number[]) => az.slice(i0, i1 + 1).map((a, idx) => [a, el[i0 + idx]] as const)
  const sun = tracks(e.sunAz, e.sunEl), earth = tracks(e.earthAz, e.earthEl)
  const els = [...sun, ...earth].map(p => p[1]).concat(mask, maskB ?? [])
  const yMin = Math.max(-12, Math.min(...mask, ...(maskB ?? []), dip) - 2)
  const yMax = Math.min(90, Math.max(...els) + 1.5)
  const x = (az: number) => PL + (az / 360) * (W - PL - PAD)
  const y = (el: number) => H - PB - ((el - yMin) / (yMax - yMin)) * (H - PB - PAD)
  const kx = (W - PL - PAD) / 360, ky = (H - PB - PAD) / (yMax - yMin)

  // Split a track where azimuth wraps through north so lines don't cross the whole ribbon.
  const path = (pts: readonly (readonly [number, number])[]) =>
    pts.map(([a, el], idx) => `${idx && Math.abs(a - pts[idx - 1][0]) < 180 ? 'L' : 'M'}${x(a).toFixed(1)},${y(el).toFixed(1)}`).join('')
  const ridge = (m: number[]) => m.map((v, a) => `${a ? 'L' : 'M'}${x(a).toFixed(1)},${y(v).toFixed(1)}`).join('') + `L${x(360).toFixed(1)},${y(m[0]).toFixed(1)}`
  const ground = `M${x(0)},${H - PB}` + mask.map((v, a) => `L${x(a)},${y(v)}`).join('') + `L${x(360)},${y(mask[0])}L${x(360)},${H - PB}Z`
  const ticks = Array.from({ length: 6 }, (_, idx) => yMin + ((yMax - yMin) * idx) / 5)

  const disc = (az: number, el: number, d: number, fill: string) => (
    <ellipse cx={x(az)} cy={y(el)} rx={Math.max(2.2, (d / 2) * kx)} ry={Math.max(2.2, (d / 2) * ky)} fill={fill} />
  )
  const discLabel = (az: number, el: number, fill: string, label: string) => {
    const left = az > 325
    return (
      <text x={x(az) + (left ? -8 : 8)} y={Math.max(PAD + 11 * k, y(el) - 8)} fontSize={11 * k} fontWeight="600"
        fill={fill} stroke="#05070c" strokeWidth={3 * k} paintOrder="stroke" textAnchor={left ? 'end' : 'start'}>
        {label}
      </text>
    )
  }
  const toAz = (ev: PointerEvent<SVGSVGElement>) => {
    const r = ev.currentTarget.getBoundingClientRect()
    const az = ((((ev.clientX - r.left) / r.width) * W - PL) / (W - PL - PAD)) * 360
    return az >= 0 && az <= 360 ? az : null
  }
  const when = new Date(Date.parse(e.t0) + iNow * e.stepMin * 60000).toISOString().slice(0, 16).replace('T', ' ')
  const stand = (name: string, az: number, el: number, d: number, color: string) => {
    const m = el + d / 2 - maskAt(mask, az)
    return (
      <span>
        <b className={`font-semibold ${color}`}>{name} {el.toFixed(2).replace('-', '−')}°</b>
        {' '}· top {Math.abs(m).toFixed(2)}° {m > 0 ? 'above' : 'below'} horizon{m > 0 ? '' : ' (hidden)'}
      </span>
    )
  }
  const stepBy = (delta: number) => {
    setPlaying(false)
    setScrubH(Math.min(hours, Math.max(0, scrubH + delta)))
  }

  return (
    <div ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full cursor-crosshair rounded-lg border border-zinc-800/80 bg-[#05070c]" role="img"
        aria-label={`Sky ribbon: Sun at elevation ${e.sunEl[iNow].toFixed(1)} degrees, Earth at ${e.earthEl[iNow].toFixed(1)} degrees, against the ${terrain} horizon`}
        onPointerMove={ev => setHoverAz(toAz(ev))} onPointerLeave={() => setHoverAz(null)}>
        <defs><clipPath id="sky-ribbon-clip"><rect x={PL} y={PAD} width={W - PL - PAD} height={H - PB - PAD} /></clipPath></defs>
        {ticks.map(t => (
          <g key={t}>
            <line x1={PL} x2={W - PAD} y1={y(t)} y2={y(t)} stroke="#1b202c" />
            <text x={PL - 4} y={y(t) + 3 * k} fontSize={9 * k} fill="#8b8b93" textAnchor="end">{t.toFixed(1)}°</text>
          </g>
        ))}
        {COMPASS.map(([a, long, short]) => (
          <g key={a}>
            <line x1={x(a)} x2={x(a)} y1={PAD} y2={H - PB} stroke="#171b26" strokeDasharray={a % 90 ? '2 4' : undefined} />
            <text x={x(a)} y={H - 5} fontSize={(width < 520 ? 9.5 : 9) * k} fill={a % 90 ? '#71717a' : '#a1a1aa'} textAnchor="middle">
              {width < 520 ? short : long}
            </text>
          </g>
        ))}
        <g clipPath="url(#sky-ribbon-clip)">
          {yMin < 0 && yMax > 0 && <line x1={PL} x2={W - PAD} y1={y(0)} y2={y(0)} stroke="#2e3547" strokeWidth="1" />}
          <path d={path(sun)} stroke="#facc15" strokeOpacity="0.55" strokeWidth="1.5" fill="none" />
          <path d={path(earth)} stroke="#60a5fa" strokeOpacity="0.55" strokeWidth="1.5" fill="none" />
          {disc(e.sunAz[iNow], e.sunEl[iNow], e.sunDiamDeg, '#facc15')}
          {disc(e.earthAz[iNow], e.earthEl[iNow], e.earthDiamDeg, '#60a5fa')}
          <path d={ground} fill="#3f3f46" fillOpacity="0.84" stroke="#71717a" strokeWidth="1.2" />
          {maskB && <path d={ridge(maskB)} fill="none" stroke="#22d3ee" strokeWidth="1.5" strokeDasharray="5 3" strokeOpacity="0.85" />}
          <line x1={PL} x2={W - PAD} y1={y(dip)} y2={y(dip)} stroke="#a1a1aa" strokeDasharray="4 4" />
          {hoverAz !== null && <line x1={x(hoverAz)} x2={x(hoverAz)} y1={PAD} y2={H - PB} stroke="#38bdf8" strokeDasharray="3 3" strokeOpacity="0.7" />}
          {discLabel(e.sunAz[iNow], e.sunEl[iNow], '#facc15', 'Sun')}
          {discLabel(e.earthAz[iNow], e.earthEl[iNow], '#60a5fa', 'Earth')}
        </g>
      </svg>

      {children}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button onClick={() => stepBy(-24)} className={btn} title="Back 24 hours">−24h</button>
          <button onClick={() => stepBy(-1)} className={btn} title="Back 1 hour">−1h</button>
          <button onClick={() => setPlaying(!playing)}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${playing ? 'bg-amber-400 text-zinc-950' : 'bg-sky-500/20 text-sky-300 border border-sky-500/40 hover:bg-sky-500/30'}`}
            aria-pressed={playing}>
            {playing ? 'Pause' : 'Play lunar day'}
          </button>
          <button onClick={() => stepBy(1)} className={btn} title="Forward 1 hour">+1h</button>
          <button onClick={() => stepBy(24)} className={btn} title="Forward 24 hours">+24h</button>
        </div>
        <input type="range" min={0} max={hours} value={scrubH} onChange={ev => { setPlaying(false); setScrubH(+ev.target.value) }}
          className="min-w-[140px] flex-1" aria-label="Time since landing" />
        <span className="font-mono text-xs text-zinc-300 tabular-nums">{when} UTC</span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-zinc-400" aria-live="off">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {stand('Sun', e.sunAz[iNow], e.sunEl[iNow], e.sunDiamDeg, 'text-amber-300')}
          {stand('Earth', e.earthAz[iNow], e.earthEl[iNow], e.earthDiamDeg, 'text-sky-300')}
        </div>
        {hoverAz !== null && (
          <span className="font-mono text-sky-300 tabular-nums">
            Az {hoverAz.toFixed(1)}° · Terrain {maskAt(mask, hoverAz).toFixed(2)}°
            {maskB ? ` · Plan B ${maskAt(maskB, hoverAz).toFixed(2)}°` : ''}
          </span>
        )}
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">
        Grey fill: {terrain} horizon · White dashed: smooth sphere ({dip.toFixed(2)}°)
        {maskB ? ` · Cyan dashed: ${labelB ?? 'Plan B'} horizon` : ''}. Discs drawn to scale (Sun 0.53°, Earth 1.9°).
      </p>
    </div>
  )
}

export type Chip = { up: boolean; inH: number | null }
export interface Rescue { option: PlanBOption; lead: string }

function KpiCard({ label, value, target, pass, ratio }: {
  label: string; value: string; target: string; pass: boolean; ratio: number
}) {
  const clamped = Math.max(0, Math.min(100, ratio * 100))
  return (
    <div className={`rounded-lg border px-2.5 py-2 ${pass ? 'border-zinc-800 bg-zinc-950/70' : 'border-rose-800/70 bg-rose-950/25'}`}>
      <div className="flex items-center justify-between gap-1 text-[11px] text-zinc-400">
        <span>{label}</span>
        <span className={`font-semibold ${pass ? 'text-emerald-400' : 'text-rose-400'}`}>{pass ? 'OK' : 'FAIL'}</span>
      </div>
      <div className="mt-0.5 text-lg font-bold tracking-tight text-zinc-100 tabular-nums">{value}</div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-zinc-800">
        <div className={`h-full rounded-full ${pass ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${clamped}%` }} />
      </div>
      <div className="mt-1 text-[11px] text-zinc-500">{target}</div>
    </div>
  )
}

export function VerdictStrip({ m, needs, sun, earth, rescue, onCompare, onUse }: {
  m: Metrics; needs?: Needs; sun: Chip; earth: Chip
  /** The best way out, shown when the plan fails. */
  rescue?: Rescue | null; onCompare?: (o: PlanBOption) => void; onUse?: (o: PlanBOption) => void
}) {
  const go = m.verdict === 'GO'
  const chip = (c: Chip, set: string, rise: string, tone: string) => (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums ${tone}`}>
      {c.inH === null ? (c.up ? `${set} > 30 d` : `${rise} > 30 d`) : `${c.up ? set : rise} in ${h(c.inH)}`}
    </span>
  )
  const best = rescue?.option
  const gain = m.meanHorizWm2 > 0.5 ? m.meanVertWm2 / m.meanHorizWm2 : null

  return (
    <div className={`rounded-xl border p-3.5 shadow-sm ${go ? 'border-emerald-700/80 bg-emerald-950/30' : 'border-rose-700/80 bg-rose-950/30'}`}>
      <div className="flex flex-wrap items-center gap-2.5">
        <span className={`rounded-lg px-2.5 py-1 text-2xl font-black tracking-tight ${go ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
          {m.verdict}
        </span>
        <span className="min-w-0 basis-full text-sm text-zinc-200 sm:basis-0 sm:flex-1">
          {go ? 'All survival thresholds met across the mission window.' : m.failed.join(' · ')}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {chip(sun, 'Sunset', 'Sunrise', sun.up ? 'border-amber-500/40 bg-amber-950/40 text-amber-200' : 'border-zinc-700 bg-zinc-900 text-zinc-300')}
          {chip(earth, 'Earthset', 'Earthrise', earth.up ? 'border-sky-500/40 bg-sky-950/40 text-sky-200' : 'border-zinc-700 bg-zinc-900 text-zinc-300')}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Sunlight share" value={pct(m.sunPct)}
          target={needs ? `Need ≥ ${needs.minSunPct}%` : 'Share of mission'}
          pass={!needs || m.sunPct >= needs.minSunPct} ratio={m.sunPct / 100} />
        <KpiCard label="Longest night" value={h(m.longestDarkH)}
          target={needs ? `Limit ≤ ${needs.maxDarkH} h` : 'Peak dark span'}
          pass={!needs || m.longestDarkH <= needs.maxDarkH}
          ratio={needs && needs.maxDarkH > 0 ? Math.min(1, m.longestDarkH / needs.maxDarkH) : 0} />
        <KpiCard label="Earth visible" value={`${pct(m.earthPct)} (${h(m.earthH)})`}
          target={needs ? `Need ≥ ${needs.minEarthPct}%` : 'Direct link'}
          pass={!needs || m.earthPct >= needs.minEarthPct} ratio={m.earthPct / 100} />
        <KpiCard label="Longest gap" value={h(m.longestCommsGapH)}
          target={needs ? `Limit ≤ ${needs.maxGapH} h` : 'Max DTE outage'}
          pass={!needs || m.longestCommsGapH <= needs.maxGapH}
          ratio={needs && needs.maxGapH > 0 ? Math.min(1, m.longestCommsGapH / needs.maxGapH) : 0} />
        <div className="col-span-2 rounded-lg border border-zinc-800 bg-zinc-950/70 px-2.5 py-2 sm:col-span-1">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span>Solar yield</span>
            {gain && <span className="font-semibold text-amber-300">{gain.toFixed(1)}× vert</span>}
          </div>
          <div className="mt-0.5 text-lg font-bold tracking-tight text-zinc-100 tabular-nums">
            {m.meanVertWm2.toFixed(0)} <span className="text-xs font-normal text-zinc-400">W/m² vert</span>
          </div>
          <div className="mt-1 text-[11px] text-zinc-400 tabular-nums">
            vs {m.meanHorizWm2.toFixed(0)} W/m² horiz deck
          </div>
        </div>
      </div>

      {!go && best && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-rose-800/60 pt-3 text-sm">
          <span className="min-w-0 flex-1 basis-64">
            <span className="text-zinc-300">{rescue.lead} </span>
            <b className="font-semibold text-white">{best.kind === 'date' ? `land ${best.start} (${slipLabel(best.slipDays)})` : `${best.siteName}, ${best.start}`}</b>
            <span className={best.m.verdict === 'GO' ? ' font-semibold text-emerald-400' : ' font-semibold text-rose-400'}> {best.m.verdict}</span>
            <span className="text-zinc-300">. {best.sentence[0].toUpperCase() + best.sentence.slice(1)}.</span>
          </span>
          <span className="flex gap-2">
            <button className={btn} onClick={() => onCompare?.(best)}>Compare</button>
            <button className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-emerald-500" onClick={() => onUse?.(best)}>
              Use this plan
            </button>
          </span>
        </div>
      )}
    </div>
  )
}

const ROWS: [string, (m: Metrics) => number, (x: number) => string, 'high' | 'low'][] = [
  ['Sunlit share', m => m.sunPct, pct, 'high'],
  ['Longest night', m => m.longestDarkH, h, 'low'],
  ['Earth visible', m => m.earthPct, pct, 'high'],
  ['Earth contact', m => m.earthH, h, 'high'],
  ['Longest comms gap', m => m.longestCommsGapH, h, 'low'],
  ['Horizontal panel, mean W/m²', m => m.meanHorizWm2, x => x.toFixed(0), 'high'],
  ['Vertical panel, mean W/m²', m => m.meanVertWm2, x => x.toFixed(0), 'high'],
  ['Vertical / horizontal gain', m => (m.meanHorizWm2 > 0.5 ? m.meanVertWm2 / m.meanHorizWm2 : 0), x => (x > 0 ? `${x.toFixed(1)}×` : '—'), 'high'],
]

export function Comparator({ a, b, la, lb, onUse, onSwap }: {
  a: Metrics | null; b: Metrics | null; la: string; lb: string; onUse?: () => void; onSwap?: () => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[440px] text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-left text-xs text-zinc-400">
            <th className="pb-2 font-normal" />
            <th className="pb-2 font-semibold text-amber-300">{la}</th>
            <th className="pb-2 font-semibold text-cyan-300">{lb}</th>
            <th className="pb-2 font-normal">B − A</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="py-1.5 text-zinc-400">Verdict</td>
            {[a, b].map((m, idx) => (
              <td key={idx} className="py-1.5">
                <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${m?.verdict === 'GO' ? 'bg-emerald-950 text-emerald-300' : 'bg-rose-950 text-rose-300'}`}>
                  {m?.verdict ?? 'no data'}
                </span>
              </td>
            ))}
            <td className="py-1.5">
              <div className="flex flex-wrap gap-1.5">
                {onSwap && b && <button className={btn} onClick={onSwap}>Swap A ↔ B</button>}
                {onUse && b && <button className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500" onClick={onUse}>Use plan B</button>}
              </div>
            </td>
          </tr>
          {ROWS.map(([label, f, fmt, better]) => {
            const va = a ? f(a) : null
            const vb = b ? f(b) : null
            const d = va !== null && vb !== null ? vb - va : null
            const fmtD = d === null ? '' : Math.abs(d) < 0.05 ? '0' : `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}`
            const good = d !== null && Math.abs(d) >= 0.05 && (better === 'high' ? d > 0 : d < 0)
            const bad = d !== null && Math.abs(d) >= 0.05 && (better === 'high' ? d < 0 : d > 0)
            return (
              <tr key={label} className="border-t border-zinc-800/80">
                <td className="py-1.5 text-zinc-400">{label}</td>
                <td className="py-1.5 font-mono text-xs tabular-nums">{va !== null ? fmt(va) : '—'}</td>
                <td className="py-1.5 font-mono text-xs tabular-nums">{vb !== null ? fmt(vb) : '—'}</td>
                <td className={`py-1.5 font-mono text-xs font-semibold tabular-nums ${good ? 'text-emerald-400' : bad ? 'text-rose-400' : 'text-zinc-500'}`}>
                  {fmtD}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function PlanBPanel({ options, onPick, onUse, activeKey }: {
  options: PlanBOption[]; onPick: (o: PlanBOption) => void; onUse?: (o: PlanBOption) => void; activeKey?: string
}) {
  const [all, setAll] = useState(false)
  const [filter, setFilter] = useState<'all' | 'date' | 'site'>('all')
  const [goOnly, setGoOnly] = useState(false)

  if (!options.length) return <p className="text-sm text-zinc-500">No other option in reach. Try the calendar below for later dates.</p>

  const dateCount = options.filter(o => o.kind === 'date').length
  const siteCount = options.filter(o => o.kind === 'site').length
  const goCount = options.filter(o => o.m.verdict === 'GO').length

  const filtered = options.filter(o => (filter === 'all' || o.kind === filter) && (!goOnly || o.m.verdict === 'GO'))
  const shown = all ? filtered : filtered.slice(0, 6)
  const tab = (active: boolean) => `rounded-md px-2 py-1 text-xs font-medium transition-colors ${active ? 'bg-zinc-200 text-zinc-950' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        <button onClick={() => setFilter('all')} className={tab(filter === 'all')}>All ({options.length})</button>
        <button onClick={() => setFilter('date')} className={tab(filter === 'date')}>New date ({dateCount})</button>
        <button onClick={() => setFilter('site')} className={tab(filter === 'site')}>Backup site ({siteCount})</button>
        <button onClick={() => setGoOnly(!goOnly)} aria-pressed={goOnly}
          className={`ml-auto rounded-md border px-2 py-1 text-xs font-medium transition-colors ${goOnly ? 'border-emerald-500/60 bg-emerald-950/60 text-emerald-300' : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>
          GO only ({goCount})
        </button>
      </div>

      {!shown.length ? (
        <p className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 text-xs text-zinc-400">No options match the current filter.</p>
      ) : (
        <ol className="grid gap-2 sm:grid-cols-2">
          {shown.map((o, idx) => {
            const selected = activeKey === `${o.siteId}@${o.start}`
            return (
              <li key={o.siteId + o.start}
                className={`rounded-lg border p-2.5 transition-colors ${selected ? 'border-cyan-400/80 bg-cyan-950/20' : 'border-zinc-800 bg-zinc-950/75 hover:border-zinc-600'}`}>
                <div className="flex items-start justify-between gap-2 text-sm">
                  <button onClick={() => onPick(o)} className="text-left font-medium text-zinc-100 hover:text-cyan-300">
                    <span className="mr-1 font-mono text-xs text-zinc-500">#{idx + 1}</span>
                    {o.siteName}
                  </button>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold ${o.m.verdict === 'GO' ? 'bg-emerald-950 text-emerald-300' : 'bg-rose-950 text-rose-300'}`}>
                    {o.m.verdict}
                  </span>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-zinc-400">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${o.kind === 'date' ? 'bg-amber-950/70 text-amber-300' : 'bg-sky-950/70 text-sky-300'}`}>
                    {o.kind === 'date' ? 'new date' : 'new site'}
                  </span>
                  <span className="font-mono text-zinc-300">{o.start}</span>
                  <span>· slip {slipLabel(o.slipDays)}</span>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-zinc-400">
                  <div>
                    <div className="flex justify-between"><span>Sun</span><span className="font-mono text-amber-300">{pct(o.m.sunPct)}</span></div>
                    <div className="mt-0.5 h-1 rounded-full bg-zinc-800"><div className="h-full rounded-full bg-amber-400" style={{ width: `${o.m.sunPct}%` }} /></div>
                  </div>
                  <div>
                    <div className="flex justify-between"><span>Earth</span><span className="font-mono text-sky-300">{pct(o.m.earthPct)}</span></div>
                    <div className="mt-0.5 h-1 rounded-full bg-zinc-800"><div className="h-full rounded-full bg-sky-400" style={{ width: `${o.m.earthPct}%` }} /></div>
                  </div>
                </div>

                <p className="mt-1.5 text-xs text-zinc-200">{o.sentence}</p>

                <div className="mt-2 flex items-center justify-end gap-1.5 border-t border-zinc-800/80 pt-2">
                  <button onClick={() => onPick(o)} className={btn}>{selected ? 'Comparing (B)' : 'Compare (B)'}</button>
                  {onUse && (
                    <button onClick={() => onUse(o)} className="rounded-md bg-emerald-700/90 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-600">
                      Adopt plan
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {filtered.length > 6 && (
        <button onClick={() => setAll(!all)} className="mt-2.5 text-xs font-medium text-sky-400 underline">
          {all ? 'Show top 6' : `Show all ${filtered.length}`}
        </button>
      )}
    </div>
  )
}
