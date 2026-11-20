"""Reject reused photographs and identical rendered covers, independently of names."""
from pathlib import Path
import hashlib,json,sys
from PIL import Image,ImageOps
R=Path(__file__).resolve().parents[1]
read=lambda p:json.loads((R/p).read_text(encoding='utf-8'))
catalog=read('output/work/catalog.json');recipes=read('src/social-covers.json')
def fingerprints(file):
    assert not Image.open(file).getexif().get(34853),'Remove hidden photo location metadata before publishing: '+str(file)
    im=ImageOps.exif_transpose(Image.open(file)).convert('RGB')
    gray=im.convert('L').resize((17,16),Image.Resampling.LANCZOS)
    px=list(gray.get_flattened_data());bits=0
    for y in range(16):
        for x in range(16):bits=(bits<<1)|int(px[y*17+x]>px[y*17+x+1])
    return hashlib.sha256(file.read_bytes()).hexdigest(),hashlib.sha256(im.tobytes()).hexdigest(),bits

sources=[];duplicates=[];near=[]
for route,recipe in recipes.items():
    p=catalog['photos'][recipe['photo']];file=R/'docs/media'/p['file']
    raw,pixel,dhash=fingerprints(file)
    for old in sources:
        if raw==old['raw'] or pixel==old['pixel'] or recipe['photo']==old['photo']:
            duplicates.append([old['route'],route])
        else:
            distance=(dhash^old['dhash']).bit_count()
            if distance<=12:near.append({'a':old['route'],'b':route,'distance':distance})
    sources.append({'route':route,'photo':recipe['photo'],'file':p['file'],'raw':raw,'pixel':pixel,'dhash':dhash})
assert not duplicates,f'Reused source photographs: {duplicates}'
assert not [x for x in near if x['distance']<=3],f'Perceptually identical source photographs: {near}'
rendered=[];seen={};pixel_duplicates=[]
if '--source-only' not in sys.argv:
    manifest=read('src/social-manifest.json')
    for route,entry in manifest.items():
        for channel,asset in entry['images'].items():
            file=R/'docs/media'/asset['file'];im=Image.open(file).convert('RGB')
            digest=hashlib.sha256(str(im.size).encode()+im.tobytes()).hexdigest()
            key=route+'/'+channel
            if digest in seen:pixel_duplicates.append([seen[digest],key])
            seen[digest]=key;rendered.append({'route':route,'channel':channel,'pixelSHA256':digest})
    assert not pixel_duplicates,f'Identical rendered cover images: {pixel_duplicates}'
report={'contents':len(recipes),'uniqueSourcePhotographs':len(set(x['pixel'] for x in sources)),
 'reusedSources':duplicates,'nearSourcePairs':near,'renderedImages':len(rendered),'identicalRenderedImages':pixel_duplicates,
 'sourceAudit':[{**x,'dhash':format(x['dhash'],'064x')} for x in sources],'renderAudit':rendered}
target=R/'output/verification/social/uniqueness-audit.json';target.parent.mkdir(parents=True,exist_ok=True)
target.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k not in ['sourceAudit','renderAudit']},ensure_ascii=False))
