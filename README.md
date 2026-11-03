# Silicon Streets

A browser game set in central Bengaluru, built with Three.js on real OpenStreetMap streets.
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

The map comes from an Overpass export of central Bengaluru (`tools/query.overpassql`):

```bash
curl -A "bengaluru-game" --data-urlencode "data@tools/query.overpassql" https://overpass-api.de/api/interpreter -o osm.json
python tools/osm2game.py osm.json public/data/map
```

Change the bounding box in the query to cover other areas. The map is written as `index.json` (roads, parks, metro, landmarks) plus one file per 220 m tile (buildings and places). In the game, each tile's meshes are built when you come near it and dropped when you leave, so a bigger map costs download size and startup placement, not frame rate.

## Controls

| | |
|---|---|
| Drive / walk | W A S D or arrows |
| Get out / in · call your vehicle (or mechanic) | F · G |
| Interact (cafés, carts, metro, jobs) | E |
| Accept / decline a job | Y / N |
| Jump · climb ledges and ladders | Space · push into it / W |
| Map, pins, search | M (or click the minimap) |
| Radio | K |
| Camera · photo mode | C · P |
| Weather · time · live sync | R · T · L |
| Settings · stats | Tab · F3 |
