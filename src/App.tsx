import { useEffect, useMemo, useState } from 'react'
import { metrics, planB, shiftDate, sphereDipDeg, sphereMask, indexAt, type Ephem, type Horizon, type Needs, type Site, type SiteData } from './engine'
import { Comparator, PlanBPanel, Panel, SkyRibbon, VerdictStrip, countdown } from './components'
import { fetchEphem } from './horizons'
import { lrocQuickMapUrl } from './moonLinks'
import Validation from './Validation'

const LUNAR_DAY_H = 709
const GROUPS = ['Artemis', 'CLPS', 'ISRO', 'Apollo', 'Custom']

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

  const [explain, setExplain] = useState(false)
  const [siteId, setSiteId] = useState('mons-mouton')
  const [start, setStart] = useState('2027-03-01')
  const [days, setDays] = useState(14)
  const [mastM, setMastM] = useState(2)
  const [slip, setSlip] = useState(0)
  const [needs, setNeeds] = useState<Needs>({ minSunPct: 60, maxDarkH: 72, minEarthPct: 50, maxGapH: 96 })
  const [scrubH, setScrubH] = useState(0)
  const [compareB, setCompareB] = useState<{ siteId: string; start: string; label: string } | null>(null)

  const [lat, setLat] = useState('-85.0'), [lon, setLon] = useState('45.0')
  const [custom, setCustom] = useState<{ site: Site; ephem: Ephem } | null>(null)
  const [busy, setBusy] = useState('')
  async function lookup() {
    const la = +lat, lo = ((+lon % 360) + 360) % 360
    if (!(la >= -90 && la <= 90) || !Number.isFinite(lo)) return setBusy('Latitude must be −90 to 90 and longitude a number.')
    setBusy('Asking JPL Horizons…')
    try {
      const t = Date.parse(start)
      const ephem = await fetchEphem('custom', la, lo, t - 8 * 864e5, t + (days + 60) * 864e5)
      const site: Site = { id: 'custom', name: `Custom ${la.toFixed(3)}°, ${lo.toFixed(3)}°E`, lat: la, lonE: lo, group: 'Custom', terrain: 'sphere', source: 'JPL Horizons, live' }
      setCustom({ site, ephem }); setSiteId('custom'); setBusy('')
    } catch (e) { setBusy(String(e)) }
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
  const b = compareB ?? { siteId, start, label: `Original date (${start})` }
  const bData = data.get(b.siteId)
  const mB = bData ? metrics({ ...scen, siteId: b.siteId, start: b.start }, bData.ephem, bData.mask) : null

  if (page === '#validation') return <Validation data={data} explain={explain} />
  if (error) return <p className="p-4 text-rose-400">Could not load data: {error}</p>
  if (!here) return <p className="p-4 text-zinc-400">Loading ephemerides from /data…</p>

  const nowMs = Date.parse(now)
  const iScrub = Math.round(indexAt(here.ephem, nowMs + scrubH * 36e5))
  const inData = iScrub >= 0 && iScrub < here.ephem.sunEl.length
  const terrain = here.site.terrain === 'lola' && horizons.has(siteId) ? 'LOLA terrain' : 'terrain not applied'
  const field = 'rounded bg-zinc-800 px-2 py-1 text-sm'
  const slider = (label: string, key: keyof Needs, max: number, unit: string) => (
    <label className="block text-sm">
      <span className="flex justify-between text-zinc-400"><span>{label}</span><span>{needs[key]} {unit}</span></span>
      <input type="range" min={0} max={max} value={needs[key]} onChange={e => setNeeds({ ...needs, [key]: +e.target.value })} className="w-full" />
    </label>
  )

  return (
    <div className="mx-auto max-w-6xl space-y-3 p-3">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">MoonSlip</h1>
        <span className="text-sm text-zinc-400">Is your South Pole landing site still alive after a slip?</span>
        <span className="flex-1" />
        <button onClick={() => setExplain(!explain)} aria-pressed={explain} className="rounded bg-zinc-800 px-3 py-1 text-sm hover:bg-zinc-700">
          {explain ? 'Explain mode' : 'Planner mode'}
        </button>
        <a href="#validation" className="text-sm text-sky-400 underline">Validation</a>
      </header>

      <div className="grid gap-3 lg:grid-cols-[300px_1fr]">
        <div className="min-w-0 space-y-3">
          <Panel title="Site" explain={explain} caption="Pick where the lander touches down. Polar sites see the Sun skim the horizon all day long.">
            <select value={siteId} onChange={e => { setSiteId(e.target.value); setCompareB(null) }} className={field + ' w-full'} aria-label="Landing site">
              {GROUPS.map(g => (
                <optgroup key={g} label={g}>
                  {[...data.values()].filter(d => d.site.group === g).map(d => <option key={d.site.id} value={d.site.id}>{d.site.name}</option>)}
                </optgroup>
              ))}
            </select>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className={`rounded px-2 py-0.5 ${terrain === 'LOLA terrain' ? 'bg-emerald-900 text-emerald-300' : 'bg-amber-900 text-amber-300'}`}>{terrain}</span>
              <span className="text-zinc-500">{here.site.lat.toFixed(3)}°, {here.site.lonE.toFixed(3)}°E</span>
              <a href={lrocQuickMapUrl(here.site)} target="_blank" rel="noreferrer" className="text-sky-400 underline">LROC QuickMap</a>
            </div>
            {horizons.get(siteId)?.snapKm ? (
              <p className="mt-1 text-xs text-zinc-500">
                Region site: terrain seen from its high point within 1 km ({horizons.get(siteId)!.observerLat!.toFixed(3)}°, {horizons.get(siteId)!.observerLonE!.toFixed(3)}°E, {horizons.get(siteId)!.siteHeightM} m).
              </p>
            ) : null}
            <div className="mt-2 flex gap-2">
              <input value={lat} onChange={e => setLat(e.target.value)} className={field + ' w-20'} aria-label="Custom latitude" />
              <input value={lon} onChange={e => setLon(e.target.value)} className={field + ' w-20'} aria-label="Custom longitude east" />
              <button onClick={lookup} className="rounded bg-zinc-700 px-2 text-sm hover:bg-zinc-600">Look up</button>
            </div>
            {busy && <p className="mt-1 text-xs text-amber-400" role="status">{busy}</p>}
          </Panel>

          <Panel title="Mission" explain={explain} caption="The plan: when you land, how long you must survive, and what the lander needs.">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label>Landing date<input type="date" min="2027-01-08" max="2028-11-15" value={start} onChange={e => e.target.value && setStart(e.target.value)} className={field + ' w-full'} /></label>
              <label>Mission days<input type="number" min={1} max={60} value={days} onChange={e => setDays(Math.max(1, Math.min(60, +e.target.value || 1)))} className={field + ' w-full'} /></label>
              <label className="col-span-2">Mast height (m){terrain === 'LOLA terrain' && <span className="text-xs text-zinc-500"> · terrain mask fixed at 2 m</span>}
                <input type="number" min={0} max={50} step={0.5} value={mastM} onChange={e => setMastM(Math.max(0, +e.target.value || 0))} className={field + ' w-full'} /></label>
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
              <span className="w-14 text-center font-mono">{slip >= 0 ? '+' : ''}{slip} d</span>
              <button onClick={() => setSlip(Math.min(28, slip + 1))} className="rounded bg-zinc-800 px-2" aria-label="One day later">+</button>
            </div>
            <p className="text-xs text-zinc-500">Landing now {now}</p>
          </Panel>
        </div>

        <div className="min-w-0 space-y-3">
          {result ? (
            <VerdictStrip m={result.current}
              sun={inData ? countdown(here.ephem, here.mask, 'sun', iScrub) : { up: false, inH: null }}
              earth={inData ? countdown(here.ephem, here.mask, 'earth', iScrub) : { up: false, inH: null }} />
          ) : (
            <p className="rounded-xl border border-amber-700 p-3 text-amber-400">No data for this date at this site. Curated data covers 2027–2028; look up a custom site again after changing the date.</p>
          )}
          {explain && result && <p className="text-sm text-sky-300">GO means the site meets every need you set. Countdowns tell you how long until the Sun or Earth slips behind the horizon at the time shown below.</p>}

          <Panel title={`Sky ribbon · one lunar day from ${now}`} explain={explain}
            caption="The whole horizon unrolled: north on the left and right, south in the middle. If the Sun or Earth sinks below the grey line, the lander loses power or its radio link.">
            <SkyRibbon e={here.ephem} mask={here.mask} dip={sphereDipDeg(mastM)} startMs={nowMs} hours={LUNAR_DAY_H} scrubH={scrubH} setScrubH={setScrubH} terrain={terrain} />
          </Panel>

          <Panel title="Plan B finder" explain={explain}
            caption="If the date moves, these are the best rescues: the same site on another day, or another site on the new day. Tap one to compare.">
            {result ? <PlanBPanel options={result.options} onPick={o => setCompareB({ siteId: o.siteId, start: o.start, label: `${o.siteName}, ${o.start}` })} /> : <p className="text-sm text-zinc-500">No data.</p>}
          </Panel>

          <Panel title="Comparator" explain={explain} caption="The same numbers for two plans side by side. The last column shows what you gain or lose by switching.">
            <Comparator a={result?.current ?? null} b={mB} la={`A: ${here.site.name}, ${now}`} lb={`B: ${b.label}`} />
          </Panel>
        </div>
      </div>
      <footer className="text-xs text-zinc-500">
        Sun and Earth positions: NASA JPL Horizons (airless, hourly, 2027–2028). Terrain: NASA LRO LOLA where marked. Open data, open code.
      </footer>
    </div>
  )
}
