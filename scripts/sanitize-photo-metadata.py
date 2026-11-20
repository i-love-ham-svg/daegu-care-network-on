"""Remove hidden location metadata while preserving the actual case image pixels."""
from pathlib import Path
import hashlib,json,shutil
from PIL import Image
R=Path(__file__).resolve().parents[1]
catalog=json.loads((R/'output/work/catalog.json').read_text(encoding='utf-8'))
recipes=json.loads((R/'src/social-covers.json').read_text(encoding='utf-8'))
files={catalog['photos'][r['photo']]['file'] for r in recipes.values()}
removed=0
def pixel_hash(file):
    with Image.open(file) as im:return hashlib.sha256(im.convert('RGB').tobytes()).hexdigest()
for relative in files:
    file=(R/'docs/media'/relative).resolve()
    assert file.is_relative_to((R/'docs/media').resolve())
    with Image.open(file) as im:
        exif=im.getexif()
        if not exif.get(34853):continue
        orientation=exif.get(274,1);fmt=im.format
    before=pixel_hash(file)
    candidate=R/'output/work/metadata-clean'/file.name
    candidate.parent.mkdir(parents=True,exist_ok=True)
    if fmt in ('JPEG','MPO'):
        data=file.read_bytes();assert data[:2]==b'\xff\xd8'
        out=bytearray(data[:2]);pos=2
        if orientation!=1:
            minimal=Image.Exif();minimal[274]=orientation;payload=minimal.tobytes()
            out+=b'\xff\xe1'+(len(payload)+2).to_bytes(2,'big')+payload
        while pos<len(data):
            start=pos;assert data[pos]==255
            while data[pos]==255:pos+=1
            marker=data[pos];pos+=1
            if marker==0xda:
                scan_end=data.find(b'\xff\xd9',pos)
                assert scan_end>=0
                out+=data[start:scan_end+2];break
            if marker==0xd9:out+=data[start:pos];break
            if marker in range(0xd0,0xd8) or marker==1:out+=data[start:pos];continue
            length=int.from_bytes(data[pos:pos+2],'big');end=pos+length
            if marker!=0xe1 and not (marker==0xe2 and data[pos+2:pos+6]==b'MPF\x00'):out+=data[start:end]
            pos=end
        candidate.write_bytes(out)
    else:
        with Image.open(file) as im:clean=im.copy()
        clean.info.clear()
        clean.save(candidate,format=fmt,**({'lossless':True} if fmt=='WEBP' else {}))
    assert pixel_hash(candidate)==before,'Visible pixels changed: '+relative
    assert not Image.open(candidate).getexif().get(34853)
    shutil.copyfile(candidate,file)
    candidate.unlink()
    removed+=1
print(json.dumps({'sourcePhotosChecked':len(files),'locationMetadataRemoved':removed,'visiblePixelsPreserved':True}))
