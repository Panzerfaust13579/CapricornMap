import { useEffect, useMemo, useState } from 'react'
import {
  bottleneck, calendar, gainLoss, indexAt, maskForMast, mastRange, metrics, planB, range, shiftDate, sphereDipDeg, sphereMask,
  type Ephem, type Horizon, type Needs, type PlanBOption, type Site, type SiteData,
} from './engine'
import { quickmapUrl } from './engine/geo'
import { Comparator, PlanBPanel, Panel, SkyRibbon, SlipBar, Tier, VerdictStrip, btn, countdown, lunarDay, slipLabel, useEvent, type Chip, type Ghost, type Mark, type Rescue } from './components'
import { CalendarHeatmap, EarthMoonCard, PoleMap, RelayCard, Timeline, type MapMeta } from './panels'
import { fetchEphem } from './horizons'
import { DATE_MAX, DATE_MIN, DEFAULTS, decode, encode } from './share'
import Validation from './Validation'

const LUNAR_DAY_H = 709
const DAY_MS = 864e5
const GROUPS = ['Artemis', 'CLPS', 'ISRO', 'Apollo', 'Custom']
const SLIPS = range(-7, 28)
const DAY_PRESETS = [7, 14, 28, 42]
const MAST_PRESETS: [number, string][] = [[2, '2m Rover'], [5, '5m Lander'], [10, '10m Hab'], [20, '20m Tower']]
const get = async <T,>(url: string) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return (await r.json()) as T }
const NO_CHIP: Chip = { up: false, inH: null }
const NO_MARKS: Mark[] = []
const NO_OPTIONS: PlanBOption[] = []
const SECTIONS = [['setup', 'Setup'], ['sky', 'Sky ribbon'], ['planb', 'Plan B'], ['map', 'Map'], ['windows', 'Windows']] as const
const NEED_TEXT: Record<keyof Needs, [string, string]> = { minSunPct: ['min sunlight', '%'], maxDarkH: ['max longest night', ' h'], minEarthPct: ['min Earth visible', '%'], maxGapH: ['max comms gap', ' h'] }
// Illustrative needs per mission class. Not published mission requirements.
const PROFILES: { label: string; hint: string; needs: Needs; mast: number }[] = [
  { label: 'Crewed HLS-class', hint: 'Human-rated: long sunlight, high Earth link', needs: { minSunPct: 65, maxDarkH: 36, minEarthPct: 75, maxGapH: 12 }, mast: 15 },
  { label: 'CLPS-class lander', hint: 'Small solar lander, short freeze tolerance', needs: { minSunPct: 50, maxDarkH: 24, minEarthPct: 40, maxGapH: 48 }, mast: 3 },
  { label: 'VIPER-class rover', hint: 'Mobile, can hibernate through longer nights', needs: { minSunPct: 40, maxDarkH: 72, minEarthPct: 50, maxGapH: 24 }, mast: 2 },
  { label: 'ISRU power tower', hint: 'Tall mast on a rim, near-constant sunlight', needs: { minSunPct: 80, maxDarkH: 18, minEarthPct: 85, maxGapH: 6 }, mast: 20 },
]

/** Explain-mode text per panel: under the panel in Overview, in the right column when a section covers the page. */
const CAP = {
  site: 'Pick an Artemis III, CLPS, ISRO or Apollo site, or tap anywhere on the South Pole map to mark custom coordinates, then query JPL Horizons for them.',
  slip: 'Drag the slip bar, or use − and +, to delay the launch. Tall green cells are days the mission survives; short red cells are days it does not.',
  needs: 'Adjust minimum solar illumination and Earth link requirements to match your lander or rover hardware.',
  sky: 'The whole horizon unrolled: North (Earthward) at the edges, South (Far Side) in the centre. Scrub or play to see when ridges block sunlight or Earth contact. The slider snaps to sunrises and sunsets.',
  planb: 'Ranked rescue options when the launch slips: other dates at this site, or backup sites on the slipped date. Hover a card to preview its Sun path on the ribbon; compare or adopt in one click.',
  comparator: 'Plan A against plan B across sunlight, dark survival, Earth link, and horizontal against vertical solar yield. The last column says whether B is better or worse.',
  windows: 'Every landing date across two years. Good windows arrive in waves of about 29.5 days and shift with the lunar seasons. Night window mode rings the dates with no night at all. Click any day to compare.',
}

interface Preset {
  id: string; label: string; hint: string
  siteId: string; start: string; days: number; mastM: number; slip: number; explain: boolean
  b: { siteId: string; start: string } | null
}

const SCENARIOS: Preset[] = [
  { id: 'artemis-go', label: 'Artemis Baseline (GO)', hint: 'Mons Mouton, Mar 12', siteId: 'mons-mouton', start: '2027-03-12', days: 14, mastM: 2, slip: 0, explain: false, b: null },
  { id: 'slip-14', label: '+14d Slip Crisis', hint: 'GO → NO-GO vs Apr 10 rescue', siteId: 'mons-mouton', start: '2027-03-12', days: 14, mastM: 2, slip: 14, explain: false, b: { siteId: 'mons-mouton', start: '2027-04-10' } },
  { id: 'mast-rescue', label: '20m Mast Rescue', hint: 'Nobile Rim 1 · 20m GO vs 2m NO-GO', siteId: 'nobile-rim-1', start: '2027-02-06', days: 14, mastM: 20, slip: 0, explain: false, b: { siteId: 'mons-mouton', start: '2027-02-06' } },
  { id: 'clps-trade', label: 'Athena vs. Ridge', hint: 'IM-2 site vs Connecting Ridge', siteId: 'im2-athena', start: '2027-03-12', days: 14, mastM: 2, slip: 0, explain: false, b: { siteId: 'connecting-ridge', start: '2027-03-12' } },
  { id: 'pole-eq', label: 'Equator vs. Pole', hint: 'Classroom Explain Mode', siteId: 'apollo-11', start: '2027-03-12', days: 14, mastM: 2, slip: 0, explain: true, b: { siteId: 'connecting-ridge', start: '2027-03-12' } },
]

