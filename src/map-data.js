// the map is an index (roads, parks, metro, landmarks) plus one file per 220 m tile (buildings, places), from tools/tile_map.py
export async function loadMap(base = 'data/map/') {
  const get = (f) => fetch(base + f).then((r) => { if (!r.ok) throw new Error(`map ${f}: ${r.status}`); return r.json(); });
  const index = await get('index.json');
  const tiles = await Promise.all(Object.keys(index.tiles).map((k) => get(k + '.json')));
  return { ...index, buildings: tiles.flatMap((t) => t.buildings), pois: tiles.flatMap((t) => t.pois) };
}
