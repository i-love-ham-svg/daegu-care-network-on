"""Build and render the five-page, source-backed Korean delivery proposal.
Run with the current Codex bundled Python; no site/application source is changed.
"""
from pathlib import Path
from io import BytesIO
import hashlib, json, shutil, subprocess, sys
from xml.sax.saxutils import escape
from PIL import Image, ImageOps
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.colors import HexColor, Color, white
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF
from pypdf import PdfReader

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).resolve().parents[1]
CONTENT = json.loads((ROOT / 'src/proposal-content.json').read_text(encoding='utf-8'))
OUT = ROOT / 'output/proposal'
OUT.mkdir(parents=True, exist_ok=True)
QA = OUT / 'verification-20261120'
QA.mkdir(exist_ok=True)
TEMP = ROOT / 'tmp/pdfs'
TEMP.mkdir(parents=True, exist_ok=True)
BUNDLE = Path(sys.executable).parent.parent
NODE = BUNDLE / 'node/bin/node.exe'
if not NODE.exists():
    NODE = shutil.which('node')
POPPLER = BUNDLE / 'native/poppler/Library/bin/pdftoppm.exe'
if not POPPLER.exists():
    POPPLER = shutil.which('pdftoppm')
assert NODE and POPPLER, 'Use the Codex bundle with Node and Poppler'
runtime_code = "const c=require('./scripts/social-catalog.cjs')();console.log(JSON.stringify({organizations:c.organizations,photos:c.photos}));"
RUNTIME = json.loads(subprocess.check_output([str(NODE), '-e', runtime_code], cwd=ROOT, encoding='utf-8'))
ORGS = {o['id']: o for o in RUNTIME['organizations']}
assert len(ORGS) == len(CONTENT['institutions']) == 7
for org in CONTENT['institutions']:
    assert ORGS[org['id']]['name'] == org['name'], org['id']
    if ORGS[org['id']].get('district'):
        assert ORGS[org['id']]['district'] == org['district'], org['id']
    elif org['district'] != '대구':
        assert org['district'] in json.dumps(ORGS[org['id']].get('facts', []), ensure_ascii=False), org['id']
assert sum('병원동행' in o['services'] for o in CONTENT['institutions']) == 4

pdfmetrics.registerFont(TTFont('Malgun', 'C:/Windows/Fonts/malgun.ttf'))
pdfmetrics.registerFont(TTFont('Malgun-Bold', 'C:/Windows/Fonts/malgunbd.ttf'))
pdfmetrics.registerFontFamily('Malgun', normal='Malgun', bold='Malgun-Bold', italic='Malgun', boldItalic='Malgun-Bold')
W, H = landscape(A4)
INK = HexColor('#153448')
MUTED = HexColor('#526875')
BLUE = HexColor('#075fce')
MINT = HexColor('#a5eed3')
LINE = HexColor('#dce7ec')
PAPER = HexColor('#f1f6f9')
MARGIN = 42
FINAL = OUT / '대구 통합돌봄네트워크 ON 제안서 최종본.pdf'
PUBLIC = ROOT / 'docs/downloads/daegu-care-on-proposal-20261120.pdf'
ARCHIVE = OUT / 'archive'
if FINAL.exists() and CONTENT['date'] not in '\n'.join(page.extract_text() or '' for page in PdfReader(FINAL).pages):
    ARCHIVE.mkdir(exist_ok=True)
    old_hash = hashlib.sha256(FINAL.read_bytes()).hexdigest()[:12]
    saved = ARCHIVE / ('대구 통합돌봄네트워크 ON 제안서 보존본-' + old_hash + '.pdf')
    if not saved.exists():
        shutil.copyfile(FINAL, saved)

C = canvas.Canvas(str(FINAL), pagesize=(W, H), pageCompression=1, invariant=1)
C.setTitle(CONTENT['serviceName'] + ' - ' + CONTENT['documentTitle'])
C.setAuthor(CONTENT['proposer'])
C.setSubject('2026.11.20 확정 7개 참여기관 기반 플랫폼 제안과 HTTPS 온라인 시연')
used_photos = []
paragraph_boxes = []


