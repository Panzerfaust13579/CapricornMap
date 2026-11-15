import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type PointerEvent, type ReactNode } from 'react'
import { discFraction, indexAt, margins, maskAt, windows, type Body, type Ephem, type Metrics, type Needs, type PlanBOption, type Run } from './engine'

export const h = (x: number | null) => (x === null ? '—' : x >= 48 ? `${(x / 24).toFixed(1)} d` : `${x.toFixed(0)} h`)
export const pct = (x: number) => `${x.toFixed(0)}%`
export const slipLabel = (d: number) => `${d >= 0 ? '+' : '−'}${Math.abs(d)} d`

// Colours used inside SVG. Text never wears these below 7:1 on the void; the saturated status hues are for fills and glows.
// sunFill and earthFill are the pair the dataviz validator passes for large fills on this surface.
export const C = {
  void: '#030508', well: '#05080e', grid: '#1a2130', ink: '#f4f4f5', ink2: '#b4b4bd',
  sun: '#fbbf24', sunFill: '#c98500', earth: '#38bdf8', earthFill: '#3987e5',
  go: '#10b981', nogo: '#ef4444', planB: '#f4f4f5', custom: '#22d3ee',
}

export const btn = 'rounded-md border border-white/10 bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-zinc-100 transition-colors hover:border-white/20 hover:bg-white/[0.12]'
export const btnGo = 'rounded-md bg-go px-3 py-1 text-xs font-semibold text-void transition-colors hover:bg-emerald-400'
const verdictText = (v?: string) => (v === 'GO' ? 'text-emerald-300' : 'text-red-300')
const verdictPill = (v?: string) => (v === 'GO' ? 'border-go/50 bg-go/15 text-emerald-300' : 'border-nogo/50 bg-nogo/15 text-red-300')

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** A callback whose identity never changes, so memoised children are not re-rendered by it. */
export function useEvent<A extends unknown[], R>(f: (...a: A) => R) {
  const ref = useRef(f)
  useLayoutEffect(() => { ref.current = f })
  return useCallback((...a: A) => ref.current(...a), [])
}

/** Eases a number toward its target. Jumps at once under reduced motion, or while the value changes continuously (scrubbing, playing). */
export function useTween(target: number, ms = 420) {
  const [anim, setAnim] = useState<number | null>(null)
  const shown = useRef(target), last = useRef(0)
  useLayoutEffect(() => {
    const t0 = performance.now(), rapid = t0 - last.current < 160, from = shown.current
    last.current = t0
    if (rapid || from === target || reducedMotion() || !Number.isFinite(from) || !Number.isFinite(target)) {
      shown.current = target
      setAnim(null)
      return
    }
    setAnim(from)
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - t0) / ms))
      shown.current = from + (target - from) * (1 - (1 - k) ** 3)
      setAnim(k < 1 ? shown.current : null)
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    // A background tab throttles animation frames. The timer makes sure the true value lands regardless.
    const settle = setTimeout(() => { cancelAnimationFrame(raf); shown.current = target; setAnim(null) }, ms + 120)
    return () => { cancelAnimationFrame(raf); clearTimeout(settle) }
  }, [target, ms])
  return anim ?? target
}

/** A number that counts up or down to its new value. */
export const Num = ({ value, fmt }: { value: number; fmt: (x: number) => string }) => <>{fmt(useTween(value))}</>

