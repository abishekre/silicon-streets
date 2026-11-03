"""Convert an Overpass JSON export (out geom tags) into the compact map used by the game.

Usage: python tools/osm2game.py <overpass.json> public/data/map
Query used: tools/query.overpassql. Map data (c) OpenStreetMap contributors, ODbL.
"""
import json, math, sys, zlib
from tile_map import write_tiles

LAT0, LON0 = 12.97525, 77.6010
KX = 111320 * math.cos(math.radians(LAT0))
KZ = 110574


def proj(lat, lon):
    return (round((lon - LON0) * KX, 1), round(-(lat - LAT0) * KZ, 1))


def h32(v):
    return zlib.crc32(str(v).encode()) / 0xFFFFFFFF


def area(pts):
    a = 0
    for i in range(len(pts)):
        x1, z1 = pts[i]; x2, z2 = pts[(i + 1) % len(pts)]
        a += x1 * z2 - x2 * z1
    return a / 2


def centroid(pts):
    return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))


def inside(pt, poly):
    x, z = pt; c = False; j = len(poly) - 1
    for i in range(len(poly)):
        xi, zi = poly[i]; xj, zj = poly[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi + 1e-12) + xi:
            c = not c
        j = i
    return c


def clean(pts, closed):
    out = []
    for p in pts:
        if not out or math.hypot(p[0] - out[-1][0], p[1] - out[-1][1]) > 0.5:
            out.append(p)
    if closed and len(out) > 2 and math.hypot(out[0][0] - out[-1][0], out[0][1] - out[-1][1]) < 0.6:
        out.pop()
    return out


def ring(geom):
    return clean([proj(g['lat'], g['lon']) for g in geom if g], False)


def stitch(ways):
    """Join open member ways of a multipolygon into closed rings."""
    ways = [w[:] for w in ways if len(w) > 1]
    rings = []
    while ways:
        cur = ways.pop(0)
        changed = True
        while changed and math.hypot(cur[0][0] - cur[-1][0], cur[0][1] - cur[-1][1]) > 1:
            changed = False
            for i, w in enumerate(ways):
                d = lambda a, b: math.hypot(a[0] - b[0], a[1] - b[1])
                if d(cur[-1], w[0]) < 1: cur += w[1:]
                elif d(cur[-1], w[-1]) < 1: cur += w[::-1][1:]
                elif d(cur[0], w[-1]) < 1: cur = w[:-1] + cur
                elif d(cur[0], w[0]) < 1: cur = w[::-1][:-1] + cur
                else: continue
                ways.pop(i); changed = True; break
        rings.append(clean(cur, True))
    return [r for r in rings if len(r) >= 3]


def flat(pts):
    return [v for p in pts for v in p]


ROAD_W = {'primary': 13, 'primary_link': 6, 'secondary': 11, 'secondary_link': 6, 'tertiary': 8.5, 'tertiary_link': 6,
          'trunk': 14, 'residential': 6.5, 'unclassified': 6.5, 'living_street': 6, 'service': 4.5, 'pedestrian': 6,
          'footway': 2.4, 'path': 2, 'cycleway': 2.2, 'steps': 2.4}
GLASS = ['tower', 'prestige', 'rmz', 'embassy', 'pinnacle', 'ub ', 'heights', 'trade', 'corniche', 'nebula', 'adventz', 'workafella']
RED = ['library', 'museum', 'mayo hall', 'court', 'victory hall', 'post office', 'krishi', 'kacheri']


