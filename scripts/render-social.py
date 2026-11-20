"""Render actual field photographs with editorial type; never invent case imagery."""
from pathlib import Path
import hashlib, json, math, sys, subprocess
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT=Path(__file__).resolve().parents[1]
DATA=json.loads((ROOT/'output/work/catalog.json').read_text(encoding='utf-8'))
RECIPES=json.loads((ROOT/'src/social-covers.json').read_text(encoding='utf-8'))
subprocess.run([sys.executable,str(ROOT/'scripts/verify-unique.py'),'--source-only'],check=True)
DEST=ROOT/'docs/media/social'
PREVIEW=sys.argv[sys.argv.index('--preview-route')+1] if '--preview-route' in sys.argv else None
if PREVIEW:
    DATA['canonicalRoutes']=[PREVIEW]
    DEST=ROOT/'output/work/thumbnail-preview'
DEST.mkdir(parents=True,exist_ok=True)
FONT='C:/Windows/Fonts/malgunbd.ttf'
REGULAR='C:/Windows/Fonts/malgun.ttf'
RENDER_VERSION=hashlib.sha256(Path(__file__).read_bytes().replace(b'\r\n',b'\n')).hexdigest()[:12]
SIZES=[('facebook',1200,630),('kakao',800,400),('linkedin',1200,627),('x',1200,600),('naver',1080,1080),('band',1080,1080),('instagram-feed',1080,1350),('instagram-story',1080,1920),('youtube',1280,720)]
selected_channels=None
if '--channels' in sys.argv:
    selected_channels=set(sys.argv[sys.argv.index('--channels')+1].split(','))
    if not selected_channels or selected_channels-set(c for c,_,_ in SIZES):
        raise ValueError('Unknown thumbnail channel')
selected_routes=None
if '--routes' in sys.argv:
    selected_routes=set(sys.argv[sys.argv.index('--routes')+1].split(','))
    if not selected_routes or selected_routes-set(DATA['canonicalRoutes']):
        raise ValueError('Unknown content route')
previous_path=ROOT/'src/social-manifest.json'
previous=json.loads(previous_path.read_text(encoding='utf-8')) if previous_path.exists() else {}
previous_audit_path=ROOT/'output/verification/social/image-audit.json'
previous_audit=json.loads(previous_audit_path.read_text(encoding='utf-8')) if previous_audit_path.exists() else []
previous_rows={(row['route'],row['channel']):row for row in previous_audit}

# Materialize the existing article image variants as well as the social covers.
variant_count=0
for original_file,sizes in DATA['imagePreviews'].items():
    for label,(relative,width,height,mime) in sizes.items():
        destination=ROOT/'docs/media'/relative
        if destination.exists():continue
        original=Image.open(ROOT/'docs/media'/original_file).convert('RGB')
        destination.parent.mkdir(parents=True,exist_ok=True)
        variant=ImageOps.fit(original,(width,height))
        variant.save(destination,quality=85)
        variant_count+=1
if '--variants-only' in sys.argv:
    print(json.dumps({'source_photo_variants_created':variant_count}))
    sys.exit(0)

def font(size,bold=True):
    return ImageFont.truetype(FONT if bold else REGULAR,round(size))

def fit_font(draw,lines,initial,width,minimum):
    size=initial
    while size>minimum and max(draw.textlength(line,font=font(size)) for line in lines)>width:
        size-=1
    if max(draw.textlength(line,font=font(size)) for line in lines)>width:
        raise ValueError('Title exceeds safe area: '+str(lines))
    return font(size)

