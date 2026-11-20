from pathlib import Path
import json,math,html
from PIL import Image,ImageDraw,ImageFont
R=Path(__file__).resolve().parents[1]
manifest=json.loads((R/'src/social-manifest.json').read_text(encoding='utf-8'))
catalog_path=R/'output/work/catalog.json'
catalog=json.loads(catalog_path.read_text(encoding='utf-8')) if catalog_path.exists() else {}
aliases=catalog.get('aliases',{})
content_count=len(manifest)
image_count=sum(len(entry['images']) for entry in manifest.values())
photo_count=len({entry['background']['file'] for entry in manifest.values()})
physical_count=len(catalog.get('routes',manifest))
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
alias_data=json.dumps(aliases,ensure_ascii=False).replace('</','<\\/')
summary=f'{content_count}개 독립 공유 콘텐츠 · 실제 배경사진 {photo_count}장 · {len(channels)}개 채널 · 썸네일 {image_count}장'
alias_note=f'{physical_count}개 공개 화면 중 같은 실제 사례를 다루는 {len(aliases)}개 사진·일정 화면은 해당 소식의 공유 주소와 표지를 함께 사용합니다. 사진 원본 보기와 다운로드는 유지합니다.'
review='''<!doctype html><html lang="ko"><meta charset="utf-8"><title>대구 통합돌봄 SNS 썸네일 검수표</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{margin:0;background:#f4f7fb;color:#142844;font:16px "Malgun Gothic",sans-serif}header{position:sticky;top:0;background:white;padding:22px 4%;border-bottom:1px solid #dce4ef}h1{font-size:24px;margin:0 0 10px}select{font:inherit;padding:10px;border:1px solid #c4d3e8;border-radius:8px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px;padding:24px 4%}article{background:white;border:1px solid #e1e7f1;border-radius:12px;overflow:hidden}img{display:block;width:100%;height:230px;object-fit:contain;background:#eaf0f8}section{padding:16px}h2{font-size:19px;line-height:1.5;margin:0 0 8px}p{font-size:14px;line-height:1.6;margin:6px 0}a{color:#185bd7}small{display:block;color:#62748c;overflow-wrap:anywhere}</style>
<header><h1>대구 통합돌봄 SNS 썸네일 검수표</h1><p>__SUMMARY__</p><p>__ALIAS_NOTE__</p><details><summary>같은 사례의 공유 연결</summary><div id="aliases"></div></details><label>채널 <select id="channel">__OPTIONS__</select></label></header><main id="grid"></main>
<script>const data=__MANIFEST__;const aliases=__ALIASES__;const esc=s=>String(s||'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));document.querySelector('#aliases').innerHTML=Object.entries(aliases).map(([from,to])=>'<p><small>'+esc(from)+' → '+esc(to)+'</small></p>').join('')||'<p>별도 연결 없음</p>';function render(){const c=document.querySelector('#channel').value;document.querySelector('#grid').innerHTML=Object.entries(data).map(([route,e])=>{const a=e.images[c];return '<article><img src="../../../docs/media/'+a.file+'" alt="'+esc(e.headline.join(' '))+'"><section><h2>'+esc(e.headline.join(' · '))+'</h2><p>'+esc(e.subtitle)+'</p><p>'+esc(e.caseKind)+' · '+esc(e.credit)+'</p><small>'+esc(e.photoNote)+'</small><p>'+a.width+' × '+a.height+' px</p><small>'+esc(route)+'</small>'+(e.background.source?'<p><a href="'+esc(e.background.source)+'" target="_blank" rel="noopener noreferrer">사진 원문</a></p>':'')+'</section></article>'}).join('')}document.querySelector('#channel').onchange=render;render();</script></html>'''
review=review.replace('__OPTIONS__',options).replace('__SUMMARY__',html.escape(summary)).replace('__ALIAS_NOTE__',html.escape(alias_note)).replace('__MANIFEST__',data).replace('__ALIASES__',alias_data)
(out/'thumbnail-review.html').write_text(review,encoding='utf-8')
print(json.dumps({'contact_sheets':len(channels),'content_cards':content_count,'physical_routes':physical_count,'share_aliases':len(aliases),'background_photos':photo_count,'images':image_count,'review_html':str(out/'thumbnail-review.html')},ensure_ascii=False))
