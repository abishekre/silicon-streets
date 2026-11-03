"""Split the game map into a small index plus one file per 220 m tile, so a bigger map can load only what is near you.

Usage: python tools/tile_map.py <combined map.json> public/data/map   (osm2game.py calls this itself)
The index keeps what the whole map needs (roads for traffic and GPS, parks, metro, landmarks, bounds);
buildings and points of interest go into tiles by their centre. Map data (c) OpenStreetMap contributors, ODbL.
"""
import json, math, os, sys

TILE = 220  # must match CH in src/world.js


def centre(flat):
    xs, zs = flat[0::2], flat[1::2]
    return sum(xs) / len(xs), sum(zs) / len(zs)


def key(x, z):
    return f'{math.floor(x / TILE)}_{math.floor(z / TILE)}'


def write_tiles(data, out):
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):
        if f.endswith('.json'): os.remove(os.path.join(out, f))
    tiles = {}
    for b in data['buildings']:
        tiles.setdefault(key(*centre(b['p'])), {'buildings': [], 'pois': []})['buildings'].append(b)
    for p in data['pois']:
        tiles.setdefault(key(p['x'], p['z']), {'buildings': [], 'pois': []})['pois'].append(p)
    index = {k: v for k, v in data.items() if k not in ('buildings', 'pois')}
    # the playable area: where the buildings are (whole roads in the export run on well past the downloaded box)
    cx = [centre(b['p'])[0] for b in data['buildings']]; cz = [centre(b['p'])[1] for b in data['buildings']]
    index['play'] = {'x1': math.floor(min(cx) / 10) * 10, 'x2': math.ceil(max(cx) / 10) * 10, 'z1': math.floor(min(cz) / 10) * 10, 'z2': math.ceil(max(cz) / 10) * 10}
    index['tile'] = TILE
    index['tiles'] = {k: [len(t['buildings']), len(t['pois'])] for k, t in sorted(tiles.items())}
    dump = lambda o, f: json.dump(o, open(os.path.join(out, f), 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=False)
    for k, t in tiles.items(): dump(t, f'{k}.json')
    dump(index, 'index.json')
    print('tiles', len(tiles), 'buildings', len(data['buildings']), 'pois', len(data['pois']))


if __name__ == '__main__':
    write_tiles(json.load(open(sys.argv[1], encoding='utf-8')), sys.argv[2])
