#!/usr/bin/env python3
"""Download real recordings and photo textures for the game (runs on GitHub Actions).

Sounds: Freesound preview MP3s (no login needed) of Cairo / Egypt field recordings.
Textures: CC0 photo materials from ambientCG and Poly Haven.
Everything goes to cairo_microbus/assets/ with a credits.json listing the license of each file.
"""
import json, os, re, sys, time, urllib.error, urllib.parse, urllib.request, zipfile, io

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')
SND = os.path.join(ROOT, 'sounds')
TEX = os.path.join(ROOT, 'textures')
UA = {'User-Agent': 'Mozilla/5.0 (cairo-microbus asset fetcher)'}
credits = {'sounds': [], 'textures': [], 'hdri': [], 'models': []}


START = time.time()
BUDGET = float(os.environ.get('FETCH_BUDGET', '900'))  # seconds per group run
_last_fs = [0.0]


def over_budget():
    return time.time() - START > BUDGET


def get(url, binary=False, tries=2):
    for i in range(tries):
        if over_budget():
            return None
        if 'freesound.org' in url:  # be polite: Freesound throttles bursts
            wait = 1.2 - (time.time() - _last_fs[0])
            if wait > 0:
                time.sleep(wait)
            _last_fs[0] = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25) as r:
                data = r.read()
                return data if binary else data.decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            print('  http', e.code, url, flush=True)
            if e.code == 429:
                time.sleep(20)
            elif e.code in (403, 404):
                return None
        except Exception as e:  # noqa
            print('  retry', url, e, flush=True)
            time.sleep(2)
    return None


# ------------------------------------------------------------------ Freesound
FS = 'https://freesound.org'
SOUND_PAGES = [
    '/people/CyWeb/sounds/256179/',          # Cairo Traffic (Metro Nasser square)
    '/people/csnmedia/sounds/388276/',        # La cucaracha musical horn
    '/people/Julien%20Nicolas/sounds/212444/',  # Egyptian car horn (Alexandria)
]
PACK_PAGES = ['/people/alchemical/packs/1446/']     # Egypt Ambience
USER_PAGES = ['/people/AhmadAiuby/sounds/']           # inside a Cairo microbus
SEARCHES = ['cairo', 'cairo street', 'cairo traffic', 'cairo market', 'egypt street', 'egypt market',
            'egypt traffic', 'egyptian', 'egypt horn', 'tuk tuk', 'arabic street vendor', 'arabic crowd',
            'arabic market', 'muezzin cairo', 'microbus', 'egypt cafe', 'shisha cafe']
MAX_SOUNDS = 60

# real foley for the interactive events; each sound keeps the query it came from as its role
FOLEY = {
    'punch': ['punch', 'face punch', 'body punch'],
    'hit_body': ['body hit', 'body fall', 'body thud'],
    'grunt': ['male grunt pain', 'man hurt grunt'],
    'scream': ['man scream', 'woman scream short'],
    'arabic_shout': ['arabic argument', 'arabic shouting', 'arabic men arguing', 'egypt argument', 'arabic angry'],
    'crowd_shout': ['crowd shouting', 'angry crowd', 'crowd gasp'],
    'car_hit_person': ['car hit person', 'car impact body'],
    'car_crash': ['car crash', 'car collision metal'],
    'chainsaw': ['chainsaw', 'saw cutting tree'],
    'tree_fall': ['tree falling', 'branch crack fall'],
    'van_door': ['sliding van door', 'minivan door slide'],
    'car_door': ['car door open close'],
    'footsteps': ['footsteps asphalt', 'running footsteps street'],
    'whistle': ['police whistle'],
    'siren': ['police siren', 'ambulance siren'],
    'engine_van': ['van engine idle', 'diesel van engine', 'minibus engine'],
    'skid': ['tire skid', 'car brake squeal'],
}
FOLEY_PER_ROLE = 4
MAX_BYTES = 7_000_000


def sound_links(html):
    return sorted(set(re.findall(r'href="(/people/[^"/]+/sounds/\d+/)"', html)))