manifest={}; report=[]; samples=[]
for route in DATA['canonicalRoutes']:
    recipe=RECIPES[route]
    if selected_routes is not None and route not in selected_routes:
        old=previous.get(route)
        if not old or any(old.get(key)!=value for key,value in recipe.items()):
            raise ValueError(f'Cannot retain changed content: {route}')
        manifest[route]=old
        report.extend({**previous_rows[(route,channel)],'retained':True} for channel,_,_ in SIZES)
        continue
    photo=DATA['photos'][recipe['photo']]
    assert not photo.get('illustrative') and photo.get('license') not in [3,4],route
    original=Image.open(ROOT/'docs/media'/photo['file']).convert('RGB')
    title=recipe['headline']
    assert 1<=len(title)<=3,route
    slug=route.replace('/','--')
    entry={**recipe,'background':{k:photo.get(k,'') for k in ['file','caption','title','publisher','source','owner','width','height']},'images':{}}
    for channel,w,h in SIZES:
        if selected_channels is not None and channel not in selected_channels:
            old=previous.get(route)
            if not old or any(old.get(key)!=recipe.get(key) for key in ['photo','headline','subtitle','category','credit','photoNote','layout','focus','reference','referenceLabel','caseKind']):
                raise ValueError(f'Cannot retain a changed cover: {route}/{channel}')
            asset=old['images'][channel]
            if not (ROOT/'docs/media'/asset['file']).is_file():
                raise ValueError(f'Missing retained image: {route}/{channel}')
            entry['images'][channel]=asset
            report.append({**previous_rows[(route,channel)],'retained':True})
            continue
        # Each canvas is an actual case photograph, with a central title safe area.
        scale=w/1200
        channel_layout=recipe.get('channelLayouts',{}).get(channel,{})
        focus=channel_layout.get('focus',recipe.get('focus',[.5,.40]))
        im=ImageOps.fit(original,(w,h),centering=tuple(focus))
        top_text=channel_layout.get('titleY',1)<.4 or (recipe.get('layout')=='top' and h/w<1)
        overlay=Image.new('RGBA',(w,h))
        od=ImageDraw.Draw(overlay)
        for y in range(h):
            ratio=y/h
            if top_text:
                alpha=round(215*max(0,min(1,(.67-ratio)/.58)))
                alpha=max(alpha,round(175*max(0,min(1,(ratio-.84)/.16))))
            elif h/w>1.1:
                alpha=round(230*max(0,min(1,(ratio-.30)/.48)))
            else:
                alpha=round(238*max(0,min(1,(ratio-.26)/.62)))
            od.line((0,y,w,y),fill=(7,23,43,alpha))
        # A subtle upper gradient keeps branding readable without a solid panel.
        if not top_text:
            for y in range(round(h*.25)):
                alpha=round(105*(1-y/(h*.25)))
                od.line((0,y,w,y),fill=(7,23,43,alpha))
        im=Image.alpha_composite(im.convert('RGBA'),overlay)
        d=ImageDraw.Draw(im)
        margin=round(w*.052)
        portrait=h/w>1.1
        top=round(h*channel_layout.get('brandY',.19 if h/w>1.6 else .06))
        brand_font=font(23*scale)
        d.text((margin,top),'ON  대구 통합돌봄네트워크',font=brand_font,fill='white',stroke_width=1,stroke_fill='#18314d')
        # Main message remains inside the central square for story/reel crops.
        initial=96*scale if portrait else (64 if len(title)==3 else 76)*scale
        minimum=48*scale if portrait else 44*scale
        heading=fit_font(d,title,initial,w-2*margin,minimum)
        lineheight=round(heading.size*1.25)
        heading_y=round(h*.60) if h/w>=1 else round(h*.43)
        if recipe.get('layout')=='top' and h/w<1:heading_y=round(h*.22)
        if channel=='band':heading_y=round(h*.62)
        if len(title)==3: heading_y-=round(lineheight*.45)
        if 'titleY' in channel_layout:heading_y=round(h*channel_layout['titleY'])
        category_y=heading_y-round(58*scale)
        category=recipe.get('referenceLabel') or recipe['category']+(' · 분야 참고사진' if recipe.get('reference') else '')
        category_font=fit_font(d,[category],29*scale,w-2*margin,19*scale)
        d.text((margin,category_y),category,font=category_font,fill='#a4f0d3',stroke_width=1,stroke_fill='#173746')
        for i,line in enumerate(title):
            text_color='#a4f0d3' if i==len(title)-1 and len(title)>1 and channel!='band' else 'white'
            d.text((margin,heading_y+i*lineheight),line,font=heading,fill=text_color,stroke_width=max(1,round(scale*1.5)),stroke_fill='#10233b')
        subtitle_y=heading_y+len(title)*lineheight+round(20*scale)
        if recipe.get('layout')=='top' and h/w<1:subtitle_y=round(h*.82)
        subtitle_font=fit_font(d,[recipe['subtitle']],30*scale,w-2*margin,18*scale)
        d.text((margin,subtitle_y),recipe['subtitle'],font=subtitle_font,fill='#e5edf8',stroke_width=1,stroke_fill='#10233b')
        note_y=max(subtitle_y+round(53*scale),round(h*.91 if not portrait else h*.76))
        short_credit=recipe['credit'].replace('대구광역 통합돌봄 네트워크 경과보고','통합돌봄 경과보고').replace('달구벌사회적협동조합연합회 2025년 활동보고','연합회 2025 활동보고')
        footer=recipe.get('caseKind','실제 활동사진')+' · 사진: '+short_credit
        note_font=fit_font(d,[footer],19*scale,w-2*margin,10*scale)
        note_height=note_font.size*1.5
        if note_y+note_height>h-margin*.35:
            raise ValueError(f'Footer clipped: {route}/{channel}')
        d.text((margin,note_y),footer,font=note_font,fill='#cbd6e6',stroke_width=1 if top_text else 0,stroke_fill='#10233b')
        # Versioned names prevent old SNS image caches from masking a new cover.
        identity=hashlib.sha256((json.dumps(recipe,ensure_ascii=False)+f'{channel}:{w}:{h}:{RENDER_VERSION}').encode()+original.tobytes()).hexdigest()[:10]
        filename=f'{slug}-{channel}-{identity}.jpg'
        target=DEST/filename
        im.convert('RGB').save(target,quality=85,optimize=True,subsampling=2)
        alt=' · '.join(title)+' · '+recipe['subtitle']+' · '+recipe['photoNote']
        asset={'file':'social/'+filename,'width':w,'height':h,'type':'image/jpeg','url':'https://daegu-care.oconia.co.kr/media/social/'+filename,'alt':alt}
        entry['images'][channel]=asset
        report.append({'route':route,'channel':channel,'file':asset['file'],'width':w,'height':h,'photo':recipe['photo'],'headline_size':heading.size,'bytes':target.stat().st_size,'fullBleedOriginalPhoto':True,'focus':focus,'insetPhotographs':0,'blurredPhotographs':0})
    manifest[route]=entry