def para(text, x, top, width, size=11, leading=17, color=INK, bold=False, max_height=None):
    style = ParagraphStyle('p', fontName='Malgun-Bold' if bold else 'Malgun', fontSize=size,
                           leading=leading, textColor=color, wordWrap='LTR', splitLongWords=True)
    p = Paragraph(text, style)
    _, height = p.wrap(width, H)
    if max_height is not None:
        assert height <= max_height + .5, (text, height, max_height)
    assert 0 <= x <= W and top + height <= H - 14, (text, top, height)
    p.drawOn(C, x, H - top - height)
    paragraph_boxes.append({'page': C.getPageNumber(), 'text': text, 'box': [x, top, x + width, top + height]})
    return height


def text(value, x, top, size=11, color=INK, bold=False):
    C.setFont('Malgun-Bold' if bold else 'Malgun', size)
    C.setFillColor(color)
    C.drawString(x, H - top - size, value)


def rect(x, top, width, height, fill, stroke=None, radius=0):
    C.setFillColor(fill)
    C.setStrokeColor(stroke or fill)
    if radius:
        C.roundRect(x, H - top - height, width, height, radius, fill=1, stroke=bool(stroke))
    else:
        C.rect(x, H - top - height, width, height, fill=1, stroke=bool(stroke))


def line(x, top, width):
    C.setStrokeColor(LINE)
    C.setLineWidth(.6)
    C.line(x, H - top, x + width, H - top)


def footer(number, dark=False):
    color = HexColor('#d8e6ed') if dark else MUTED
    text(CONTENT['serviceName'], MARGIN, H - 27, 8, color)
    text(CONTENT['date'] + '  |  ' + str(number) + ' / 5', W - 150, H - 27, 8, color)


def heading(kicker, title, intro=None):
    text(kicker, MARGIN, 31, 9, BLUE, True)
    text(title, MARGIN, 54, 25, INK, True)
    if intro:
        para(escape(intro), MARGIN, 96, W - MARGIN * 2, 11, 17, MUTED)


def photo_background(key, focus=(.5, .5)):
    photo = RUNTIME['photos'][key]
    assert not photo.get('illustrative') and photo.get('owner') in ORGS
    file = ROOT / 'docs/media' / photo['file']
    with Image.open(file) as original:
        picture = ImageOps.exif_transpose(original).convert('RGB')
        picture = ImageOps.fit(picture, (2000, round(2000 * H / W)), Image.Resampling.LANCZOS, centering=focus)
    memory = BytesIO()
    picture.save(memory, format='JPEG', quality=91)
    memory.seek(0)
    C.drawImage(ImageReader(memory), 0, 0, W, H)
    used_photos.append({'page': C.getPageNumber(), 'key': key, 'file': photo['file'], 'owner': photo['owner'],
                        'title': photo.get('title'), 'source': photo.get('source'),
                        'credit': photo.get('publisher') or photo.get('sourceLabel'),
                        'fit': 'full-page cover', 'focus': list(focus), 'stretched': False})
    return photo


def gradient(top=False, bottom=True):
    # One soft-mask image avoids overlap seams between semi-transparent PDF strips.
    overlay_height = 1800
    overlay = Image.new('RGBA', (4, overlay_height))
    for row in range(overlay_height):
        y = row * H / overlay_height
        alpha = 0
        if top:
            alpha = max(alpha, .66 * max(0, 1 - y / 235))
        if bottom:
            alpha = max(alpha, .88 * max(0, min(1, (y - 278) / 240)))
        overlay.paste((10, 36, 57, round(alpha * 255)), (0, row, 4, row + 1))
    C.drawImage(ImageReader(overlay), 0, 0, W, H, mask='auto')


def qr(x, top, size, url):
    widget = QrCodeWidget(url, barLevel='M', barBorder=4)
    bounds = widget.getBounds()
    scale = size / max(bounds[2] - bounds[0], bounds[3] - bounds[1])
    drawing = Drawing(size, size, transform=[scale, 0, 0, scale, -bounds[0] * scale, -bounds[1] * scale])
    drawing.add(widget)
    rect(x, top, size, size, white)
    renderPDF.draw(drawing, C, x, H - top - size)
    C.linkURL(url, (x, H - top - size, x + size, H - top), relative=0, thickness=0)


