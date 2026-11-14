import { useEffect, useMemo, useState } from 'react'
import {
  calendar, gainLoss, maskForMast, mastRange, metrics, planB, shiftDate, sphereDipDeg, sphereMask, indexAt,
  type Ephem, type Horizon, type Needs, type PlanBOption, type Site, type SiteData,
} from './engine'
import { quickmapUrl } from './engine/geo'
import { Comparator, PlanBPanel, Panel, SkyRibbon, VerdictStrip, btn, countdown, slipLabel, type Chip, type Rescue } from './components'
import { CalendarHeatmap, EarthMoonCard, PoleMap, RelayCard, Timeline, type MapMeta } from './panels'
import { fetchEphem } from './horizons'
import { DATE_MAX, DATE_MIN, DEFAULTS, decode, encode } from './share'
import Validation from './Validation'

const LUNAR_DAY_H = 709
const DAY_MS = 864e5
const GROUPS = ['Artemis', 'CLPS', 'ISRO', 'Apollo', 'Custom']
const get = async <T,>(url: string) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return (await r.json()) as T }
const NO_CHIP: Chip = { up: false, inH: null }

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
    get<MapMeta>('/data/southpole.json').then(m => !dead && setMapMeta(m)).catch(() => {}) // the map falls back to a schematic
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
  const copy = () => navigator.clipboard?.writeText(location.href).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }, () => prompt('Copy this link', location.href))

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
  const [earlier, setEarlier] = useState(false)
  const [showMap, setShowMap] = useState(() => typeof matchMedia !== 'function' || matchMedia('(min-width: 1024px)').matches)

  if (error) return <p className="p-4 text-rose-400">Could not load data: {error}</p>
  if (page === '#validation') return <Validation data={data} horizons={horizons} explain={explain} />
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
  // After a slip, a date before the new landing date is no rescue. Hide those unless the planner asks for them.
  const options = (result?.options ?? []).filter(o => earlier || slip <= 0 || o.kind === 'site' || o.start > now)
  let rescue: Rescue | null = null
  if (m && m.verdict === 'NO-GO') {
    // Beyond the +28 day window, the calendar may still hold a good date at this site.
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
  const field = 'rounded bg-zinc-800 px-2 py-1 text-sm'
  const slider = (label: string, key: keyof Needs, max: number, unit: string) => (
    <label className="block text-sm">
      <span className="flex justify-between text-zinc-400"><span>{label}</span><span>{needs[key]} {unit}</span></span>
      <input type="range" min={0} max={max} value={needs[key]} onChange={e => setNeeds({ ...needs, [key]: +e.target.value })} className="w-full" />
    </label>
  )

  return (
    <div className="mx-auto max-w-6xl space-y-3 p-3">
      <header className="sticky top-0 z-10 -mx-3 flex flex-wrap items-center gap-x-3 gap-y-1 bg-[#0b0d12]/95 px-3 py-2 backdrop-blur">
        <h1 className="text-xl font-bold">MoonSlip</h1>
        {m && <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${m.verdict === 'GO' ? 'bg-emerald-900 text-emerald-300' : 'bg-rose-900 text-rose-300'}`} aria-label={`Current verdict ${m.verdict}`}>{m.verdict}</span>}
        <span className="hidden text-sm text-zinc-400 md:inline">Is your South Pole landing site still alive after a slip?</span>
        <span className="flex-1" />
        <button onClick={() => setExplain(!explain)} aria-pressed={explain} className={btn}>{explain ? 'Explain mode' : 'Planner mode'}</button>
        <button onClick={copy} className={btn}>{copied ? 'Link copied' : 'Copy link'}</button>
        <a href="#validation" className="text-sm text-sky-400 underline">Validation and data</a>
      </header>

      <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
        <div className="min-w-0 space-y-3">
          <Panel title="Site" explain={explain} caption="Pick where the lander touches down. Polar sites see the Sun skim the horizon all day long.">
            <select value={siteId} onChange={e => { setSiteId(e.target.value); setCompareB(null) }} className={field + ' w-full'} aria-label="Landing site">
              {GROUPS.map(g => (
                <optgroup key={g} label={g}>
                  {[...data.values()].filter(d => d.site.group === g).map(d => <option key={d.site.id} value={d.site.id}>{d.site.name}</option>)}
                </optgroup>
              ))}
            </select>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded px-2 py-0.5 ${hz ? 'bg-emerald-900 text-emerald-300' : 'bg-amber-900 text-amber-300'}`}>{terrain}</span>
              <span className="text-zinc-500">{here.site.lat.toFixed(3)}°, {here.site.lonE.toFixed(3)}°E</span>
              <a href={quickmapUrl(here.site.lat, here.site.lonE)} target="_blank" rel="noreferrer" className="text-sky-400 underline">Open in LROC QuickMap</a>
            </div>
            {hz?.snapKm ? (
              <p className="mt-1 text-xs text-zinc-500">
                Region site: terrain seen from its high point within 1 km ({hz.observerLat!.toFixed(3)}°, {hz.observerLonE!.toFixed(3)}°E, {hz.siteHeightM} m).
              </p>
            ) : null}
            <div className="mt-2 flex gap-2">
              <input value={lat} onChange={e => setLat(e.target.value)} className={field + ' w-20'} aria-label="Custom latitude" inputMode="decimal" />
              <input value={lon} onChange={e => setLon(e.target.value)} className={field + ' w-20'} aria-label="Custom longitude east" inputMode="decimal" />
              <button onClick={() => lookup()} className="rounded bg-zinc-700 px-2 text-sm hover:bg-zinc-600">Look up</button>
            </div>
            {busy && <p className="mt-1 text-xs text-amber-400" role="status">{busy}</p>}
          </Panel>

          <Panel title="Mission" explain={explain} caption="The plan: when you land, how long you must survive, and what the lander needs.">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label>Landing date<input type="date" min={DATE_MIN} max={DATE_MAX} value={start} onChange={e => e.target.value && setStart(e.target.value)} className={field + ' w-full'} /></label>
              <label>Mission days<input type="number" min={1} max={60} value={days} onChange={e => setDays(Math.max(1, Math.min(60, +e.target.value || 1)))} className={field + ' w-full'} /></label>
              <label className="col-span-2">Mast height (m)
                {hz && <span className="text-xs text-zinc-500"> · {masts ? `terrain computed for ${masts[0]} to ${masts[1]} m` : 'terrain mask fixed at 2 m'}</span>}
                <input type="number" min={0} max={50} step={0.5} value={mastM} onChange={e => setMastM(Math.max(0, Math.min(50, +e.target.value || 0)))} className={field + ' w-full'} /></label>
            </div>
            <div className="mt-2 space-y-1">
              {slider('Min sunlight', 'minSunPct', 100, '%')}
              {slider('Max night', 'maxDarkH', 360, 'h')}
              {slider('Min Earth visible', 'minEarthPct', 100, '%')}
              {slider('Max comms gap', 'maxGapH', 360, 'h')}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-sm font-semibold">Launch slipped</span>
              <button onClick={() => setSlip(Math.max(-7, slip - 1))} className="rounded bg-zinc-800 px-2" aria-label="One day earlier">−</button>
              <span className="w-14 text-center font-mono">{slipLabel(slip)}</span>
              <button onClick={() => setSlip(Math.min(28, slip + 1))} className="rounded bg-zinc-800 px-2" aria-label="One day later">+</button>
            </div>
            <p className="text-xs text-zinc-500">Landing now {now}</p>
          </Panel>

          <Panel title="South Pole map" explain={explain} caption="The Moon's South Pole seen from above. Every pin is a landing site. Earth is toward the top of the map."
            aside={<button className="text-xs text-sky-400 underline" onClick={() => setShowMap(!showMap)} aria-expanded={showMap}>{showMap ? 'Hide' : 'Show'}</button>}>
            {showMap && (
              <PoleMap sites={sites} meta={mapMeta} a={siteId} b={compareB && compareB.siteId !== siteId ? compareB.siteId : null} custom={custom?.site ?? null}
                onPick={id => { setSiteId(id); setCompareB(null) }}
                onGround={(la, lo) => { setLat(String(la)); setLon(String(lo)); setBusy(`Coordinates ${la}°, ${lo}°E set from the map. Press Look up.`) }} />
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-3">
          {m ? (
            <VerdictStrip m={m} sun={sunChip} earth={earthChip} rescue={rescue} onCompare={pick} onUse={use} />
          ) : (
            <p className="rounded-xl border border-amber-700 p-3 text-amber-400">No data for this date at this site. Curated data covers 2027–2028; look up a custom site again after changing the date.</p>
          )}
          {explain && m && <p className="text-sm text-sky-300">GO means the site meets every need you set. Countdowns tell you how long until the Sun or Earth slips behind the horizon at the time shown below.</p>}
          {m && (commsFail || (inData && !earthChip.up)) && m.longestCommsGapH > 0 && <RelayCard gapH={m.longestCommsGapH} earthUp={earthChip.up} />}
          {explain && <EarthMoonCard site={here.site} e={here.ephem} />}

          <Panel title={`Sky ribbon · one lunar day from ${now}`} explain={explain}
            caption="The whole horizon unrolled: north on the left and right, south in the middle. If the Sun or Earth sinks below the grey line, the lander loses power or its radio link. The two bars underneath show when each is in view.">
            <SkyRibbon e={here.ephem} mask={here.mask} dip={sphereDipDeg(mastM)} startMs={nowMs} hours={LUNAR_DAY_H} scrubH={scrubH} setScrubH={setScrubH} terrain={terrain}>
              <Timeline e={here.ephem} mask={here.mask} startMs={nowMs} hours={LUNAR_DAY_H} missionH={days * 24} scrubH={scrubH} setScrubH={setScrubH} />
            </SkyRibbon>
          </Panel>

          <Panel title="Plan B finder" explain={explain}
            caption="If the date moves, these are the best rescues: the same site on another day, or another site on the new day. Tap one to compare."
            aside={slip > 0 && (
              <label className="flex items-center gap-1 text-xs text-zinc-400">
                <input type="checkbox" checked={earlier} onChange={e => setEarlier(e.target.checked)} /> include dates before {now}
              </label>
            )}>
            {result ? <PlanBPanel options={options} onPick={pick} /> : <p className="text-sm text-zinc-500">No data.</p>}
            <p className="mt-2 text-xs text-zinc-500">
              Gains and losses are measured against the current plan: {here.site.name}, landing {now}.
              {loading > 0 && ` Still loading ${loading} of ${sites.length} sites.`}
            </p>
          </Panel>

          <Panel title="Comparator" explain={explain} caption="The same numbers for two plans side by side. The last column shows what you gain or lose by switching.">
            <Comparator a={m ?? null} b={mB} la={`A: ${here.site.name}, ${now}`} lb={`B: ${bLabel}`} onUse={b.siteId !== siteId || b.start !== now ? () => use(b) : undefined} />
          </Panel>

          <Panel title={`When to land · ${here.site.name}`} explain={explain}
            caption="Every possible landing date for two years. Lighter squares get more sunlight over the mission. Good dates come in waves because the Sun circles the horizon once a month and climbs and sinks with the lunar seasons.">
            <CalendarHeatmap days={year} current={now} original={start} missionDays={days} onPick={date => setCompareB({ siteId, start: date })} />
          </Panel>
        </div>
      </div>
      <footer className="text-xs text-zinc-500">
        Sun and Earth positions: NASA JPL Horizons (airless, hourly, 2027–2028). Terrain: NASA LRO LOLA where marked. Open data, open code.
        {' '}<a href="#validation" className="text-sky-400 underline">How we checked it, and every data source</a>.
      </footer>
    </div>
  )
}
