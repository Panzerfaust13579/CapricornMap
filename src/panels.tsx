// The map, the landing calendar, the window timeline and the two explainer cards.
import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { indexAt, margins, type Day, type Ephem, type Run, type Site } from './engine'
import { distKm, polarLatLon, polarXY } from './engine/geo'
import { C, Concept, h, lunarDay, magnet, pct, useWidth, type Ghost, type Mark } from './components'

// Heatmap ramps: one hue each, dark (low) to light (high) on the dark surface. Each passes the dataviz ramp checks
// against #030508: monotone lightness, visible steps, and a dark end that still clears the surface at 2:1.
const RAMPS = {
  sun: ['#6b4106', '#855408', '#a06b0a', '#bd850f', '#dba31b', '#f5c13c', '#fde68a'],
  earth: ['#14438a', '#1c58a8', '#2a6fc6', '#3f8ae6', '#6da7ec', '#9ec5f4', '#cde2fb'],
  night: ['#44319e', '#5846ba', '#6c59d2', '#8474e3', '#a193ec', '#c0b6f3', '#e0daf9'],
}
const MUTED = '#3f3f46', TRACK = '#141a26', ZERO_NIGHT = '#6ee7b7'
const step = (ramp: string[], p: number) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor((p / 100) * ramp.length)))]

/* ---------------------------------------------------------------- South Pole radar map */

export interface MapMeta { image: string; halfWidthM: number; dem: string; pixelM: number }
interface Pt { x: number; y: number; lat: number; lon: number }

const S = 1000, RIM = 78, VB = S + 2 * RIM, MID = S / 2
/** A point on a circle of radius r about the pole, at east longitude deg (0 at the top, toward Earth). */
const onRing = (r: number, deg: number) => [MID + r * Math.sin((deg * Math.PI) / 180), MID - r * Math.cos((deg * Math.PI) / 180)] as const