def link_label(label, url, x, top, width, size=9.3):
    return para('<link href="' + escape(url, {'"': '&quot;'}) + '"><u>' + escape(label) + '</u></link>',
                x, top, width, size, 14, BLUE)


# 1. Full-photo cover; faces and the care action remain above the lower message.
photo = photo_background('org-with-medical', (.5, .28))
gradient(top=True)
text(CONTENT['serviceName'], MARGIN, 30, 22, white, True)
text(CONTENT['documentTitle'] + '  ·  제안 검토용 시연', MARGIN, 66, 11, white)
for index, value in enumerate(CONTENT['headline']):
    text(value, MARGIN, 374 + index * 42, 31, white if index == 0 else MINT, True)
text(CONTENT['description'], MARGIN, 467, 12, white)
text(CONTENT['proposer'] + '  |  ' + CONTENT['date'], MARGIN, 502, 10, white)
text(CONTENT['demoURL'], MARGIN, 534, 12, white, True)
C.linkURL(CONTENT['demoURL'], (MARGIN, H - 554, 440, H - 529), relative=0, thickness=0)
qr(W - 150, 432, 100, CONTENT['demoURL'])
text('온라인 시연 바로 열기', W - 154, 537, 9, white)
text('실제 활동사진: ' + photo['publisher'], MARGIN, 557, 8, HexColor('#d8e6ed'))
if photo.get('source'):
    C.linkURL(photo['source'], (MARGIN, H - 568, 500, H - 554), relative=0, thickness=0)
footer(1, True)
C.showPage()

# 2. Exactly the user-confirmed seven names, service fields and direct sources.
heading('01  /  CONFIRMED PARTICIPANTS', '확정된 7개 기관이 함께합니다',
        '참여 확정 명단 2026.11.20 기준. 기관별 서비스와 공개 활동자료를 대조해 소개합니다.')
table_x = MARGIN
widths = [272, 62, 304, W - 2 * MARGIN - 638]
headers = ['참여기관', '지역', '주요 돌봄 분야', '직접 출처']
y = 137
rect(table_x, y, W - 2 * MARGIN, 31, INK)
left = table_x
for value, width in zip(headers, widths):
    text(value, left + 10, y + 8, 10, white, True)
    left += width
y += 31
for index, org in enumerate(CONTENT['institutions']):
    if index % 2 == 0:
        rect(table_x, y, W - 2 * MARGIN, 42, PAPER)
    left = table_x
    para(escape(org['name']), left + 10, y + 12, widths[0] - 18, 10.2, 14, bold=True, max_height=28)
    left += widths[0]
    text(org['district'], left + 10, y + 12, 10)
    left += widths[1]
    para(escape(org['services']), left + 10, y + 11, widths[2] - 18, 10, 14, max_height=28)
    left += widths[2]
    link_label(org['sourceLabel'], org['source'], left + 10, y + 11, widths[3] - 18, 8.5)
    line(table_x, y + 42, W - 2 * MARGIN)
    y += 42
rect(MARGIN, 482, W - 2 * MARGIN, 45, HexColor('#e8f2ff'), radius=7)
para('<b>병원동행</b>은 대구도우누리·우리함께통합돌봄·대구돌봄·모두행복센터에서 안내하는 분야입니다. '
     '방문진료는 위드의 의료서비스로 구분합니다.', MARGIN + 14, 493, W - 2 * MARGIN - 28, 10.5, 16, max_height=32)
text('기관별 이용 조건·제공 지역은 각 기관의 공식 안내를 확인합니다.', MARGIN, 539, 9, MUTED)
footer(2)
C.showPage()

# 3. Scope and roles, described as a readable proposal rather than a process chart.
heading('02  /  SERVICE AND OPERATION', '시민이 찾고, 기관이 알리고, 함께 관리합니다',
        '흩어진 기관정보와 활동자료를 한곳에 모아, 필요한 돌봄을 찾고 이해하기 쉬운 공개 창구를 제안합니다.')