export default function App() {
  const [page, setPage] = useState(location.hash)
  useEffect(() => { const f = () => setPage(location.hash); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, [])
  const init = useMemo(() => decode(location.search), [])

  const [explain, setExplain] = useState(init.explain)
  const [siteId, setSiteId] = useState(init.site)
  const [start, setStart] = useState(init.date)
  const [days, setDays] = useState(init.days)
  const [mastM, setMastM] = useState(init.mast)
  const [slip, setSlip] = useState(init.slip)
  const [needs, setNeeds] = useState<Needs>(init.needs)
  const [scrubH, setScrubH] = useState(0)
  const [compareB, setCompareB] = useState<{ siteId: string; start: string } | null>(init.b ?? null)
  /** The Plan B card under the pointer: drawn as a ghost on the sky ribbon until the pointer leaves. */
  const [preview, setPreview] = useState<PlanBOption | null>(null)

  // Data: the selected site first, so the screen appears before the other nine sites arrive.
  const [sites, setSites] = useState<Site[]>([])
  const [ephems, setEphems] = useState(new Map<string, Ephem>())
  const [horizons, setHorizons] = useState(new Map<string, Horizon>())
  const [mapMeta, setMapMeta] = useState<MapMeta | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let dead = false
    ;(async () => {
      const list = await get<Site[]>('/data/sites.json')
      if (dead) return
      setSites(list)
      if (init.site !== 'custom' && !list.some(s => s.id === init.site)) setSiteId(DEFAULTS.site)
      const first = (s: Site) => +(s.id !== init.site)
      await Promise.all([...list].sort((a, b) => first(a) - first(b)).map(async s => {
        const [e, hz] = await Promise.all([get<Ephem>(`/data/ephem/${s.id}.json`), s.terrain === 'lola' ? get<Horizon>(`/data/horizon/${s.id}.json`) : null])
        if (dead) return
        if (hz) setHorizons(m => new Map(m).set(s.id, hz))
        setEphems(m => new Map(m).set(s.id, e))
      }))
    })().catch(e => setError(String(e)))
    get<MapMeta>('/data/southpole.json').then(m => !dead && setMapMeta(m)).catch(() => {})
    return () => { dead = true }
  }, [init])

  // Custom coordinates: live from JPL Horizons, smooth horizon.
  const [lat, setLat] = useState(String(init.lat ?? -85)), [lon, setLon] = useState(String(init.lon ?? 45))
  const [custom, setCustom] = useState<{ site: Site; ephem: Ephem } | null>(null)
  const [busy, setBusy] = useState('')
  async function lookup(laIn = +lat, loIn = +lon) {
    const la = +laIn.toFixed(4), lo = +(((loIn % 360) + 360) % 360).toFixed(4)
    if (!(la >= -90 && la <= 90) || !Number.isFinite(lo)) return setBusy('Latitude must be −90 to 90 and longitude a number.')
    setBusy('Asking JPL Horizons…')
    try {
      const t = Date.parse(start)
      const ephem = await fetchEphem('custom', la, lo, t - 8 * DAY_MS, t + (days + 60) * DAY_MS)
      const site: Site = { id: 'custom', name: `Custom ${la.toFixed(3)}°, ${lo.toFixed(3)}°E`, lat: la, lonE: lo, group: 'Custom', terrain: 'sphere', source: 'JPL Horizons, live' }
      setCustom({ site, ephem }); setSiteId('custom'); setCompareB(null); setBusy('')
    } catch (e) {
      setBusy(String(e))
      setSiteId(id => (id === 'custom' && !custom ? DEFAULTS.site : id))
    }
  }
  useEffect(() => { if (init.site === 'custom' && init.lat !== undefined && init.lon !== undefined) lookup(init.lat, init.lon) }, [init]) // eslint-disable-line

  const data = useMemo(() => {
    const m = new Map<string, SiteData>()
    const sphere = sphereMask(mastM)
    for (const site of sites) {
      const ephem = ephems.get(site.id), hz = horizons.get(site.id)
      if (ephem && (site.terrain !== 'lola' || hz)) m.set(site.id, { site, ephem, mask: hz ? maskForMast(hz, mastM) : sphere })
    }
    if (custom) m.set('custom', { ...custom, mask: sphere })
    return m
  }, [sites, ephems, horizons, custom, mastM])

  const here = data.get(siteId)
  const now = shiftDate(start, slip)
  const nowMs = Date.parse(now)
  const scen = { siteId, start, days, mastM, needs }
  const result = useMemo(() => (here ? planB(scen, slip, data) : null), [here, data, start, days, slip, needs, siteId]) // eslint-disable-line
  const year = useMemo(() => (here ? calendar(scen, here.ephem, here.mask, '2027-01-01', '2028-12-31') : []), [here, days, needs]) // eslint-disable-line
  const slipStrip = useMemo(
    () => (here ? SLIPS.map(s => ({ s, date: shiftDate(start, s), m: metrics({ ...scen, start: shiftDate(start, s) }, here.ephem, here.mask) })) : []),
    [here, start, days, needs, siteId], // eslint-disable-line
  )
  // Rises and sets across the lunar day: the scrubber and the timeline snap to these.
  const marks = useMemo(() => (here ? lunarDay(here.ephem, here.mask, nowMs, LUNAR_DAY_H)?.marks : null) ?? NO_MARKS, [here, nowMs])

  const b = compareB ?? { siteId, start }
  const bData = data.get(b.siteId)
  const mB = bData ? metrics({ ...scen, siteId: b.siteId, start: b.start }, bData.ephem, bData.mask) : null
  const bLabel = compareB ? `${bData?.site.name ?? b.siteId}, ${b.start}` : `Original date (${start})`
  const showOverlayB = !!(bData && (b.siteId !== siteId || b.start !== now))

  // Other plans drawn over plan A. Memoised, so the 25 frames a second of "play" do not recompute their windows.
  const ghostB = useMemo<Ghost | null>(
    () => (showOverlayB && bData ? { e: bData.ephem, mask: bData.mask, startMs: Date.parse(b.start), label: bLabel, tone: 'b' } : null),
    [showOverlayB, bData, b.start, bLabel],
  )
  const ghostPreview = useMemo<Ghost | null>(() => {
    const d = preview && data.get(preview.siteId)
    if (!preview || !d) return null
    const label = preview.kind === 'date' ? `land ${preview.start} (${slipLabel(preview.slipDays)})` : `${preview.siteName}, ${preview.start}`
    return { e: d.ephem, mask: d.mask, startMs: Date.parse(preview.start), label, tone: 'preview' }
  }, [preview, data])

  const [earlier, setEarlier] = useState(false)
  const options = useMemo(
    () => (result ? result.options.filter(o => earlier || slip <= 0 || o.kind === 'site' || o.start > now) : NO_OPTIONS),
    [result, earlier, slip, now],
  )

  // Keep the address bar in step with the scenario, so the page can be shared as it stands.
  useEffect(() => {
    if (!here) return
    const q = encode({ site: siteId, date: start, days, mast: mastM, slip, needs, explain, lat: custom?.site.lat, lon: custom?.site.lonE, b: compareB ?? undefined })
    history.replaceState(null, '', location.pathname + q + location.hash)
  }, [here, siteId, start, days, mastM, slip, needs, explain, custom, compareB])

  const [copied, setCopied] = useState(false)
  const [shareUrl, setShareUrl] = useState('')
  const copy = () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(location.href).then(
        () => { setCopied(true); setShareUrl(''); setTimeout(() => setCopied(false), 2000) },
        () => setShareUrl(location.href),
      )
    } else {
      setShareUrl(location.href)
    }
  }

  function applyPreset(p: Preset) {
    setSiteId(p.siteId); setStart(p.start); setDays(p.days); setMastM(p.mastM); setSlip(p.slip)
    setNeeds(DEFAULTS.needs); setExplain(p.explain); setCompareB(p.b); setScrubH(0); setPreview(null)
  }

  /** Make a compared plan the plan: move the slip if the date is within reach, otherwise move the landing date. */
  const use = useEvent((p: { siteId: string; start: string }) => {
    const d = Math.round((Date.parse(p.start) - Date.parse(start)) / DAY_MS)
    setSiteId(p.siteId)
    if (d >= -7 && d <= 28) {
      setSlip(d)
      setCompareB(p.siteId !== siteId ? { siteId, start: now } : null)
    } else {
      setStart(p.start)
      setSlip(0)
      setCompareB({ siteId, start: now })
    }
    setScrubH(0)
    setPreview(null)
  })

  function swapAB() {
    if (!bData) return
    const prevA = { siteId, start: now }
    setSiteId(b.siteId)
    const d = Math.round((Date.parse(b.start) - Date.parse(start)) / DAY_MS)
    if (b.siteId === siteId && d >= -7 && d <= 28) setSlip(d)
    else { setStart(b.start); setSlip(0) }
    setCompareB(prevA)
    setScrubH(0)
  }

  // Stable handlers for the memoised map, calendar and Plan B list.
  const pick = useEvent((o: { siteId: string; start: string }) => setCompareB({ siteId: o.siteId, start: o.start }))
  const pickDate = useEvent((date: string) => setCompareB({ siteId, start: date }))
  const pickSite = useEvent((id: string) => { setSiteId(id); setCompareB(null); setPreview(null) })
  const markGround = useEvent((la: number, lo: number) => { setLat(String(la)); setLon(String(lo)); setBusy('') })
  const lookupGround = useEvent((la: number, lo: number) => { setLat(String(la)); setLon(String(lo)); lookup(la, lo) })

  const [panelOpen, setPanelOpen] = useState(true)
  const [panelW, setPanelW] = useState(545)
  // Panel stays 545–720px so its text never squeezes or stretches; the Light & link canvas keeps at least 400px.
  const clampW = (w: number) => Math.round(Math.max(545, Math.min(w, 720, innerWidth - 400)))
  useEffect(() => {
    const f = () => setPanelW(w => Math.round(Math.max(545, Math.min(w, 720, innerWidth - 400))))
    addEventListener('resize', f)
    return () => removeEventListener('resize', f)
  }, [])
  const [showCal, setShowCal] = useState(false)
  /** 'all' is the overview; any other value is one section covering the page under the navbar. */
  const [view, setView] = useState<'all' | (typeof SECTIONS)[number][0]>('all')
  const show = useEvent((id: typeof view) => {
    setView(id)
    if (id === 'windows') setShowCal(true)
    scrollTo(0, 0)
  })
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.ctrlKey || e.metaKey || e.altKey || t.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) || !/^[0-5]$/.test(e.key)) return
      e.preventDefault()
      show(e.key === '0' ? 'all' : SECTIONS[+e.key - 1][0])
    }
    addEventListener('keydown', f)
    return () => removeEventListener('keydown', f)
  }, [show])

  if (error) return <p className="p-6 text-sm text-red-300">Could not load data: {error}</p>
  if (page === '#validation') return <Validation data={data} horizons={horizons} explain={explain} onToggleExplain={() => setExplain(!explain)} />
  if (!here) {
    return (
      <p className="flex min-h-screen items-center justify-center gap-3 p-6 font-mono text-sm text-zinc-300" role="status">
        <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-sun shadow-[0_0_10px_var(--color-sun)]" />
        {siteId === 'custom' ? busy || 'Asking JPL Horizons…' : 'Loading Sun and Earth positions…'}
      </p>
    )
  }

  const iScrub = Math.round(indexAt(here.ephem, nowMs + scrubH * 36e5))
  const inData = iScrub >= 0 && iScrub < here.ephem.sunEl.length
  const hz = horizons.get(siteId)
  const terrain = hz ? 'LOLA terrain' : 'terrain not applied'
  const masts = hz ? mastRange(hz) : null
  const sunChip = inData ? countdown(here.ephem, here.mask, 'sun', iScrub) : NO_CHIP
  const earthChip = inData ? countdown(here.ephem, here.mask, 'earth', iScrub) : NO_CHIP
  const m = result?.current
  const next = m?.verdict === 'NO-GO' ? year.find(d => d.date > now && d.m?.verdict === 'GO') : undefined
  const nextGo: PlanBOption | null = m && next?.m
    ? { siteId, siteName: here.site.name, start: next.date, slipDays: Math.round((Date.parse(next.date) - Date.parse(start)) / DAY_MS), m: next.m, sentence: gainLoss(next.m, m), kind: 'date' }
    : null
  let rescue: Rescue | null = null
  if (m && m.verdict === 'NO-GO') {
    if (options[0]?.m.verdict === 'GO') rescue = { option: options[0], lead: 'Best Plan B:' }
    else if (nextGo) rescue = { option: nextGo, lead: 'Nothing in the Plan B list meets every need. Next good date here:' }
    else {
      const b = bottleneck(year.filter(d => d.date > now), needs)
      const [name, unit] = b ? NEED_TEXT[b.key] : ['', '']
      const fix = b
        ? `Relaxing ${name} from ${b.from}${unit} to ${b.to}${unit} unlocks ${b.unlocks} landing date${b.unlocks === 1 ? '' : 's'}.`
        : 'Every date fails two or more needs: relax several at once, or try a taller mast.'
      rescue = { option: options[0], lead: `No GO date here after ${now} through 2028 with these needs. ${fix}${options[0] ? ' Closest option:' : ''}` }
    }
  }
  const commsFail = !!m && (m.earthPct < needs.minEarthPct || m.longestCommsGapH > needs.maxGapH)
  const loading = sites.length - [...data.keys()].filter(k => k !== 'custom').length
  const field = 'rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 text-sm text-zinc-50 transition-colors focus:border-earth/60'
  const chip = (active: boolean, on = 'bg-zinc-100 text-void') => `rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${active ? on + ' font-semibold' : 'border border-white/10 bg-white/[0.05] text-zinc-200 hover:bg-white/[0.12]'}`
  const needsChanged = JSON.stringify(needs) !== JSON.stringify(DEFAULTS.needs)

  const slider = (label: string, key: keyof Needs, max: number, unit: string, pass: boolean) => (
    <label className="block text-xs">
      <span className="mb-0.5 flex items-center justify-between text-zinc-200">
        <span>{label}</span>
        <span className="flex items-center gap-1.5 font-mono tabular-nums">
          <span className="text-zinc-50">{needs[key]} {unit}</span>
          {m && <span className={`rounded border px-1 py-px text-[10px] font-bold ${pass ? 'border-go/50 bg-go/15 text-emerald-300' : 'border-nogo/50 bg-nogo/15 text-red-300'}`}>{pass ? 'PASS' : 'FAIL'}</span>}
        </span>
      </span>
      <input type="range" min={0} max={max} value={needs[key]} onChange={e => setNeeds({ ...needs, [key]: +e.target.value })} className="block w-full" />
    </label>
  )

  return (
    <div className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden" style={{ '--panel': `${panelW}px` } as React.CSSProperties}>
      {/* Navbar across the whole site: brand and verdict, section tabs, workspace controls, scenarios. */}
      <header className="glass-float z-50 md:sticky md:top-0 !border-x-0 !border-t-0 px-3 py-2 lg:px-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex shrink-0 items-center gap-2.5">
            <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
              <circle cx="12" cy="12" r="10" fill="#d4d4d8" />
              <circle cx="16.5" cy="10" r="10" fill="#030508" />
              <circle cx="12" cy="12" r="10" fill="none" stroke="#ffffff" strokeOpacity="0.35" />
            </svg>
            <h1 className="text-lg font-semibold tracking-tight text-white">MoonSlip</h1>
            {m && (
              <span className={`rounded-md border px-2 py-0.5 font-mono text-xs font-bold ${m.verdict === 'GO' ? 'border-go/60 bg-go/15 text-emerald-300' : 'border-nogo/60 bg-nogo/15 text-red-300'}`}
                aria-label={`Current verdict ${m.verdict}`}>
                {m.verdict}
              </span>
            )}
          </div>
          <nav className="order-last flex w-full min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] xl:order-none xl:w-auto xl:flex-1" aria-label="Sections (keys 0 to 5)">
            {([['all', 'Overview'], ...SECTIONS] as const).map(([id, label], i) => (
              <button key={id} onClick={e => { show(id); e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }} aria-current={view === id ? 'page' : undefined}
                className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${view === id ? 'bg-zinc-100 text-void' : 'text-zinc-200 hover:bg-white/[0.08] hover:text-white'}`}>
                <kbd className={`mr-1.5 font-mono text-[10px] ${view === id ? 'text-zinc-600' : 'text-zinc-400'}`}>{i}</kbd>{label}
              </button>
            ))}
          </nav>
          <nav className="ml-auto flex shrink-0 flex-wrap items-center gap-1.5" aria-label="Workspace">
            <a href="#validation" className={btn}>Validation<span className="hidden sm:inline"> &amp; NASA Data</span></a>
            <div className="inline-flex rounded-md border border-white/10 bg-black/40 p-0.5 text-xs" role="group" aria-label="Audience mode">
              <button onClick={() => setExplain(false)} aria-pressed={!explain}
                className={`rounded px-2 py-0.5 font-medium transition-colors ${!explain ? 'bg-zinc-100 text-void' : 'text-zinc-200 hover:text-white'}`}>
                Planner
              </button>
              <button onClick={() => setExplain(true)} aria-pressed={explain}
                className={`rounded px-2 py-0.5 font-medium transition-colors ${explain ? 'bg-earth text-void' : 'text-zinc-200 hover:text-white'}`}>
                Explain
              </button>
            </div>
            <a href="https://github.com/oscarzt20/CapricornMap" target="_blank" rel="noreferrer" className={btn}>GitHub</a>
            <button onClick={copy} className={btn}>{copied ? 'Copied' : 'Share'}<span className="hidden sm:inline"> link</span></button>
          </nav>
        </div>
          {shareUrl && (
            <div className="glass-float mt-2 flex flex-wrap items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs">
              <span className="text-sky-100">Copy share link:</span>
              <input readOnly value={shareUrl} onFocus={e => e.currentTarget.select()} aria-label="Shareable scenario URL"
                className="min-w-0 flex-1 rounded border border-white/10 bg-black/50 px-2 py-1 font-mono text-xs text-zinc-100" />
              <button onClick={() => setShareUrl('')} className={btn}>Close</button>
            </div>
          )}
      </header>

      {view === 'all' ? (
        <div className="flex flex-col lg:relative lg:block lg:min-h-0 lg:flex-1">
          {/* Light & link fills the space, the planner is a resizable side panel over it. Below lg: Light & link first, then the panel. */}
          <section aria-label="Light and link"
            className={`px-3 pt-4 lg:absolute lg:inset-y-0 lg:right-0 lg:overflow-y-auto lg:px-6 lg:pb-8 ${panelOpen ? 'lg:left-(--panel)' : 'lg:left-0'}`}>
            <div className="min-w-0 space-y-4">
              {/* Tier 2: when does the light go, and what are the ways out? */}
              <Tier n="02" title="Light & link" hint="When does darkness fall? When is Earth lost?" />
              <Panel id="sec-sky" kicker="Sky" title="360° horizon ribbon" explain={explain} className="min-w-0"
                aside={<span className="font-mono text-[11px] text-zinc-300">one lunar day from {now}</span>}
                caption={CAP.sky}>
                <SkyRibbon e={here.ephem} mask={here.mask} dip={sphereDipDeg(mastM)} startMs={nowMs} hours={LUNAR_DAY_H} scrubH={scrubH} setScrubH={setScrubH}
                  terrain={terrain} marks={marks} ghost={ghostPreview ?? ghostB}>
                  <Timeline e={here.ephem} mask={here.mask} startMs={nowMs} hours={LUNAR_DAY_H} missionH={days * 24} scrubH={scrubH} setScrubH={setScrubH}
                    marks={marks} b={ghostB} preview={ghostPreview} />
                </SkyRibbon>
              </Panel>

              <Panel id="sec-planb" kicker="Plan B" title="Rescue finder" explain={explain} className="min-w-0"
                caption={CAP.planb}
                aside={slip > 0 && (
                  <label className="flex items-center gap-1.5 text-xs text-zinc-300">
                    <input type="checkbox" checked={earlier} onChange={e => setEarlier(e.target.checked)} className="accent-sun" /> include dates before {now}
                  </label>
                )}>
                {result ? (
                  <PlanBPanel options={options} nextGo={nextGo} onPick={pick} onUse={use} onPreview={setPreview} activeKey={compareB ? `${compareB.siteId}@${compareB.start}` : undefined} />
                ) : <p className="text-sm text-zinc-400">No data.</p>}
                <p className="mt-3 text-[11px] leading-relaxed text-zinc-400">
                  Gains and losses are measured against plan A: {here.site.name}, landing {now}.
                  {loading > 0 && ` Loading ${loading} remaining sites…`}
                </p>
              </Panel>
            </div>
          </section>

          {panelOpen && (
            <div role="separator" aria-orientation="vertical" aria-controls="side-panel" aria-label="Resize side panel (arrow keys)"
              aria-valuenow={panelW} aria-valuemin={545} aria-valuemax={720} tabIndex={0}
              className="absolute inset-y-0 left-(--panel) z-40 hidden w-2 -translate-x-1/2 cursor-col-resize touch-none transition-colors hover:bg-earth/40 focus-visible:bg-earth/40 lg:block"
              onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId) }}
              onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) setPanelW(clampW(e.clientX)) }}
              onKeyDown={e => {
                const d = e.key === 'ArrowLeft' ? -24 : e.key === 'ArrowRight' ? 24 : 0
                if (d) { e.preventDefault(); setPanelW(w => clampW(w + d)) }
              }} />
          )}

          <button onClick={() => setPanelOpen(!panelOpen)} aria-expanded={panelOpen} aria-controls="side-panel"
            aria-label={panelOpen ? 'Collapse side panel' : 'Expand side panel'}
            className={`glass-float absolute top-1/2 z-40 hidden h-12 w-6 -translate-y-1/2 items-center justify-center rounded-r-lg text-zinc-200 hover:text-white lg:flex ${panelOpen ? 'left-(--panel)' : 'left-0'}`}>
            {panelOpen ? '‹' : '›'}
          </button>

          <aside id="side-panel" aria-label="Mission planner"
            className={`order-first px-3 pb-4 lg:order-none lg:pb-8 lg:absolute lg:inset-y-0 lg:left-0 lg:z-30 lg:w-(--panel) lg:overflow-y-auto lg:border-r lg:border-white/10 lg:bg-void lg:px-4 lg:shadow-[8px_0_32px_rgb(0_0_0/0.6)] ${panelOpen ? '' : 'lg:hidden'}`}>
            <main className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Scenarios">
                <span className="kicker shrink-0 text-zinc-400">Scenarios</span>
                {SCENARIOS.map(p => {
                  const active = siteId === p.siteId && start === p.start && slip === p.slip && mastM === p.mastM && days === p.days && explain === p.explain
                  return (
                    <button key={p.id} onClick={() => applyPreset(p)} title={p.hint} aria-pressed={active}
                      className={`shrink-0 rounded-full border px-3 py-1 text-xs transition-colors ${active ? 'border-sun/70 bg-amber-950 text-amber-200' : 'border-white/15 bg-zinc-900 text-zinc-200 hover:border-white/30 hover:text-white'}`}>
                      {p.label}
                    </button>
                  )
                })}
              </div>
              {/* Tier 1: can we land? */}
              <div className="min-w-0 space-y-4">
                {m ? (
                  <VerdictStrip m={m} needs={needs} sun={sunChip} earth={earthChip} rescue={rescue} onCompare={pick} onUse={use} />
                ) : (
                  <p className="rounded-2xl border border-sun/50 bg-sun/10 p-4 text-sm text-amber-200">
                    No data for this date at this site. Curated data covers 2027–2028; look up a custom site again after changing the date.
                  </p>
                )}
                {explain && m && (
                  <p className="rounded-xl border border-earth/25 bg-earth/[0.07] px-3 py-2 text-xs text-sky-100">
                    <b>GO</b> means the site meets every threshold. The T− counters show how long until the Sun or Earth slips behind the terrain, measured from the scrubber time.
                  </p>
                )}
                {m && (commsFail || (inData && !earthChip.up)) && m.longestCommsGapH > 0 && <RelayCard gapH={m.longestCommsGapH} earthUp={earthChip.up} />}
                {explain && <EarthMoonCard site={here.site} e={here.ephem} />}
              </div>
              <section id="sec-setup" className="min-w-0 space-y-4" aria-label="Scenario controls">
                <Panel kicker="Site" title="Landing site & radar map" explain={explain}
                  caption={CAP.site}
                  badge={<span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${hz ? 'border-go/50 bg-go/15 text-emerald-300' : 'border-sun/50 bg-sun/10 text-amber-200'}`}>{terrain}</span>}>
                  <select value={siteId} onChange={e => pickSite(e.target.value)} className={field + ' w-full'} aria-label="Landing site">
                    {GROUPS.map(g => (
                      <optgroup key={g} label={g}>
                        {[...data.values()].filter(d => d.site.group === g).map(d => <option key={d.site.id} value={d.site.id}>{d.site.name}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-mono text-zinc-200 tabular-nums">{here.site.lat.toFixed(3).replace('-', '−')}°, {here.site.lonE.toFixed(3)}°E</span>
                    <a href={quickmapUrl(here.site.lat, here.site.lonE)} target="_blank" rel="noreferrer" className="text-sky-300 underline">Open in LROC QuickMap ↗</a>
                  </div>
                  {hz?.snapKm ? (
                    <p className="mt-1 text-[11px] text-zinc-400">
                      Region site: horizon from high point within 1 km ({hz.observerLat!.toFixed(3)}°, {hz.observerLonE!.toFixed(3)}°E, {hz.siteHeightM} m).
                    </p>
                  ) : null}

                  <div id="sec-map" className="mt-3">
                    <PoleMap sites={sites} meta={mapMeta} a={siteId} b={compareB && compareB.siteId !== siteId ? compareB.siteId : null} custom={custom?.site ?? null}
                      onPick={pickSite} onGround={markGround} onLookup={lookupGround} />
                  </div>

                  <div className="mt-3 border-t border-white/10 pt-3">
                    <div className="mb-1.5 flex items-center justify-between text-[11px] text-zinc-300">
                      <span>Custom coordinates (live JPL Horizons)</span>
                      <button onClick={() => { setLat('0'); setLon('180'); lookup(0, 180) }} className="text-sky-300 underline">Try far side (0°, 180°)</button>
                    </div>
                    <div className="flex gap-1.5">
                      <input value={lat} onChange={e => setLat(e.target.value)} className={field + ' w-20 font-mono text-xs'} aria-label="Custom latitude" inputMode="decimal" />
                      <input value={lon} onChange={e => setLon(e.target.value)} className={field + ' w-20 font-mono text-xs'} aria-label="Custom longitude east" inputMode="decimal" />
                      <button onClick={() => lookup()} className="flex-1 rounded-md bg-cyan-400 px-2.5 py-1.5 text-xs font-semibold text-void transition-colors hover:bg-cyan-300">Look up</button>
                    </div>
                    {busy && <p className="mt-1.5 text-xs text-amber-200" role="status">{busy}</p>}
                  </div>
                </Panel>

                <Panel kicker="Slip" title="Launch slip & hardware" explain={explain}
                  caption={CAP.slip}>
                  <SlipBar slip={slip} setSlip={setSlip} strip={slipStrip} start={start} />

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <label className="block">
                      <span className="text-zinc-300">Nominal date</span>
                      <input type="date" min={DATE_MIN} max={DATE_MAX} value={start} onChange={e => e.target.value && setStart(e.target.value)} className={field + ' mt-1 w-full font-mono text-xs'} />
                    </label>
                    <label className="block">
                      <span className="text-zinc-300">Mission days</span>
                      <input type="number" min={1} max={60} value={days} onChange={e => setDays(Math.max(1, Math.min(60, +e.target.value || 1)))} className={field + ' mt-1 w-full font-mono text-xs'} />
                    </label>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {DAY_PRESETS.map(d => <button key={d} onClick={() => setDays(d)} aria-pressed={days === d} className={chip(days === d)}>{d}d</button>)}
                  </div>

                  <div className="mt-3 border-t border-white/10 pt-3 text-xs">
                    <label className="block">
                      <span className="flex items-center justify-between text-zinc-300">
                        <span>Mast height (m)</span>
                        {hz && <span className="font-mono text-[11px] text-zinc-400">{masts ? `LOLA ${masts[0]}–${masts[1]} m` : 'fixed 2 m'}</span>}
                      </span>
                      <input type="number" min={0} max={50} step={0.5} value={mastM} onChange={e => setMastM(Math.max(0, Math.min(50, +e.target.value || 0)))} className={field + ' mt-1 w-full font-mono text-xs'} />
                    </label>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {MAST_PRESETS.map(([val, label]) => <button key={val} onClick={() => setMastM(val)} aria-pressed={mastM === val} className={chip(mastM === val, 'bg-sun text-void')}>{label}</button>)}
                    </div>
                  </div>
                </Panel>

                <Panel kicker="Needs" title="Lander survival needs" explain={explain}
                  caption={CAP.needs}
                  aside={needsChanged && <button onClick={() => setNeeds(DEFAULTS.needs)} className="text-xs text-sky-300 underline">Reset defaults</button>}>
                  <div className="mb-3 flex flex-wrap items-center gap-1" role="group" aria-label="Mission profiles, illustrative values">
                    <span className="kicker mr-1 text-zinc-400" title="Illustrative values, not published mission requirements">Profiles · illustrative</span>
                    {PROFILES.map(p => {
                      const on = mastM === p.mast && JSON.stringify(needs) === JSON.stringify(p.needs)
                      return <button key={p.label} title={p.hint} aria-pressed={on} onClick={() => { setNeeds(p.needs); setMastM(p.mast) }} className={chip(on, 'bg-sun text-void')}>{p.label}</button>
                    })}
                  </div>
                  <div className="space-y-2.5">
                    {slider('Min sunlight', 'minSunPct', 100, '%', !m || m.sunPct >= needs.minSunPct)}
                    {slider('Max longest night', 'maxDarkH', 360, 'h', !m || m.longestDarkH <= needs.maxDarkH)}
                    {slider('Min Earth visible', 'minEarthPct', 100, '%', !m || m.earthPct >= needs.minEarthPct)}
                    {slider('Max comms gap', 'maxGapH', 360, 'h', !m || m.longestCommsGapH <= needs.maxGapH)}
                  </div>
                </Panel>
              </section>
              <div className="min-w-0 space-y-4">
                <Tier n="03" title="Deep analysis" hint="Plan A against plan B, and every landing date in two years" />
                <Panel kicker="Δ" title="Scenario comparator" explain={explain}
                  caption={CAP.comparator}>
                  <Comparator a={m ?? null} b={mB} la={`A: ${here.site.name}, ${now}`} lb={`B: ${bLabel}`}
                    onUse={b.siteId !== siteId || b.start !== now ? () => use(b) : undefined}
                    onSwap={showOverlayB ? swapAB : undefined} />
                </Panel>

                <Panel id="sec-windows" kicker="Windows" title={`2027–2028 landing calendar · ${here.site.name}`} explain={explain}
                  aside={<button className="text-xs text-sky-300 underline" onClick={() => setShowCal(!showCal)} aria-expanded={showCal}>{showCal ? 'Hide calendar' : 'Show calendar'}</button>}
                  caption={CAP.windows}>
                  {showCal && <CalendarHeatmap days={year} current={now} original={start} missionDays={days} e={here.ephem} mask={here.mask} onPick={pickDate} />}
                </Panel>
              </div>
            </main>
          <footer className="mt-6 hidden lg:block border-t border-white/10 pt-4 text-xs leading-relaxed text-zinc-400">
            Sun and Earth positions: NASA JPL Horizons (airless, hourly, 2027–2028). Terrain: NASA LRO LOLA PGDA Product 90 where marked. Open data, <a href="https://github.com/oscarzt20/CapricornMap" target="_blank" rel="noreferrer" className="text-sky-300 underline">open code on GitHub</a>.
            {' '}<a href="#validation" className="text-sky-300 underline">Validation, NASA cross-check, and all data sources</a>.
          </footer>
          </aside>
          <footer className="mx-3 mt-6 pb-8 lg:hidden border-t border-white/10 pt-4 text-xs leading-relaxed text-zinc-400">
            Sun and Earth positions: NASA JPL Horizons (airless, hourly, 2027–2028). Terrain: NASA LRO LOLA PGDA Product 90 where marked. Open data, <a href="https://github.com/oscarzt20/CapricornMap" target="_blank" rel="noreferrer" className="text-sky-300 underline">open code on GitHub</a>.
            {' '}<a href="#validation" className="text-sky-300 underline">Validation, NASA cross-check, and all data sources</a>.
          </footer>
        </div>
      ) : (
        /* A section tab: that section alone covers the page under the navbar. */
        <main className={`px-3 py-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-6 ${explain ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6' : ''}`}>
          <div className="min-w-0">
          {view === 'setup' && (
            <section className="gap-4 md:columns-2 2xl:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid" aria-label="Scenario controls">
              <Panel kicker="Site" title="Landing site & radar map" explain={false}
                caption={CAP.site}
                badge={<span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${hz ? 'border-go/50 bg-go/15 text-emerald-300' : 'border-sun/50 bg-sun/10 text-amber-200'}`}>{terrain}</span>}>
                <select value={siteId} onChange={e => pickSite(e.target.value)} className={field + ' w-full'} aria-label="Landing site">
                  {GROUPS.map(g => (
                    <optgroup key={g} label={g}>
                      {[...data.values()].filter(d => d.site.group === g).map(d => <option key={d.site.id} value={d.site.id}>{d.site.name}</option>)}
                    </optgroup>
                  ))}
                </select>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-mono text-zinc-200 tabular-nums">{here.site.lat.toFixed(3).replace('-', '−')}°, {here.site.lonE.toFixed(3)}°E</span>
                  <a href={quickmapUrl(here.site.lat, here.site.lonE)} target="_blank" rel="noreferrer" className="text-sky-300 underline">Open in LROC QuickMap ↗</a>
                </div>
                {hz?.snapKm ? (
                  <p className="mt-1 text-[11px] text-zinc-400">
                    Region site: horizon from high point within 1 km ({hz.observerLat!.toFixed(3)}°, {hz.observerLonE!.toFixed(3)}°E, {hz.siteHeightM} m).
                  </p>
                ) : null}

                <div className="mt-3 border-t border-white/10 pt-3">
                  <div className="mb-1.5 flex items-center justify-between text-[11px] text-zinc-300">
                    <span>Custom coordinates (live JPL Horizons)</span>
                    <button onClick={() => { setLat('0'); setLon('180'); lookup(0, 180) }} className="text-sky-300 underline">Try far side (0°, 180°)</button>
                  </div>
                  <div className="flex gap-1.5">
                    <input value={lat} onChange={e => setLat(e.target.value)} className={field + ' w-20 font-mono text-xs'} aria-label="Custom latitude" inputMode="decimal" />
                    <input value={lon} onChange={e => setLon(e.target.value)} className={field + ' w-20 font-mono text-xs'} aria-label="Custom longitude east" inputMode="decimal" />
                    <button onClick={() => lookup()} className="flex-1 rounded-md bg-cyan-400 px-2.5 py-1.5 text-xs font-semibold text-void transition-colors hover:bg-cyan-300">Look up</button>
                  </div>
                  {busy && <p className="mt-1.5 text-xs text-amber-200" role="status">{busy}</p>}
                </div>
              </Panel>
              <Panel kicker="Slip" title="Launch slip & hardware" explain={false}
                caption={CAP.slip}>
                <SlipBar slip={slip} setSlip={setSlip} strip={slipStrip} start={start} />

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <label className="block">
                    <span className="text-zinc-300">Nominal date</span>
                    <input type="date" min={DATE_MIN} max={DATE_MAX} value={start} onChange={e => e.target.value && setStart(e.target.value)} className={field + ' mt-1 w-full font-mono text-xs'} />
                  </label>
                  <label className="block">
                    <span className="text-zinc-300">Mission days</span>
                    <input type="number" min={1} max={60} value={days} onChange={e => setDays(Math.max(1, Math.min(60, +e.target.value || 1)))} className={field + ' mt-1 w-full font-mono text-xs'} />
                  </label>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {DAY_PRESETS.map(d => <button key={d} onClick={() => setDays(d)} aria-pressed={days === d} className={chip(days === d)}>{d}d</button>)}
                </div>

                <div className="mt-3 border-t border-white/10 pt-3 text-xs">
                  <label className="block">
                    <span className="flex items-center justify-between text-zinc-300">
                      <span>Mast height (m)</span>
                      {hz && <span className="font-mono text-[11px] text-zinc-400">{masts ? `LOLA ${masts[0]}–${masts[1]} m` : 'fixed 2 m'}</span>}
                    </span>
                    <input type="number" min={0} max={50} step={0.5} value={mastM} onChange={e => setMastM(Math.max(0, Math.min(50, +e.target.value || 0)))} className={field + ' mt-1 w-full font-mono text-xs'} />
                  </label>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {MAST_PRESETS.map(([val, label]) => <button key={val} onClick={() => setMastM(val)} aria-pressed={mastM === val} className={chip(mastM === val, 'bg-sun text-void')}>{label}</button>)}
                  </div>
                </div>
              </Panel>
              <Panel kicker="Needs" title="Lander survival needs" explain={false}
                caption={CAP.needs}
                aside={needsChanged && <button onClick={() => setNeeds(DEFAULTS.needs)} className="text-xs text-sky-300 underline">Reset defaults</button>}>
                <div className="mb-3 flex flex-wrap items-center gap-1" role="group" aria-label="Mission profiles, illustrative values">
                  <span className="kicker mr-1 text-zinc-400" title="Illustrative values, not published mission requirements">Profiles · illustrative</span>
                  {PROFILES.map(p => {
                    const on = mastM === p.mast && JSON.stringify(needs) === JSON.stringify(p.needs)
                    return <button key={p.label} title={p.hint} aria-pressed={on} onClick={() => { setNeeds(p.needs); setMastM(p.mast) }} className={chip(on, 'bg-sun text-void')}>{p.label}</button>
                  })}
                </div>
                <div className="space-y-2.5">
                  {slider('Min sunlight', 'minSunPct', 100, '%', !m || m.sunPct >= needs.minSunPct)}
                  {slider('Max longest night', 'maxDarkH', 360, 'h', !m || m.longestDarkH <= needs.maxDarkH)}
                  {slider('Min Earth visible', 'minEarthPct', 100, '%', !m || m.earthPct >= needs.minEarthPct)}
                  {slider('Max comms gap', 'maxGapH', 360, 'h', !m || m.longestCommsGapH <= needs.maxGapH)}
                </div>
              </Panel>
            </section>
          )}
          {view === 'sky' && (
            <Panel id="sec-sky" kicker="Sky" title="360° horizon ribbon" explain={false} className="min-w-0"
              aside={<span className="font-mono text-[11px] text-zinc-300">one lunar day from {now}</span>}
              caption={CAP.sky}>
              <SkyRibbon e={here.ephem} mask={here.mask} dip={sphereDipDeg(mastM)} startMs={nowMs} hours={LUNAR_DAY_H} scrubH={scrubH} setScrubH={setScrubH}
                terrain={terrain} marks={marks} ghost={ghostPreview ?? ghostB}>
                <Timeline e={here.ephem} mask={here.mask} startMs={nowMs} hours={LUNAR_DAY_H} missionH={days * 24} scrubH={scrubH} setScrubH={setScrubH}
                  marks={marks} b={ghostB} preview={ghostPreview} />
              </SkyRibbon>
            </Panel>
          )}
          {view === 'planb' && (
            <Panel id="sec-planb" kicker="Plan B" title="Rescue finder" explain={false} className="min-w-0"
              caption={CAP.planb}
              aside={slip > 0 && (
                <label className="flex items-center gap-1.5 text-xs text-zinc-300">
                  <input type="checkbox" checked={earlier} onChange={e => setEarlier(e.target.checked)} className="accent-sun" /> include dates before {now}
                </label>
              )}>
              {result ? (
                <PlanBPanel options={options} nextGo={nextGo} onPick={pick} onUse={use} onPreview={setPreview} activeKey={compareB ? `${compareB.siteId}@${compareB.start}` : undefined} />
              ) : <p className="text-sm text-zinc-400">No data.</p>}
              <p className="mt-3 text-[11px] leading-relaxed text-zinc-400">
                Gains and losses are measured against plan A: {here.site.name}, landing {now}.
                {loading > 0 && ` Loading ${loading} remaining sites…`}
              </p>
            </Panel>
          )}
          {view === 'map' && (
            <div className="mx-auto w-full max-w-[min(100%,calc(100vh-13rem))]">
              <PoleMap sites={sites} meta={mapMeta} a={siteId} b={compareB && compareB.siteId !== siteId ? compareB.siteId : null} custom={custom?.site ?? null}
                onPick={pickSite} onGround={markGround} onLookup={lookupGround} />
            </div>
          )}
          {view === 'windows' && (
          <Panel id="sec-windows" kicker="Windows" title={`2027–2028 landing calendar · ${here.site.name}`} explain={false}
            aside={<button className="text-xs text-sky-300 underline" onClick={() => setShowCal(!showCal)} aria-expanded={showCal}>{showCal ? 'Hide calendar' : 'Show calendar'}</button>}
            caption={CAP.windows}>
            {showCal && <CalendarHeatmap days={year} current={now} original={start} missionDays={days} e={here.ephem} mask={here.mask} onPick={pickDate} fit />}
          </Panel>
          )}
          </div>
          {explain && (
            <aside aria-label="Explain" className="mt-4 space-y-3 lg:sticky lg:top-0 lg:mt-0">
              <span className="kicker text-earth">Explain</span>
              {(view === 'setup' ? [CAP.site, CAP.slip, CAP.needs] : [CAP[view === 'map' ? 'site' : view]]).map(t => (
                <p key={t} className="rounded-lg border border-earth/25 bg-earth/[0.07] px-3 py-2 text-xs leading-relaxed text-sky-100">{t}</p>
              ))}
            </aside>
          )}
        </main>
      )}
    </div>
  )
}
