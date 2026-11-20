from pathlib import Path
import json
from PIL import Image
root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'src/social-manifest.json').read_text(encoding='utf-8'))
count=0
for route,entry in manifest.items():
    for channel,asset in entry['images'].items():
        with Image.open(root/'docs/media'/asset['file']) as image:
            assert image.format=='JPEG',(route,channel)
            assert image.size==(asset['width'],asset['height']),(route,channel)
            image.verify()
        count+=1
print(json.dumps({'verified_jpegs':count,'routes':len(manifest)}))