left_width = 440
y = 147
for title, body in CONTENT['scope']:
    text(title, MARGIN, y, 12, BLUE, True)
    height = para(escape(body), MARGIN, y + 23, left_width, 10.8, 17, MUTED)
    y += max(61, 30 + height)
right_x = 526
rect(right_x - 18, 138, W - right_x - MARGIN + 36, 332, PAPER, radius=10)
text('운영 역할 제안', right_x, 157, 16, INK, True)
role_y = 203
for title, body in CONTENT['roles']:
    text(title, right_x, role_y, 12, INK, True)
    height = para(escape(body), right_x, role_y + 24, W - right_x - MARGIN, 10.5, 17, MUTED)
    role_y += 80
para('활동소식은 기관이 자료를 제공하고, 사무국이 출처와 공개 범위를 확인하는 운영 방식을 제안합니다.',
     MARGIN, 493, W - 2 * MARGIN, 11, 18, INK)
footer(3)
C.showPage()

# 4. A second, distinct institution's actual scene fills the whole page.
photo = photo_background('org-welfare-design', (.5, .32))
gradient(top=True)
text('03  /  REAL STORIES AND SHARING', MARGIN, 30, 9, MINT, True)
text('실제 활동이', MARGIN, 65, 29, white, True)
text('신뢰의 첫 화면이 됩니다', MARGIN, 106, 29, white, True)
text('공유받은 한 장에서도 서비스와 콘텐츠의 의미가 분명하게 전달되도록 합니다.', MARGIN, 155, 11, white)
col_width = (W - 2 * MARGIN - 40) / 3
for index, (title, body) in enumerate(CONTENT['sharing']):
    x = MARGIN + index * (col_width + 20)
    text(title, x, 448, 12, MINT, True)
    para(escape(body), x, 474, col_width, 10, 16, white, max_height=66)
text('기관 실제 활동: 사회복지디자인연구소 조합원 워크숍  |  사진: 대구시민공익활동지원센터', MARGIN, 549, 8, HexColor('#d8e6ed'))
if photo.get('source'):
    C.linkURL(photo['source'], (MARGIN, H - 561, 620, H - 545), relative=0, thickness=0)
footer(4, True)
C.showPage()

# 5. Precise distinction between the available demonstration and live integration.
heading('04  /  DEMONSTRATION AND NEXT DISCUSSION', '시연을 확인하고, 운영 범위를 함께 정합니다',
        'HTTPS 온라인 시연은 로그인 없이 열람할 수 있습니다. 실제 개통 범위와 시연 범위를 구분해 검토합니다.')
text('현재 시연에서 확인할 수 있습니다', MARGIN, 146, 16, BLUE, True)
y = 187
for index, item in enumerate(CONTENT['demonstration']):
    text(str(index + 1).zfill(2), MARGIN, y + 1, 10, BLUE, True)
    para(escape(item), MARGIN + 31, y, 467, 11, 18)
    y += 42
rect(MARGIN, 370, 495, 132, PAPER, radius=9)
text('시연과 실제 운영의 구분', MARGIN + 16, 383, 13, INK, True)
limit_y = 414
for item in CONTENT['limits']:
    height = para(escape(item), MARGIN + 16, limit_y, 462, 9.5, 14, MUTED)
    limit_y += height + 5
text('온라인 시연', 591, 147, 16, INK, True)
qr(614, 188, 143, CONTENT['demoURL'])
link_label(CONTENT['demoURL'], CONTENT['demoURL'], 566, 345, 232, 10)
para('제안서와 함께 링크 또는 QR을 전달하면 바로 시연 화면을 확인할 수 있습니다.', 577, 383, 210, 10.5, 17, MUTED)
para(escape(CONTENT['discussion']), MARGIN, 520, W - 2 * MARGIN, 10.5, 16, INK, max_height=32)
footer(5)
C.save()
PUBLIC.parent.mkdir(parents=True, exist_ok=True)
shutil.copyfile(FINAL, PUBLIC)

