import { useState, type ReactNode } from 'react'
import { Alert, Button, Card, Col, Flex, Row, Statistic, Table, Tag, Typography } from 'antd'
import { margins, windows, type Body, type Ephem, type Metrics, type Needs, type PlanBOption } from './engine'
import { EARTH, SUN } from './SkyRibbon'

const { Text } = Typography

export const h = (x: number | null) => (x === null ? '—' : x >= 48 ? `${(x / 24).toFixed(1)} d` : `${x.toFixed(0)} h`)
export const pct = (x: number) => `${x.toFixed(0)}%`
const slipText = (d: number) => (d === 0 ? 'original date' : d > 0 ? `${d} day${d > 1 ? 's' : ''} later` : `${-d} day${d < -1 ? 's' : ''} earlier`)

/** Plain-language caption shown only in Explain mode. */
export const Explain = ({ show, children }: { show: boolean; children: ReactNode }) =>
  show ? <Alert type="info" showIcon title={children} style={{ marginBottom: 16 }} /> : null

export const Verdict = ({ go }: { go: boolean }) => <Tag color={go ? 'success' : 'error'}>{go ? '✓ GO' : '✕ NO-GO'}</Tag>

/** Hours until the body next sets or rises, looking up to 30 days ahead from sample i. */
export function countdown(e: Ephem, mask: number[], body: Body, i: number) {
  const i1 = Math.min(e.sunEl.length - 1, i + Math.round((720 * 60) / e.stepMin))
  const runs = windows(margins(e, mask, body, i, i1), e.stepMin)
  return { up: runs[0].visible, inH: runs.length > 1 ? runs[0].endH : null }
}

type Clock = { up: boolean; inH: number | null }

export function VerdictCard({ m, needs, title, sun, earth }: { m: Metrics; needs: Needs; title: string; sun: Clock; earth: Clock }) {
  const go = m.verdict === 'GO'
  const tiles = [
    { label: 'Sunlight', value: pct(m.sunPct), need: `need ≥ ${needs.minSunPct}%`, ok: m.sunPct >= needs.minSunPct },
    { label: 'Longest night', value: h(m.longestDarkH), need: `need ≤ ${h(needs.maxDarkH)}`, ok: m.longestDarkH <= needs.maxDarkH },
    { label: 'Earth in view', value: pct(m.earthPct), need: `need ≥ ${needs.minEarthPct}%`, ok: m.earthPct >= needs.minEarthPct },
    { label: 'Longest comms gap', value: h(m.longestCommsGapH), need: `need ≤ ${h(needs.maxGapH)}`, ok: m.longestCommsGapH <= needs.maxGapH },
  ]
  const clock = (c: Clock, set: string, rise: string) => (c.inH === null ? `${c.up ? set : rise}: not within 30 days` : `${c.up ? set : rise} in ${h(c.inH)}`)
  return (
    <Alert
      type={go ? 'success' : 'error'}
      role="status"
      title={
        <Flex wrap align="baseline" gap={12}>
          <Typography.Title level={2} style={{ margin: 0 }}>{go ? '✓ GO' : '✕ NO-GO'}</Typography.Title>
          <Text type="secondary">{title}</Text>
        </Flex>
      }
      description={
        <Flex vertical gap={12} style={{ marginTop: 4 }}>
          <Text>{go ? 'Every need is met for the whole mission.' : `${m.failed.length} of 4 needs not met.`}</Text>
          <Row gutter={[12, 12]}>
            {tiles.map(t => (
              <Col key={t.label} xs={12} lg={6}>
                <Card size="small">
                  <Statistic title={t.label} value={t.value} />
                  <Text type={t.ok ? 'success' : 'danger'} style={{ fontSize: 12 }}>{t.ok ? '✓' : '✕'} {t.need}</Text>
                </Card>
              </Col>
            ))}
          </Row>
          <Flex wrap align="center" gap={8}>
            <Tag><span style={{ color: SUN }}>☀</span> {clock(sun, 'Sunset', 'Sunrise')}</Tag>
            <Tag><span style={{ color: EARTH }}>◉</span> {clock(earth, 'Earthset', 'Earthrise')}</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>from the time shown on the sky chart</Text>
          </Flex>
        </Flex>
      }
    />
  )
}

