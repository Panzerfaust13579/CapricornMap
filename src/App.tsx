import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Col, Collapse, DatePicker, Flex, Form, Grid, InputNumber, Layout, Row, Segmented, Select, Skeleton, Slider, Space, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { metrics, planB, shiftDate, sphereDipDeg, sphereMask, indexAt, type Ephem, type Horizon, type Needs, type Site, type SiteData } from './engine'
import { Comparator, Explain, PlanBPanel, VerdictCard, countdown, h, pct } from './components'
import { SkyRibbon } from './SkyRibbon'
import { fetchEphem } from './horizons'
import Validation from './Validation'

const { Text, Title } = Typography
const LUNAR_DAY_H = 709
const GROUPS: [string, string][] = [['Artemis', 'NASA Artemis III regions'], ['CLPS', 'NASA CLPS landers'], ['ISRO', 'ISRO'], ['Apollo', 'Apollo'], ['Custom', 'Custom']]
const DATA_FROM = dayjs('2027-01-08'), DATA_TO = dayjs('2028-11-15')

/** Card title with a secondary line underneath, so neither gets truncated on phones. */
const CardTitle = ({ title, sub }: { title: string; sub?: string }) => (
  <div style={{ whiteSpace: 'normal', padding: '4px 0' }}>
    <div>{title}</div>
    {sub && <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>{sub}</Text>}
  </div>
)