def main(src, dst):
    els = json.load(open(src, encoding='utf-8'))['elements']
    roads, buildings, areas, metro, stations, pois = [], [], [], [], [], []
    polys = {}  # named landuse polygons for classification
    for e in els:
        t = e.get('tags', {})
        if e['type'] == 'node':
            x, z = proj(e['lat'], e['lon'])
            if t.get('railway') == 'station': stations.append({'n': t.get('name', 'Metro'), 'x': x, 'z': z})
            elif 'amenity' in t: pois.append({'a': t['amenity'], 'n': t.get('name', ''), 'x': x, 'z': z})
            continue
        if e['type'] == 'relation':
            outers = [ring(m['geometry']) for m in e.get('members', []) if m.get('role') == 'outer' and m.get('geometry')]
            rs = stitch(outers)
            k = t.get('leisure') or t.get('landuse')
            for r in rs:
                if k in ('park', 'garden'): areas.append({'k': 'park', 'n': t.get('name', ''), 'p': flat(r)})
            continue
        geom = e.get('geometry')
        if not geom: continue
        pts = ring(geom)
        closed = len(geom) > 3 and geom[0] == geom[-1]
        hw = t.get('highway')
        if 'building' in t and closed:
            if t['building'] in ('roof', 'construction', 'no'): continue
            pts = clean(pts, True)
            if len(pts) < 3 or abs(area(pts)) < 12: continue
            if area(pts) < 0: pts = pts[::-1]
            b = {'id': e['id'], 'p': pts, 't': t}
            buildings.append(b)
        elif hw and hw in ROAD_W and t.get('tunnel') != 'yes' and t.get('area') != 'yes':
            w = ROAD_W[hw]
            ow = 1 if t.get('oneway') in ('yes', '1') else -1 if t.get('oneway') == '-1' else 0
            if t.get('lanes', '').isdigit() and hw not in ('footway', 'path', 'cycleway'):
                w = int(t['lanes']) * 3.2 + (0.6 if ow else 1.2)
            elif ow and hw in ('primary', 'secondary', 'tertiary'):
                w = w * 0.7
            if t.get('junction') == 'roundabout': ow = 1
            roads.append({'k': hw, 'n': t.get('name', ''), 'w': round(w, 1), 'o': ow, 'p': flat(pts)})
        elif hw == 'pedestrian' and closed:
            areas.append({'k': 'plaza', 'n': t.get('name', ''), 'p': flat(clean(pts, True))})
        elif t.get('railway') == 'subway' and (t.get('bridge') or (t.get('layer', '0').lstrip('-').isdigit() and int(t.get('layer', '0')) > 0)):
            metro.append({'n': t.get('name', ''), 'p': flat(pts)})
        elif closed:
            k = None; lu = t.get('landuse'); le = t.get('leisure'); nat = t.get('natural')
            if le in ('park', 'garden', 'common', 'dog_park', 'playground'): k = 'park'
            elif le in ('pitch', 'track'): k = 'pitch'
            elif le == 'swimming_pool' or nat == 'water': k = 'water'
            elif nat == 'wood': k = 'wood'
            elif lu in ('grass', 'recreation_ground', 'flowerbed', 'plant_nursery', 'cemetery', 'village_green'): k = 'grass'
            elif le == 'stadium' and 'Chinnaswamy' in t.get('name', ''):
                polys['stadium'] = clean(pts, True)
            if lu or le:
                n = t.get('name', '')
                if 'UB City' in n: polys['ubcity'] = clean(pts, True)
                if 'High Court' in n: polys['highcourt'] = clean(pts, True)
            if k: areas.append({'k': k, 'n': t.get('name', ''), 'p': flat(clean(pts, True))})

    # ---- landmarks
    lm = {}
    vx, vz = proj(12.97965, 77.59068)
    cand = [b for b in buildings if math.hypot(*(a - c for a, c in zip(centroid(b['p']), (vx, vz)))) < 120]
    if cand:
        vb = max(cand, key=lambda b: abs(area(b['p'])))
        cx, cz = centroid(vb['p'])
        # main axis = longest edge direction
        best = max(range(len(vb['p'])), key=lambda i: math.dist(vb['p'][i], vb['p'][(i + 1) % len(vb['p'])]))
        a, c = vb['p'][best], vb['p'][(best + 1) % len(vb['p'])]
        lm['vidhana'] = {'x': round(cx, 1), 'z': round(cz, 1), 'ang': round(math.atan2(c[1] - a[1], c[0] - a[0]), 3)}
        buildings = [b for b in buildings if math.hypot(*(p - q for p, q in zip(centroid(b['p']), (cx, cz)))) > 60]
    if 'stadium' in polys:
        sp = polys['stadium']; cx, cz = centroid(sp)
        r = math.sqrt(abs(area(sp)) / math.pi)
        lm['stadium'] = {'x': round(cx, 1), 'z': round(cz, 1), 'r': round(r, 1)}
        buildings = [b for b in buildings if not inside(centroid(b['p']), sp)]
    if 'ubcity' in polys:
        up = polys['ubcity']; cx, cz = centroid(up)
        lm['ubcity'] = {'x': round(cx, 1), 'z': round(cz, 1)}

    out_b = []
    for b in buildings:
        t = b['t']; n = t.get('name', ''); nl = n.lower(); c = centroid(b['p'])
        r = h32(b['id']); a = abs(area(b['p']))
        if 'height' in t:
            try: h = float(t['height'].split()[0])
            except ValueError: h = None
        else: h = None
        if h is None and t.get('building:levels', '').replace('.', '').isdigit():
            h = float(t['building:levels']) * 3.4 + 1
        bt = t.get('building', 'yes')
        style = 'res'
        if bt in ('commercial', 'office', 'retail', 'hotel'): style = 'com'
        if any(k in nl for k in GLASS): style = 'glass'
        if any(k in nl for k in RED) or ('highcourt' in polys and inside(c, polys['highcourt'])): style = 'red'
        if t.get('amenity') == 'place_of_worship' or bt in ('church', 'cathedral'): style = 'church'
        if 'ubcity' in polys and inside(c, polys['ubcity']):
            style = 'glass'
            if h is None: h = 40 + r * 50
        if h is None:
            if bt in ('house', 'detached', 'hut', 'shed', 'garage', 'kiosk'): floors = 1 + int(r * 2.5)
            elif bt in ('apartments', 'residential'): floors = 4 + int(r * 5)
            elif style in ('com', 'glass'): floors = 3 + int(r * (10 if a > 600 else 5))
            elif style == 'red': floors = 2 + int(r * 2)
            else: floors = 2 + int(r * (6 if a > 300 else 3))
            h = floors * 3.4
        if style == 'glass' and h < 20: style = 'com'
        ob = {'p': flat(b['p']), 'h': round(min(h, 130), 1), 's': style}
        if n: ob['n'] = n
        out_b.append(ob)

    xs = [v for r in roads for v in r['p'][0::2]]; zs = [v for r in roads for v in r['p'][1::2]]
    data = {
        'origin': {'lat': LAT0, 'lon': LON0},
        'bounds': {'x1': min(xs), 'x2': max(xs), 'z1': min(zs), 'z2': max(zs)},
        'roads': roads, 'buildings': out_b, 'areas': areas, 'metro': metro,
        'stations': stations, 'pois': [p for p in pois if p['n']], 'landmarks': lm,
        'attribution': '© OpenStreetMap contributors (ODbL)',
    }
    write_tiles(data, dst)  # an index plus one file per 220 m tile
    print('roads', len(roads), 'buildings', len(out_b), 'areas', len(areas), 'metro', len(metro), 'stations', len(stations), 'pois', len(data['pois']), 'landmarks', lm, 'bounds', data['bounds'])


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