def fetch_sound(path, seen, role=None, limit=None):
    sid = re.search(r'/sounds/(\d+)/', path).group(1)
    if sid in seen or len(seen) >= (limit or MAX_SOUNDS):
        return False
    html = get(FS + path)
    if not html:
        return
    # the page's og:audio tag holds a doubled "https://freesound.orghttps://cdn..." address: take the cdn link
    previews = re.findall(r'https://cdn\.freesound\.org/previews/[^"\s]+?-[hl]q\.mp3', html)
    hq = [u for u in previews if u.endswith('-hq.mp3')]
    audio = hq[0] if hq else (previews[0].replace('-lq.mp3', '-hq.mp3') if previews else None)
    if not audio:
        print('  no preview', path)
        return
    title = re.search(r'<meta property="og:title" content="([^"]*)"', html)
    desc = re.search(r'<meta property="og:description" content="([^"]*)"', html)
    lic = re.search(r'href="(https?://creativecommons\.org/[^"]+)"', html)
    tags = re.findall(r'href="/browse/tags/([^/"]+)/?"', html)
    dur = re.search(r'"duration"[^0-9]*([0-9.]+)', html)
    data = get(audio, binary=True) or get(audio.replace('-hq.mp3', '-lq.mp3'), binary=True)
    if not data or len(data) > MAX_BYTES:
        print('  skip size', path)
        return
    author = path.split('/')[2]
    fname = f'fs_{sid}.mp3'
    with open(os.path.join(SND, fname), 'wb') as f:
        f.write(data)
    seen.add(sid)
    credits['sounds'].append({
        'file': fname, 'id': sid, 'url': FS + path, 'author': urllib.parse.unquote(author),
        'title': title.group(1) if title else '', 'description': (desc.group(1) if desc else '')[:400],
        'license': lic.group(1) if lic else 'unknown', 'tags': sorted(set(tags))[:25],
        'duration': float(dur.group(1)) if dur else None, 'bytes': len(data),
    })
    if role:
        credits['sounds'][-1]['role'] = role
    print('  +', fname, credits['sounds'][-1]['title'], credits['sounds'][-1]['license'], flush=True)
    return True


def freesound():
    os.makedirs(SND, exist_ok=True)
    seen = set()
    for p in SOUND_PAGES:
        fetch_sound(p, seen)
    for p in PACK_PAGES + USER_PAGES:
        html = get(FS + p) or ''
        for l in sound_links(html)[:15]:
            fetch_sound(l, seen)
    for q in SEARCHES:
        if over_budget():
            break
        html = get(FS + '/search/?q=' + urllib.parse.quote(q) + '&s=Downloads+(most+first)') or ''
        for l in sound_links(html)[:6]:
            fetch_sound(l, seen)


def foley():
    os.makedirs(SND, exist_ok=True)
    seen = set()
    for role, queries in FOLEY.items():
        if over_budget():
            break
        got = 0
        for q in queries:
            # short sounds first: filter to < 20 s
            html = get(FS + '/search/?q=' + urllib.parse.quote(q) + '&f=duration:[0+TO+20]&s=Downloads+(most+first)') or ''
            for l in sound_links(html)[:5]:
                if got >= FOLEY_PER_ROLE:
                    break
                if fetch_sound(l, seen, role, limit=10_000):
                    got += 1
            if got >= FOLEY_PER_ROLE:
                break


# ------------------------------------------------------------------ OpenStreetMap: real downtown Cairo
# Tahrir square, Talaat Harb, Qasr El Nil, Abdel Moneim Riad and the Nile corniche (© OpenStreetMap contributors, ODbL)
OSM_BBOX = (30.0395, 31.2300, 30.0545, 31.2465)  # south, west, north, east