export const PoleMap = memo(function PoleMap({ sites, meta, a, b, custom, onPick, onGround, onLookup }: {
  sites: Site[]; meta: MapMeta | null; a: string; b: string | null; custom: Site | null
  onPick: (id: string) => void
  /** A tap on bare ground: the point is marked, nothing is fetched. */
  onGround: (lat: number, lonE: number) => void
  /** The planner asked for the marked point to be looked up. */
  onLookup: (lat: number, lonE: number) => void
}) {
  const [hover, setHover] = useState<string | null>(null)
  const [cursor, setCursor] = useState<Pt | null>(null)
  const [pinned, setPinned] = useState<Pt | null>(null)
  const half = meta?.halfWidthM ?? 304000
  const px = (lat: number, lonE: number) => {
    const [x, y] = polarXY(lat, lonE)
    return [((x + half) / (2 * half)) * S, ((half - y) / (2 * half)) * S] as const
  }
  const ring = (lat: number) => (2 * 1737400 * Math.tan(((90 + lat) * Math.PI) / 360) / (2 * half)) * S
  const R0 = Math.min(MID, ring(-80)) // the periscope's edge: 80° S, which the LOLA image exactly inscribes
  const point = (ev: PointerEvent<SVGSVGElement>): Pt | null => {
    const r = ev.currentTarget.getBoundingClientRect()
    const x = ((ev.clientX - r.left) / r.width) * VB - RIM, y = ((ev.clientY - r.top) / r.height) * VB - RIM
    if (Math.hypot(x - MID, y - MID) > R0) return null
    const [lat, lon] = polarLatLon((x / S) * 2 * half - half, half - (y / S) * 2 * half)
    return { x, y, lat: +lat.toFixed(3), lon: +lon.toFixed(3) }
  }
  const all = custom ? [...sites, custom] : sites
  const on = all.filter(s => { const [x, y] = px(s.lat, s.lonE); return Math.hypot(x - MID, y - MID) <= R0 + 1 })
  const off = all.filter(s => !on.includes(s))
  // Selected pins last so they sit on top; label the hovered pin, plan A and plan B.
  const order = [...on].sort((p, q) => +(p.id === a || p.id === b) - +(q.id === a || q.id === b))
  const ground = (ev: PointerEvent<SVGSVGElement>) => {
    const p = point(ev)
    if (!p) return
    setPinned(p)
    onGround(p.lat, p.lon)
  }
  const shown = pinned ?? cursor
  const nearest = shown && sites.reduce<{ name: string; km: number } | null>((best, s) => {
    const km = distKm(shown.lat, shown.lon, s.lat, s.lonE)
    return !best || km < best.km ? { name: s.name, km } : best
  }, null)
  const wedge = (from: number, to: number) => {
    const [x1, y1] = onRing(R0, from), [x2, y2] = onRing(R0, to)
    return `M0,0L${x1 - MID},${y1 - MID}A${R0},${R0} 0 0 1 ${x2 - MID},${y2 - MID}Z`
  }
  const swatch = (c: string, label: string) => <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full" style={{ background: c, boxShadow: `0 0 6px ${c}` }} />{label}</span>

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-300">
        <div className="flex items-center gap-3">
          {a !== 'custom' && swatch(C.sun, 'Plan A')}
          {b && swatch(C.planB, 'Plan B')}
          {(custom || pinned) && swatch(C.custom, a === 'custom' ? 'Custom (plan A)' : 'Custom')}
        </div>
        <span className="kicker text-zinc-400">LOLA radar · 80° S to pole</span>
      </div>

      <div className="relative">
        <svg viewBox={`${-RIM} ${-RIM} ${VB} ${VB}`} className="block w-full cursor-crosshair" role="group"
          aria-label="Map of the lunar South Pole, 80° S to the pole, with the curated sites. Tap bare ground to mark a custom point."
          onPointerMove={ev => setCursor(point(ev))} onPointerLeave={() => setCursor(null)} onPointerUp={ground}>
          <defs>
            <clipPath id="pm-clip"><circle cx={MID} cy={MID} r={R0} /></clipPath>
            <radialGradient id="pm-vignette">
              <stop offset="0.55" stopColor={C.void} stopOpacity="0" />
              <stop offset="1" stopColor={C.void} stopOpacity="0.8" />
            </radialGradient>
          </defs>

          {/* Bezel: longitude ticks every 10 degrees, labelled at the quarters. */}
          <circle cx={MID} cy={MID} r={R0 + RIM - 4} fill={C.well} stroke="#ffffff" strokeOpacity="0.1" strokeWidth="2" />
          {Array.from({ length: 36 }, (_, i) => i * 10).map(d => {
            const [x1, y1] = onRing(R0 + 8, d), [x2, y2] = onRing(R0 + (d % 30 ? 18 : 30), d)
            return <line key={d} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ffffff" strokeOpacity={d % 30 ? 0.3 : 0.7} strokeWidth={d % 30 ? 2 : 3} />
          })}
          <g fontSize="24" fontWeight="600" fill={C.ink2} textAnchor="middle" fontFamily="var(--font-mono)" letterSpacing="2">
            {([[0, '0° · EARTH'], [90, '90°E'], [180, '180° · FAR SIDE'], [270, '270°E']] as const).map(([d, t]) => {
              const [x, y] = onRing(R0 + 54, d)
              return <text key={d} x={x} y={y + 8} transform={d % 180 ? `rotate(${d === 90 ? 90 : -90} ${x} ${y})` : undefined}>{t}</text>
            })}
          </g>

          <g clipPath="url(#pm-clip)">
            <circle cx={MID} cy={MID} r={R0} fill="#0a0e15" />
            {meta && <image href={`/data/${meta.image}`} width={S} height={S} opacity="0.85" />}
            {[-85, -88].map(lat => <circle key={lat} cx={MID} cy={MID} r={ring(lat)} fill="none" stroke={C.earth} strokeOpacity="0.45" strokeDasharray="5 9" strokeWidth="2" />)}
            <g fontSize="24" fill={C.ink} stroke={C.void} strokeWidth="6" paintOrder="stroke" fontFamily="var(--font-mono)">
              {([[-85, '85°S'], [-88, '88°S']] as const).map(([lat, t]) => <text key={t} x={MID + 8} y={MID + ring(lat) - 8}>{t}</text>)}
            </g>
            <path d={`M${MID - 14},${MID}h28M${MID},${MID - 14}v28`} stroke="#fff" strokeWidth="3" />
            <circle cx={MID} cy={MID} r={R0} fill="url(#pm-vignette)" />
            {/* One sweep each time the selection changes. */}
            <g transform={`translate(${MID} ${MID})`}>
              <g key={`${a}|${b ?? ''}`} className="radar-sweep">
                {[0, 1, 2, 3, 4, 5].map(i => <path key={i} d={wedge(-(i + 1) * 9, -i * 9)} fill={C.earth} opacity={0.26 * (1 - i / 6)} />)}
                <line x1="0" y1="0" x2="0" y2={-R0} stroke="#e0f2fe" strokeWidth="3" />
              </g>
            </g>
            {shown && (
              <g stroke={C.custom} strokeWidth="2" strokeOpacity={pinned ? 0.9 : 0.6}>
                <line x1={0} x2={S} y1={shown.y} y2={shown.y} strokeDasharray="10 8" />
                <line y1={0} y2={S} x1={shown.x} x2={shown.x} strokeDasharray="10 8" />
              </g>
            )}
          </g>
          <circle cx={MID} cy={MID} r={R0} fill="none" stroke={C.earth} strokeOpacity="0.5" strokeWidth="3" />
          {shown && (
            <g transform={`translate(${shown.x} ${shown.y})`} fill="none" stroke={C.custom} strokeWidth="3">
              <circle r="16" />
              <path d="M-28,0h-12M28,0h12M0,-28v-12M0,28v12" />
              {pinned && <circle r="16" className="pin-pulse" />}
            </g>
          )}

          {order.map(s => {
            const [x, y] = px(s.lat, s.lonE)
            const tag = s.id === a ? 'A' : s.id === b ? 'B' : ''
            const isCustom = s.id === 'custom'
            const fill = isCustom ? C.custom : tag === 'A' ? C.sun : tag === 'B' ? C.planB : '#d4d4d8'
            const big = !!tag || isCustom
            const right = x < S * 0.62
            return (
              <g key={s.id} role="button" tabIndex={0} aria-label={`${s.name}${tag ? `, plan ${tag}` : ''}`} transform={`translate(${x} ${y})`}
                className="cursor-pointer outline-none [&:focus-visible>.pin]:stroke-earth [&:focus-visible>.pin]:stroke-[8px]"
                onPointerUp={ev => { ev.stopPropagation(); setPinned(null); onPick(s.id) }}
                onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onPick(s.id) } }}
                onPointerEnter={() => setHover(s.id)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(s.id)} onBlur={() => setHover(null)}>
                <circle r={38} fill="transparent" />
                {big && <circle r={24} fill="none" stroke={fill} strokeWidth="4" className="pin-pulse" />}
                {big && <circle r={24} fill="none" stroke={fill} strokeWidth="4" className="pin-pulse pin-pulse-late" />}
                <circle className="pin" r={big ? 24 : 12} fill={fill} stroke={C.void} strokeWidth="5" />
                {big && <text y={10} fontSize="28" fontWeight="700" textAnchor="middle" fill={C.void} fontFamily="var(--font-mono)">{isCustom ? 'C' : tag}</text>}
                {(big || hover === s.id) && (
                  <text x={right ? 34 : -34} y={10} fontSize="30" fontWeight="600" textAnchor={right ? 'start' : 'end'} fill="#fff" stroke={C.void} strokeWidth="8" paintOrder="stroke">{s.name}</text>
                )}
              </g>
            )
          })}
        </svg>

        {/* Readout for the point under the crosshair. Coordinates only: the browser holds no LOLA heights. */}
        {shown && (
          <div className={`glass-float absolute z-10 w-44 rounded-xl p-2.5 text-[11px] ${pinned ? '' : 'pointer-events-none'}`}
            style={{
              left: `${((shown.x + RIM) / VB) * 100}%`, top: `${((shown.y + RIM) / VB) * 100}%`,
              transform: `translate(${shown.x > MID ? 'calc(-100% - 14px)' : '14px'}, ${shown.y > S * 0.55 ? 'calc(-100% - 14px)' : '14px'})`,
            }}>
            <div className="flex items-center justify-between">
              <span className="kicker text-cyan-300">{pinned ? 'Marked point' : 'Ground'}</span>
              {pinned && <button onClick={() => setPinned(null)} className="-my-1 px-1 text-sm text-zinc-300 hover:text-white" aria-label="Clear marked point">×</button>}
            </div>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 font-mono tabular-nums">
              <dt className="text-zinc-400">LAT</dt><dd className="text-right text-zinc-50">{shown.lat.toFixed(3).replace('-', '−')}°</dd>
              <dt className="text-zinc-400">LON</dt><dd className="text-right text-zinc-50">{shown.lon.toFixed(3)}°E</dd>
              <dt className="text-zinc-400">POLE</dt><dd className="text-right text-zinc-50">{distKm(shown.lat, shown.lon, -90, 0).toFixed(0)} km</dd>
            </dl>
            {nearest && <p className="mt-1 truncate text-zinc-300">{nearest.km.toFixed(0)} km from {nearest.name}</p>}
            {pinned && (
              <button onClick={() => { onLookup(pinned.lat, pinned.lon); setPinned(null) }}
                className="mt-2 w-full rounded-md bg-cyan-400 px-2 py-1.5 text-xs font-semibold text-void transition-colors hover:bg-cyan-300">
                Query JPL Horizons
              </button>
            )}
          </div>
        )}
      </div>

      {off.length > 0 && (
        <p className="mt-2 flex flex-wrap items-center gap-1 text-xs text-zinc-300">
          <span className="text-zinc-400">Beyond 80° S:</span>
          {off.map(s => (
            <button key={s.id} onClick={() => onPick(s.id)}
              className={`rounded px-1.5 py-0.5 transition-colors ${s.id === a ? 'bg-sun font-semibold text-void' : s.id === b ? 'bg-zinc-100 font-semibold text-void' : 'border border-white/10 bg-white/[0.06] text-zinc-100 hover:bg-white/[0.14]'}`}>
              {s.name}
            </button>
          ))}
        </p>
      )}
      <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">
        {meta ? `Shaded relief from NASA LOLA (${meta.dem}, ${meta.pixelM} m/px here).` : 'Schematic: latitude circles only.'} Select a pin, or tap the ground to mark a point. A marked point uses a smooth-sphere horizon.
      </p>
    </div>
  )
})