export default function App() {
  const [page, setPage] = useState(location.hash)
  useEffect(() => { const f = () => setPage(location.hash); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, [])

  const [sites, setSites] = useState<Site[]>([])
  const [ephems, setEphems] = useState(new Map<string, Ephem>())
  const [horizons, setHorizons] = useState(new Map<string, Horizon>())
  const [error, setError] = useState('')
  useEffect(() => {
    (async () => {
      const list: Site[] = await (await fetch('/data/sites.json')).json()
      setSites(list)
      const get = async <T,>(url: string) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return (await r.json()) as T }
      const eps = await Promise.all(list.map(s => get<Ephem>(`/data/ephem/${s.id}.json`)))
      const hzs = await Promise.all(list.filter(s => s.terrain === 'lola').map(s => get<Horizon>(`/data/horizon/${s.id}.json`)))
      setEphems(new Map(eps.map(e => [e.id, e])))
      setHorizons(new Map(hzs.map(z => [z.id, z])))
    })().catch(e => setError(String(e)))
  }, [])

  const wide = Grid.useBreakpoint().lg // two-column layout: the plan panel sits beside the results
  const [explain, setExplain] = useState(false)
  const [siteId, setSiteId] = useState('mons-mouton')
  const [start, setStart] = useState('2027-03-01')
  const [days, setDays] = useState(14)
  const [mastM, setMastM] = useState(2)
  const [slip, setSlip] = useState(0)
  const [needs, setNeeds] = useState<Needs>({ minSunPct: 60, maxDarkH: 72, minEarthPct: 50, maxGapH: 96 })
  const [scrubH, setScrubH] = useState(0)
  const [compareB, setCompareB] = useState<{ siteId: string; start: string; label: string } | null>(null)

  const [lat, setLat] = useState<number | null>(-85), [lon, setLon] = useState<number | null>(45)
  const [custom, setCustom] = useState<{ site: Site; ephem: Ephem } | null>(null)
  const [busy, setBusy] = useState<{ type: 'info' | 'error'; text: string } | null>(null)
  async function lookup() {
    if (lat === null || lon === null || lat < -90 || lat > 90) return setBusy({ type: 'error', text: 'Latitude must be −90 to 90 and longitude a number.' })
    const lo = ((lon % 360) + 360) % 360
    setBusy({ type: 'info', text: 'Asking JPL Horizons…' })
    try {
      const t = Date.parse(start)
      const ephem = await fetchEphem('custom', lat, lo, t - 8 * 864e5, t + (days + 60) * 864e5)
      const site: Site = { id: 'custom', name: `Custom ${lat.toFixed(3)}°, ${lo.toFixed(3)}°E`, lat, lonE: lo, group: 'Custom', terrain: 'sphere', source: 'JPL Horizons, live' }
      setCustom({ site, ephem }); setSiteId('custom'); setCompareB(null); setBusy(null)
    } catch (e) { setBusy({ type: 'error', text: String(e) }) }
  }

  const data = useMemo(() => {
    const m = new Map<string, SiteData>()
    for (const site of sites) {
      const ephem = ephems.get(site.id)
      if (ephem) m.set(site.id, { site, ephem, mask: horizons.get(site.id)?.elevDeg ?? sphereMask(mastM) })
    }
    if (custom) m.set('custom', { ...custom, mask: sphereMask(mastM) })
    return m
  }, [sites, ephems, horizons, custom, mastM])

  const here = data.get(siteId)
  const now = shiftDate(start, slip)
  const scen = { siteId, start, days, mastM, needs }
  const result = useMemo(() => (here ? planB(scen, slip, data) : null), [here, data, start, days, slip, needs, siteId]) // eslint-disable-line
  const b = compareB ?? { siteId, start, label: `${data.get(siteId)?.site.name ?? ''}, ${start}` }
  const bData = data.get(b.siteId)
  const mB = bData ? metrics({ ...scen, siteId: b.siteId, start: b.start }, bData.ephem, bData.mask) : null

  if (page === '#validation') return <Validation data={data} explain={explain} />
  if (error) return <Alert type="error" showIcon title="Could not load data" description={error} style={{ margin: 24 }} />
  if (!here) return <Card style={{ margin: 24 }}><Skeleton active paragraph={{ rows: 8 }} /><Text type="secondary">Loading Sun and Earth positions…</Text></Card>

  const nowMs = Date.parse(now)
  const iScrub = Math.round(indexAt(here.ephem, nowMs + scrubH * 36e5))
  const inData = iScrub >= 0 && iScrub < here.ephem.sunEl.length
  const lola = here.site.terrain === 'lola' && horizons.has(siteId)
  const terrain = lola ? 'LOLA terrain' : 'terrain not applied'
  const hz = horizons.get(siteId)
  const goCount = result?.options.filter(o => o.m.verdict === 'GO').length ?? 0
  const need = (label: string, key: keyof Needs, max: number, fmt: (x: number) => string, step = 1) => (
    <div style={{ marginBottom: 4 }}>
      <Flex justify="space-between"><Text type="secondary">{label}</Text><Text strong>{fmt(needs[key])}</Text></Flex>
      <Slider min={0} max={max} step={step} value={needs[key]} onChange={v => setNeeds({ ...needs, [key]: v })} tooltip={{ formatter: v => fmt(v ?? 0) }} aria-label={label} />
    </div>
  )

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header style={{ height: 'auto', lineHeight: 'normal', padding: '12px 24px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
        <div style={{ marginRight: 'auto' }}>
          <Title level={3} style={{ margin: 0 }}>MoonSlip</Title>
          <Text type="secondary">Lunar South Pole landing check: is the site still alive after a launch slip?</Text>
        </div>
        <Segmented aria-label="Display mode" value={explain ? 'Explain' : 'Planner'} options={['Planner', 'Explain']} onChange={v => setExplain(v === 'Explain')} />
        <Button type="link" href="#validation">Validation & method</Button>
      </Layout.Header>

      <Layout.Content style={{ padding: 16, maxWidth: 1400, width: '100%', margin: '0 auto' }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={8} xl={7}>
            {/* On wide screens the panel stays in view and scrolls on its own; on phones it is part of the page scroll. */}
            <Card title="Mission plan" style={wide ? { position: 'sticky', top: 16 } : undefined}
              styles={wide ? { body: { maxHeight: 'calc(100vh - 32px - 57px)', overflowY: 'auto', scrollbarGutter: 'stable' } } : undefined}>
              <Explain show={explain}>Set where and when you land, and what the lander needs to survive.</Explain>
              <Form layout="vertical" requiredMark={false}>
                <Form.Item label="Landing site" style={{ marginBottom: 8 }}>
                  <Select value={siteId} onChange={v => { setSiteId(v); setCompareB(null) }} aria-label="Landing site"
                    options={GROUPS.map(([g, name]) => ({
                      label: name, title: name,
                      options: [...data.values()].filter(d => d.site.group === g).map(d => ({ label: d.site.name, value: d.site.id })),
                    })).filter(g => g.options.length)} />
                </Form.Item>
                <Space size={4} wrap style={{ marginBottom: 4 }}>
                  <Tag color={lola ? 'success' : 'warning'}>{lola ? '✓ LOLA terrain' : '! terrain not applied'}</Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>{here.site.lat.toFixed(3)}°, {here.site.lonE.toFixed(3)}°E</Text>
                </Space>
                {hz?.snapKm ? <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Region: horizon seen from its high point within 1 km ({hz.siteHeightM} m).</Text> : null}
                <Collapse ghost size="small" style={{ margin: '4px -16px 12px' }} items={[{
                  key: 'custom', label: 'Use custom coordinates',
                  children: (
                    <Flex vertical gap={8}>
                      <Space.Compact block>
                        <InputNumber value={lat} onChange={setLat} min={-90} max={90} step={0.1} prefix="Lat" suffix="°" style={{ width: '50%' }} aria-label="Latitude" />
                        <InputNumber value={lon} onChange={setLon} step={0.1} prefix="Lon" suffix="°E" style={{ width: '50%' }} aria-label="Longitude east" />
                      </Space.Compact>
                      <Button onClick={lookup} loading={busy?.type === 'info'}>Look up in JPL Horizons</Button>
                      <Text type="secondary" style={{ fontSize: 12 }}>Live from NASA JPL Horizons. Smooth-Moon horizon only.</Text>
                      {busy?.type === 'error' && <Alert type="error" showIcon title={busy.text} />}
                    </Flex>
                  ),
                }]} />

                <Row gutter={12}>
                  <Col span={14}>
                    <Form.Item label="Planned landing">
                      <DatePicker value={dayjs(start)} allowClear={false} style={{ width: '100%' }} format="YYYY-MM-DD"
                        disabledDate={d => d.isBefore(DATA_FROM) || d.isAfter(DATA_TO)} onChange={d => d && setStart(d.format('YYYY-MM-DD'))} />
                    </Form.Item>
                  </Col>
                  <Col span={10}>
                    <Form.Item label="Mission days">
                      <InputNumber value={days} min={1} max={60} onChange={v => setDays(v ?? 1)} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                </Row>

                <Card size="small" type="inner" title="Launch slipped" style={{ marginBottom: 16 }}
                  extra={slip !== 0 && <Button type="link" size="small" onClick={() => setSlip(0)}>Reset</Button>}>
                  <Space.Compact block>
                    <Button onClick={() => setSlip(Math.max(-7, slip - 1))} aria-label="One day earlier">−</Button>
                    <InputNumber value={slip} min={-7} max={28} onChange={v => setSlip(v ?? 0)} suffix="days" style={{ flex: 1 }} aria-label="Slip in days"
                      formatter={v => (Number(v) > 0 ? `+${v}` : `${v}`)} parser={v => Number((v ?? '').replace('+', ''))} />
                    <Button onClick={() => setSlip(Math.min(28, slip + 1))} aria-label="One day later">+</Button>
                  </Space.Compact>
                  <Text type="secondary" style={{ fontSize: 12 }}>New landing: <Text>{now}</Text></Text>
                </Card>

                <Text strong style={{ display: 'block', marginBottom: 4 }}>Lander needs</Text>
                {need('Sunlight at least', 'minSunPct', 100, pct)}
                {need('Longest night at most', 'maxDarkH', 360, h, 6)}
                {need('Earth in view at least', 'minEarthPct', 100, pct)}
                {need('Comms gap at most', 'maxGapH', 360, h, 6)}

                <Form.Item label="Panel / antenna mast height" extra={lola ? 'The LOLA horizon is fixed at 2 m.' : undefined} style={{ marginTop: 12, marginBottom: 0 }}>
                  <InputNumber value={mastM} min={0} max={50} step={0.5} suffix="m" onChange={v => setMastM(v ?? 0)} style={{ width: '100%' }} />
                </Form.Item>
              </Form>
            </Card>
          </Col>

          <Col xs={24} lg={16} xl={17}>
            <Flex vertical gap={16}>
              {result ? (
                <VerdictCard m={result.current} needs={needs} title={`${here.site.name} · landing ${now} · ${days} days`}
                  sun={inData ? countdown(here.ephem, here.mask, 'sun', iScrub) : { up: false, inH: null }}
                  earth={inData ? countdown(here.ephem, here.mask, 'earth', iScrub) : { up: false, inH: null }} />
              ) : (
                <Alert type="warning" showIcon title="No data for this date at this site"
                  description="Curated data covers 2027–2028. For a custom site, look it up again after changing the date." />
              )}
              <Explain show={explain && !!result}>GO means the site meets every need you set. Each tile shows the result next to your limit.</Explain>

              <Card title={<CardTitle title="1 · Sky over the site" sub={`One lunar day from ${now}`} />}>
                <Explain show={explain}>The whole horizon unrolled into a strip, north at both ends. When the Sun or Earth sinks behind the grey ground, the lander loses power or its radio link.</Explain>
                <SkyRibbon e={here.ephem} mask={here.mask} dip={sphereDipDeg(mastM)} startMs={nowMs} hours={LUNAR_DAY_H} scrubH={scrubH} setScrubH={setScrubH} terrain={terrain} />
              </Card>

              <Card title={<CardTitle title="2 · Plan B: ranked rescues" sub={result ? `${result.options.length} options · ${goCount} GO` : undefined} />}>
                <Explain show={explain}>Other dates at the same site, and other sites on the new date. Best first. Changes are against the current plan. Click one to compare it below.</Explain>
                {result
                  ? <PlanBPanel options={result.options} current={result.current} selected={compareB ? compareB.siteId + compareB.start : null}
                      onPick={o => setCompareB({ siteId: o.siteId, start: o.start, label: `${o.siteName}, ${o.start}` })} />
                  : <Text type="secondary">No data for this date.</Text>}
              </Card>

              <Card title={<CardTitle title="3 · Compare two plans" sub={compareB ? undefined : 'Pick a Plan B option to fill column B'} />}>
                <Explain show={explain}>The same numbers side by side. Green arrows mean B is better, red arrows mean B is worse.</Explain>
                <Comparator a={result?.current ?? null} b={mB} la={`${here.site.name}, ${now}`} lb={b.label} />
              </Card>
            </Flex>
          </Col>
        </Row>
      </Layout.Content>

      <Layout.Footer style={{ textAlign: 'center' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Sun and Earth positions: NASA JPL Horizons (airless, hourly, 2027–2028). Terrain: NASA LRO LOLA, PGDA Product 90. Open data, open code.
        </Text>
      </Layout.Footer>
    </Layout>
  )
}