def osm():
    s_, w_, n_, e_ = OSM_BBOX
    q = f"""[out:json][timeout:120];
(
  way["highway"]({s_},{w_},{n_},{e_});
  way["building"]({s_},{w_},{n_},{e_});
  relation["building"]({s_},{w_},{n_},{e_});
  way["leisure"~"park|garden"]({s_},{w_},{n_},{e_});
  way["landuse"~"grass|park"]({s_},{w_},{n_},{e_});
  way["natural"="water"]({s_},{w_},{n_},{e_});
  relation["natural"="water"]({s_},{w_},{n_},{e_});
  way["waterway"="riverbank"]({s_},{w_},{n_},{e_});
  node["natural"="tree"]({s_},{w_},{n_},{e_});
  node["amenity"~"cafe|restaurant|pharmacy|bank|fuel|place_of_worship"]({s_},{w_},{n_},{e_});
  node["shop"]({s_},{w_},{n_},{e_});
  node["highway"="traffic_signals"]({s_},{w_},{n_},{e_});
);
out body geom;"""
    for url in ('https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'):
        try:
            data = urllib.request.urlopen(urllib.request.Request(url, data=urllib.parse.urlencode({'data': q}).encode(), headers=UA), timeout=180).read()
            j = json.loads(data)
            break
        except Exception as e:  # noqa
            print('  overpass failed', url, e)
            j = None
    if not j:
        return
    os.makedirs(os.path.join(ROOT, 'osm'), exist_ok=True)
    # keep it compact: only the tags and geometry the game uses
    keep = ('highway', 'name', 'name:ar', 'name:en', 'lanes', 'width', 'oneway', 'building', 'building:levels', 'height',
            'leisure', 'landuse', 'natural', 'waterway', 'amenity', 'shop', 'layer', 'bridge', 'tunnel', 'service', 'area')
    out = []
    for el in j.get('elements', []):
        tags = {k: v for k, v in el.get('tags', {}).items() if k in keep}
        if el['type'] == 'node':
            out.append({'t': 'n', 'tags': tags, 'g': [round(el['lat'], 7), round(el['lon'], 7)]})
        elif el['type'] == 'way' and 'geometry' in el:
            out.append({'t': 'w', 'tags': tags, 'g': [[round(p['lat'], 7), round(p['lon'], 7)] for p in el['geometry']]})
        elif el['type'] == 'relation':
            outer = [[[round(p['lat'], 7), round(p['lon'], 7)] for p in m.get('geometry', [])] for m in el.get('members', []) if m.get('role') == 'outer' and m.get('geometry')]
            if outer:
                out.append({'t': 'r', 'tags': tags, 'g': outer})
    with open(os.path.join(ROOT, 'osm', 'downtown.json'), 'w') as f:
        json.dump({'bbox': OSM_BBOX, 'attribution': '© OpenStreetMap contributors (ODbL)', 'elements': out}, f, ensure_ascii=False, separators=(',', ':'))
    print('  + osm elements', len(out))


# ------------------------------------------------------------------ Poly Haven 3D models (CC0): trees, palms, street props
PH_MODEL_KEYS = ['tree', 'palm', 'bush', 'plant', 'street', 'lamp', 'bench', 'bin', 'trash', 'barrier', 'cone', 'crate', 'chair', 'table']
PH_MAX_MODELS = 16


