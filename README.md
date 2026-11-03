# Silicon Streets

A browser game set in Bengaluru, built with Three.js on real OpenStreetMap streets.
Drive an auto, scooter or car, take Namma Auto / Swiggly / Zoomato / Oober jobs, walk into cafés,
ride the metro, climb Vidhana Soudha, and get caught in the 4 PM rain.

The name lives in one place: `src/config.js`.

## Run it

```bash
npm install
npm run dev          # Vite dev server at http://localhost:5173
```

No-build alternative (serves the source files directly, never cached):

```bash
python tools/serve.py 5173
```

## Build

```bash
npm run build        # outputs dist/
npm run preview      # serves dist/ at http://localhost:4173
```

## Deploy to Vercel

1. Put the project in a GitHub repo (`git init`, commit, push).
2. On vercel.com: **Add New → Project → Import** the repo.
3. Vercel detects Vite. Build command `npm run build`, output `dist` (already set in `vercel.json`).
4. Deploy. Every push to the main branch redeploys; pull requests get preview URLs.

`vercel.json` caches the hashed JS forever and the map data for a day.

Notes for a public launch:
- **Multiplayer** later needs a persistent WebSocket server. Vercel functions can't hold those open: use PartyKit, Cloudflare Durable Objects, or a small server on Fly.io/Railway, and keep the game itself on Vercel.
- **Live weather** uses Open-Meteo's free API, which is for non-commercial use. A commercial launch needs their paid plan.
- **Map data** is © OpenStreetMap contributors (ODbL). Keep the attribution visible (it's on the start screen).
- **Business names**: signboards show real café/restaurant names from OSM. That's fine for a prototype; for a public or commercial release, consider parody names or partnerships.

## Refresh or extend the map

The map covers central Bengaluru, Indiranagar, Domlur, Koramangala, Madiwala, Banaswadi, Kasturi Nagar,
Kammanahalli, Kalyan Nagar and the roads that join them. The areas are boxes in `tools/areas.json`.
Download each one from Overpass (a single big query usually times out) and merge them:

```bash
python tools/make_query.py
curl -A "silicon-streets" --data-urlencode "data@tools/query.overpassql" https://overpass-api.de/api/interpreter -o osm.json
python -X utf8 tools/osm2game.py a0.json a1.json ... public/data/map
```

`make_query.py` writes one query covering every area. For a big map, split it into one query per area. The converter takes any number of exports and de-duplicates them.

### Making the map bigger

1. Add a box to `tools/areas.json`, download, and convert (above). The converter writes the playable area (`play` in `index.json`) from where the buildings are. Everything sizes itself from that: world bounds, edge barricades, where dogs, side hustles, fuel stations, cameras, jobs and parked cars can appear, the tow yard, and the minimap (kept under 4096 px). Neighbourhood names for the map and fast travel are in `src/travel.js`.
2. **Frame rate** stays about the same. Meshes are built per 220 m tile in a worker as you move, and traffic, people and physics only exist around you.
3. **Startup** loads `all.json` (every tile in one file) and sets up roads, buildings and collisions for the whole map. The per-tile files stay for later streaming. The current map (82,000 buildings, about 8 × 13 km) takes about 10 s to set up on a laptop. For a whole city, setup needs to load per tile too, and positions need re-centring every couple of km (see `docs/performance-plan.md`, step F).

## Controls

| | |
|---|---|
| Drive / walk | W A S D or arrows |
| Look around | move the mouse (click the game once; Esc frees the cursor). Click and drag instead in Settings → Controls |
| Get out / in · call your vehicle (or mechanic) | F · G |
| Interact (cafés, carts, metro, jobs) | E |
| Accept / decline a job | Y / N |
| Jump · climb ledges and ladders | Space · push into it / W |
| Map, pins, search, fast travel | M (or click the minimap), then pick a place |
| Radio | K |
| Camera · photo mode | C · P |
| Weather · time · live sync | R · T · L |
| Settings · stats | Tab · F3 |
