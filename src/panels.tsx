// The map, the landing calendar, the window timeline and the two explainer cards.
import { useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { indexAt, margins, windows, type Day, type Ephem, type Run, type Site } from './engine'
import { polarLatLon, polarXY, quickmapUrl } from './engine/geo'
import { h, pct, useWidth } from './components'

// Chart colours. Sun and Earth pass the dataviz palette checks on the dark surface (#05070c):
// colour-blind separation 27, both above 3:1 contrast. Sequential ramp is one hue, dark (low) to light (high).
export const SUN = '#c98500', EARTH = '#3987e5'
const RAMP = ['#0d366b', '#184f95', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4', '#cde2fb']
const GOOD = '#0ca30c', MUTED = '#3f3f46', TRACK = '#1f2430', INK = '#e4e4e7', INK2 = '#a1a1aa'
const ramp = (p: number) => RAMP[Math.min(RAMP.length - 1, Math.floor((p / 100) * RAMP.length))]

/* ---------------------------------------------------------------- South Pole map */

export interface MapMeta { image: string; halfWidthM: number; dem: string; pixelM: number }

export function PoleMap({ sites, meta, a, b, custom, onPick, onGround }: {
  sites: Site[]; meta: MapMeta | null; a: string; b: string | null; custom: Site | null
  onPick: (id: string) => void; onGround: (lat: number, lonE: number) => void
}) {
  const [hover, setHover] = useState<string | null>(null)
  const half = meta?.halfWidthM ?? 304000
  const S = 1000
  const px = (lat: number, lonE: number) => { const [x, y] = polarXY(lat, lonE); return [((x + half) / (2 * half)) * S, ((half - y) / (2 * half)) * S] as const }
  const all = custom ? [...sites, custom] : sites
  const on = all.filter(s => { const [x, y] = polarXY(s.lat, s.lonE); return Math.abs(x) <= half && Math.abs(y) <= half })
  const off = all.filter(s => !on.includes(s))
  const ring = (lat: number) => (2 * 1737400 * Math.tan(((90 + lat) * Math.PI) / 360) / (2 * half)) * S
  const ground = (ev: PointerEvent<SVGSVGElement>) => {
    const r = ev.currentTarget.getBoundingClientRect()
    const [lat, lon] = polarLatLon(((ev.clientX - r.left) / r.width) * 2 * half - half, half - ((ev.clientY - r.top) / r.height) * 2 * half)
    onGround(+lat.toFixed(3), +lon.toFixed(3))
  }
  // Selected pins last so they sit on top; label the hovered pin, plan A and plan B.
  const order = [...on].sort((p, q) => +(p.id === a || p.id === b) - +(q.id === a || q.id === b))
  const inspected = all.find(s => s.id === (hover ?? a)) ?? all[0]
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[11px] text-zinc-400">
        <span>NASA LOLA South Pole Shaded Relief</span>
        <span>{meta ? `${meta.pixelM} m/px (${meta.dem.replace('.TIF', '')})` : 'Schematic'}</span>
      </div>
      <svg viewBox={`0 0 ${S} ${S}`} className="w-full cursor-crosshair rounded-lg bg-[#05070c]" role="group" aria-label="Map of the lunar South Pole, 80° S to the pole, with the curated sites" onPointerUp={ground}>
        {meta && <image href={`/data/${meta.image}`} width={S} height={S} opacity="0.62" />}
        {[-85, -88].map(lat => <circle key={lat} cx={S / 2} cy={S / 2} r={ring(lat)} fill="none" stroke="#ffffff" strokeOpacity="0.4" strokeDasharray="6 8" strokeWidth="2" />)}
        <circle cx={S / 2} cy={S / 2} r={ring(-80)} fill="none" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="2" />
        <g fontSize="26" fill="#e4e4e7" stroke="#05070c" strokeWidth="6" paintOrder="stroke">
          {[[-85, '85° S'], [-88, '88° S']].map(([lat, t]) => <text key={t} x={S / 2 + 8} y={S / 2 + ring(+lat) - 8}>{t}</text>)}
          <text x={14} y={36}>↑ toward Earth (0°)</text>
          <text x={S - 14} y={S / 2 - 10} textAnchor="end">90° E</text>
        </g>
        <path d={`M${S / 2 - 12},${S / 2}h24M${S / 2},${S / 2 - 12}v24`} stroke="#fff" strokeWidth="3" />
        {order.map(s => {
          const [x, y] = px(s.lat, s.lonE)
          const isCustom = s.id === 'custom'
          const tag = s.id === a ? 'A' : s.id === b ? 'B' : isCustom ? 'C' : ''
          const label = tag || hover === s.id
          const right = x < S * 0.62
          const pinFill = tag === 'A' ? '#facc15' : tag === 'B' ? '#ffffff' : isCustom ? '#38bdf8' : '#d4d4d8'
          const textFill = tag === 'A' || tag === 'B' || isCustom ? '#05070c' : '#ffffff'
          return (
            <g key={s.id} role="button" tabIndex={0} aria-label={`${s.name}${tag ? `, plan ${tag}` : ''}`} className="cursor-pointer outline-none [&:focus-visible>circle:last-of-type]:stroke-sky-400"
              onPointerUp={ev => { ev.stopPropagation(); onPick(s.id) }} onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onPick(s.id) } }}
              onPointerEnter={() => setHover(s.id)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(s.id)} onBlur={() => setHover(null)}>
              <circle cx={x} cy={y} r={34} fill="transparent" />
              <circle cx={x} cy={y} r={tag ? 22 : 13} fill={pinFill} stroke="#05070c" strokeWidth={tag ? 5 : 4} />
              {tag && <text x={x} y={y + 9} fontSize="26" fontWeight="700" textAnchor="middle" fill={textFill}>{tag}</text>}
              {label && (
                <text x={x + (right ? 30 : -30)} y={y + 9} fontSize="28" fontWeight="600" textAnchor={right ? 'start' : 'end'} fill="#fff" stroke="#05070c" strokeWidth="7" paintOrder="stroke">{s.name}</text>
              )}
            </g>
          )
        })}
      </svg>
      {inspected && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-zinc-200">{inspected.name}</span>
            <span className="font-mono text-zinc-400">{inspected.lat.toFixed(3)}°, {inspected.lonE.toFixed(3)}°E</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${inspected.terrain === 'lola' ? 'border border-emerald-800/60 bg-emerald-950/60 text-emerald-300' : 'border border-amber-800/60 bg-amber-950/60 text-amber-300'}`}>
              {inspected.terrain === 'lola' ? 'LOLA terrain' : 'smooth Moon'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {inspected.id !== a && (
              <button onClick={() => onPick(inspected.id)} className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-200 hover:bg-zinc-700">
                Select site
              </button>
            )}
            <a href={quickmapUrl(inspected.lat, inspected.lonE)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-sky-400 hover:underline">
              <span>Open in LROC QuickMap</span>
              <span>↗</span>
            </a>
          </div>
        </div>
      )}
      {off.length > 0 && (
        <p className="mt-2 flex flex-wrap items-center gap-1 text-xs text-zinc-400">
          <span>Off this map:</span>
          {off.map(s => (
            <button key={s.id} onClick={() => onPick(s.id)} className={`rounded px-1.5 py-0.5 hover:bg-zinc-700 ${s.id === a ? 'bg-yellow-400 text-black' : 'bg-zinc-800 text-zinc-200'}`}>{s.name}</button>
          ))}
        </p>
      )}
      <p className="mt-1 text-xs text-zinc-500">
        {meta ? `Shaded relief from the NASA LOLA elevation map (${meta.dem}, ${meta.pixelM} m per pixel here).` : 'Schematic: latitude circles only.'} Tap a pin to choose a site, or tap the ground to set custom coordinates.
      </p>
    </div>
  )
}

/* ---------------------------------------------------------------- Calendar heatmap */

export type CalMode = 'sun' | 'earth' | 'dark' | 'verdict'
const MODES: [CalMode, string][] = [
  ['sun', 'Sunlight %'],
  ['earth', 'Earth in view %'],
  ['dark', 'Night Window'],
  ['verdict', 'Verdict'],
]
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const CELL = 12, GUT = 46, TOP = 14

export function CalendarHeatmap({ days, current, original, missionDays, onPick }: {
  days: Day[]; current: string; original: string; missionDays: number; onPick: (date: string) => void
}) {
  const [mode, setMode] = useState<CalMode>('sun')
  const [yearFilter, setYearFilter] = useState<'all' | '2027' | '2028'>('all')
  const [at, setAt] = useState<number | null>(null)
  const { rows, grid, table } = useMemo(() => {
    const allRows = [...new Set(days.map(d => d.date.slice(0, 7)))]
    const rows = yearFilter === 'all' ? allRows : allRows.filter(r => r.startsWith(yearFilter))
    const grid = new Map(days.map((d, i) => [d.date, i]))
    const table = allRows.map(ym => {
      const ds = days.filter(d => d.date.startsWith(ym) && d.m)
      const mean = (f: (d: Day) => number) => (ds.length ? ds.reduce((s, d) => s + f(d), 0) / ds.length : NaN)
      const go = ds.filter(d => d.m!.verdict === 'GO')
      const best = (go.length ? go : ds).reduce<Day | null>((p, d) => (!p || d.m!.sunPct > p.m!.sunPct ? d : p), null)
      const shortestNight = ds.reduce<number>((min, d) => Math.min(min, d.m!.longestDarkH), 1e9)
      return { ym, n: ds.length, go: go.length, sun: mean(d => d.m!.sunPct), earth: mean(d => d.m!.earthPct), best: best?.date ?? '—', minNight: shortestNight === 1e9 ? 0 : shortestNight }
    })
    return { rows, grid, table }
  }, [days, yearFilter])
  const pos = (date: string) => [GUT + (+date.slice(8) - 1) * CELL, TOP + rows.indexOf(date.slice(0, 7)) * CELL] as const
  const darkRamp = (h: number) => {
    if (h <= 0) return '#10b981' // continuous daylight
    if (h <= 24) return '#38bdf8'
    if (h <= 72) return '#256abf'
    if (h <= 144) return '#184f95'
    if (h <= 240) return '#0d366b'
    return '#27272a'
  }
  const fill = (d: Day) => {
    if (!d.m) return 'none'
    if (mode === 'verdict') return d.m.verdict === 'GO' ? GOOD : MUTED
    if (mode === 'dark') return darkRamp(d.m.longestDarkH)
    return ramp(mode === 'sun' ? d.m.sunPct : d.m.earthPct)
  }
  const Wd = GUT + 31 * CELL, Hd = TOP + rows.length * CELL
  const shown = days[at ?? grid.get(current) ?? -1]

  const hit = (ev: PointerEvent<SVGSVGElement>) => {
    const r = ev.currentTarget.getBoundingClientRect()
    const col = Math.floor((((ev.clientX - r.left) / r.width) * Wd - GUT) / CELL), row = Math.floor((((ev.clientY - r.top) / r.height) * Hd - TOP) / CELL)
    if (col < 0 || col > 30 || row < 0 || row >= rows.length) return null
    return grid.get(`${rows[row]}-${String(col + 1).padStart(2, '0')}`) ?? null
  }
  const key = (ev: KeyboardEvent) => {
    const i = at ?? grid.get(current) ?? 0
    const side = { ArrowLeft: -1, ArrowRight: 1 }[ev.key], month = { ArrowUp: -1, ArrowDown: 1 }[ev.key]
    if (side) { ev.preventDefault(); setAt(Math.min(days.length - 1, Math.max(0, i + side))) }
    else if (month) {
      ev.preventDefault()
      const ym = rows[rows.indexOf(days[i].date.slice(0, 7)) + month]
      const j = ym && [0, 1, 2, 3].map(back => grid.get(`${ym}-${String(+days[i].date.slice(8) - back).padStart(2, '0')}`)).find(v => v !== undefined)
      if (j !== undefined && j !== '') setAt(j)
    }
    else if ((ev.key === 'Enter' || ev.key === ' ') && days[i]?.m) { ev.preventDefault(); onPick(days[i].date) }
  }
  const ring = (date: string, dash?: string) => {
    if (!grid.has(date) || !rows.includes(date.slice(0, 7))) return null
    const [x, y] = pos(date)
    return <rect x={x - 1} y={y - 1} width={CELL} height={CELL} rx="3" fill="none" stroke="#fff" strokeWidth="1.5" strokeDasharray={dash} />
  }
  const swatch = (c: string) => <span className="inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: c }} />

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm" role="group" aria-label="Colour the calendar by">
        <div className="flex flex-wrap items-center gap-1.5">
          {MODES.map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m} className={`rounded px-2 py-0.5 text-xs font-medium ${mode === m ? 'bg-zinc-200 text-zinc-900' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>{label}</button>
          ))}
        </div>
        <div className="flex items-center gap-1 text-xs">
          {(['all', '2027', '2028'] as const).map(y => (
            <button key={y} onClick={() => setYearFilter(y)} className={`rounded px-2 py-0.5 uppercase ${yearFilter === y ? 'bg-sky-900 text-sky-200 font-semibold' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
              {y}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-400">
        <span>Click any date to load into comparator</span>
        <span>
          {mode === 'verdict' && <>{swatch(GOOD)} GO <span className="ml-2" />{swatch(MUTED)} NO-GO</>}
          {mode === 'dark' && <>{swatch('#10b981')} 0h night {swatch('#38bdf8')} &lt;24h {swatch('#256abf')} &lt;72h {swatch('#184f95')} &lt;144h {swatch('#27272a')} &gt;240h</>}
          {(mode === 'sun' || mode === 'earth') && <>0% {RAMP.map(c => <span key={c}>{swatch(c)}</span>)} 100%</>}
        </span>
      </div>
      <svg viewBox={`0 0 ${Wd} ${Hd}`} className="w-full touch-pan-y rounded-lg bg-[#05070c] outline-none focus-visible:ring-2 focus-visible:ring-sky-400" tabIndex={0} role="application"
        aria-label={`Landing calendar: ${mode === 'verdict' ? 'verdict' : mode === 'sun' ? 'sunlit share' : mode === 'dark' ? 'night duration' : 'Earth-visible share'} for every landing date. Arrow keys move, Enter compares.`}
        onPointerMove={ev => setAt(hit(ev))} onPointerLeave={() => setAt(null)} onKeyDown={key}
        onClick={ev => { const i = hit(ev as unknown as PointerEvent<SVGSVGElement>); if (i !== null && days[i].m) onPick(days[i].date) }}>
        {[1, 5, 10, 15, 20, 25, 30].map(d => <text key={d} x={GUT + (d - 1) * CELL + 5} y={10} fontSize="8" fill={INK2} textAnchor="middle">{d}</text>)}
        {rows.map((ym, r) => <text key={ym} x={GUT - 5} y={TOP + r * CELL + 9} fontSize="8" fill={INK2} textAnchor="end">{MONTHS[+ym.slice(5) - 1]} {ym.slice(2, 4)}</text>)}
        {days.filter(d => rows.includes(d.date.slice(0, 7))).map(d => { const [x, y] = pos(d.date); return <rect key={d.date} x={x} y={y} width={CELL - 2} height={CELL - 2} rx="2" fill={fill(d)} stroke={d.m ? undefined : '#2c2c2a'} /> })}
        {original !== current && ring(original, '2 2')}
        {ring(current)}
        {at !== null && rows.includes(days[at].date.slice(0, 7)) && (() => { const [x, y] = pos(days[at].date); return <rect x={x - 1} y={y - 1} width={CELL} height={CELL} rx="3" fill="none" stroke="#38bdf8" strokeWidth="1.5" /> })()}
      </svg>
      <p className="mt-1 min-h-5 text-xs text-zinc-400" aria-live="polite">
        {shown ? shown.m ? (
          <><b className="text-sm font-semibold text-zinc-100">{mode === 'earth' ? `${pct(shown.m.earthPct)} Earth in view` : mode === 'dark' ? `Max night ${h(shown.m.longestDarkH)}` : `${pct(shown.m.sunPct)} sunlit`}</b>
            {' '}· land {shown.date}{shown.date === current ? ' (current plan)' : ''} · <span className={shown.m.verdict === 'GO' ? 'text-emerald-400' : 'text-rose-400'}>{shown.m.verdict}</span>
            {' '}· {pct(shown.m.sunPct)} sun · {pct(shown.m.earthPct)} Earth · longest night {h(shown.m.longestDarkH)} · comms gap {h(shown.m.longestCommsGapH)}</>
        ) : `${shown.date}: the ${missionDays}-day mission runs past the end of the data.` : null}
      </p>
      <p className="text-xs text-zinc-500">
        Each square is one landing date, scored over the {missionDays}-day mission. Solid ring: current plan.{original !== current && ' Dashed ring: original date.'} Tap any date to compare.
      </p>
      <details className="mt-1 text-xs text-zinc-400">
        <summary className="cursor-pointer text-sky-400">Monthly windows table</summary>
        <table className="mt-1 w-full">
          <thead><tr className="text-left text-zinc-400"><th className="font-normal">Month</th><th className="font-normal">GO dates</th><th className="font-normal">Mean sunlit</th><th className="font-normal">Mean Earth</th><th className="font-normal">Min night</th><th className="font-normal">Best window date</th></tr></thead>
          <tbody>
            {table.filter(t => t.n && (yearFilter === 'all' || t.ym.startsWith(yearFilter))).map(t => (
              <tr key={t.ym} className="border-t border-zinc-800 font-mono">
                <td>{t.ym}</td><td>{t.go} of {t.n}</td><td>{pct(t.sun)}</td><td>{pct(t.earth)}</td>
                <td>{h(t.minNight)}</td>
                <td>{t.best === '—' ? t.best : <button className="text-sky-400 underline hover:text-sky-300" onClick={() => onPick(t.best)}>{t.best}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}

/* ---------------------------------------------------------------- Window timeline */

const TL = 44, TR = 8, ROW = 14

export function Timeline({ e, mask, startMs, hours, missionH, scrubH, setScrubH }: {
  e: Ephem; mask: number[]; startMs: number; hours: number; missionH: number; scrubH: number; setScrubH: (h: number) => void
}) {
  const [hoverH, setHoverH] = useState<number | null>(null)
  const [box, TW] = useWidth<HTMLDivElement>() // one unit is one screen pixel, so labels keep their size on a phone
  const i0 = Math.round(indexAt(e, startMs))
  const i1 = Math.min(e.sunEl.length - 1, i0 + Math.round((hours * 60) / e.stepMin))
  const runs = useMemo(() => (i0 < 0 || i0 >= e.sunEl.length ? null : {
    sun: windows(margins(e, mask, 'sun', i0, i1), e.stepMin), earth: windows(margins(e, mask, 'earth', i0, i1), e.stepMin),
  }), [e, mask, i0, i1])
  if (!runs) return null
  const x = (t: number) => TL + (Math.min(hours, Math.max(0, t)) / hours) * (TW - TL - TR)
  const toH = (ev: PointerEvent<SVGSVGElement>) => {
    const r = ev.currentTarget.getBoundingClientRect()
    return Math.round(Math.min(hours, Math.max(0, ((((ev.clientX - r.left) / r.width) * TW - TL) / (TW - TL - TR)) * hours)))
  }
  const bar = (rs: Run[], y: number, fill: string, name: string) => (
    <g>
      <text x={TL - 6} y={y + 11} fontSize="11" fill={INK} textAnchor="end">{name}</text>
      <rect x={TL} y={y} width={TW - TL - TR} height={ROW} rx="4" fill={TRACK} />
      {rs.filter(r => r.visible && r.hours > 0).map(r => {
        const w = Math.max(1.5, x(r.endH) - x(r.startH))
        return <rect key={r.startH} x={x(r.startH)} y={y} width={w} height={ROW} rx={Math.min(4, w / 2)} fill={fill} />
      })}
    </g>
  )
  const state = (rs: Run[], t: number, up: string, down: string) => {
    const r = rs.find(r => t >= r.startH && t <= r.endH) ?? rs[rs.length - 1]
    const last = r === rs[rs.length - 1]
    return `${r.visible ? up : down}${last ? '' : `, ${r.visible ? 'sets' : 'rises'} in ${h(r.endH - t)}`}`
  }
  const t = hoverH ?? scrubH
  const mEnd = Math.min(hours, missionH)
  const table = (['sun', 'earth'] as const).flatMap(b => runs[b].filter(r => r.hours > 0).map(r => ({ b, ...r })))
  return (
    <div className="mt-2" ref={box}>
      <svg viewBox={`0 0 ${TW} 70`} className="w-full cursor-pointer touch-none select-none" role="img"
        aria-label="Timeline of sunlight and Earth-contact windows across the lunar day. Use the time slider below to move."
        onPointerDown={ev => { ev.currentTarget.setPointerCapture(ev.pointerId); setScrubH(toH(ev)) }}
        onPointerMove={ev => (ev.buttons ? setScrubH(toH(ev)) : setHoverH(toH(ev)))} onPointerLeave={() => setHoverH(null)}>
        {bar(runs.sun, 4, SUN, 'Sun')}
        {bar(runs.earth, 4 + ROW + 6, EARTH, 'Earth')}
        <path d={`M${x(0)},43v5H${x(mEnd)}v-5`} fill="none" stroke={INK2} />
        <text x={(x(0) + x(mEnd)) / 2} y={60} fontSize="10" fill={INK2} textAnchor="middle">mission, {h(missionH)}{missionH > hours ? ' (continues)' : ''}</text>
        {Array.from({ length: Math.floor(hours / 120) + 1 }, (_, k) => k * 120).filter(d => x(d) > x(mEnd) + 45 && (TW > 500 || d % 240 === 0)).map(d => (
          <text key={d} x={x(d)} y={60} fontSize="10" fill="#71717a" textAnchor="middle">day {d / 24}</text>
        ))}
        {hoverH !== null && <line x1={x(hoverH)} x2={x(hoverH)} y1={0} y2={42} stroke="#38bdf8" />}
        <line x1={x(scrubH)} x2={x(scrubH)} y1={0} y2={42} stroke="#fff" strokeWidth="1.5" />
      </svg>
      <p className="text-xs text-zinc-400">
        <b className="font-semibold text-zinc-200">{t < 48 ? `${t.toFixed(0)} h` : `Day ${(t / 24).toFixed(1)}`} after landing</b>
        {' '}· {state(runs.sun, t, 'Sun up', 'Sun down')} · {state(runs.earth, t, 'Earth in view', 'Earth hidden')}
      </p>
      <details className="text-xs text-zinc-400">
        <summary className="cursor-pointer text-sky-400">Windows as a table</summary>
        <table className="mt-1 w-full">
          <thead><tr className="text-left"><th className="font-normal">Body</th><th className="font-normal">State</th><th className="font-normal">From</th><th className="font-normal">To</th><th className="font-normal">Length</th></tr></thead>
          <tbody>
            {table.map(r => (
              <tr key={r.b + r.startH} className="border-t border-zinc-800 font-mono">
                <td>{r.b === 'sun' ? 'Sun' : 'Earth'}</td><td>{r.visible ? 'in view' : 'hidden'}</td><td>{h(r.startH)}</td><td>{h(r.endH)}</td><td>{h(r.hours)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}

/* ---------------------------------------------------------------- Explainer cards */

const DEG = Math.PI / 180

/** Explain mode: a day on Earth next to a day at this site, from the site's own two years of data. */
export function EarthMoonCard({ site, e }: { site: Site; e: Ephem }) {
  const f = useMemo(() => {
    const sunMax = Math.max(...e.sunEl), eMin = Math.min(...e.earthEl), eMax = Math.max(...e.earthEl)
    // How far Earth strays from its average place in the sky: mean direction, then the largest angle from it.
    const v = e.earthAz.map((az, i) => [Math.cos(e.earthEl[i] * DEG) * Math.sin(az * DEG), Math.cos(e.earthEl[i] * DEG) * Math.cos(az * DEG), Math.sin(e.earthEl[i] * DEG)])
    const m = [0, 1, 2].map(k => v.reduce((s, p) => s + p[k], 0)), n = Math.hypot(m[0], m[1], m[2])
    const stray = Math.max(...v.map(p => Math.acos(Math.min(1, (p[0] * m[0] + p[1] * m[1] + p[2] * m[2]) / n)))) / DEG
    return { sunMax, eMin, eMax, stray }
  }, [e])
  const arc = (peak: number) => { const y = 62 - (Math.max(0, peak) / 90) * 56; return `M8,62 Q80,${2 * y - 62} 152,62` }
  const sky = (peak: number, label: string) => (
    <svg viewBox="0 0 160 72" className="w-full max-w-56 rounded bg-[#05070c]" role="img" aria-label={label}>
      <line x1="4" x2="156" y1="62" y2="62" stroke="#71717a" />
      <path d={arc(peak)} fill="none" stroke="#facc15" strokeWidth="2" />
      <circle cx="80" cy={62 - (Math.max(0, peak) / 90) * 56} r="4" fill="#facc15" />
      <text x="80" y="70" fontSize="7" fill={INK2} textAnchor="middle">horizon</text>
    </svg>
  )
  return (
    <section className="rounded-xl border border-sky-800 bg-sky-950/30 p-3 text-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-300">
          <span>Earth versus Moon</span>
          <span className="rounded border border-sky-400/60 bg-sky-950/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-300">Concept / Mock</span>
        </h2>
        <span className="text-[11px] text-zinc-400">Educational comparison</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          {sky(73.4, 'On Earth the Sun climbs high in the sky at noon')}
          <p className="mt-1"><b>On Earth</b>, at 40° latitude. A day lasts 24 hours. At noon the Sun stands between 27° and 73° high, depending on the season.</p>
        </div>
        <div>
          {sky(f.sunMax, `At ${site.name} the Sun stays ${f.sunMax.toFixed(1)} degrees or lower`)}
          <p className="mt-1">
            <b>At {site.name}</b>. A day lasts 29.5 Earth days. In 2027–2028 the Sun never climbs above {f.sunMax.toFixed(1)}°.
            {' '}{f.eMax < 0 ? 'Earth never rises here.' : `Earth does not rise and set like the Sun. It stays within ${f.stray.toFixed(0)}° of one spot in the sky, between ${f.eMin.toFixed(1)}° and ${f.eMax.toFixed(1)}° high, and rocks slowly as the Moon wobbles (libration).`}
          </p>
        </div>
      </div>
      <p className="mt-2 text-sky-300">{f.sunMax < 15
        ? 'With the Sun and Earth this low, one ridge on the horizon can take away power or radio contact for days.'
        : 'This site is far from the pole, so the Sun climbs high. It is here for comparison with the polar sites.'}</p>
    </section>
  )
}

/** What a planner could do about a loss of Earth contact. An idea on screen, not a computed result. */
export function RelayCard({ gapH, earthUp }: { gapH: number; earthUp: boolean }) {
  return (
    <section className="rounded-xl border border-violet-800/70 bg-violet-950/20 p-3 text-sm">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-violet-300">
          <span>Relay fallback</span>
          <span className="rounded border border-violet-400/60 bg-violet-950/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-300">Concept / Mock</span>
        </h2>
        <span className="text-[11px] text-zinc-400">Contingency architecture</span>
      </div>
      <p>
        {gapH > 0 ? (
          <>
            {earthUp ? 'Earth is in view now, but' : 'Earth is below the horizon at the time shown, and'} this mission has a gap of up to <b>{h(gapH)}</b> with no direct line to Earth.
            {' '}A relay in lunar orbit—such as the planned Lunar Gateway station (NASA, CSA, ESA and JAXA) or dedicated lunar communications orbiters—could carry the radio link during such line-of-sight occultations.
          </>
        ) : (
          <>
            This mission plan currently maintains direct Earth line-of-sight throughout the window. If landing in deeper crater depressions or behind high rims where direct line-of-sight is blocked, an orbital relay (such as NASA's Lunar Gateway or commercial lunar relay constellations) would serve as a communications bridge.
          </>
        )}
        {' '}MoonSlip does not model relays: every number on this page assumes a direct line-of-sight link to Earth.
      </p>
    </section>
  )
}
