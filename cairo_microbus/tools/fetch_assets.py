#!/usr/bin/env python3
"""Download real recordings and photo textures for the game (runs on GitHub Actions).

Sounds: Freesound preview MP3s (no login needed) of Cairo / Egypt field recordings.
Textures: CC0 photo materials from ambientCG and Poly Haven.
Everything goes to cairo_microbus/assets/ with a credits.json listing the license of each file.
"""
import json, os, re, sys, time, urllib.parse, urllib.request, zipfile, io

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')
SND = os.path.join(ROOT, 'sounds')
TEX = os.path.join(ROOT, 'textures')
UA = {'User-Agent': 'Mozilla/5.0 (cairo-microbus asset fetcher)'}
credits = {'sounds': [], 'textures': [], 'hdri': []}


def get(url, binary=False, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                data = r.read()
                return data if binary else data.decode('utf-8', 'replace')
        except Exception as e:  # noqa
            print('  retry', url, e)
            time.sleep(2 + i * 3)
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
    audio = re.search(r'<meta property="og:audio" content="([^"]+)"', html)
    if not audio:
        print('  no preview', path)
        return
    title = re.search(r'<meta property="og:title" content="([^"]*)"', html)
    desc = re.search(r'<meta property="og:description" content="([^"]*)"', html)
    lic = re.search(r'href="(https?://creativecommons\.org/[^"]+)"', html)
    tags = re.findall(r'href="/browse/tags/([^/"]+)/?"', html)
    dur = re.search(r'"duration"[^0-9]*([0-9.]+)', html)
    data = get(audio.group(1), binary=True)
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
    print('  +', fname, credits['sounds'][-1]['title'], credits['sounds'][-1]['license'])
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
        html = get(FS + '/search/?q=' + urllib.parse.quote(q) + '&s=Downloads+(most+first)') or ''
        for l in sound_links(html)[:6]:
            fetch_sound(l, seen)


def foley():
    os.makedirs(SND, exist_ok=True)
    seen = {c['id'] for c in credits['sounds']}
    for role, queries in FOLEY.items():
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


if __name__ == '__main__':
    what = sys.argv[1:] or ['sounds', 'ambientcg', 'polyhaven']
    os.makedirs(ROOT, exist_ok=True)
    cpath = os.path.join(ROOT, 'credits.json')
    if os.path.exists(cpath):
        old = json.load(open(cpath))
        for k in credits:
            credits[k] = [c for c in old.get(k, [])]
    if 'sounds' in what:
        credits['sounds'] = [c for c in credits['sounds'] if c.get('role')]
        freesound()
    if 'foley' in what:
        credits['sounds'] = [c for c in credits['sounds'] if not c.get('role')]
        foley()
    if 'ambientcg' in what or 'polyhaven' in what:
        credits['textures'] = [c for c in credits['textures'] if
                               ('ambientcg' not in what or c['source'] != 'ambientCG') and
                               ('polyhaven' not in what or c['source'] != 'Poly Haven')]
    if 'ambientcg' in what:
        ambientcg()
    if 'polyhaven' in what:
        credits['hdri'] = []
        polyhaven()
    with open(cpath, 'w') as f:
        json.dump(credits, f, ensure_ascii=False, indent=1)
    print('sounds', len(credits['sounds']), 'textures', len(credits['textures']), 'hdri', len(credits['hdri']))