export function Panel({ title, caption, explain, children, aside, badge, kicker, className = '', id }: {
  title: string; caption: string; explain: boolean; children?: ReactNode; aside?: ReactNode; badge?: ReactNode; kicker?: string; className?: string; id?: string
}) {
  return (
    <section id={id} className={`glass scroll-mt-32 rounded-2xl p-4 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {kicker && <span className="kicker text-sun">{kicker}</span>}
          <h2 className="text-[13px] font-semibold tracking-tight text-zinc-50">{title}</h2>
          {badge}
        </div>
        {aside}
      </div>
      {children}
      {explain && (
        <p className="mt-3 rounded-lg border border-earth/25 bg-earth/[0.07] px-3 py-2 text-xs leading-relaxed text-sky-100">
          {caption}
        </p>
      )}
    </section>
  )
}

/** A labelled divider between the three reading tiers of the page. */
export const Tier = ({ n, title, hint }: { n: string; title: string; hint: string }) => (
  <div className="flex items-center gap-3 pt-1">
    <span className="kicker shrink-0 text-zinc-300"><span className="text-sun">{n}</span> · {title}</span>
    <span className="hairline flex-1" />
    <span className="hidden shrink-0 text-xs text-zinc-400 sm:inline">{hint}</span>
  </div>
)

/** Marks anything that is an idea shown on screen, not a computed result. */
export const Concept = () => (
  <span className="rounded border border-violet-400/50 bg-violet-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-violet-200">
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

/* ---------------------------------------------------------------- Lunar day events and the magnetic scrubber */

/** A rise or set, in hours after landing. The scrubber snaps to these. */
export interface Mark { h: number; label: string; body: Body }

/** Sun and Earth windows for the hours after startMs, and the rises and sets between them. Null outside the ephemeris. */
export function lunarDay(e: Ephem, mask: number[], startMs: number, hours: number) {
  const i0 = Math.round(indexAt(e, startMs))
  if (i0 < 0 || i0 >= e.sunEl.length) return null
  const i1 = Math.min(e.sunEl.length - 1, i0 + Math.round((hours * 60) / e.stepMin))
  if (i1 <= i0) return null
  const sun = windows(margins(e, mask, 'sun', i0, i1), e.stepMin)
  const earth = windows(margins(e, mask, 'earth', i0, i1), e.stepMin)
  const edges = (rs: Run[], body: Body, set: string, rise: string): Mark[] => rs.slice(0, -1).map(r => ({ h: r.endH, label: r.visible ? set : rise, body }))
  return { i0, i1, sun, earth, marks: [...edges(sun, 'sun', 'Sunset', 'Sunrise'), ...edges(earth, 'earth', 'Earthset', 'Earthrise')] }
}

/** The nearest mark within tolH hours of hr, or null. */
export function snapTo(hr: number, marks: Mark[], tolH: number): Mark | null {
  let best: Mark | null = null
  for (const m of marks) if (Math.abs(m.h - hr) <= tolH && (!best || Math.abs(m.h - hr) < Math.abs(best.h - hr))) best = m
  return best
}

/** Where a dragged scrubber lands: on a rise or set when within px pixels of one, otherwise where the pointer is. */
export function magnet(hr: number, marks: Mark[], trackPx: number, hours: number, px = 6) {
  const hit = snapTo(hr, marks, (px / Math.max(120, trackPx)) * hours)
  return hit ? Math.round(hit.h) : hr
}

/* ---------------------------------------------------------------- Sky ribbon */

/** Another plan drawn faintly over the ribbon: plan B, or the Plan B card under the pointer. */
export interface Ghost { e: Ephem; mask: number[]; startMs: number; label: string; tone: 'b' | 'preview' }

const W = 720, PAD = 24
const COMPASS: [number, string, string][] = [
  [0, 'N 0°', 'N'], [45, 'NE', ''], [90, 'E 90°', 'E'], [135, 'SE', ''],
  [180, 'S 180°', 'S'], [225, 'SW', ''], [270, 'W 270°', 'W'], [315, 'NW', ''], [360, 'N 360°', 'N'],
]

export function SkyRibbon({ e, mask, dip, startMs, hours, scrubH, setScrubH, terrain, marks, ghost, children }: {
  e: Ephem; mask: number[]; dip: number; startMs: number; hours: number; scrubH: number; setScrubH: (h: number) => void
  terrain: string; marks: Mark[]; ghost?: Ghost | null; children?: ReactNode
}) {
  const [playing, setPlaying] = useState(false)
  const [hoverAz, setHoverAz] = useState<number | null>(null)
  const [box, width] = useWidth<HTMLDivElement>()
  const viaKey = useRef(false)
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
  if (i0 < 0 || i0 >= e.sunEl.length) return <p className="text-sm text-amber-300">No ephemeris for this date. Data covers 2027–2028.</p>
  const iNow = Math.min(i1, i0 + Math.round((scrubH * 60) / e.stepMin))

  const tracks = (az: number[], el: number[], a: number, b: number) => az.slice(a, b + 1).map((v, idx) => [v, el[a + idx]] as const)
  const sun = tracks(e.sunAz, e.sunEl, i0, i1), earth = tracks(e.earthAz, e.earthEl, i0, i1)

  // The ghost plan's Sun over its own lunar day, and its ridge when it stands somewhere else.
  const g0 = ghost ? Math.round(indexAt(ghost.e, ghost.startMs)) : -1
  const gSun = ghost && g0 >= 0 && g0 < ghost.e.sunEl.length
    ? tracks(ghost.e.sunAz, ghost.e.sunEl, g0, Math.min(ghost.e.sunEl.length - 1, g0 + Math.round((hours * 60) / ghost.e.stepMin)))
    : null
  const gMask = ghost && ghost.mask !== mask ? ghost.mask : null
  // Only a pinned plan B may stretch the axes. A hover preview is clipped instead, so the chart never jumps under the pointer.
  const stretch = ghost?.tone === 'b' ? [...(gMask ?? []), ...(gSun ?? []).map(p => p[1])] : []

  const els = [...sun, ...earth].map(p => p[1]).concat(mask, stretch)
  const yMin = Math.max(-12, Math.min(...mask, ...(ghost?.tone === 'b' && gMask ? gMask : []), dip) - 2)
  const yMax = Math.min(90, Math.max(...els) + 1.5)
  const x = (az: number) => PL + (az / 360) * (W - PL - PAD)
  const y = (el: number) => H - PB - ((el - yMin) / (yMax - yMin)) * (H - PB - PAD)
  const kx = (W - PL - PAD) / 360, ky = (H - PB - PAD) / (yMax - yMin)

  // Split a track where azimuth wraps through north so lines don't cross the whole ribbon.
  const path = (pts: readonly (readonly [number, number])[]) =>
    pts.map(([a, el], idx) => `${idx && Math.abs(a - pts[idx - 1][0]) < 180 ? 'L' : 'M'}${x(a).toFixed(1)},${y(el).toFixed(1)}`).join('')
  const ridge = (m: number[]) => m.map((v, a) => `${a ? 'L' : 'M'}${x(a).toFixed(1)},${y(v).toFixed(1)}`).join('') + `L${x(360).toFixed(1)},${y(m[0]).toFixed(1)}`
  const ridgeA = ridge(mask)
  const ground = `${ridgeA}L${x(360)},${H - PB}L${x(0)},${H - PB}Z`
  const ticks = Array.from({ length: 6 }, (_, idx) => yMin + ((yMax - yMin) * idx) / 5)

  // How much of each disc clears the terrain right now: the engine's own numbers drive every light effect below.
  const sunAz = e.sunAz[iNow], sunEl = e.sunEl[iNow], earthAz = e.earthAz[iNow], earthEl = e.earthEl[iNow]
  const sunM = sunEl + e.sunDiamDeg / 2 - maskAt(mask, sunAz), earthM = earthEl + e.earthDiamDeg / 2 - maskAt(mask, earthAz)
  const lit = discFraction(sunM, e.sunDiamDeg)
  const sx = x(sunAz), sy = y(sunEl), bloomR = 46 + 120 * lit
  const radii = (d: number) => [Math.max(2.4, (d / 2) * kx), Math.max(2.4, (d / 2) * ky)] as const
  const [srx, sry] = radii(e.sunDiamDeg), [erx, ery] = radii(e.earthDiamDeg)

  const discLabel = (az: number, el: number, fill: string, label: string, hidden: boolean) => {
    const left = az > 290
    return (
      <text x={x(az) + (left ? -9 : 9)} y={Math.max(PAD + 11 * k, Math.min(H - PB - 4, y(el) - 9))} fontSize={11 * k} fontWeight="600"
        fill={hidden ? C.ink2 : fill} stroke={C.well} strokeWidth={3.5 * k} paintOrder="stroke" textAnchor={left ? 'end' : 'start'}>
        {label}{hidden ? ' · behind ridge' : ''}
      </text>
    )
  }
  const toAz = (ev: PointerEvent<SVGSVGElement>) => {
    const r = ev.currentTarget.getBoundingClientRect()
    const az = ((((ev.clientX - r.left) / r.width) * W - PL) / (W - PL - PAD)) * 360
    return az >= 0 && az <= 360 ? az : null
  }
  const when = new Date(Date.parse(e.t0) + iNow * e.stepMin * 60000).toISOString().slice(0, 16).replace('T', ' ')
  const stand = (name: string, az: number, el: number, m: number, color: string) => (
    <span>
      <b className={`font-mono font-semibold ${color}`}>{name} {el.toFixed(2).replace('-', '−')}°</b>
      {' '}· top {Math.abs(m).toFixed(2)}° {m > 0 ? 'above the horizon' : `below the ridge at az ${az.toFixed(0)}°`}
    </span>
  )
  const stepBy = (delta: number) => {
    setPlaying(false)
    setScrubH(Math.min(hours, Math.max(0, scrubH + delta)))
  }
  const onScrub = (ev: ChangeEvent<HTMLInputElement>) => {
    setPlaying(false)
    const v = +ev.target.value
    // A drag is pulled onto a nearby rise or set. Arrow keys are not, so every hour stays reachable.
    const to = viaKey.current ? v : magnet(v, marks, ev.target.clientWidth - 16, hours)
    if (to !== v && to !== scrubH && navigator.userActivation?.isActive) navigator.vibrate?.(6) // a tick on phones that support it
    setScrubH(to)
  }
  const atMark = marks.find(m => Math.round(m.h) === scrubH)

  return (
    <div ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} className="well w-full cursor-crosshair rounded-xl" role="img"
        aria-label={`Sky ribbon: Sun at elevation ${sunEl.toFixed(1)} degrees${sunM > 0 ? '' : ', behind the terrain'}, Earth at ${earthEl.toFixed(1)} degrees${earthM > 0 ? '' : ', behind the terrain'}, against the ${terrain} horizon`}
        onPointerMove={ev => setHoverAz(toAz(ev))} onPointerLeave={() => setHoverAz(null)}>
        <defs>
          <clipPath id="sr-clip"><rect x={PL} y={PAD} width={W - PL - PAD} height={H - PB - PAD} /></clipPath>
          <radialGradient id="sr-bloom" gradientUnits="userSpaceOnUse" cx={sx} cy={sy} r={bloomR}>
            <stop offset="0" stopColor="#fef3c7" stopOpacity="0.6" />
            <stop offset="0.22" stopColor={C.sun} stopOpacity="0.3" />
            <stop offset="1" stopColor="#f59e0b" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="sr-ridge" gradientUnits="userSpaceOnUse" cx={sx} cy={sy} r={bloomR * 1.6}>
            <stop offset="0" stopColor="#fffbeb" stopOpacity="1" />
            <stop offset="0.5" stopColor={C.sun} stopOpacity="0.55" />
            <stop offset="1" stopColor={C.sun} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="sr-ground" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#343a47" />
            <stop offset="1" stopColor="#0d1017" />
          </linearGradient>
          <radialGradient id="sr-earth">
            <stop offset="0.35" stopColor={C.earth} stopOpacity="0.5" />
            <stop offset="1" stopColor={C.earth} stopOpacity="0" />
          </radialGradient>
        </defs>
        {ticks.map(t => (
          <g key={t}>
            <line x1={PL} x2={W - PAD} y1={y(t)} y2={y(t)} stroke={C.grid} />
            <text x={PL - 4} y={y(t) + 3 * k} fontSize={9 * k} fill={C.ink2} textAnchor="end" fontFamily="var(--font-mono)">{t.toFixed(1)}°</text>
          </g>
        ))}
        {COMPASS.map(([a, long, short]) => (
          <g key={a}>
            <line x1={x(a)} x2={x(a)} y1={PAD} y2={H - PB} stroke={C.grid} strokeDasharray={a % 90 ? '2 5' : undefined} />
            <text x={x(a)} y={H - 5} fontSize={(width < 520 ? 9.5 : 9) * k} fill={a % 90 ? C.ink2 : C.ink} textAnchor="middle" fontFamily="var(--font-mono)">
              {width < 520 ? short : long}
            </text>
          </g>
        ))}
        <g clipPath="url(#sr-clip)">
          {yMin < 0 && yMax > 0 && <line x1={PL} x2={W - PAD} y1={y(0)} y2={y(0)} stroke="#2e3547" strokeWidth="1" />}
          {/* Glare behind the terrain, so the ridge stands in silhouette. It scales with the lit share of the disc: no Sun, no glow. */}
          <circle cx={sx} cy={sy} r={bloomR} fill="url(#sr-bloom)" opacity={lit} />
          <path d={path(sun)} stroke={C.sun} strokeOpacity="0.6" strokeWidth="1.5" fill="none" />
          <path d={path(earth)} stroke={C.earth} strokeOpacity="0.6" strokeWidth="1.5" fill="none" />
          {gSun && ghost && (
            <path d={path(gSun)} fill="none" stroke={C.planB} strokeWidth={ghost.tone === 'b' ? 1.4 : 1.8} strokeLinecap="round"
              strokeDasharray={ghost.tone === 'b' ? '6 4' : '0.5 4.5'} strokeOpacity={ghost.tone === 'b' ? 0.75 : 0.95} />
          )}
          <ellipse cx={x(earthAz)} cy={y(earthEl)} rx={erx * 2.4} ry={ery * 2.4} fill="url(#sr-earth)" />
          <ellipse cx={x(earthAz)} cy={y(earthEl)} rx={erx} ry={ery} fill={C.earth} />
          <ellipse cx={sx} cy={sy} rx={srx} ry={sry} fill={C.sun} />
          <ellipse cx={sx} cy={sy} rx={srx * 0.55} ry={sry * 0.55} fill="#fffbeb" />

          <path d={ground} fill="url(#sr-ground)" />
          {/* Night falls on the ground as the disc is covered. */}
          <path d={ground} fill={C.void} opacity={(1 - lit) * 0.55} style={{ transition: 'opacity 240ms linear' }} />
          <path d={path(sun)} stroke={C.sun} strokeOpacity="0.2" strokeWidth="1" strokeDasharray="2 3" fill="none" />
          <path d={path(earth)} stroke={C.earth} strokeOpacity="0.2" strokeWidth="1" strokeDasharray="2 3" fill="none" />
          <path d={ridgeA} fill="none" stroke="#7b8494" strokeWidth="1.2" strokeLinejoin="round" />
          <path d={ridgeA} fill="none" stroke="url(#sr-ridge)" strokeWidth="2.2" strokeLinejoin="round" opacity={lit} />
          {gMask && <path d={ridge(gMask)} fill="none" stroke={C.planB} strokeWidth="1.4" strokeDasharray={ghost!.tone === 'b' ? '6 4' : '0.5 4.5'} strokeLinecap="round" strokeOpacity="0.8" />}
          <line x1={PL} x2={W - PAD} y1={y(dip)} y2={y(dip)} stroke={C.ink2} strokeDasharray="4 4" strokeOpacity="0.8" />

          {/* A body behind the ridge: outline only, so the planner can see where it went. */}
          {sunM <= 0 && <ellipse cx={sx} cy={sy} rx={srx + 2} ry={sry + 2} fill="none" stroke={C.sun} strokeWidth="1.2" strokeDasharray="2 2.5" />}
          {earthM <= 0 && <ellipse cx={x(earthAz)} cy={y(earthEl)} rx={erx + 2} ry={ery + 2} fill="none" stroke={C.earth} strokeWidth="1.2" strokeDasharray="2 2.5" />}
          {gSun && <circle cx={x(gSun[0][0])} cy={y(gSun[0][1])} r={4.5} fill={C.well} stroke={C.planB} strokeWidth="1.5" />}
          {hoverAz !== null && <line x1={x(hoverAz)} x2={x(hoverAz)} y1={PAD} y2={H - PB} stroke={C.earth} strokeDasharray="3 3" strokeOpacity="0.8" />}
          {discLabel(sunAz, sunEl, C.sun, 'Sun', sunM <= 0)}
          {discLabel(earthAz, earthEl, C.earth, 'Earth', earthM <= 0)}
        </g>
        {ghost && gSun && (
          <text x={W - PAD - 4} y={PAD + 11 * k} fontSize={10 * k} fontWeight="600" textAnchor="end" fill={C.planB}
            stroke={C.well} strokeWidth={3.5 * k} paintOrder="stroke" fontFamily="var(--font-mono)">
            {ghost.tone === 'b' ? '– – B · ' : '· · · PREVIEW · '}{ghost.label}
          </text>
        )}
      </svg>

      {children}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1">
          <button onClick={() => stepBy(-24)} className={btn} title="Back 24 hours">−24h</button>
          <button onClick={() => stepBy(-1)} className={btn} title="Back 1 hour">−1h</button>
          <button onClick={() => setPlaying(!playing)}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${playing ? 'bg-sun text-void' : 'border border-earth/45 bg-earth/15 text-sky-200 hover:bg-earth/25'}`}
            aria-pressed={playing}>
            {playing ? 'Pause' : 'Play lunar day'}
          </button>
          <button onClick={() => stepBy(1)} className={btn} title="Forward 1 hour">+1h</button>
          <button onClick={() => stepBy(24)} className={btn} title="Forward 24 hours">+24h</button>
        </div>
        <div className="relative min-w-[160px] flex-1 pb-2">
          <input type="range" min={0} max={hours} value={scrubH} onChange={onScrub}
            onKeyDown={() => { viaKey.current = true }} onPointerDown={() => { viaKey.current = false }}
            className="block w-full" aria-label="Time since landing, in hours. Dragging snaps to sunrises and sunsets; arrow keys move one hour." />
          <div aria-hidden className="pointer-events-none absolute inset-x-2 bottom-0 h-2">
            {marks.map(m => (
              <span key={m.body + m.h} className="absolute top-0 h-2 w-0.5 -translate-x-1/2 rounded-full"
                style={{ left: `${(m.h / hours) * 100}%`, background: m.body === 'sun' ? C.sun : C.earth, opacity: Math.round(m.h) === scrubH ? 1 : 0.6 }} />
            ))}
          </div>
        </div>
        <div className="w-[21ch] shrink-0 text-right font-mono text-xs tabular-nums">
          <div className="whitespace-nowrap text-zinc-100">{when} UTC</div>
          <div className="h-4">
            {atMark && (
              <span key={atMark.body + atMark.h} className={`snap-flash inline-block font-semibold ${atMark.body === 'sun' ? 'text-amber-300' : 'text-sky-300'}`}>
                ◆ {atMark.label}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-zinc-300" aria-live="off">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {stand('Sun', sunAz, sunEl, sunM, 'text-amber-300')}
          {stand('Earth', earthAz, earthEl, earthM, 'text-sky-300')}
        </div>
        {hoverAz !== null && (
          <span className="font-mono text-sky-200 tabular-nums">
            Az {hoverAz.toFixed(1)}° · Terrain {maskAt(mask, hoverAz).toFixed(2)}°
            {gMask ? ` · ${ghost!.tone === 'b' ? 'Plan B' : 'Preview'} ${maskAt(gMask, hoverAz).toFixed(2)}°` : ''}
          </span>
        )}
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
        Filled ridge: {terrain} horizon, lit where the Sun clears it · Grey dashed: smooth sphere ({dip.toFixed(2)}°) · White dashed: plan B's Sun path and ridge.
        Ticks under the slider are rises and sets. Disc heights to scale (Sun 0.53°, Earth 1.9°).
      </p>
    </div>
  )
}

/* ---------------------------------------------------------------- Verdict HUD */

export type Chip = { up: boolean; inH: number | null }
/** No option: nothing in reach at all, so only the lead (a diagnosis) is shown. */
export interface Rescue { option?: PlanBOption; lead: string }

function Gauge({ label, value, fmt, note, target, pass, fill, tick }: {
  label: string; value: number; fmt: (x: number) => string; note?: ReactNode; target: string; pass: boolean
  /** Bar length and threshold position, both 0 to 1 on the same scale. */
  fill: number; tick: number | null
}) {
  const clamp = (v: number) => Math.max(0, Math.min(1, v)) * 100
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${pass ? 'border-white/10 bg-black/30' : 'border-nogo/55 bg-nogo/10'}`}>
      <div className="flex items-center justify-between gap-1">
        <span className="kicker text-zinc-400">{label}</span>
        <span className={`kicker ${pass ? 'text-emerald-300' : 'text-red-300'}`}>{pass ? 'OK' : 'FAIL'}</span>
      </div>
      <div className="mt-1 font-mono text-xl font-semibold tracking-tight text-zinc-50 tabular-nums">
        <Num value={value} fmt={fmt} />{note}
      </div>
      <div className="relative mt-2 h-1.5 rounded-full bg-white/10">
        <div className={`h-full rounded-full transition-[width] duration-300 ${pass ? 'bg-go' : 'bg-nogo'}`} style={{ width: `${clamp(fill)}%` }} />
        {tick !== null && <span aria-hidden className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-zinc-100" style={{ left: `calc(${clamp(tick)}% - 1px)` }} />}
      </div>
      <div className="mt-1.5 text-[11px] text-zinc-400">{target}</div>
    </div>
  )
}

function TChip({ c, set, rise, on, lamp }: { c: Chip; set: string; rise: string; on: string; lamp: string }) {
  return (
    <div className={`min-w-[8.5rem] flex-1 rounded-xl border px-3 py-2 sm:flex-none ${c.up ? on : 'border-white/10 bg-black/30'}`}>
      <div className="flex items-center gap-1.5">
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${c.up ? lamp : 'border border-zinc-400'}`} />
        {/* Live on the label only: the countdown number ticks every frame during play and would flood a screen reader. */}
        <span className="kicker text-zinc-300" aria-live="polite">{c.up ? set : rise} T−</span>
      </div>
      <div className="mt-0.5 font-mono text-lg font-semibold text-zinc-50 tabular-nums">
        {c.inH === null ? '> 30 d' : <Num value={c.inH} fmt={h} />}
      </div>
    </div>
  )
}