if PREVIEW:
    (ROOT/'output/work/thumbnail-preview/manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'preview':PREVIEW,'images':len(report),'directory':str(DEST)},ensure_ascii=False))
    sys.exit(0)
(ROOT/'src/social-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
proof=ROOT/'output/verification/social';proof.mkdir(parents=True,exist_ok=True)
(proof/'image-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
# Contact sheets cover every route in each distinct layout, with readable labels.
for channel in ['facebook','instagram-feed','instagram-story','youtube']:
    cols=4;tw=360;th=round(tw*dict((c,h/w) for c,w,h in SIZES)[channel]);label_h=30
    rows=math.ceil(len(manifest)/cols)
    sheet=Image.new('RGB',(cols*tw,rows*(th+label_h)),'white');draw=ImageDraw.Draw(sheet)
    for i,(route,entry) in enumerate(manifest.items()):
        x=i%cols*tw;y=i//cols*(th+label_h)
        thumb=Image.open(ROOT/'docs/media'/entry['images'][channel]['file']).resize((tw,th))
        sheet.paste(thumb,(x,y));draw.text((x+5,y+th+4),route,font=font(13,False),fill='#18314d')
    sheet.save(proof/f'all-{channel}.jpg',quality=88)
print(json.dumps({'routes':len(manifest),'images':len(report),'bytes':sum(r['bytes'] for r in report),'minimum_landscape_title_size':min(r['headline_size'] for r in report if r['channel']=='facebook')},ensure_ascii=False))