/* ---------------------------------------------------------------- Calendar heatmap */

export type CalMode = 'sun' | 'earth' | 'night' | 'verdict'
const MODES: [CalMode, string][] = [['sun', 'Sunlight'], ['earth', 'Earth in view'], ['night', 'Night window'], ['verdict', 'Verdict']]
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const CELL = 12, GUT = 46, TOP = 14

/** The Sun's upper limb against the terrain under it, hour by hour through one mission. Above the line is daylight. */
function SunCurve({ e, mask, date, missionDays }: { e: Ephem; mask: number[]; date: string; missionDays: number }) {
  const m = useMemo(() => {
    const i0 = Math.round(indexAt(e, Date.parse(date))), i1 = i0 + Math.round((missionDays * 24 * 60) / e.stepMin)
    return i0 >= 0 && i1 < e.sunEl.length ? Array.from(margins(e, mask, 'sun', i0, i1)) : null
  }, [e, mask, date, missionDays])
  if (!m) return null
  const SW = 208, SH = 44
  const top = Math.max(0.4, ...m), bottom = Math.min(-0.4, ...m)
  const x = (i: number) => (i / (m.length - 1)) * SW, y = (v: number) => 2 + ((top - v) / (top - bottom)) * (SH - 4)
  const area = (f: (v: number) => number) => `M0,${y(0)}` + m.map((v, i) => `L${x(i).toFixed(1)},${y(f(v)).toFixed(1)}`).join('') + `L${SW},${y(0)}Z`
  return (
    <div className="mt-2.5">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="kicker text-zinc-400">Sun vs ridge</span>
        <span className="font-mono text-[10px] text-zinc-200">{bottom.toFixed(1).replace('-', '−')}° to +{top.toFixed(1)}°</span>
      </div>
      <svg viewBox={`0 0 ${SW} ${SH}`} className="well block w-full rounded-md" role="img"
        aria-label={`Sun height above the terrain through the mission: from ${bottom.toFixed(1)} to ${top.toFixed(1)} degrees`}>
        <path d={area(v => Math.max(0, v))} fill={C.sun} fillOpacity="0.85" />
        <path d={area(v => Math.min(0, v))} fill="#475569" fillOpacity="0.8" />
        <line x1="0" x2={SW} y1={y(0)} y2={y(0)} stroke={C.ink} strokeWidth="1" />
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-zinc-400">
        <span>landing</span>
        <span>day {missionDays}</span>
      </div>
    </div>
  )
}

