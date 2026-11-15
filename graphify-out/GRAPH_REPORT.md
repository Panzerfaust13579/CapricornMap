# Graph Report - CapricornMap  (2026-11-14)

## Corpus Check
- Corpus is ~8,981 words - fits in a single context window. You may not need a graph.

## Summary
- 197 nodes · 333 edges · 10 communities (8 shown, 2 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.89)
- Token cost: 57,173 input · 0 output

## Community Hubs (Navigation)
- npm Dependencies
- React UI Components
- Engine and Tests
- App TypeScript Config
- Horizons Ephemeris Pipeline
- LOLA Horizon Mask Pipeline
- Node TypeScript Config
- Product Concepts and Contract
- TS Project References
- Vercel Proxy Config

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 20 edges
2. `App()` - 17 edges
3. `compilerOptions` - 15 edges
4. `metrics()` - 14 edges
5. `indexAt()` - 9 edges
6. `Validation()` - 7 edges
7. `planB()` - 7 edges
8. `src/engine pure calculation functions` - 7 edges
9. `scripts` - 6 edges
10. `react` - 6 edges

## Surprising Connections (you probably didn't know these)
- `App()` --calls--> `countdown()`  [EXTRACTED]
  src/App.tsx → src/components.tsx
- `App()` --calls--> `metrics()`  [EXTRACTED]
  src/App.tsx → src/engine/index.ts
- `App()` --calls--> `planB()`  [EXTRACTED]
  src/App.tsx → src/engine/index.ts
- `App()` --calls--> `shiftDate()`  [EXTRACTED]
  src/App.tsx → src/engine/index.ts
- `App()` --calls--> `sphereDipDeg()`  [EXTRACTED]
  src/App.tsx → src/engine/index.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Offline data pipeline producing contract JSON** — pipeline_fetch_ephem, pipeline_horizon_mask, contract_ephem_json, contract_horizon_json, contract_sites_json [EXTRACTED 1.00]
- **Launch-slip rescue flow** — readme_go_nogo_verdict, readme_plan_b_finder, readme_comparator, readme_power_model [INFERRED 0.85]

## Communities (10 total, 2 thin omitted)

### Community 0 - "npm Dependencies"
Cohesion: 0.07
Nodes (35): dependencies, react@^19.3.1, react-dom@^19.3.1, devDependencies, oxlint@^1.90.0, tailwindcss@^4.3.5, @tailwindcss/vite@^4.3.5, @types/node@^24.19.2 (+27 more)

### Community 1 - "React UI Components"
Cohesion: 0.12
Nodes (29): react, App(), lookup(), GROUPS, Comparator(), h(), Panel(), pct() (+21 more)

### Community 2 - "Engine and Tests"
Cohesion: 0.11
Nodes (25): countdown(), lax, sites, Horizon, longest(), margin(), margins(), maskAt() (+17 more)

### Community 3 - "App TypeScript Config"
Cohesion: 0.09
Nodes (22): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+14 more)

### Community 4 - "Horizons Ephemeris Pipeline"
Cohesion: 0.15
Nodes (8): fetch_site(), parse(), query(), self_tests(), /horizons-api proxy (vercel.json), NASA JPL Horizons API, Earth libration, Validation page (known-answer tests, Horizons spot check)

### Community 5 - "LOLA Horizon Mask Pipeline"
Cohesion: 0.20
Nodes (7): cart(), horizon_mask(), mask_from_points(), read(), self_test(), LOLA South Pole DEM (LDEM_80S_20MPP_ADJ), Sky ribbon

### Community 6 - "Node TypeScript Config"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 7 - "Product Concepts and Contract"
Cohesion: 0.22
Nodes (11): Data Contract, ephem/<id>.json schema, horizon/<id>.json schema, sites.json schema, index.html app shell, Plan comparator (A vs B), Curated landing sites (Artemis, CLPS, ISRO, Apollo), src/engine pure calculation functions (+3 more)

## Knowledge Gaps
- **5 isolated node(s):** `Sky ribbon`, `Validation page (known-answer tests, Horizons spot check)`, `/horizons-api proxy (vercel.json)`, `Curated landing sites (Artemis, CLPS, ISRO, Apollo)`, `Earth libration`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 82 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `index.html app shell` connect `Product Concepts and Contract` to `React UI Components`?**
  _High betweenness centrality (0.256) - this node is a cross-community bridge._
- **What connects `Sky ribbon`, `Validation page (known-answer tests, Horizons spot check)`, `/horizons-api proxy (vercel.json)` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `npm Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.07357357357357357 - nodes in this community are weakly interconnected._
- **Should `React UI Components` be split into smaller, more focused modules?**
  _Cohesion score 0.12436974789915967 - nodes in this community are weakly interconnected._
- **Should `Engine and Tests` be split into smaller, more focused modules?**
  _Cohesion score 0.10887096774193548 - nodes in this community are weakly interconnected._
- **Should `App TypeScript Config` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `Node TypeScript Config` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._