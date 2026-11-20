const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const runtime=require('./runtime.cjs');

const root=path.join(__dirname,'..'),docs=path.join(root,'docs');
const catalog=require('./social-catalog.cjs')();
const recipes=JSON.parse(fs.readFileSync(path.join(root,'src/social-covers.json'),'utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'src/social-manifest.json'),'utf8'));
const r=runtime('const onSocialThumbnails='+JSON.stringify(manifest)+';');
const json=code=>JSON.parse(r.run('JSON.stringify('+code+')'));
const organizations=json('organizations'),ids=new Set(organizations.map(org=>org.id));
const results=[];
function check(label,fn){
  try{const details=fn();results.push({label,passed:true,...(details?{details}:{})});}
  catch(error){results.push({label,passed:false,error:error.message});}
}
function fileFor(url){
  const absolute=new URL(url,'https://daegu-care.oconia.co.kr');
  assert.equal(absolute.origin,'https://daegu-care.oconia.co.kr');
  const file=path.resolve(docs,'.'+decodeURIComponent(absolute.pathname));
  assert.ok(file.startsWith(path.resolve(docs)+path.sep),'Asset path must stay inside docs');
  return file;
}
function samePhoto(story,route){
  const body=json(`photoData[storyPhotoKey(findItem(${JSON.stringify(story.id)}))]`);
  const recipe=recipes[route];
  assert.ok(body&&!body.illustrative,'Article body must use an actual photograph');
  assert.ok(recipe,'Missing social cover recipe');
  const cover=catalog.photos[recipe.photo];
  assert.equal(body.file,cover.file,'Article body and social cover must depict the same selected case photograph');
  return {file:body.file,owner:body.owner||null};
}

check('confirmed institution count',()=>assert.equal(organizations.length,7));
for(const org of organizations){
  check('institution gallery ownership: '+org.id,()=>{
    const gallery=json(`galleryPhotos('member',${JSON.stringify(org.id)})`);
    if(org.id!=='woorihamkke')assert.ok(gallery.length,'Confirmed own-case photographs must remain available');
    const files=[];
    for(const item of gallery){
      assert.ok(item.key,'Built-in institution gallery must identify its provenance');
      const photo=json(`photoData[${JSON.stringify(item.key)}]`);
      assert.equal(photo.owner,org.id,'Another institution or regional reference must not appear as this institution\'s field gallery');
      assert.ok(!photo.illustrative,'Institution gallery must use actual photographs');
      assert.ok(fs.existsSync(path.join(docs,'media',photo.file)),'Missing gallery photograph');
      files.push(photo.file);
    }
    assert.equal(new Set(files).size,files.length,'Gallery aliases must not duplicate the same file');
    return {photos:gallery.length,files};
  });
  check('institution cover and metadata ownership: '+org.id,()=>{
    const keys=json(`onPagePhotoKeys(${JSON.stringify('member/'+org.id)},organizations.find(x=>x.id===${JSON.stringify(org.id)}))`);
    assert.ok(keys.length,'Institution metadata needs a real photograph');
    for(const key of keys){
      const photo=json(`photoData[${JSON.stringify(key)}]`);
      assert.ok(!photo.illustrative,'Institution metadata must use actual photographs');
      assert.equal(photo.owner,org.id,'Institution metadata must describe its own institution\'s photograph');
    }
    const recipe=recipes['member/'+org.id],photo=catalog.photos[recipe.photo];
    assert.equal(photo.owner,org.id,'Institution cover must use its own actual photograph');
    return {photoKeys:keys};
  });
  check('institution donation remains available and labelled as demonstration: '+org.id,()=>{
    const member=`organizations.find(x=>x.id===${JSON.stringify(org.id)})`;
    const card=r.run(`organizationCard(${member})`);
    assert.ok(card.includes('data-action="campaign-give" data-id="'+org.id+'"'),'Missing correct donation target');
    assert.match(card,/모금 시연/,'Unverified seed figures must remain explicitly identified as demonstration figures');
    const funding=r.run(`campaignFunding(${member},campaignFor(${member}))`);
    assert.match(funding,/결제 없이 후원 체험/,'Demonstration must not claim live payment processing');
  });
}

const institutionalRecords=new Set([...Array.from({length:8},(_,i)=>'n'+(i+1)),'e1','e2',...json('onResearchedNews.map(item=>item.id)')]);
for(const id of institutionalRecords){
  check('researched institutional record: '+id,()=>{
    const story=json(`findItem(${JSON.stringify(id)})`);
    assert.ok(story?.verified,'Legacy example ID must now identify a verified record');
    assert.ok(ids.has(story.memberId),'Verified record must belong to one of the seven confirmed institutions');
    const org=organizations.find(item=>item.id===story.memberId);
    assert.ok(story.org===org.name||org.aliases?.includes(story.org),'Record publisher must match its confirmed institution');
    assert.match(story.url||'',/^https:\/\//,'Verified record needs its public original source');
    assert.ok(!/예시 일정|미정/.test(story.date||''),'A real record must not retain an invented event date');
    const photo=samePhoto(story,'detail/'+id);
    if(photo.owner!==story.memberId){
      const context=json(`photoData[storyPhotoKey(findItem(${JSON.stringify(id)}))]`);
      assert.ok(context.relatedMemberIds?.includes(story.memberId),'Joint activity must identify this institution as an actual participant');
      assert.ok(context.depictedOrganization&&context.caption.includes(context.depictedOrganization),'Photograph must identify the depicted partner');
      assert.ok(story.body.includes(context.depictedOrganization),'Article must distinguish its participant from the photographed partner');
      assert.equal(context.source,story.url,'Joint activity must be supported by the same original event report');
    }
    assert.ok(!r.run(`detail(${JSON.stringify(id)})`).includes('/undefined'),'Real record must not link to an undefined story');
    return {institution:story.memberId,title:story.title,source:story.url,photo:photo.file};
  });
}

for(const id of ['p1','p2','p3','p4','p5','p6','r1','r2','r3']){
  check('public guidance body and thumbnail agree: '+id,()=>{
    const story=json(`findItem(${JSON.stringify(id)})`);
    assert.ok(story,'Missing guidance record');
    return samePhoto(story,'detail/'+id);
  });
}

check('one recipe per independently shared public content',()=>{
  assert.deepEqual(Object.keys(recipes).sort(),[...catalog.canonicalRoutes].sort());
  const files=new Map(),digests=new Map();
  for(const [route,recipe]of Object.entries(recipes)){
    const photo=catalog.photos[recipe.photo];
    assert.ok(photo&&!photo.illustrative,'Social thumbnail must use an actual photograph: '+route);
    assert.ok(!files.has(photo.file),'Repeated background file: '+files.get(photo.file)+' / '+route);
    files.set(photo.file,route);
    const digest=crypto.createHash('sha256').update(fs.readFileSync(path.join(docs,'media',photo.file))).digest('hex');
    assert.ok(!digests.has(digest),'Copied photograph under different filenames: '+digests.get(digest)+' / '+route);
    digests.set(digest,route);
  }
  return {independentContents:catalog.canonicalRoutes.length,distinctSourceFiles:files.size};
});

for(const route of catalog.routes){
  check('public view content and assets: '+route,()=>{
    const [area,id='',...rest]=route.split('/');
    const html=r.run(`pageMarkup(${JSON.stringify(area)},${JSON.stringify(id)},${JSON.stringify(rest)})`);
    assert.ok(typeof html==='string'&&html.length>20,'View failed to produce its content');
    if(route==='members'||route==='home')assert.ok(!html.includes('org-card-no-photo'),'Empty institution card');
    const meta=json(`onSeoPage(${JSON.stringify(route)})`);
    assert.ok(meta,'Missing public metadata');
    for(const photo of meta.photos){
      const original=json(`photoData[${JSON.stringify(photo.key)}]`);
      assert.ok(!original.illustrative,'Public metadata still exposes an AI illustration: '+photo.key);
      assert.ok(fs.existsSync(fileFor(photo.original.url)),'Missing public source photograph');
      assert.ok(fs.existsSync(fileFor(photo.primary.url)),'Missing public display photograph');
    }
    for(const match of html.matchAll(/\b(?:src|href)="(\/media\/[^"?#]+)"/g))assert.ok(fs.existsSync(fileFor(match[1])),'Missing content asset: '+match[1]);
    return {characters:html.length,metadataPhotos:meta.photos.length};
  });
}

const report={passed:results.every(result=>result.passed),scope:'Public content provenance and rendering contracts; no browser authentication or payments',institutions:organizations.length,publicViews:catalog.routes.length,independentContents:catalog.canonicalRoutes.length,checks:results.length,results};
const directory=path.join(root,'output/verification/content');fs.mkdirSync(directory,{recursive:true});
fs.writeFileSync(path.join(directory,'content-contracts.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,results:undefined,failures:results.filter(result=>!result.passed).slice(0,14)}));
if(!report.passed)process.exitCode=1;
