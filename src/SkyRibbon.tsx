import { useEffect, useRef, useState } from 'react'
import { Button, Flex, Slider, Tag, Typography, theme } from 'antd'
import { indexAt, margin, type Ephem } from './engine'

export const SUN = '#fadb14'
export const EARTH = '#4096ff'
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N']
const PAD = { l: 40, r: 12, t: 12, b: 26 }
const STEPS = [0.5, 1, 2, 5, 10, 20]

/** Width of the container in CSS pixels, so chart text stays readable at any size. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(720)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

function status(name: string, el: number, az: number, mask: number[], d: number) {
  const m = margin(el, az, mask, d)
  return m > 0 ? { up: true, text: `${name} visible, ${m.toFixed(1)}° above the horizon` } : { up: false, text: `${name} hidden, ${(-m).toFixed(1)}° below the horizon` }
}

export function SkyRibbon({ e, mask, dip, startMs, hours, scrubH, setScrubH, terrain }: {
  e: Ephem; mask: number[]; dip: number; startMs: number; hours: number; scrubH: number; setScrubH: (h: number) => void; terrain: string
}) {
  const { token } = theme.useToken()
  const [ref, W] = useWidth()
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setScrubH(scrubH + 3 > hours ? 0 : scrubH + 3), 40)
    return () => clearInterval(t)
  }, [playing, scrubH, hours, setScrubH])

  const i0 = Math.round(indexAt(e, startMs))
  if (i0 < 0 || i0 >= e.sunEl.length) return <Typography.Text type="warning">No ephemeris for this date. Data covers 2027–2028.</Typography.Text>
  const i1 = Math.min(e.sunEl.length - 1, i0 + Math.round((hours * 60) / e.stepMin))
  const iNow = Math.min(i1, i0 + Math.round((scrubH * 60) / e.stepMin))

  const H = W < 520 ? 230 : 300
  const track = (az: number[], el: number[]) => az.slice(i0, i1 + 1).map((a, k) => [a, el[i0 + k]] as const)
  const sun = track(e.sunAz, e.sunEl), earth = track(e.earthAz, e.earthEl)
  const yMin = Math.max(-10, Math.min(...mask, dip) - 1.5)
  const yMax = Math.min(90, Math.max(...sun.map(p => p[1]), ...earth.map(p => p[1]), ...mask) + 1.5)
  const x = (az: number) => PAD.l + (az / 360) * (W - PAD.l - PAD.r)
  const y = (el: number) => H - PAD.b - ((el - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b)
  const kx = (W - PAD.l - PAD.r) / 360, ky = (H - PAD.t - PAD.b) / (yMax - yMin)
  const step = STEPS.find(s => (yMax - yMin) / s <= 6) ?? 30
  const yTicks: number[] = []
  for (let t = Math.ceil(yMin / step) * step; t <= yMax; t += step) yTicks.push(+t.toFixed(2))

  // Break a track where azimuth wraps through north so it doesn't streak across the chart.
  const path = (pts: readonly (readonly [number, number])[]) =>
    pts.map(([a, el], k) => `${k && Math.abs(a - pts[k - 1][0]) < 180 ? 'L' : 'M'}${x(a).toFixed(1)},${y(el).toFixed(1)}`).join('')
  const ridge = mask.map((m, a) => `${a ? 'L' : 'M'}${x(a)},${y(m)}`).join('') + `L${x(360)},${y(mask[0])}`
  const ground = `${ridge}L${x(360)},${H - PAD.b}L${x(0)},${H - PAD.b}Z`
  const disc = (az: number, el: number, d: number, fill: string) => (
    <ellipse cx={x(az)} cy={y(el)} rx={Math.max(3, (d / 2) * kx)} ry={Math.max(3, (d / 2) * ky)} fill={fill} />
  )
  const label = { fill: token.colorTextSecondary, fontSize: 11 }

  const sunS = status('Sun', e.sunEl[iNow], e.sunAz[iNow], mask, e.sunDiamDeg)
  const earthS = status('Earth', e.earthEl[iNow], e.earthAz[iNow], mask, e.earthDiamDeg)
  const when = new Date(Date.parse(e.t0) + iNow * e.stepMin * 60000).toISOString().slice(0, 16).replace('T', ' ')
  const swatch = (color: string, dashed = false) => (
    <span style={{ display: 'inline-block', width: 16, marginRight: 6, verticalAlign: 'middle', borderTop: `${dashed ? 1 : 3}px ${dashed ? 'dashed' : 'solid'} ${color}` }} />
  )

  return (
    <Flex vertical gap={12}>
      <Flex wrap gap={8} aria-live="polite">
        <Tag color={sunS.up ? 'gold' : 'default'}>{sunS.up ? '●' : '○'} {sunS.text}</Tag>
        <Tag color={earthS.up ? 'blue' : 'default'}>{earthS.up ? '●' : '○'} {earthS.text}</Tag>
      </Flex>

      <div ref={ref} style={{ width: '100%' }}>
        <svg width={W} height={H} role="img" style={{ display: 'block', background: token.colorBgLayout, borderRadius: token.borderRadius }}
          aria-label={`Sky at ${when} UTC. ${sunS.text}. ${earthS.text}. Horizon: ${terrain}.`}>
          {yTicks.map(t => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? token.colorTextQuaternary : token.colorBorderSecondary} />
              <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" {...label}>{t}°</text>
            </g>
          ))}
          {COMPASS.map((c, k) => (W >= 520 || k % 2 === 0) && <text key={k} x={x(k * 45)} y={H - 8} textAnchor="middle" {...label}>{c}</text>)}
          <defs><clipPath id="plot"><rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} /></clipPath></defs>
          <g clipPath="url(#plot)">
            <path d={path(sun)} fill="none" stroke={SUN} strokeOpacity={0.5} strokeWidth={1.5} />
            <path d={path(earth)} fill="none" stroke={EARTH} strokeOpacity={0.5} strokeWidth={1.5} />
            {disc(e.sunAz[iNow], e.sunEl[iNow], e.sunDiamDeg, SUN)}
            {disc(e.earthAz[iNow], e.earthEl[iNow], e.earthDiamDeg, EARTH)}
            <path d={ground} fill={token.colorBgElevated} />
            <path d={ridge} fill="none" stroke={token.colorTextTertiary} />
            <line x1={PAD.l} x2={W - PAD.r} y1={y(dip)} y2={y(dip)} stroke={token.colorTextTertiary} strokeDasharray="4 4" />
          </g>
        </svg>
      </div>

      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        <Flex wrap gap={16} component="span">
          <span>{swatch(SUN)}Sun path</span>
          <span>{swatch(EARTH)}Earth path</span>
          <span>{swatch(token.colorTextTertiary)}{terrain === 'LOLA terrain' ? 'Terrain (LOLA)' : 'Ground'}</span>
          <span>{swatch(token.colorTextTertiary, true)}Smooth-Moon horizon</span>
          <span>Up: elevation · Across: compass direction</span>
        </Flex>
      </Typography.Text>

      <Flex wrap align="center" gap={12}>
        <Button onClick={() => setPlaying(!playing)} aria-pressed={playing}>{playing ? '❚❚ Pause' : '▶︎ Play lunar day'}</Button>
        <Slider min={0} max={hours} value={scrubH} onChange={setScrubH} style={{ flex: 1, minWidth: 180 }}
          tooltip={{ formatter: v => `day ${((v ?? 0) / 24).toFixed(1)}` }} aria-label="Time since landing" />
        <Typography.Text type="secondary">{when} UTC · day {(scrubH / 24).toFixed(1)}</Typography.Text>
      </Flex>
    </Flex>
  )
}