function DayCard({ d, current, e, mask, missionDays }: { d: Day; current: string; e: Ephem; mask: number[]; missionDays: number }) {
  if (!d.m) return <p className="text-xs text-zinc-300">{d.date}: the {missionDays}-day mission runs past the end of the data.</p>
  const go = d.m.verdict === 'GO'
  const row = (k: string, v: string) => <><dt className="text-zinc-400">{k}</dt><dd className="text-right font-mono text-zinc-50 tabular-nums">{v}</dd></>
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-zinc-50">{d.date}{d.date === current ? ' · current' : ''}</span>
        <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${go ? 'border-go/50 bg-go/15 text-emerald-300' : 'border-nogo/50 bg-nogo/15 text-red-300'}`}>{d.m.verdict}</span>
      </div>
      <dl className="mt-1.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[11px]">
        {row('Sunlit', pct(d.m.sunPct))}
        {row('Longest night', d.m.longestDarkH === 0 ? 'none' : h(d.m.longestDarkH))}
        {row('Earth in view', pct(d.m.earthPct))}
        {row('Longest comms gap', d.m.longestCommsGapH === 0 ? 'none' : h(d.m.longestCommsGapH))}
      </dl>
      <SunCurve e={e} mask={mask} date={d.date} missionDays={missionDays} />
    </>
  )
}

export const CalendarHeatmap = memo(function CalendarHeatmap({ days, current, original, missionDays, e, mask, onPick, fit }: {
  days: Day[]; current: string; original: string; missionDays: number; e: Ephem; mask: number[]; onPick: (date: string) => void
  /** Grow the grid as large as the window allows below its top edge. */
  fit?: boolean
}) {
  const [mode, setMode] = useState<CalMode>('sun')
  const [at, setAt] = useState<number | null>(null)
  const [box, width] = useWidth<HTMLDivElement>()
  const { rows, grid, table, stats } = useMemo(() => {
    const rows = [...new Set(days.map(d => d.date.slice(0, 7)))]
    const grid = new Map(days.map((d, i) => [d.date, i]))
    const valid = days.filter(d => d.m)
    const goDays = valid.filter(d => d.m!.verdict === 'GO')
    const zero = valid.filter(d => d.m!.longestDarkH === 0)
    const best = (goDays.length ? goDays : valid).reduce<Day | null>((p, d) => (!p || d.m!.sunPct > p.m!.sunPct ? d : p), null)
    const table = rows.map(ym => {
      const ds = days.filter(d => d.date.startsWith(ym) && d.m)
      const mean = (f: (d: Day) => number) => (ds.length ? ds.reduce((s, d) => s + f(d), 0) / ds.length : NaN)
      const go = ds.filter(d => d.m!.verdict === 'GO')
      const mBest = (go.length ? go : ds).reduce<Day | null>((p, d) => (!p || d.m!.sunPct > p.m!.sunPct ? d : p), null)
      return { ym, n: ds.length, go: go.length, zero: ds.filter(d => d.m!.longestDarkH === 0).length, sun: mean(d => d.m!.sunPct), earth: mean(d => d.m!.earthPct), best: mBest?.date ?? '—' }
    })
    return { rows, grid, table, stats: { valid: valid.length, go: goDays.length, zero, best } }
  }, [days])

  const pos = (date: string) => [GUT + (+date.slice(8) - 1) * CELL, TOP + rows.indexOf(date.slice(0, 7)) * CELL] as const
  const missionH = missionDays * 24
  const fill = (d: Day) => {
    if (!d.m) return 'none'
    if (mode === 'verdict') return d.m.verdict === 'GO' ? C.go : MUTED
    if (mode === 'night') return d.m.longestDarkH === 0 ? ZERO_NIGHT : step(RAMPS.night, 100 * (1 - Math.min(1, d.m.longestDarkH / missionH)))
    return step(RAMPS[mode], mode === 'sun' ? d.m.sunPct : d.m.earthPct)
  }
  const Wd = GUT + 31 * CELL, Hd = TOP + rows.length * CELL
  const shown = days[at ?? grid.get(current) ?? -1]
  const narrow = width < 520
  // Fit by capping the width at the grid's aspect, not its height: hit-testing maps the SVG's box to cells.
  const fitRef = useRef<HTMLDivElement>(null)
  const [fitW, setFitW] = useState<number>()
  useEffect(() => {
    if (!fit) return
    const f = () => { const el = fitRef.current; if (el) setFitW(Math.max(320, (innerHeight - el.getBoundingClientRect().top - 16) * Wd / (Hd + 2))) }
    f()
    addEventListener('resize', f)
    return () => removeEventListener('resize', f)
  }, [fit, Wd, Hd])
  const nextZero = stats.zero.find(d => d.date > current) ?? stats.zero[0]

  const hit = (ev: PointerEvent<SVGSVGElement>) => {
    const r = ev.currentTarget.getBoundingClientRect()
    const col = Math.floor((((ev.clientX - r.left) / r.width) * Wd - GUT) / CELL)
    const row = Math.floor((((ev.clientY - r.top) / r.height) * Hd - TOP) / CELL)
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
    if (!grid.has(date)) return null
    const [x, y] = pos(date)
    return <rect x={x - 1} y={y - 1} width={CELL} height={CELL} rx="3.5" fill="none" stroke="#fff" strokeWidth="1.5" strokeDasharray={dash} />
  }
  const swatch = (c: string, halo = false) => <span className="inline-block h-2.5 w-2.5 rounded-[3px] align-middle" style={{ background: c, boxShadow: halo ? `0 0 0 1.5px ${C.go}, 0 0 6px ${C.go}` : undefined }} />
  const legend = mode === 'verdict'
    ? <>{swatch(C.go)} GO <span className="ml-2" />{swatch(MUTED)} NO-GO</>
    : mode === 'night'
      ? <>whole mission dark {RAMPS.night.map(c => <span key={c}>{swatch(c)}</span>)} short night <span className="ml-2" />{swatch(ZERO_NIGHT, true)} no night at all</>
      : <>0% {RAMPS[mode].map(c => <span key={c}>{swatch(c)}</span>)} 100%</>

  // The floating card sits beside the hovered cell and flips near the edges.
  const tip = at !== null && !narrow ? (() => {
    const [x, y] = pos(days[at].date)
    const fx = (x + CELL / 2) / Wd, low = y > Hd / 2
    return {
      left: `${fx * 100}%`, top: `${((low ? y : y + CELL) / Hd) * 100}%`,
      transform: `translate(${fx < 0.3 ? '-12px' : fx > 0.7 ? 'calc(-100% + 12px)' : '-50%'}, ${low ? 'calc(-100% - 10px)' : '10px'})`,
    }
  })() : null

  return (
    <div ref={box}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs">
        <span className="text-zinc-300">
          Viable windows: <b className="font-mono text-emerald-300">{stats.go}</b> / <span className="font-mono">{stats.valid}</span> landing dates
          {stats.valid > 0 && ` (${((100 * stats.go) / stats.valid).toFixed(0)}%)`}
          <span className="mx-2 text-zinc-400">·</span>
          Zero-night windows: <b className="font-mono text-emerald-300">{stats.zero.length}</b>
        </span>
        <span className="flex flex-wrap gap-1.5">
          {mode === 'night' && nextZero && (
            <button onClick={() => onPick(nextZero.date)}
              className="rounded-md border border-go/50 bg-go/15 px-2 py-0.5 text-xs font-medium text-emerald-300 hover:bg-go/25">
              Compare next zero-night: {nextZero.date}
            </button>
          )}
          {stats.best && (
            <button onClick={() => onPick(stats.best!.date)}
              className="rounded-md border border-earth/40 bg-earth/10 px-2 py-0.5 text-xs font-medium text-sky-200 hover:bg-earth/20">
              Compare peak date: {stats.best.date} ({pct(stats.best.m!.sunPct)} sun)
            </button>
          )}
        </span>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs" role="group" aria-label="Colour the calendar by">
        {MODES.map(([m, label]) => (
          <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m}
            className={`rounded-md px-2 py-1 font-medium transition-colors ${mode === m ? 'bg-zinc-100 text-void' : 'border border-white/10 bg-white/[0.05] text-zinc-200 hover:bg-white/[0.12]'}`}>
            {label}
          </button>
        ))}
        <span className="ml-auto flex flex-wrap items-center gap-1 text-xs text-zinc-300">{legend}</span>
      </div>

      <div ref={fitRef} className="relative mx-auto" style={fit && fitW ? { maxWidth: fitW } : undefined}>
        <svg viewBox={`0 0 ${Wd} ${Hd + 2}`} className="well block w-full touch-pan-y rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-earth" tabIndex={0} role="application"
          aria-label={`Landing calendar: ${mode === 'verdict' ? 'verdict' : mode === 'sun' ? 'sunlit share' : mode === 'night' ? 'longest night' : 'Earth-visible share'} for every landing date. Arrow keys move, Enter compares.`}
          onPointerMove={ev => setAt(hit(ev))} onPointerLeave={() => setAt(null)} onBlur={() => setAt(null)} onKeyDown={key}
          onClick={ev => { const i = hit(ev as unknown as PointerEvent<SVGSVGElement>); if (i !== null && days[i].m) onPick(days[i].date) }}>
          {[1, 5, 10, 15, 20, 25, 30].map(d => <text key={d} x={GUT + (d - 1) * CELL + 5} y={10} fontSize="7.5" fill={C.ink2} textAnchor="middle" fontFamily="var(--font-mono)">{d}</text>)}
          {rows.map((ym, r) => <text key={ym} x={GUT - 5} y={TOP + r * CELL + 8.5} fontSize="7.5" fill={C.ink2} textAnchor="end" fontFamily="var(--font-mono)">{MONTHS[+ym.slice(5) - 1]} {ym.slice(2, 4)}</text>)}
          {days.map(d => { const [x, y] = pos(d.date); return <rect key={d.date} x={x} y={y} width={CELL - 2} height={CELL - 2} rx="2.5" fill={fill(d)} stroke={d.m ? undefined : '#2a2f3a'} /> })}
          {/* Zero-night windows: a whole mission with the Sun never fully behind the terrain. */}
          {mode === 'night' && (
            <g className="halo" fill="none" stroke={C.go} strokeWidth="1.2">
              {stats.zero.map(d => { const [x, y] = pos(d.date); return <rect key={d.date} x={x - 0.6} y={y - 0.6} width={CELL - 0.8} height={CELL - 0.8} rx="3.2" /> })}
            </g>
          )}
          {original !== current && ring(original, '2 2')}
          {ring(current)}
          {at !== null && (() => {
            const [x, y] = pos(days[at].date)
            return (
              <g transform={`translate(${x + CELL / 2 - 1} ${y + CELL / 2 - 1})`}>
                <rect key={at} className="cell-pop" x={-5} y={-5} width={10} height={10} rx="2.5" fill={days[at].m ? fill(days[at]) : C.well} stroke="#fff" strokeWidth="1" />
              </g>
            )
          })()}
        </svg>
        {tip && (
          <div key={at} className="glass-float rise pointer-events-none absolute z-10 w-60 rounded-xl p-3" style={tip}>
            <DayCard d={days[at!]} current={current} e={e} mask={mask} missionDays={missionDays} />
          </div>
        )}
      </div>

      {narrow && shown && (
        <div className="mt-2 rounded-xl border border-white/10 bg-black/30 p-3">
          <DayCard d={shown} current={current} e={e} mask={mask} missionDays={missionDays} />
        </div>
      )}
      <p className={narrow ? 'sr-only' : 'mt-2 min-h-5 text-xs text-zinc-300'} aria-live="polite">
        {shown ? shown.m ? (
          <><b className="font-mono text-sm font-semibold text-zinc-50">{mode === 'earth' ? `${pct(shown.m.earthPct)} Earth in view` : mode === 'night' ? `longest night ${shown.m.longestDarkH === 0 ? 'none' : h(shown.m.longestDarkH)}` : `${pct(shown.m.sunPct)} sunlit`}</b>
            {' '}· land {shown.date}{shown.date === current ? ' (current plan)' : ''} · <span className={shown.m.verdict === 'GO' ? 'font-semibold text-emerald-300' : 'font-semibold text-red-300'}>{shown.m.verdict}</span>
            {' '}· {mode === 'sun' ? `${pct(shown.m.earthPct)} Earth in view` : `${pct(shown.m.sunPct)} sunlit`}{mode !== 'night' && ` · longest night ${h(shown.m.longestDarkH)}`}</>
        ) : `${shown.date}: the ${missionDays}-day mission runs past the end of the data.` : null}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
        Each square scores a {missionDays}-day mission landing that day. Solid ring: current plan.{original !== current && ' Dashed ring: original date.'} Click a date to load it as plan B.
      </p>
      <details className="mt-2 text-xs text-zinc-300">
        <summary className="cursor-pointer text-sky-300">Monthly summary table</summary>
        <table className="mt-1.5 w-full">
          <thead><tr className="text-left text-zinc-400"><th className="font-normal">Month</th><th className="font-normal">GO dates</th><th className="font-normal">Zero-night</th><th className="font-normal">Mean sunlit</th><th className="font-normal">Mean Earth in view</th><th className="font-normal">Best date</th></tr></thead>
          <tbody>
            {table.filter(t => t.n).map(t => (
              <tr key={t.ym} className="border-t border-white/[0.07] font-mono">
                <td>{t.ym}</td><td>{t.go} of {t.n}</td><td>{t.zero}</td><td>{pct(t.sun)}</td><td>{pct(t.earth)}</td>
                <td>{t.best === '—' ? t.best : <button className="text-sky-300 underline" onClick={() => onPick(t.best)}>{t.best}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
})

/* ---------------------------------------------------------------- Window timeline */

const TL = 52, TR = 8, ROW = 13

export function Timeline({ e, mask, startMs, hours, missionH, scrubH, setScrubH, marks, b, preview }: {
  e: Ephem; mask: number[]; startMs: number; hours: number; missionH: number; scrubH: number; setScrubH: (h: number) => void
  marks: Mark[]
  /** Plan B, drawn as its own pair of rows. */
  b?: Ghost | null
  /** The Plan B card under the pointer, drawn as thin strips under plan A's rows so nothing moves. */
  preview?: Ghost | null
}) {
  const [hoverH, setHoverH] = useState<number | null>(null)
  const [box, TW] = useWidth<HTMLDivElement>() // one unit is one screen pixel, so labels keep their size on a phone
  const runs = useMemo(() => lunarDay(e, mask, startMs, hours), [e, mask, startMs, hours])
  const runsB = useMemo(() => (b ? lunarDay(b.e, b.mask, b.startMs, hours) : null), [b, hours])
  const runsP = useMemo(() => (preview ? lunarDay(preview.e, preview.mask, preview.startMs, hours) : null), [preview, hours])

  if (!runs) return null
  const x = (t: number) => TL + (Math.min(hours, Math.max(0, t)) / hours) * (TW - TL - TR)
  const toH = (ev: PointerEvent<SVGSVGElement>) => {
    const r = ev.currentTarget.getBoundingClientRect()
    return Math.round(Math.min(hours, Math.max(0, ((((ev.clientX - r.left) / r.width) * TW - TL) / (TW - TL - TR)) * hours)))
  }
  const spans = (rs: Run[], y: number, height: number, fill: string, opacity = 1) => rs.filter(r => r.visible && r.hours > 0).map(r => {
    const w = Math.max(1.5, x(r.endH) - x(r.startH))
    return <rect key={r.startH} x={x(r.startH)} y={y} width={w} height={height} rx={Math.min(height / 2, 3.5, w / 2)} fill={fill} fillOpacity={opacity} />
  })
  const bar = (rs: Run[], y: number, fill: string, name: string, planB = false) => (
    <g>
      <text x={TL - 6} y={y + 10.5} fontSize="10.5" fill={planB ? C.ink2 : C.ink} textAnchor="end">{name}</text>
      <rect x={TL} y={y} width={TW - TL - TR} height={ROW} rx="3.5" fill={TRACK} />
      {spans(rs, y, ROW, fill, planB ? 0.6 : 1)}
    </g>
  )
  const state = (rs: Run[], t: number, up: string, down: string) => {
    const r = rs.find(r => t >= r.startH && t <= r.endH) ?? rs[rs.length - 1]
    const last = r === rs[rs.length - 1]
    return `${r.visible ? up : down}${last ? '' : `, ${r.visible ? 'sets' : 'rises'} in ${h(r.endH - t)}`}`
  }
  const t = hoverH ?? scrubH
  const mEnd = Math.min(hours, missionH)
  const bracketY = runsB ? 76 : 42
  const svgH = runsB ? 104 : 70
  const table = (['sun', 'earth'] as const).flatMap(body => runs[body].filter(r => r.hours > 0).map(r => ({ body, ...r })))
  const y2 = 4 + ROW + 5

  return (
    <div className="mt-2.5" ref={box}>
      <svg viewBox={`0 0 ${TW} ${svgH}`} className="w-full cursor-pointer touch-none select-none" role="img"
        aria-label="Timeline of sunlight and Earth-contact windows across the lunar day. Use the time slider below to move."
        onPointerDown={ev => { ev.currentTarget.setPointerCapture(ev.pointerId); setScrubH(magnet(toH(ev), marks, TW - TL - TR, hours)) }}
        onPointerMove={ev => (ev.buttons ? setScrubH(magnet(toH(ev), marks, TW - TL - TR, hours)) : setHoverH(toH(ev)))} onPointerLeave={() => setHoverH(null)}>
        {bar(runs.sun, 4, C.sunFill, runsB ? 'Sun A' : 'Sun')}
        {bar(runs.earth, y2, C.earthFill, runsB ? 'Earth A' : 'Earth')}
        {runsP && (
          <g>
            {spans(runsP.sun, 4 + ROW + 1, 3, C.planB)}
            {spans(runsP.earth, y2 + ROW + 1, 3, C.planB)}
          </g>
        )}
        {runsB && (
          <>
            {bar(runsB.sun, 4 + (ROW + 5) * 2, C.sunFill, 'Sun B', true)}
            {bar(runsB.earth, 4 + (ROW + 5) * 3, C.earthFill, 'Earth B', true)}
          </>
        )}
        <path d={`M${x(0)},${bracketY}v5H${x(mEnd)}v-5`} fill="none" stroke={C.ink2} />
        <text x={(x(0) + x(mEnd)) / 2} y={bracketY + 17} fontSize="10" fill={C.ink2} textAnchor="middle">
          mission, {h(missionH)}{missionH > hours ? ' (continues)' : ''}
        </text>
        {Array.from({ length: Math.floor(hours / 120) + 1 }, (_, k) => k * 120).filter(d => x(d) > x(mEnd) + 45 && (TW > 500 || d % 240 === 0)).map(d => (
          <text key={d} x={x(d)} y={bracketY + 17} fontSize="10" fill={C.ink2} textAnchor="middle" fontFamily="var(--font-mono)">day {d / 24}</text>
        ))}
        {hoverH !== null && <line x1={x(hoverH)} x2={x(hoverH)} y1={0} y2={bracketY - 1} stroke={C.earth} />}
        <line x1={x(scrubH)} x2={x(scrubH)} y1={0} y2={bracketY - 1} stroke="#fff" strokeWidth="1.5" />
        <circle cx={x(scrubH)} cy={1.5} r={2.5} fill="#fff" />
      </svg>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-300">
        <p>
          <b className="font-mono font-semibold text-zinc-50">{t < 48 ? `${t.toFixed(0)} h` : `Day ${(t / 24).toFixed(1)}`} after landing</b>
          {' '}· {state(runs.sun, t, 'Sun up', 'Sun down')} · {state(runs.earth, t, 'Earth in view', 'Earth hidden')}
        </p>
        {runsB && b && <span className="text-[11px] text-zinc-100">Rows B: {b.label}</span>}
      </div>

      <details className="mt-1.5 text-xs text-zinc-300">
        <summary className="cursor-pointer text-sky-300">Windows as a table</summary>
        <table className="mt-1.5 w-full">
          <thead><tr className="text-left text-zinc-400"><th className="font-normal">Body</th><th className="font-normal">State</th><th className="font-normal">From</th><th className="font-normal">To</th><th className="font-normal">Length</th></tr></thead>
          <tbody>
            {table.map(r => (
              <tr key={r.body + r.startH} className="border-t border-white/[0.07] font-mono">
                <td>{r.body === 'sun' ? 'Sun' : 'Earth'}</td><td>{r.visible ? 'in view' : 'hidden'}</td><td>{h(r.startH)}</td><td>{h(r.endH)}</td><td>{h(r.hours)}</td>
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
    const v = e.earthAz.map((az, i) => [Math.cos(e.earthEl[i] * DEG) * Math.sin(az * DEG), Math.cos(e.earthEl[i] * DEG) * Math.cos(az * DEG), Math.sin(e.earthEl[i] * DEG)])
    const m = [0, 1, 2].map(k => v.reduce((s, p) => s + p[k], 0)), n = Math.hypot(m[0], m[1], m[2])
    const stray = Math.max(...v.map(p => Math.acos(Math.min(1, (p[0] * m[0] + p[1] * m[1] + p[2] * m[2]) / n)))) / DEG
    return { sunMax, eMin, eMax, stray }
  }, [e])
  const arc = (peak: number) => { const y = 62 - (Math.max(0, peak) / 90) * 56; return `M8,62 Q80,${2 * y - 62} 152,62` }
  const sky = (peak: number, label: string, color: string) => (
    <svg viewBox="0 0 160 72" className="well w-full max-w-56 rounded-lg" role="img" aria-label={label}>
      <line x1="4" x2="156" y1="62" y2="62" stroke={C.ink2} />
      <path d={arc(peak)} fill="none" stroke={color} strokeWidth="2" />
      <circle cx="80" cy={62 - (Math.max(0, peak) / 90) * 56} r="4" fill={color} />
      <text x="80" y="70" fontSize="7" fill={C.ink2} textAnchor="middle">horizon</text>
    </svg>
  )
  return (
    <section className="glass rounded-2xl p-4 text-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold tracking-tight text-zinc-50">Earth versus Moon</h2>
        <span className="kicker text-sky-300">Explain mode</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/30 p-3">
          {sky(73.4, 'On Earth the Sun climbs high in the sky at noon', C.earth)}
          <p className="mt-2 text-xs leading-relaxed text-zinc-200">
            <b>On Earth</b> (e.g. 40° latitude). A day lasts 24 hours with a blue atmosphere and gradual twilight. At noon the Sun climbs between 27° and 73°.
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/30 p-3">
          {sky(f.sunMax, `At ${site.name} the Sun stays ${f.sunMax.toFixed(1)} degrees or lower`, C.sun)}
          <p className="mt-2 text-xs leading-relaxed text-zinc-200">
            <b>At {site.name}</b>. A solar day lasts 29.5 Earth days with no atmosphere or twilight. In 2027–2028 the Sun peaks at {f.sunMax.toFixed(1)}°.
            {' '}{f.eMax < 0 ? 'Earth never rises here.' : `Earth hovers within ${f.stray.toFixed(0)}° of one azimuth (${f.eMin.toFixed(1)}° to ${f.eMax.toFixed(1)}° high) as libration rocks it.`}
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs text-sky-100">{f.sunMax < 15
        ? 'With the Sun and Earth this low, one ridge on the horizon can cut power or radio contact for days.'
        : 'This site is far from the pole, so the Sun climbs high. It serves as a baseline against polar ridges.'}</p>
    </section>
  )
}

/** What a planner could do about a loss of Earth contact. An idea on screen, not a computed result. */
export function RelayCard({ gapH, earthUp }: { gapH: number; earthUp: boolean }) {
  return (
    <section className="rounded-2xl border border-violet-400/35 bg-violet-500/[0.07] p-4 text-sm">
      <h2 className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold tracking-tight text-violet-100">Relay fallback <Concept /></h2>
      <p className="text-xs leading-relaxed text-zinc-200">
        {earthUp ? 'Earth is in view now, but' : 'Earth is below the horizon at the time shown, and'} this mission has a gap of up to <b>{h(gapH)}</b> with no direct line to Earth.
        {' '}A relay in lunar orbit, such as the planned Lunar Gateway station (NASA, CSA, ESA and JAXA), could carry the radio link during such gaps. MoonSlip does not model relays: every number on this page assumes a direct link only.
      </p>
    </section>
  )
}