/** Change from A to B, coloured by whether it helps the lander (dir +1: higher is better, -1: lower is better). */
export function Delta({ d, fmt, dir }: { d: number; fmt: (x: number) => string; dir: 1 | -1 }) {
  if (fmt(Math.abs(d)) === fmt(0)) return <Text type="secondary">same</Text>
  const better = d * dir > 0
  return <Text type={better ? 'success' : 'danger'}>{d > 0 ? '▲' : '▼'} {fmt(Math.abs(d))}<span className="sr-only">{better ? ' better' : ' worse'}</span></Text>
}

const ROWS: [string, (m: Metrics) => number, (x: number) => string, 1 | -1][] = [
  ['Sunlight', m => m.sunPct, pct, 1],
  ['Longest night', m => m.longestDarkH, h, -1],
  ['Earth in view', m => m.earthPct, pct, 1],
  ['Earth contact', m => m.earthH, h, 1],
  ['Longest comms gap', m => m.longestCommsGapH, h, -1],
  ['Horizontal panel (W/m²)', m => m.meanHorizWm2, x => x.toFixed(0), 1],
  ['Vertical panel (W/m²)', m => m.meanVertWm2, x => x.toFixed(0), 1],
]

export function Comparator({ a, b, la, lb }: { a: Metrics | null; b: Metrics | null; la: string; lb: string }) {
  const rows = [
    { key: 'verdict', metric: 'Verdict', a: a ? <Verdict go={a.verdict === 'GO'} /> : '—', b: b ? <Verdict go={b.verdict === 'GO'} /> : '—', d: null },
    ...ROWS.map(([metric, f, fmt, dir]) => ({
      key: metric, metric, a: a ? fmt(f(a)) : '—', b: b ? fmt(f(b)) : '—',
      d: a && b ? <Delta d={f(b) - f(a)} fmt={fmt} dir={dir} /> : null,
    })),
  ]
  return (
    <Table size="small" pagination={false} scroll={{ x: 440 }} dataSource={rows}
      columns={[
        { title: 'Metric', dataIndex: 'metric', render: v => <Text type="secondary">{v}</Text> },
        { title: <>A · {la}</>, dataIndex: 'a', align: 'right' },
        { title: <>B · {lb}</>, dataIndex: 'b', align: 'right' },
        { title: 'B vs A', dataIndex: 'd', align: 'right' },
      ]} />
  )
}

export function PlanBPanel({ options, current, selected, onPick }: {
  options: PlanBOption[]; current: Metrics; selected: string | null; onPick: (o: PlanBOption) => void
}) {
  const [all, setAll] = useState(false)
  const shown = all ? options : options.slice(0, 6)
  const stat = (label: string, v: string, d: number, dir: 1 | -1, fmt: (x: number) => string) => (
    <Col span={8}>
      <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>{label}</Text>
      <Text strong>{v}</Text> <span style={{ fontSize: 12 }}><Delta d={d} fmt={fmt} dir={dir} /></span>
    </Col>
  )
  return (
    <Flex vertical gap={12}>
      <Row gutter={[12, 12]} role="list">
        {shown.map((o, k) => {
          const key = o.siteId + o.start
          const isSel = selected === key
          return (
            <Col key={key} xs={24} md={12} role="listitem">
              <Card size="small" hoverable onClick={() => onPick(o)} tabIndex={0} aria-pressed={isSel}
                onKeyDown={ev => (ev.key === 'Enter' || ev.key === ' ') && (ev.preventDefault(), onPick(o))}
                style={isSel ? { borderColor: '#4096ff' } : undefined}
                title={<Text strong><Text type="secondary">#{k + 1} </Text>{o.siteName}</Text>}
                extra={<Verdict go={o.m.verdict === 'GO'} />}>
                <Text type="secondary">Land {o.start} · {slipText(o.slipDays)}</Text>
                <Row gutter={8} style={{ marginTop: 8 }}>
                  {stat('Sunlight', pct(o.m.sunPct), o.m.sunPct - current.sunPct, 1, pct)}
                  {stat('Earth', pct(o.m.earthPct), o.m.earthPct - current.earthPct, 1, pct)}
                  {stat('Longest night', h(o.m.longestDarkH), o.m.longestDarkH - current.longestDarkH, -1, h)}
                </Row>
                <Typography.Paragraph style={{ margin: '8px 0 0' }}>{o.sentence}</Typography.Paragraph>
              </Card>
            </Col>
          )
        })}
      </Row>
      {options.length > 6 && (
        <Button type="link" onClick={() => setAll(!all)} style={{ alignSelf: 'flex-start', padding: 0 }}>
          {all ? 'Show top 6' : `Show all ${options.length} options`}
        </Button>
      )}
    </Flex>
  )
}