# Validate semantics and links independently from ReportLab before rendering.
reader = PdfReader(FINAL)
assert len(reader.pages) == 5
all_text = '\n'.join(page.extract_text() or '' for page in reader.pages)
for required in [CONTENT['date'], CONTENT['demoURL'], '병원동행', '외부 서비스 연동 전'] + [org['name'] for org in CONTENT['institutions']]:
    assert required in all_text, required
uris = []
fonts = []
for page in reader.pages:
    for annotation in page.get('/Annots', []):
        action = annotation.get_object().get('/A')
        if action and action.get('/URI'):
            uris.append(str(action['/URI']))
    for font_ref in page.get('/Resources', {}).get('/Font', {}).values():
        f = font_ref.get_object()
        if 'Malgun' in str(f.get('/BaseFont', '')):
            descriptor = f.get('/FontDescriptor')
            assert descriptor and descriptor.get_object().get('/FontFile2'), 'CJK TrueType font must be embedded'
            fonts.append(str(f['/BaseFont']))
assert len(fonts) >= 2
assert all(uri.startswith('https://') for uri in uris)
assert CONTENT['demoURL'] in uris
for org in CONTENT['institutions']:
    assert org['source'] in uris, org['id']
assert FINAL.read_bytes() == PUBLIC.read_bytes()
subprocess.run([str(POPPLER), '-r', '135', '-png', str(FINAL), str(QA / 'page')], check=True)
pages = sorted(QA.glob('page-*.png'))
assert len(pages) == 5
with Image.open(pages[0]) as im:
    im.convert('RGB').save(OUT / 'proposal-preview.jpg', quality=90)
report = {'passed': True, 'date': CONTENT['date'], 'pages': 5, 'pageSize': 'A4 landscape',
          'pagePlan': CONTENT['pagePlan'], 'confirmedInstitutions': 7,
          'institutionNamesMatchRuntime': True, 'hospitalEscortInstitutions': 4,
          'embeddedCJKFonts': sorted(set(fonts)), 'externalLinks': sorted(set(uris)),
          'demoURL': CONTENT['demoURL'], 'QRValues': [CONTENT['demoURL'], CONTENT['demoURL']],
          'qrType': 'ReportLab vector QR, error correction M, four-module quiet zone',
          'photoSources': used_photos, 'photosFullPageBackground': True,
          'sourceRestrictions': ['사진·기관정보는 기존 검증 자료를 재사용합니다. 사진 이용조건과 원문 출처를 유지합니다.',
                                 '사회복지디자인연구소의 민간 세무번호 표기와 공공 기관현황 상충은 별도 확인 대상이며 이 제안서는 세무상 계속사업을 단정하지 않습니다.',
                                 '실제 인증·결제 연동을 구현하거나 개통 완료로 표시하지 않았습니다.'],
          'institutionSourceCrossCheck': [{'id': org['id'], 'exactName': org['name'], 'region': org['district'],
                                           'services': org['services'], 'source': org['source'],
                                           'basis': '2026.11.20 사용자 확정 참여명단 + runtime 기관정보 + 기존 원문 검증 기록'}
                                          for org in CONTENT['institutions']],
          'renderedPages': [str(p.relative_to(ROOT)).replace('\\', '/') for p in pages],
          'paragraphBoxes': paragraph_boxes, 'pdfSHA256': hashlib.sha256(FINAL.read_bytes()).hexdigest(),
          'publicCopyByteIdentical': True, 'finalPDF': str(FINAL), 'publicPDF': str(PUBLIC),
          'visualReviewComplete': False}
previous_report = QA / 'report.json'
if previous_report.exists():
    previous = json.loads(previous_report.read_text(encoding='utf-8'))
    if previous.get('pdfSHA256') == report['pdfSHA256'] and previous.get('visualReviewComplete'):
        report['visualReviewComplete'] = True
        report['visualReview'] = previous.get('visualReview')
(QA / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({key: report[key] for key in ['passed', 'pages', 'confirmedInstitutions', 'hospitalEscortInstitutions',
                                              'publicCopyByteIdentical', 'pdfSHA256', 'visualReviewComplete']}, ensure_ascii=False))