def polyhaven_models():
    j = get('https://api.polyhaven.com/assets?t=models')
    if not j:
        return
    assets = json.loads(j)
    with open(os.path.join(ROOT, 'polyhaven_models_index.json'), 'w') as f:
        json.dump({k: {'name': v.get('name'), 'categories': v.get('categories'), 'tags': v.get('tags')} for k, v in assets.items()}, f, ensure_ascii=False)
    picked = 0
    credits['models'] = []
    base = os.path.join(ROOT, 'models')
    for k, v in sorted(assets.items(), key=lambda kv: -kv[1].get('download_count', 0)):
        text = ' '.join([k] + v.get('categories', []) + v.get('tags', [])).lower()
        if picked >= PH_MAX_MODELS or not any(w in text for w in PH_MODEL_KEYS):
            continue
        files = json.loads(get(f'https://api.polyhaven.com/files/{k}') or '{}')
        try:
            g = files['gltf']['1k']['gltf']
        except KeyError:
            continue
        out = os.path.join(base, k)
        os.makedirs(out, exist_ok=True)
        data = get(g['url'], binary=True)
        if not data:
            continue
        with open(os.path.join(out, k + '.gltf'), 'wb') as f:
            f.write(data)
        ok = True
        for rel, inc in (g.get('include') or {}).items():
            b = get(inc['url'], binary=True)
            if b is None:
                ok = False
                break
            dst = os.path.join(out, rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with open(dst, 'wb') as f:
                f.write(b)
        if ok:
            picked += 1
            credits['models'].append({'id': k, 'file': f'models/{k}/{k}.gltf', 'license': 'CC0', 'url': 'https://polyhaven.com/a/' + k,
                                      'categories': v.get('categories', []), 'tags': v.get('tags', [])})
            print('  + model', k)


# ------------------------------------------------------------------ ambientCG (CC0)
ACG_QUERIES = ['Facade', 'Asphalt', 'Plaster', 'PavingStones', 'Concrete', 'Tiles', 'Bricks', 'Ground', 'Road', 'Rust', 'Metal', 'Fabric']
ACG_PER_QUERY = {'Facade': 18, 'Asphalt': 6, 'Plaster': 6, 'PavingStones': 6, 'Concrete': 5, 'Tiles': 4,
                 'Bricks': 4, 'Ground': 3, 'Road': 4, 'Rust': 2, 'Metal': 2, 'Fabric': 2}
KEEP_MAPS = ('_Color.jpg', '_NormalGL.jpg', '_Roughness.jpg')


def ambientcg():
    os.makedirs(TEX, exist_ok=True)
    for q in ACG_QUERIES:
        url = ('https://ambientcg.com/api/v2/full_json?type=Material&sort=Popular&include=downloadData'
               f'&limit={ACG_PER_QUERY[q]}&q={q}')
        j = get(url)
        if not j:
            continue
        for a in json.loads(j).get('foundAssets', []):
            aid = a['assetId']
            dl = None
            for cat in a.get('downloadFolders', {}).values():
                for fmt in cat.get('downloadFiletypeCategories', {}).values():
                    for d in fmt.get('downloads', []):
                        if d.get('attribute') == '1K-JPG':
                            dl = d.get('fullDownloadPath') or d.get('downloadLink')
            if not dl:
                continue
            z = get(dl, binary=True)
            if not z:
                continue
            out = os.path.join(TEX, 'acg_' + aid)
            os.makedirs(out, exist_ok=True)
            with zipfile.ZipFile(io.BytesIO(z)) as zf:
                for n in zf.namelist():
                    if n.endswith(KEEP_MAPS):
                        with open(os.path.join(out, n.split('_', 1)[1] if '_' in n else n), 'wb') as f:
                            f.write(zf.read(n))
            credits['textures'].append({'id': aid, 'dir': 'acg_' + aid, 'source': 'ambientCG', 'license': 'CC0',
                                        'url': 'https://ambientcg.com/view?id=' + aid, 'query': q,
                                        'tags': a.get('tags', [])[:20]})
            print('  + ambientCG', aid)


# ------------------------------------------------------------------ Poly Haven (CC0)
PH_TEX_KEYS = ['asphalt', 'road', 'plaster', 'concrete', 'paving', 'brick', 'stucco', 'sidewalk', 'tiles', 'sand', 'dirt', 'facade']
PH_MAX_TEX = 24


def polyhaven():
    os.makedirs(TEX, exist_ok=True)
    j = get('https://api.polyhaven.com/assets?t=textures')
    picked = 0
    if j:
        assets = json.loads(j)
        index = {k: {'name': v.get('name'), 'categories': v.get('categories'), 'tags': v.get('tags')} for k, v in assets.items()}
        with open(os.path.join(ROOT, 'polyhaven_textures_index.json'), 'w') as f:
            json.dump(index, f, ensure_ascii=False)
        for k, v in sorted(assets.items(), key=lambda kv: -kv[1].get('download_count', 0)):
            text = ' '.join([k] + v.get('categories', []) + v.get('tags', [])).lower()
            if picked >= PH_MAX_TEX or not any(w in text for w in PH_TEX_KEYS):
                continue
            files = json.loads(get(f'https://api.polyhaven.com/files/{k}') or '{}')
            out = os.path.join(TEX, 'ph_' + k)
            os.makedirs(out, exist_ok=True)
            ok = False
            for mp, name in (('Diffuse', 'Color.jpg'), ('nor_gl', 'NormalGL.jpg'), ('Rough', 'Roughness.jpg')):
                try:
                    u = files[mp]['1k']['jpg']['url']
                except KeyError:
                    continue
                data = get(u, binary=True)
                if data:
                    with open(os.path.join(out, name), 'wb') as f:
                        f.write(data)
                    ok = True
            if ok:
                picked += 1
                credits['textures'].append({'id': k, 'dir': 'ph_' + k, 'source': 'Poly Haven', 'license': 'CC0',
                                            'url': 'https://polyhaven.com/a/' + k, 'tags': v.get('tags', [])})
                print('  + polyhaven', k)
    # sky HDRIs
    j = get('https://api.polyhaven.com/assets?t=hdris&c=skies')
    if j:
        hd = sorted(json.loads(j).items(), key=lambda kv: -kv[1].get('download_count', 0))
        want = [k for k, v in hd if 'clear' in ' '.join(v.get('tags', []) + [k]) or 'sunny' in ' '.join(v.get('tags', []))][:3] + [k for k, _ in hd[:2]]
        os.makedirs(os.path.join(ROOT, 'hdri'), exist_ok=True)
        for k in dict.fromkeys(want):
            files = json.loads(get(f'https://api.polyhaven.com/files/{k}') or '{}')
            try:
                u = files['hdri']['1k']['hdr']['url']
            except KeyError:
                continue
            data = get(u, binary=True)
            if data:
                with open(os.path.join(ROOT, 'hdri', k + '_1k.hdr'), 'wb') as f:
                    f.write(data)
                credits['hdri'].append({'id': k, 'file': 'hdri/' + k + '_1k.hdr', 'license': 'CC0', 'url': 'https://polyhaven.com/a/' + k})
                print('  + hdri', k)


def merge():
    """combine assets/credits.<group>.json files into assets/credits.json"""
    cpath = os.path.join(ROOT, 'credits.json')
    merged = json.load(open(cpath)) if os.path.exists(cpath) else {}
    for k in ('sounds', 'textures', 'hdri', 'models'):
        merged.setdefault(k, [])
    parts = sorted(f for f in os.listdir(ROOT) if f.startswith('credits.') and f.endswith('.json') and f != 'credits.json')
    for f in parts:
        part = json.load(open(os.path.join(ROOT, f)))
        group = f.split('.')[1]
        if group == 'sounds':
            merged['sounds'] = [c for c in merged['sounds'] if c.get('role')] + part.get('sounds', [])
        elif group == 'foley':
            merged['sounds'] = [c for c in merged['sounds'] if not c.get('role')] + part.get('sounds', [])
        elif group == 'models':
            merged['models'] = part.get('models', [])
        os.remove(os.path.join(ROOT, f))
    with open(cpath, 'w') as fh:
        json.dump(merged, fh, ensure_ascii=False, indent=1)
    print('merged', {k: len(v) for k, v in merged.items()})


if __name__ == '__main__':
    what = sys.argv[1:] or ['sounds']
    os.makedirs(ROOT, exist_ok=True)
    if what == ['--merge']:
        merge()
        sys.exit(0)
    for group in what:
        credits['sounds'] = []
        credits['models'] = []
        print('== group', group, flush=True)
        if group == 'sounds':
            freesound()
        elif group == 'foley':
            foley()
        elif group == 'osm':
            osm()
        elif group == 'models':
            polyhaven_models()
        elif group == 'ambientcg':
            ambientcg()
        elif group == 'polyhaven':
            polyhaven()
        with open(os.path.join(ROOT, f'credits.{group}.json'), 'w') as f:
            json.dump(credits, f, ensure_ascii=False, indent=1)
        print('done', group, {k: len(v) for k, v in credits.items()}, flush=True)
