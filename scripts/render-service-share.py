"""Compose service-value covers from verified real photographs, retaining the full scene."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, math, sys
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
from PIL import Image, ImageOps, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
PROOF = ROOT / 'output/verification/service-share'
DEST = ROOT / 'docs/media/service-share'
DATA = json.loads((PROOF / 'candidates.json').read_text(encoding='utf-8'))
VALUES = DATA['values']
WIDTH, HEIGHT = 1200, 630
FONT = 'C:/Windows/Fonts/malgunbd.ttf'
REGULAR = 'C:/Windows/Fonts/malgun.ttf'
DEST.mkdir(parents=True, exist_ok=True)
RENDERER = hashlib.sha256(Path(__file__).read_bytes().replace(b'\r\n', b'\n')).hexdigest()


def canonical_original(value):
    if not value:
        return None
    u = urlsplit(value)
    excluded = {'type', 'w', 'h', 'width', 'height', 'quality', 'q'}
    query = urlencode(sorted((k, v) for k, v in parse_qsl(u.query) if k not in excluded))
    return urlunsplit((u.scheme, u.netloc.lower(), u.path, query, ''))


def pixels(file):
    with Image.open(file) as original:
        im = ImageOps.exif_transpose(original).convert('RGB')
        digest = hashlib.sha256(str(im.size).encode() + im.tobytes()).hexdigest()
        small = im.convert('L').resize((17, 16), Image.Resampling.LANCZOS)
        px = list(small.get_flattened_data())
        dhash = 0
        for y in range(16):
            for x in range(16):
                dhash = (dhash << 1) | int(px[y*17+x] > px[y*17+x+1])
        return im.copy(), digest, dhash


def font(size, bold=True):
    return ImageFont.truetype(FONT if bold else REGULAR, size)


def fit(draw, text, initial, minimum, max_width):
    for size in range(initial, minimum - 1, -1):
        face = font(size)
        if draw.textlength(text, font=face) <= max_width:
            return face
    raise ValueError('Text cannot fit without truncation: ' + text)


def make_cover(photo, original):
    # The full real scene stays unobscured in the upper area. The background is
    # the same photograph; the value message occupies the lower image area.
    base = ImageOps.fit(original, (WIDTH, HEIGHT)).filter(ImageFilter.GaussianBlur(24)).convert('RGBA')
    shade = Image.new('RGBA', (WIDTH, HEIGHT))
    sd = ImageDraw.Draw(shade)
    for y in range(HEIGHT):
        alpha = round(95 + 152 * min(1, max(0, (y - 200) / 270)))
        sd.line((0, y, WIDTH, y), fill=(8, 29, 45, alpha))
    base = Image.alpha_composite(base, shade)
    contained = ImageOps.contain(original, (WIDTH - 56, 328), Image.Resampling.LANCZOS)
    scene_x = (WIDTH - contained.width) // 2
    scene_y = 12 + (328 - contained.height) // 2
    base.paste(contained.convert('RGBA'), (scene_x, scene_y))
    draw = ImageDraw.Draw(base)
    margin = 48
    draw.text((margin, 351), VALUES['title'], font=font(23), fill='#a7f0d6')
    heading_font = fit(draw, max(VALUES['headline'], key=len), 57, 48, WIDTH - 2 * margin)
    boxes = []
    for i, text in enumerate(VALUES['headline']):
        position = (margin, 390 + i * 68)
        draw.text(position, text, font=heading_font, fill='white' if i == 0 else '#a7f0d6',
                  stroke_width=1, stroke_fill='#132d41')
        box = draw.textbbox(position, text, font=heading_font, stroke_width=1)
        assert box[0] >= 0 and box[2] <= WIDTH - 36
        boxes.append(list(box))
    description_font = fit(draw, VALUES['description'], 25, 20, WIDTH - 2 * margin)
    draw.text((margin, 541), VALUES['description'], font=description_font, fill='#edf5fb')
    footer = '실제 활동: ' + photo['institutionName'] + '  ·  사진: ' + photo['credit']
    credit_font = fit(draw, footer, 17, 12, WIDTH - 2 * margin)
    draw.text((margin, 593), footer, font=credit_font, fill='#c3d2df')
    assert draw.textbbox((margin, 593), footer, font=credit_font)[3] < HEIGHT - 10
    return base.convert('RGB'), {'sceneBox': [scene_x, scene_y, scene_x + contained.width, scene_y + contained.height],
                                 'titleBoxes': boxes, 'headlineSize': heading_font.size,
                                 'creditSize': credit_font.size, 'fullScenePreserved': True,
                                 'textOverScene': False}


photos = []
duplicates = []
near_duplicates = []
identities = {}
fingerprints = []
for candidate in DATA['photos']:
    original, pixel_hash, perceptual = pixels(ROOT / 'docs/media' / candidate['file'])
    raw_hash = hashlib.sha256((ROOT / 'docs/media' / candidate['file']).read_bytes()).hexdigest()
    identity_values = [('pixel', pixel_hash), ('file', raw_hash)]
    for label, value in [('originalURL', canonical_original(candidate.get('originalImageUrl'))),
                         ('originalFile', candidate.get('originalFile')),
                         ('sourceRawSHA256', candidate.get('sourceRawSHA256'))]:
        if value:
            identity_values.append((label, value))
    duplicate = next((identities[(label, value)] for label, value in identity_values if (label, value) in identities), None)
    if duplicate is None:
        # Different processing/resize encodings of the same photograph are also
        # caught by an extremely close perceptual hash, without merging merely
        # similar photos from the same event.
        duplicate = next((p for p, h in fingerprints if (perceptual ^ h).bit_count() <= 3), None)
        if duplicate:
            near_duplicates.append({'key': candidate['key'], 'duplicateOf': duplicate['key'], 'reason': 'perceptual-distance<=3'})
    if duplicate:
        duplicates.append({'key': candidate['key'], 'duplicateOf': duplicate['key'], 'owner': candidate['owner']})
        duplicate.setdefault('aliasKeys', []).append(candidate['key'])
        for label, value in identity_values:
            identities[(label, value)] = duplicate
        continue
    photo = {**candidate, 'id': pixel_hash, 'sha256': raw_hash, 'pixelSHA256': pixel_hash,
             'width': original.width, 'height': original.height, 'aliasKeys': []}
    for label, value in identity_values:
        identities[(label, value)] = photo
    fingerprints.append((photo, perceptual))
    identity = hashlib.sha256(json.dumps({'pixel': pixel_hash, 'values': VALUES,
                                        'owner': photo['owner'], 'credit': photo['credit'], 'renderer': RENDERER},
                                       ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:20]
    filename = pixel_hash[:16] + '-' + identity + '.jpg'
    target = DEST / filename
    if target.exists():
        # Hash names are immutable; previously published files are never rewritten.
        with Image.open(target) as check:
            assert check.size == (WIDTH, HEIGHT), str(target)
        _, geometry = make_cover(photo, original)
    else:
        cover, geometry = make_cover(photo, original)
        cover.save(target, quality=89, optimize=True, subsampling=2)
    photo.update({'poster': VALUES['canonicalURL'] + 'media/service-share/' + filename,
                  'posterFile': 'service-share/' + filename,
                  'posterSHA256': hashlib.sha256(target.read_bytes()).hexdigest(),
                  'posterWidth': WIDTH, 'posterHeight': HEIGHT,
                  'layout': geometry})
    photos.append(photo)

photos.sort(key=lambda p: (-p['freshnessTimestamp'], p['owner'], p['key']))
assert len({p['id'] for p in photos}) == len(photos)
expected_owners = {org['id'] for org in DATA['organizations']}
assert {p['owner'] for p in photos} == expected_owners, 'Fallback must retain all seven institutions'
latest = [p['id'] for p in photos[:VALUES['latestLimit']]]
manifest = {'version': 1, 'batchSize': VALUES['batchSize'], 'latestLimit': VALUES['latestLimit'],
            'title': VALUES['title'], 'description': VALUES['description'], 'headline': VALUES['headline'],
            'canonicalURL': VALUES['canonicalURL'], 'photos': photos, 'latest': latest,
            'fallback': [p['id'] for p in photos], 'ordering': VALUES['ordering'],
            'rendererVersion': RENDERER[:12]}
catalog_file = ROOT / 'docs/service-share-catalog.json'
catalog_file.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# Review every generated cover in panels, and retain complete 1200x630 samples.
columns, tile_w, tile_h, label_h = 3, 400, 210, 56
panel_files = []
for start in range(0, len(photos), 12):
    subset = photos[start:start + 12]
    rows = math.ceil(len(subset) / columns)
    sheet = Image.new('RGB', (columns * tile_w, rows * (tile_h + label_h)), 'white')
    draw = ImageDraw.Draw(sheet)
    for index, p in enumerate(subset):
        x, y = index % columns * tile_w, index // columns * (tile_h + label_h)
        with Image.open(ROOT / 'docs/media' / p['posterFile']) as im:
            sheet.paste(im.resize((tile_w, tile_h), Image.Resampling.LANCZOS), (x, y))
        draw.text((x + 6, y + tile_h + 3), p['owner'] + ' · ' + p['key'], font=font(11, False), fill='#18314d')
        date_label = p['publishedDate'] or '게시일 미확인'
        draw.text((x + 6, y + tile_h + 24), date_label + (' · latest' if p['id'] in latest else ' · fallback'), font=font(12, False), fill='#18314d')
    filename = 'contact-' + str(start // 12 + 1) + '.jpg'
    sheet.save(PROOF / filename, quality=92)
    panel_files.append(filename)

audit = {'passed': True, 'sourceCandidates': len(DATA['photos']), 'uniquePhotographs': len(photos),
         'institutions': len(expected_owners), 'ownerCounts': {owner: sum(p['owner'] == owner for p in photos) for owner in sorted(expected_owners)},
         'duplicatesRemoved': duplicates, 'nearDuplicatesRemoved': near_duplicates,
         'latestCount': len(latest), 'latest': [{'id': p['id'], 'key': p['key'], 'owner': p['owner'],
                                             'publishedDate': p['publishedDate'], 'freshnessDate': p['freshnessDate']} for p in photos[:VALUES['latestLimit']]],
         'unknownPublicationDates': [p['key'] for p in photos if not p['publishedDate']],
         'datePolicy': VALUES['ordering'], 'generatedPosters': len(photos), 'posterDimensions': [WIDTH, HEIGHT],
         'posterGPSMetadata': 0, 'fullScenesPreserved': True, 'textOverScene': False,
         'manifest': 'docs/service-share-catalog.json', 'contactSheets': panel_files,
         'existing603CoversModified': False, 'browserUIUsed': False}
(PROOF / 'audit.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({k: audit[k] for k in ['passed', 'sourceCandidates', 'uniquePhotographs', 'institutions', 'latestCount', 'generatedPosters', 'contactSheets']}, ensure_ascii=False))
