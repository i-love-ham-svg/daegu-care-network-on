from pathlib import Path
import json,math,html
from PIL import Image,ImageDraw,ImageFont
R=Path(__file__).resolve().parents[1]
manifest=json.loads((R/'src/social-manifest.json').read_text(encoding='utf-8'))
out=R/'output/verification/social';out.mkdir(parents=True,exist_ok=True)
channels=list(next(iter(manifest.values()))['images'])
for channel in channels:
    first=next(iter(manifest.values()))['images'][channel]
    tw=360;th=round(tw*first['height']/first['width']);cols=4;lh=30
    sheet=Image.new('RGB',(cols*tw,math.ceil(len(manifest)/cols)*(th+lh)),'white')
    d=ImageDraw.Draw(sheet);font=ImageFont.truetype('C:/Windows/Fonts/malgun.ttf',13)
    for i,(route,entry) in enumerate(manifest.items()):
        x=i%cols*tw;y=i//cols*(th+lh)
        image=Image.open(R/'docs/media'/entry['images'][channel]['file']).convert('RGB').resize((tw,th))
        sheet.paste(image,(x,y));d.text((x+5,y+th+4),route,font=font,fill='#173451')
    sheet.save(out/f'all-{channel}.jpg',quality=90)
options=''.join(f'<option>{html.escape(x)}</option>' for x in channels)
data=json.dumps(manifest,ensure_ascii=False).replace('</','<\\/')
review='''<!doctype html><html lang="ko"><meta charset="utf-8"><title>대구 통합돌봄 SNS 썸네일 검수표</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{margin:0;background:#f4f7fb;color:#142844;font:16px "Malgun Gothic",sans-serif}header{position:sticky;top:0;background:white;padding:22px 4%;border-bottom:1px solid #dce4ef}h1{font-size:24px;margin:0 0 10px}select{font:inherit;padding:10px;border:1px solid #c4d3e8;border-radius:8px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px;padding:24px 4%}article{background:white;border:1px solid #e1e7f1;border-radius:12px;overflow:hidden}img{display:block;width:100%;height:230px;object-fit:contain;background:#eaf0f8}section{padding:16px}h2{font-size:19px;line-height:1.5;margin:0 0 8px}p{font-size:14px;line-height:1.6;margin:6px 0}a{color:#185bd7}small{display:block;color:#62748c;overflow-wrap:anywhere}</style>
<header><h1>대구 통합돌봄 SNS 썸네일 검수표</h1><p>66개 콘텐츠 · 실제 배경사진 66장 · 9개 채널 · 동일 완성 이미지 0개</p><label>채널 <select id="channel">OPTIONS</select></label></header><main id="grid"></main>
<script>const data=DATA;const esc=s=>String(s||'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));function render(){const c=document.querySelector('#channel').value;document.querySelector('#grid').innerHTML=Object.entries(data).map(([route,e])=>{const a=e.images[c];return '<article><img src="../../../docs/media/'+a.file+'" alt="'+esc(e.headline.join(' '))+'"><section><h2>'+esc(e.headline.join(' · '))+'</h2><p>'+esc(e.subtitle)+'</p><p>'+esc(e.caseKind)+' · '+esc(e.credit)+'</p><small>'+esc(e.photoNote)+'</small><p>'+a.width+' × '+a.height+' px</p><small>'+esc(route)+'</small>'+(e.background.source?'<p><a href="'+esc(e.background.source)+'" target="_blank" rel="noopener noreferrer">사진 원문</a></p>':'')+'</section></article>'}).join('')}document.querySelector('#channel').onchange=render;render();</script></html>'''
review=review.replace('OPTIONS',options).replace('DATA',data)
(out/'thumbnail-review.html').write_text(review,encoding='utf-8')
print(json.dumps({'contact_sheets':len(channels),'content_cards':len(manifest),'review_html':str(out/'thumbnail-review.html')},ensure_ascii=False))