export function VerdictStrip({ m, needs, sun, earth, rescue, onCompare, onUse }: {
  m: Metrics; needs?: Needs; sun: Chip; earth: Chip
  /** The best way out, shown when the plan fails. */
  rescue?: Rescue | null; onCompare?: (o: PlanBOption) => void; onUse?: (o: PlanBOption) => void
}) {
  const go = m.verdict === 'GO'
  const best = rescue?.option
  const gain = m.meanHorizWm2 > 0.5 ? m.meanVertWm2 / m.meanHorizWm2 : null
  const rgb = go ? '16 185 129' : '239 68 68'
  // A "no more than" need: the bar runs to 1.5 times the limit, so the threshold tick sits two thirds along.
  const cap = (value: number, limit?: number) => {
    if (limit === undefined) return { fill: 0, tick: null }
    const scale = Math.max(limit * 1.5, value, 1)
    return { fill: value / scale, tick: limit / scale }
  }
  const dark = cap(m.longestDarkH, needs?.maxDarkH), gap = cap(m.longestCommsGapH, needs?.maxGapH)

  return (
    <section className="glass relative overflow-hidden rounded-2xl" aria-label="Landing verdict">
      <p className="sr-only" role="status">Verdict {m.verdict}</p>
      <div aria-hidden className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, rgb(${rgb}), transparent)` }} />
      <div aria-hidden className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={{ background: `radial-gradient(60% 120% at 0% 0%, rgb(${rgb} / 0.16), transparent 60%)` }} />

      <div className="relative p-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div key={m.verdict} className={`lamp lamp-in rounded-xl border px-4 py-2 ${go ? 'border-go/60 text-emerald-300' : 'border-nogo/60 text-red-300'} bg-black/35`}>
            <div className="kicker text-zinc-300">Landing verdict</div>
            <div className={`font-mono text-4xl font-black leading-none tracking-tight sm:text-5xl ${go ? 'glow-go' : 'glow-nogo'}`}>{m.verdict}</div>
          </div>
          <div className="min-w-0 flex-1 basis-56">
            <div className={`kicker ${go ? 'text-emerald-300' : 'text-red-300'}`}>
              {go ? 'All thresholds met' : `${m.failed.length} threshold${m.failed.length === 1 ? '' : 's'} breached`}
            </div>
            {go ? (
              <p className="mt-1 text-sm text-zinc-100">Sunlight, night survival and the Earth link all hold across the mission window.</p>
            ) : (
              <ul className="mt-1 space-y-0.5 text-sm text-zinc-100">
                {m.failed.map(f => (
                  <li key={f} className="flex gap-2">
                    <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-nogo" />
                    {f[0].toUpperCase() + f.slice(1)}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <TChip c={sun} set="Sunset" rise="Sunrise" on="border-sun/45 bg-sun/10" lamp="bg-sun shadow-[0_0_8px_var(--color-sun)]" />
            <TChip c={earth} set="Earthset" rise="Earthrise" on="border-earth/45 bg-earth/10" lamp="bg-earth shadow-[0_0_8px_var(--color-earth)]" />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          <Gauge label="Sunlight" value={m.sunPct} fmt={pct}
            target={needs ? `Need ≥ ${needs.minSunPct}%` : 'Share of mission'}
            pass={!needs || m.sunPct >= needs.minSunPct} fill={m.sunPct / 100} tick={needs ? needs.minSunPct / 100 : null} />
          <Gauge label="Longest night" value={m.longestDarkH} fmt={h}
            target={needs ? `Limit ≤ ${needs.maxDarkH} h` : 'Peak dark span'}
            pass={!needs || m.longestDarkH <= needs.maxDarkH} fill={dark.fill} tick={dark.tick} />
          <Gauge label="Earth visible" value={m.earthPct} fmt={pct} note={<span className="ml-1.5 text-xs font-normal text-zinc-400">{h(m.earthH)}</span>}
            target={needs ? `Need ≥ ${needs.minEarthPct}%` : 'Direct link'}
            pass={!needs || m.earthPct >= needs.minEarthPct} fill={m.earthPct / 100} tick={needs ? needs.minEarthPct / 100 : null} />
          <Gauge label="Longest gap" value={m.longestCommsGapH} fmt={h}
            target={needs ? `Limit ≤ ${needs.maxGapH} h` : 'Max DTE outage'}
            pass={!needs || m.longestCommsGapH <= needs.maxGapH} fill={gap.fill} tick={gap.tick} />
          <div className="col-span-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 sm:col-span-1">
            <div className="flex items-center justify-between gap-1">
              <span className="kicker text-zinc-400">Solar yield</span>
              {gain && <span className="kicker text-amber-300">{gain.toFixed(gain >= 100 ? 0 : 1)}× vert</span>}
            </div>
            <div className="mt-1 font-mono text-xl font-semibold tracking-tight text-zinc-50 tabular-nums">
              <Num value={m.meanVertWm2} fmt={v => v.toFixed(0)} /> <span className="text-xs font-normal text-zinc-400">W/m² vert</span>
            </div>
            <div className="mt-2 text-[11px] text-zinc-400 tabular-nums">
              Mission mean. Horizontal deck: <span className="font-mono text-zinc-200">{m.meanHorizWm2.toFixed(0)}</span> W/m²
            </div>
          </div>
        </div>

        {!go && rescue && !best && (
          <p className="rise mt-4 rounded-xl border border-sun/40 bg-sun/[0.07] px-3 py-2.5 text-sm text-amber-100">{rescue.lead}</p>
        )}
        {!go && rescue && best && (
          <div className={`rise mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2.5 text-sm ${best.m.verdict === 'GO' ? 'border-go/35 bg-go/[0.07]' : 'border-sun/40 bg-sun/[0.07]'}`}>
            <span className="min-w-0 flex-1 basis-64">
              <span className="text-zinc-300">{rescue.lead} </span>
              <b className="font-semibold text-white">{best.kind === 'date' ? `land ${best.start} (${slipLabel(best.slipDays)})` : `${best.siteName}, ${best.start}`}</b>
              <span className={`font-mono font-semibold ${verdictText(best.m.verdict)}`}> {best.m.verdict}</span>
              <span className="text-zinc-300">. {best.sentence[0].toUpperCase() + best.sentence.slice(1)}.</span>
            </span>
            <span className="flex gap-2">
              <button className={btn} onClick={() => onCompare?.(best)}>Compare</button>
              <button className={btnGo} onClick={() => onUse?.(best)}>Use this plan</button>
            </span>
          </div>
        )}
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------- Launch slip bar */

/** The launch delay as one bar: each day is a cell, tall and green where the mission survives, short and red where it does not. */
export const SlipBar = memo(function SlipBar({ slip, setSlip, strip, start }: {
  slip: number; setSlip: (s: number) => void; strip: { s: number; date: string; m: Metrics | null }[]; start: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const n = strip.length
  if (!n) return null
  const lo = strip[0].s, hi = strip[n - 1].s
  const idx = Math.max(0, Math.min(n - 1, slip - lo))
  const at = (ev: PointerEvent<HTMLDivElement>) => {
    const r = ev.currentTarget.getBoundingClientRect()
    return Math.max(0, Math.min(n - 1, Math.floor(((ev.clientX - r.left) / r.width) * n)))
  }
  const centre = (i: number) => `${((i + 0.5) / n) * 100}%`
  const cur = strip[idx], shown = strip[hover ?? idx]
  const zones: { v: string; a: number; b: number }[] = []
  for (const { s, m } of strip) {
    const v = m?.verdict ?? 'No data', last = zones[zones.length - 1]
    if (last && last.v === v) last.b = s
    else zones.push({ v, a: s, b: s })
  }

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="kicker text-zinc-400">Launch slip</div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tracking-tight text-sun tabular-nums">{slipLabel(slip)}</span>
            <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${cur.m ? verdictPill(cur.m.verdict) : 'border-white/15 text-zinc-300'}`}>{cur.m?.verdict ?? 'NO DATA'}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {slip !== 0 && <button onClick={() => setSlip(0)} className="mr-1 text-[11px] text-sky-300 underline">reset</button>}
          <button onClick={() => setSlip(Math.max(lo, slip - 1))} className={btn + ' h-8 w-8 !px-0 text-base'} aria-label="One day earlier">−</button>
          <button onClick={() => setSlip(Math.min(hi, slip + 1))} className={btn + ' h-8 w-8 !px-0 text-base'} aria-label="One day later">+</button>
        </div>
      </div>

      <div className="relative mt-2 h-11 cursor-ew-resize touch-pan-y select-none"
        onPointerDown={ev => { ev.currentTarget.setPointerCapture(ev.pointerId); setSlip(strip[at(ev)].s) }}
        onPointerMove={ev => { const i = at(ev); setHover(i); if (ev.buttons) setSlip(strip[i].s) }}
        onPointerLeave={() => setHover(null)}>
        <input type="range" min={lo} max={hi} value={slip} onChange={e => setSlip(+e.target.value)}
          className="peer pointer-events-none absolute inset-0 h-full w-full opacity-0"
          aria-label="Launch slip in days" aria-valuetext={`${slipLabel(slip)}, landing ${cur.date}, ${cur.m?.verdict ?? 'no data'}`} />
        <div aria-hidden className="absolute inset-x-0 top-1/2 flex h-4 -translate-y-1/2 items-center gap-px">
          {strip.map(({ s, m }, i) => (
            <span key={s} className={`flex-1 rounded-[2px] transition-[filter] ${!m ? 'h-1 bg-white/15' : m.verdict === 'GO' ? 'h-4 bg-go' : 'h-1.5 bg-nogo'} ${i === hover ? 'brightness-150' : ''}`} />
          ))}
        </div>
        {lo <= 0 && hi >= 0 && (
          <span aria-hidden className="absolute top-0 -translate-x-1/2 font-mono text-[9px] leading-none text-zinc-300" style={{ left: centre(-lo) }}>
            0<span className="mx-auto mt-px block h-1.5 w-px bg-zinc-300" />
          </span>
        )}
        <span aria-hidden className="pointer-events-none absolute top-1/2 h-9 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-white/15 shadow-[0_0_14px_rgb(255_255_255/0.6)] transition-[left] duration-100 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-earth"
          style={{ left: centre(idx) }} />
      </div>

      <div className="flex justify-between font-mono text-[10px] text-zinc-400">
        <span>{slipLabel(lo)}</span>
        <span>{slipLabel(hi)}</span>
      </div>
      <p className="truncate text-center font-mono text-[11px] text-zinc-100">
        {slipLabel(shown.s)} · lands {shown.date} · {shown.m ? `${shown.m.verdict} · ${pct(shown.m.sunPct)} sun` : 'no data'}
      </p>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 border-t border-white/10 pt-2 text-[11px] text-zinc-300">
        <span className="text-zinc-400">Nominal {start}:</span>
        {zones.map(z => (
          <span key={z.a} className="font-mono">
            <b className={z.v === 'No data' ? 'text-zinc-300' : verdictText(z.v)}>{z.v}</b> {z.a === z.b ? slipLabel(z.a) : `${slipLabel(z.a)} to ${slipLabel(z.b)}`}
          </span>
        ))}
      </p>
    </div>
  )
})

