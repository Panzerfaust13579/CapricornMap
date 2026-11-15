import { useEffect, useMemo, useState } from 'react'
import {
  calendar, gainLoss, indexAt, maskForMast, mastRange, metrics, planB, range, shiftDate, sphereDipDeg, sphereMask,
  type Ephem, type Horizon, type Needs, type PlanBOption, type Site, type SiteData,
} from './engine'
import { quickmapUrl } from './engine/geo'
import { Comparator, PlanBPanel, Panel, SkyRibbon, VerdictStrip, btn, countdown, pct, slipLabel, type Chip, type Rescue } from './components'
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
  const scen = { siteId, start, days, mastM, needs }
  const result = useMemo(() => (here ? planB(scen, slip, data) : null), [here, data, start, days, slip, needs, siteId]) // eslint-disable-line
  const year = useMemo(() => (here ? calendar(scen, here.ephem, here.mask, '2027-01-01', '2028-12-31') : []), [here, days, needs]) // eslint-disable-line
  const slipStrip = useMemo(
    () => (here ? SLIPS.map(s => ({ s, m: metrics({ ...scen, start: shiftDate(start, s) }, here.ephem, here.mask) })) : []),
    [here, start, days, needs, siteId], // eslint-disable-line
  )

  const b = compareB ?? { siteId, start }
  const bData = data.get(b.siteId)
  const mB = bData ? metrics({ ...scen, siteId: b.siteId, start: b.start }, bData.ephem, bData.mask) : null
  const bLabel = compareB ? `${bData?.site.name ?? b.siteId}, ${b.start}` : `Original date (${start})`

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
    setNeeds(DEFAULTS.needs); setExplain(p.explain); setCompareB(p.b); setScrubH(0)
  }

  /** Make a compared plan the plan: move the slip if the date is within reach, otherwise move the landing date. */
  function use(p: { siteId: string; start: string }) {
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
  }

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

  const [earlier, setEarlier] = useState(false)
  const [showMap, setShowMap] = useState(() => typeof matchMedia !== 'function' || matchMedia('(min-width: 1024px)').matches)

  if (error) return <p className="p-4 text-rose-400">Could not load data: {error}</p>
  if (page === '#validation') return <Validation data={data} horizons={horizons} explain={explain} onToggleExplain={() => setExplain(!explain)} />
  if (!here) return <p className="p-4 text-zinc-400" role="status">{siteId === 'custom' ? busy || 'Asking JPL Horizons…' : 'Loading Sun and Earth positions…'}</p>

  const nowMs = Date.parse(now)
  const iScrub = Math.round(indexAt(here.ephem, nowMs + scrubH * 36e5))
  const inData = iScrub >= 0 && iScrub < here.ephem.sunEl.length
  const hz = horizons.get(siteId)
  const terrain = hz ? 'LOLA terrain' : 'terrain not applied'
  const masts = hz ? mastRange(hz) : null
  const sunChip = inData ? countdown(here.ephem, here.mask, 'sun', iScrub) : NO_CHIP
  const earthChip = inData ? countdown(here.ephem, here.mask, 'earth', iScrub) : NO_CHIP
  const m = result?.current
  const options = (result?.options ?? []).filter(o => earlier || slip <= 0 || o.kind === 'site' || o.start > now)
  let rescue: Rescue | null = null
  if (m && m.verdict === 'NO-GO') {
    const next = year.find(d => d.date > now && d.m?.verdict === 'GO')
    if (options[0]?.m.verdict === 'GO') rescue = { option: options[0], lead: 'Best Plan B:' }
    else if (next) rescue = {
      lead: 'Nothing in the Plan B list meets every need. Next good date here:',
      option: { siteId, siteName: here.site.name, start: next.date, slipDays: Math.round((Date.parse(next.date) - Date.parse(start)) / DAY_MS), m: next.m!, sentence: gainLoss(next.m!, m), kind: 'date' },
    }
    else if (options[0]) rescue = { option: options[0], lead: 'No option meets every need. Closest:' }
  }
  const commsFail = !!m && (m.earthPct < needs.minEarthPct || m.longestCommsGapH > needs.maxGapH)
  const pick = (o: PlanBOption) => setCompareB({ siteId: o.siteId, start: o.start })
  const loading = sites.length - [...data.keys()].filter(k => k !== 'custom').length
  const field = 'rounded-md border border-zinc-700/80 bg-zinc-950/90 px-2.5 py-1.5 text-sm text-zinc-100'
  const showOverlayB = !!(bData && (b.siteId !== siteId || b.start !== now))
  const needsChanged = JSON.stringify(needs) !== JSON.stringify(DEFAULTS.needs)

  const slider = (label: string, key: keyof Needs, max: number, unit: string, pass: boolean) => (
    <label className="block text-xs">
      <span className="mb-0.5 flex items-center justify-between text-zinc-300">
        <span>{label}</span>
        <span className="flex items-center gap-1.5 font-mono tabular-nums">
          <span>{needs[key]} {unit}</span>
          {m && <span className={`rounded px-1 py-0.5 text-[10px] font-bold ${pass ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'}`}>{pass ? 'PASS' : 'FAIL'}</span>}
        </span>
      </span>
      <input type="range" min={0} max={max} value={needs[key]} onChange={e => setNeeds({ ...needs, [key]: +e.target.value })} className="w-full" />
    </label>
  )

  return (
    <div className="mx-auto max-w-7xl space-y-3 p-3 sm:p-4">
      <header className="sticky top-0 z-20 -mx-3 border-b border-zinc-800/80 bg-[#090b10]/95 px-3 py-2.5 backdrop-blur sm:-mx-4 sm:px-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-extrabold tracking-tight text-white sm:text-xl">MoonSlip</h1>
            {m && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${m.verdict === 'GO' ? 'bg-emerald-950 text-emerald-300 ring-1 ring-emerald-700/70' : 'bg-rose-950 text-rose-300 ring-1 ring-rose-700/70'}`}
                aria-label={`Current verdict ${m.verdict}`}>
                {m.verdict}
              </span>
            )}
          </div>
          <span className="hidden text-xs text-zinc-400 xl:inline">Lunar South Pole Launch-Slip &amp; Horizon Navigator</span>

          <nav className="ml-auto flex flex-wrap items-center gap-1.5" aria-label="Workspace navigation">
            <a href="#" className="rounded-md bg-zinc-200 px-2.5 py-1 text-xs font-semibold text-zinc-950">Mission Planner</a>
            <a href="#validation" className={btn}>Validation &amp; NASA Data</a>
            <div className="inline-flex rounded-md border border-zinc-700/80 bg-zinc-900 p-0.5 text-xs" role="group" aria-label="Audience mode">
              <button onClick={() => setExplain(false)} aria-pressed={!explain}
                className={`rounded px-2 py-0.5 font-medium transition-colors ${!explain ? 'bg-zinc-200 text-zinc-950' : 'text-zinc-300 hover:text-white'}`}>
                Planner
              </button>
              <button onClick={() => setExplain(true)} aria-pressed={explain}
                className={`rounded px-2 py-0.5 font-medium transition-colors ${explain ? 'bg-sky-400 text-zinc-950' : 'text-zinc-300 hover:text-white'}`}>
                Explain
              </button>
            </div>
            <button onClick={copy} className={btn}>{copied ? 'Link copied' : 'Share link'}</button>
          </nav>
        </div>

        {shareUrl && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-sky-700/70 bg-sky-950/40 px-2.5 py-1.5 text-xs">
            <span className="text-sky-200">Copy share link:</span>
            <input readOnly value={shareUrl} onFocus={e => e.currentTarget.select()} aria-label="Shareable scenario URL"
              className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-200" />
            <button onClick={() => setShareUrl('')} className={btn}>Close</button>
          </div>
        )}

        <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Quick scenarios:</span>
          {SCENARIOS.map(p => {
            const active = siteId === p.siteId && start === p.start && slip === p.slip && mastM === p.mastM && days === p.days && explain === p.explain
            return (
              <button key={p.id} onClick={() => applyPreset(p)} title={p.hint}
                className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${active ? 'border-amber-400/80 bg-amber-950/50 text-amber-200' : 'border-zinc-800 bg-zinc-900/90 text-zinc-300 hover:border-zinc-600 hover:text-white'}`}>
                {p.label}
              </button>
            )
          })}
        </div>
      </header>

      <div className="grid gap-3.5 lg:grid-cols-[360px_1fr]">
        <div className="min-w-0 space-y-3.5">
          <Panel title="1. Landing Site & Map" explain={explain}
            caption="Pick an Artemis III, CLPS, ISRO or Apollo site, or click anywhere on the South Pole map to inspect custom coordinates."
            badge={<span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${hz ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60' : 'bg-amber-950 text-amber-300 border border-amber-700/60'}`}>{terrain}</span>}
            aside={<button className="text-xs text-sky-400 underline" onClick={() => setShowMap(!showMap)} aria-expanded={showMap}>{showMap ? 'Hide map' : 'Show map'}</button>}>
            <select value={siteId} onChange={e => { setSiteId(e.target.value); setCompareB(null) }} className={field + ' w-full'} aria-label="Landing site">
              {GROUPS.map(g => (
                <optgroup key={g} label={g}>
                  {[...data.values()].filter(d => d.site.group === g).map(d => <option key={d.site.id} value={d.site.id}>{d.site.name}</option>)}
                </optgroup>
              ))}
            </select>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-mono text-zinc-400">{here.site.lat.toFixed(3)}°, {here.site.lonE.toFixed(3)}°E</span>
              <a href={quickmapUrl(here.site.lat, here.site.lonE)} target="_blank" rel="noreferrer" className="text-sky-400 underline">Open in LROC QuickMap ↗</a>
            </div>
            {hz?.snapKm ? (
              <p className="mt-1 text-[11px] text-zinc-500">
                Region site: horizon from high point within 1 km ({hz.observerLat!.toFixed(3)}°, {hz.observerLonE!.toFixed(3)}°E, {hz.siteHeightM} m).
              </p>
            ) : null}

            {showMap && (
              <div className="mt-2.5">
                <PoleMap sites={sites} meta={mapMeta} a={siteId} b={compareB && compareB.siteId !== siteId ? compareB.siteId : null} custom={custom?.site ?? null}
                  onPick={id => { setSiteId(id); setCompareB(null) }}
                  onGround={(la, lo) => { setLat(String(la)); setLon(String(lo)); setBusy(`Coordinates ${la}°, ${lo}°E set from map. Press Look up.`) }} />
              </div>
            )}

            <div className="mt-2.5 border-t border-zinc-800/80 pt-2.5">
              <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-400">
                <span>Custom coordinates (live JPL Horizons)</span>
                <button onClick={() => { setLat('0'); setLon('180'); lookup(0, 180) }} className="text-sky-400 underline">Try far side (0°, 180°)</button>
              </div>
              <div className="flex gap-1.5">
                <input value={lat} onChange={e => setLat(e.target.value)} className={field + ' w-20 font-mono text-xs'} aria-label="Custom latitude" inputMode="decimal" />
                <input value={lon} onChange={e => setLon(e.target.value)} className={field + ' w-20 font-mono text-xs'} aria-label="Custom longitude east" inputMode="decimal" />
                <button onClick={() => lookup()} className="flex-1 rounded-md bg-zinc-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-zinc-600">Look up</button>
              </div>
              {busy && <p className="mt-1 text-xs text-amber-300" role="status">{busy}</p>}
            </div>
          </Panel>

          <Panel title="2. Launch Slip & Hardware" explain={explain}
            caption="Move the Launch slipped slider or click any day in the 36-day strip to see how a delay breaks or rescues the mission.">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-zinc-200">Launch slipped</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setSlip(Math.max(-7, slip - 1))} className={btn} aria-label="One day earlier">−</button>
                  <span className="w-12 text-center font-mono text-sm font-bold text-amber-300 tabular-nums">{slipLabel(slip)}</span>
                  <button onClick={() => setSlip(Math.min(28, slip + 1))} className={btn} aria-label="One day later">+</button>
                  {slip !== 0 && <button onClick={() => setSlip(0)} className="ml-1 text-[11px] text-sky-400 underline">0d</button>}
                </div>
              </div>
              <input type="range" min={-7} max={28} value={slip} onChange={e => setSlip(+e.target.value)} className="mt-2 w-full" aria-label="Launch slip in days" />
              <div className="mt-1.5 flex gap-0.5" role="group" aria-label="36-day launch slip viability strip from -7 to +28 days">
                {slipStrip.map(({ s, m: sm }) => {
                  const active = s === slip
                  const bg = !sm ? 'bg-zinc-800' : sm.verdict === 'GO' ? 'bg-emerald-500/85 hover:bg-emerald-400' : 'bg-rose-600/75 hover:bg-rose-500'
                  return (
                    <button key={s} onClick={() => setSlip(s)} title={`Slip ${slipLabel(s)} (${shiftDate(start, s)}): ${sm ? `${sm.verdict}, ${pct(sm.sunPct)} sun` : 'no data'}`}
                      className={`h-3 flex-1 rounded-[2px] transition-transform ${bg} ${active ? 'ring-2 ring-white scale-y-125' : ''}`}
                      aria-label={`Slip ${slipLabel(s)}: ${sm?.verdict ?? 'no data'}`} />
                  )
                })}
              </div>
              <div className="mt-1 flex justify-between font-mono text-[10px] text-zinc-500">
                <span>−7d</span><span>Nominal ({start})</span><span className="text-zinc-300">Landing: {now}</span><span>+28d</span>
              </div>
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs">
              <label className="block">
                <span className="text-zinc-400">Nominal date</span>
                <input type="date" min={DATE_MIN} max={DATE_MAX} value={start} onChange={e => e.target.value && setStart(e.target.value)} className={field + ' mt-1 w-full text-xs'} />
              </label>
              <label className="block">
                <span className="text-zinc-400">Mission days</span>
                <input type="number" min={1} max={60} value={days} onChange={e => setDays(Math.max(1, Math.min(60, +e.target.value || 1)))} className={field + ' mt-1 w-full text-xs'} />
              </label>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {DAY_PRESETS.map(d => (
                <button key={d} onClick={() => setDays(d)}
                  className={`rounded px-2 py-0.5 text-[11px] font-medium ${days === d ? 'bg-zinc-200 text-zinc-950' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>
                  {d}d
                </button>
              ))}
            </div>

            <div className="mt-2.5 border-t border-zinc-800/80 pt-2.5 text-xs">
              <label className="block">
                <span className="flex items-center justify-between text-zinc-400">
                  <span>Mast height (m)</span>
                  {hz && <span className="text-[11px] text-zinc-500">{masts ? `LOLA ${masts[0]}–${masts[1]} m` : 'fixed 2 m'}</span>}
                </span>
                <input type="number" min={0} max={50} step={0.5} value={mastM} onChange={e => setMastM(Math.max(0, Math.min(50, +e.target.value || 0)))} className={field + ' mt-1 w-full text-xs'} />
              </label>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {MAST_PRESETS.map(([val, label]) => (
                  <button key={val} onClick={() => setMastM(val)}
                    className={`rounded px-2 py-0.5 text-[11px] font-medium ${mastM === val ? 'bg-amber-400 text-zinc-950 font-semibold' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </Panel>

          <Panel title="3. Lander Survival Needs" explain={explain}
            caption="Adjust minimum solar illumination and Earth link requirements to match your lander or rover hardware."
            aside={needsChanged && <button onClick={() => setNeeds(DEFAULTS.needs)} className="text-xs text-sky-400 underline">Reset defaults</button>}>
            <div className="space-y-2">
              {slider('Min sunlight', 'minSunPct', 100, '%', !m || m.sunPct >= needs.minSunPct)}
              {slider('Max longest night', 'maxDarkH', 360, 'h', !m || m.longestDarkH <= needs.maxDarkH)}
              {slider('Min Earth visible', 'minEarthPct', 100, '%', !m || m.earthPct >= needs.minEarthPct)}
              {slider('Max comms gap', 'maxGapH', 360, 'h', !m || m.longestCommsGapH <= needs.maxGapH)}
            </div>
          </Panel>
        </div>

        <div className="min-w-0 space-y-3.5">
          {m ? (
            <VerdictStrip m={m} needs={needs} sun={sunChip} earth={earthChip} rescue={rescue} onCompare={pick} onUse={use} />
          ) : (
            <p className="rounded-xl border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-300">
              No data for this date at this site. Curated data covers 2027–2028; look up a custom site again after changing the date.
            </p>
          )}
          {explain && m && (
            <p className="rounded-lg border border-sky-900/70 bg-sky-950/35 px-3 py-2 text-xs text-sky-200">
              <b>GO</b> means the site meets every threshold above. The countdown pills show how long until the Sun or Earth slips behind the terrain from the scrubber time.
            </p>
          )}
          {m && (commsFail || (inData && !earthChip.up)) && m.longestCommsGapH > 0 && <RelayCard gapH={m.longestCommsGapH} earthUp={earthChip.up} />}
          {explain && <EarthMoonCard site={here.site} e={here.ephem} />}

          <Panel title={`360° Horizon Sky Ribbon · one lunar day from ${now}`} explain={explain}
            caption="The whole horizon unrolled: North (Earthward) at the edges, South (Far Side) in the centre. Scrub or play to see when ridges block sunlight or Earth contact.">
            <SkyRibbon e={here.ephem} mask={here.mask} dip={sphereDipDeg(mastM)} startMs={nowMs} hours={LUNAR_DAY_H} scrubH={scrubH} setScrubH={setScrubH}
              terrain={terrain} maskB={bData && b.siteId !== siteId ? bData.mask : undefined} labelB={bData?.site.name}>
              <Timeline e={here.ephem} mask={here.mask} startMs={nowMs} hours={LUNAR_DAY_H} missionH={days * 24} scrubH={scrubH} setScrubH={setScrubH}
                eB={showOverlayB ? bData.ephem : undefined} maskB={showOverlayB ? bData.mask : undefined}
                startMsB={showOverlayB ? Date.parse(b.start) : undefined} labelB={showOverlayB ? bLabel : undefined} />
            </SkyRibbon>
          </Panel>

          <Panel title="Plan B Rescue Finder" explain={explain}
            caption="Ranked rescue options when the launch slips: alternative dates at this site, or backup sites on the slipped date. Compare or adopt in one click."
            aside={slip > 0 && (
              <label className="flex items-center gap-1.5 text-xs text-zinc-400">
                <input type="checkbox" checked={earlier} onChange={e => setEarlier(e.target.checked)} /> include dates before {now}
              </label>
            )}>
            {result ? (
              <PlanBPanel options={options} onPick={pick} onUse={use} activeKey={compareB ? `${compareB.siteId}@${compareB.start}` : undefined} />
            ) : <p className="text-sm text-zinc-500">No data.</p>}
            <p className="mt-2 text-[11px] text-zinc-500">
              Gains and losses measured against current Plan A: {here.site.name}, landing {now}.
              {loading > 0 && ` Loading ${loading} remaining sites…`}
            </p>
          </Panel>

          <Panel title="Side-by-Side Scenario Comparator" explain={explain}
            caption="Plan A vs Plan B across sunlight, dark survival, Earth link, and horizontal vs vertical solar yield. Green deltas show improvements.">
            <Comparator a={m ?? null} b={mB} la={`A: ${here.site.name}, ${now}`} lb={`B: ${bLabel}`}
              onUse={b.siteId !== siteId || b.start !== now ? () => use(b) : undefined}
              onSwap={showOverlayB ? swapAB : undefined} />
          </Panel>

          <Panel title={`2027–2028 Landing Calendar · ${here.site.name}`} explain={explain}
            caption="Every landing date across two years. Good windows arrive in ~29.5-day waves and shift with lunar seasons. Click any day to compare.">
            <CalendarHeatmap days={year} current={now} original={start} missionDays={days} onPick={date => setCompareB({ siteId, start: date })} />
          </Panel>
        </div>
      </div>

      <footer className="border-t border-zinc-800/80 pt-3 text-xs text-zinc-500">
        Sun and Earth positions: NASA JPL Horizons (airless, hourly, 2027–2028). Terrain: NASA LRO LOLA PGDA Product 90 where marked. Open data, open code.
        {' '}<a href="#validation" className="text-sky-400 underline">Validation, NASA cross-check, and all data sources</a>.
      </footer>
    </div>
  )
}
