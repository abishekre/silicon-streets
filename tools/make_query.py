"""Write tools/query.overpassql from tools/areas.json (one block of map features per area box).

Usage: python tools/make_query.py
Then: curl -A "silicon-streets" --data-urlencode "data@tools/query.overpassql" https://overpass-api.de/api/interpreter -o osm.json
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
FEATURES = [
    'way["highway"]', 'way["building"]', 'way["leisure"]', 'relation["leisure"]', 'way["landuse"]',
    'way["natural"~"water|wood"]', 'way["railway"]', 'node["railway"="station"]',
    'node["amenity"~"cafe|restaurant|fast_food|pub|bar|ice_cream"]',
]


def main():
    areas = json.load(open(os.path.join(HERE, 'areas.json'), encoding='utf-8'))['areas']
    lines = ['[out:json][timeout:600][maxsize:2147483648];', '(']
    for name, (s, w, n, e) in areas.items():
        lines.append(f'  // {name}')
        lines += [f'  {f}({s},{w},{n},{e});' for f in FEATURES]
    lines += [');', 'out geom tags;', '']
    open(os.path.join(HERE, 'query.overpassql'), 'w', encoding='utf-8').write('\n'.join(lines))
    print(len(areas), 'areas')


if __name__ == '__main__':
    main()