/* ---------------------------------------------------------------- Comparator */

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
          <tr className="border-b border-white/10 text-left text-xs">
            <th className="pb-2 font-normal" />
            <th className="pb-2 font-semibold text-amber-300"><span aria-hidden className="mr-1.5 inline-block h-2 w-2 rounded-full bg-sun" />{la}</th>
            <th className="pb-2 font-semibold text-zinc-50"><span aria-hidden className="mr-1.5 inline-block h-2 w-2 rounded-full bg-zinc-50" />{lb}</th>
            <th className="kicker pb-2 text-zinc-400">Δ B − A</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="py-2 text-zinc-300">Verdict</td>
            {[a, b].map((m, idx) => (
              <td key={idx} className="py-2">
                <span className={`rounded border px-1.5 py-0.5 font-mono text-xs font-bold ${m ? verdictPill(m.verdict) : 'border-white/15 text-zinc-300'}`}>
                  {m?.verdict ?? 'no data'}
                </span>
              </td>
            ))}
            <td className="py-2">
              <div className="flex flex-wrap gap-1.5">
                {onSwap && b && <button className={btn} onClick={onSwap}>Swap A ↔ B</button>}
                {onUse && b && <button className={btnGo} onClick={onUse}>Use plan B</button>}
              </div>
            </td>
          </tr>
          {ROWS.map(([label, f, fmt, better]) => {
            const va = a ? f(a) : null
            const vb = b ? f(b) : null
            const d = va !== null && vb !== null ? vb - va : null
            const flat = d === null || Math.abs(d) < 0.05
            const fmtD = d === null ? '' : flat ? '0' : `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}`
            const good = !flat && (better === 'high' ? d! > 0 : d! < 0)
            return (
              <tr key={label} className="border-t border-white/[0.07]">
                <td className="py-1.5 text-zinc-300">{label}</td>
                <td className="py-1.5 font-mono text-xs text-zinc-100 tabular-nums">{va !== null ? fmt(va) : '—'}</td>
                <td className="py-1.5 font-mono text-xs text-zinc-100 tabular-nums">{vb !== null ? fmt(vb) : '—'}</td>
                <td className={`py-1.5 font-mono text-xs font-semibold tabular-nums ${flat ? 'text-zinc-400' : good ? 'text-emerald-300' : 'text-red-300'}`}>
                  {fmtD}{!flat && <span className="ml-1.5 font-sans text-[10px] font-normal">{good ? 'better' : 'worse'}</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ---------------------------------------------------------------- Plan B */

export const PlanBPanel = memo(function PlanBPanel({ options, nextGo, onPick, onUse, onPreview, activeKey }: {
  options: PlanBOption[]; onPick: (o: PlanBOption) => void; onUse?: (o: PlanBOption) => void
  /** The calendar's first GO date after the slipped date, offered when no option in the list is GO. */
  nextGo?: PlanBOption | null
  /** The card under the pointer or with focus, drawn as a ghost on the sky ribbon. Null when none. */
  onPreview?: (o: PlanBOption | null) => void; activeKey?: string
}) {
  const [all, setAll] = useState(false)
  const [filter, setFilter] = useState<'all' | 'date' | 'site' | 'next'>('all')
  const [goOnly, setGoOnly] = useState(false)

  if (!options.length) return <p className="text-sm text-zinc-400">No other option in reach. Try the calendar for later dates.</p>

  const dateCount = options.filter(o => o.kind === 'date').length
  const siteCount = options.filter(o => o.kind === 'site').length
  const goCount = options.filter(o => o.m.verdict === 'GO').length
  const next = goCount === 0 ? nextGo : null

  const filtered = filter === 'next' && next
    ? [next]
    : options.filter(o => (filter === 'all' || filter === 'next' || o.kind === filter) && (!goOnly || o.m.verdict === 'GO'))
  const shown = all ? filtered : filtered.slice(0, 6)
  const tab = (active: boolean) => `rounded-md px-2 py-1 text-xs font-medium transition-colors ${active ? 'bg-zinc-100 text-void' : 'border border-white/10 bg-white/[0.05] text-zinc-200 hover:bg-white/[0.12]'}`

  return (
    <div className="@container" onPointerLeave={() => onPreview?.(null)}>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <button onClick={() => setFilter('all')} className={tab(filter === 'all')} aria-pressed={filter === 'all'}>All ({options.length})</button>
        <button onClick={() => setFilter('date')} className={tab(filter === 'date')} aria-pressed={filter === 'date'}>New date ({dateCount})</button>
        <button onClick={() => setFilter('site')} className={tab(filter === 'site')} aria-pressed={filter === 'site'}>Backup site ({siteCount})</button>
        {next && (
          <button onClick={() => setFilter('next')} aria-pressed={filter === 'next'}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${filter === 'next' ? 'border-go bg-go text-void' : 'border-go/60 bg-go/15 text-emerald-300 hover:bg-go/25'}`}>
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-300 motion-safe:animate-pulse" />
            Next GO window ({next.start})
          </button>
        )}
        <button onClick={() => setGoOnly(!goOnly)} aria-pressed={goOnly}
          className={`ml-auto rounded-md border px-2 py-1 text-xs font-medium transition-colors ${goOnly ? 'border-go/60 bg-go/15 text-emerald-300' : 'border-white/10 bg-white/[0.05] text-zinc-200 hover:bg-white/[0.12]'}`}>
          GO only ({goCount})
        </button>
      </div>

      {!shown.length ? (
        <p className="rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-zinc-300">No options match the current filter.</p>
      ) : (
        <ol className="grid gap-2 @lg:grid-cols-2">
          {shown.map((o, idx) => {
            const selected = activeKey === `${o.siteId}@${o.start}`
            return (
              <li key={o.siteId + o.start}
                onPointerEnter={() => onPreview?.(o)} onFocus={() => onPreview?.(o)} onBlur={() => onPreview?.(null)}
                className={`rounded-xl border p-3 transition-colors ${selected ? 'border-zinc-100/80 bg-white/[0.08]' : 'border-white/10 bg-black/30 hover:border-white/30 hover:bg-white/[0.05]'}`}>
                <div className="flex items-start justify-between gap-2 text-sm">
                  <button onClick={() => onPick(o)} className="text-left font-medium text-zinc-50 hover:underline">
                    <span className="mr-1.5 font-mono text-xs text-zinc-400">{String(idx + 1).padStart(2, '0')}</span>
                    {o.siteName}
                  </button>
                  <span className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[11px] font-bold ${verdictPill(o.m.verdict)}`}>
                    {o.m.verdict}
                  </span>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-300">
                  <span className="kicker rounded border border-white/15 px-1.5 py-0.5 text-zinc-200">
                    {o.kind === 'date' ? 'new date' : 'new site'}
                  </span>
                  <span className="font-mono text-zinc-100">{o.start}</span>
                  <span className="font-mono">slip {slipLabel(o.slipDays)}</span>
                </div>

                <div className="mt-2.5 grid grid-cols-2 gap-3 text-[11px] text-zinc-300">
                  <div>
                    <div className="flex justify-between"><span>Sun</span><span className="font-mono text-zinc-100">{pct(o.m.sunPct)}</span></div>
                    <div className="mt-1 h-1 rounded-full bg-white/10"><div className="h-full rounded-full bg-sun" style={{ width: `${o.m.sunPct}%` }} /></div>
                  </div>
                  <div>
                    <div className="flex justify-between"><span>Earth</span><span className="font-mono text-zinc-100">{pct(o.m.earthPct)}</span></div>
                    <div className="mt-1 h-1 rounded-full bg-white/10"><div className="h-full rounded-full bg-earth" style={{ width: `${o.m.earthPct}%` }} /></div>
                  </div>
                </div>

                <p className="mt-2 text-xs leading-relaxed text-zinc-200">{o.sentence[0].toUpperCase() + o.sentence.slice(1)}.</p>

                <div className="mt-2.5 flex items-center justify-end gap-1.5 border-t border-white/10 pt-2.5">
                  <button onClick={() => onPick(o)} className={btn} aria-pressed={selected}>{selected ? 'Comparing (B)' : 'Compare (B)'}</button>
                  {onUse && <button onClick={() => onUse(o)} className={btnGo}>Adopt plan</button>}
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {filtered.length > 6 && (
        <button onClick={() => setAll(!all)} className="mt-3 text-xs font-medium text-sky-300 underline">
          {all ? 'Show top 6' : `Show all ${filtered.length}`}
        </button>
      )}
    </div>
  )
})
