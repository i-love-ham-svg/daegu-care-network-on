const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync}=require('node:child_process');
const runtime = require('./runtime.cjs');
const root=path.join(__dirname,'..'),docs=path.join(root,'docs');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'src/social-manifest.json'),'utf8'));
const audit=JSON.parse(fs.readFileSync(path.join(root,'output/verification/social/pages-audit.json'),'utf8'));
const catalog=require('./social-catalog.cjs')();
const r=runtime('const onSocialThumbnails = '+JSON.stringify(manifest)+';');
const jsonRun=code=>JSON.parse(r.run('JSON.stringify('+code+')'));
const expectedAliases={
  'gallery/field-launch':'detail/daegu-declaration',
  'gallery/field-agreement':'detail/daegu-agreement',
  'gallery/field-conference':'detail/daegu-national-conference',
  'gallery/field-seminar':'detail/daegu-seminar',
  'gallery/field-naeiln':'detail/daegu-naeiln-visit',
  'gallery/field-garden':'detail/daegu-garden-visit',
  'detail/event-daegu-health-symposium':'detail/daegu-health-symposium',
  'detail/event-daegu-university-symposium':'detail/daegu-university-symposium',
  'detail/event-daegu-national-conference':'detail/daegu-national-conference',
  'detail/event-daegu-seminar':'detail/daegu-seminar'
};
assert.deepEqual(catalog.aliases,expectedAliases,'Only records of the same actual case may share a cover');
const canonicalRoute=route=>catalog.aliases[route]||route;
assert.equal(new Set(catalog.routes).size,catalog.routes.length,'Repeated physical route');
assert.deepEqual([...catalog.canonicalRoutes].sort(),[...new Set(catalog.routes.map(canonicalRoute))].sort(),'Canonical route catalog');
assert.deepEqual(Object.keys(manifest).sort(),[...catalog.canonicalRoutes].sort(),'Exactly one cover set per independent sharing content');
for(const [alias,target] of Object.entries(expectedAliases)){
  assert.ok(catalog.routes.includes(alias)&&catalog.routes.includes(target),'Missing physical case view: '+alias);
  assert.ok(!catalog.aliases[target],'Alias must resolve directly to a canonical story: '+alias);
  assert.equal(r.run(`canonicalShareRoute(${JSON.stringify(alias)})`),target,alias);
  const story=jsonRun(`findItem(${JSON.stringify(target.split('/')[1])})`);
  assert.ok(story?.verified&&!story.isLocal,'Alias target must be a verified historical record: '+alias);
  if(alias.startsWith('gallery/')){
    const key=alias.split('/')[1];
    assert.equal(story.photoKey,key,'Gallery must show the exact photograph recorded by the story: '+alias);
    assert.equal(manifest[target].photo,key,'Historical cover must use its own recorded photograph: '+alias);
    assert.equal(r.run(`onPublicPagePath(${JSON.stringify(alias)})`),'/gallery/'+key+'.html','Original gallery URL preserved');
    assert.deepEqual(jsonRun(`onPagePhotoKeys(${JSON.stringify(alias)},null)`),[key],'Gallery still displays its original photograph');
    const gallery=r.run(`galleryPage(${JSON.stringify(key)})`);
    const original=jsonRun(`onPreviewPhoto(${JSON.stringify(key)})`);
    assert.ok(gallery.includes(original.primary.file)||gallery.includes(original.original.file),'Original gallery photograph remains visible: '+alias);
  }else{
    const event=jsonRun(`findItem(${JSON.stringify(alias.split('/')[1])})`);
    assert.ok(event?.past&&event.type==='event','Only a copied historical event may alias a story: '+alias);
    assert.equal(event.storyId,story.id,'Event belongs to the same source story: '+alias);
    for(const field of ['title','date','body','photoKey','source'])assert.equal(event[field],story[field],alias+' changed '+field);
    assert.notEqual(r.run(`onPublicPagePath(${JSON.stringify(alias)})`),r.run(`onPublicPagePath(${JSON.stringify(target)})`),'Historical event view remains accessible');
  }
  assert.deepEqual(jsonRun(`shareTarget(${JSON.stringify(alias)})`),jsonRun(`shareTarget(${JSON.stringify(target)})`),'Share target resolves to the same case: '+alias);
  const aliasSeo=jsonRun(`onSeoPage(${JSON.stringify(alias)})`),targetSeo=jsonRun(`onSeoPage(${JSON.stringify(target)})`);
  for(const field of ['title','description','url'])assert.equal(aliasSeo[field],targetSeo[field],alias+' canonical '+field);
  for(const [channel] of catalog.channels)assert.deepEqual(jsonRun(`socialCover(${JSON.stringify(alias)},${JSON.stringify(channel)})`),jsonRun(`socialCover(${JSON.stringify(target)},${JSON.stringify(channel)})`),alias+'/'+channel+' cover');
  for(const channel of ['facebook','kakao','linkedin','x'])assert.equal(r.run(`socialShareAddress(${JSON.stringify(alias)},${JSON.stringify(channel)})`),r.run(`socialShareAddress(${JSON.stringify(target)},${JSON.stringify(channel)})`),alias+'/'+channel+' share URL');
}
const meta=(html,name)=>html.match(new RegExp('<meta (?:property|name)="'+name+'" content="([^"]*)"'))?.[1];
const publicFile=(url)=>path.join(docs,new URL(url,'https://daegu-care.oconia.co.kr').pathname);
const images=new Set();
const missingPhotoVariants=new Set();
for(const page of audit.generated){
  const html=fs.readFileSync(path.join(docs,page.path),'utf8');
  assert.equal((html.match(/property="og:image"/g)||[]).length,1,page.path);
  assert.equal(meta(html,'og:image'),page.image,page.path);
  assert.equal(meta(html,'twitter:image'),manifest[canonicalRoute(page.route)].images.x.url,page.path);
  assert.ok(meta(html,'og:title')&&meta(html,'og:description'),page.path);
  assert.ok(html.includes('<link rel="canonical" href="'+page.canonical+'">'),page.path);
  assert.ok(!meta(html,'og:url').includes('#/'),page.path);
  assert.ok(fs.existsSync(publicFile(page.image)),page.image);
  for(const match of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g))assert.ok(fs.existsSync(path.join(docs,match[1])),match[1]);
}
for(const [route,entry] of Object.entries(manifest)){
  const photo=catalog.photos[entry.photo];
  assert.ok(photo&&!photo.illustrative,route);
  assert.ok(![3,4].includes(photo.license),route+' disallows photo modification');
  assert.equal(Object.keys(entry.images).length,catalog.channels.length,route);
  assert.ok(entry.headline.length&&entry.subtitle&&entry.credit,route);
  for(const [channel,asset] of Object.entries(entry.images)){
    const row=catalog.channels.find(x=>x[0]===channel);
    assert.deepEqual([asset.width,asset.height],[row[3],row[4]],route+'/'+channel);
    const bytes=fs.readFileSync(publicFile(asset.url));
    assert.equal(bytes[0],255);assert.equal(bytes[1],216);
    assert.ok(bytes.length>5000&&bytes.length<2*1024*1024,route+'/'+channel);
    images.add(asset.file);
  }
  const target=r.run(`shareTarget(${JSON.stringify(route)})`);
  for(const channel of ['facebook','kakao','linkedin','x']){
    const share=r.run(`socialShareAddress(${JSON.stringify(route)},${JSON.stringify(channel)})`);
    assert.ok(new URL(share).pathname.startsWith('/share/'+channel+'/'),share);
    assert.ok(fs.existsSync(publicFile(share)),share);
  }
  const seo=r.run(`onSeoPage(${JSON.stringify(route)})`);
  for(const photo of seo.photos)for(const asset of [photo.original,photo.primary,...photo.variants])if(!fs.existsSync(publicFile(asset.url)))missingPhotoVariants.add(asset.file);
  assert.equal(new URL(target.url).hash,'',route);
  assert.ok(fs.existsSync(publicFile(target.url==='https://daegu-care.oconia.co.kr/'?target.url+'index.html':target.url)),route);
}
assert.deepEqual([...missingPhotoVariants],[],'Missing source photo variants');
for(const route of ['my','admin','admin-gifts','project-apply/private','detail/local-private','member/private'])assert.equal(r.run(`shareTarget(${JSON.stringify(route)})`),null,route);
assert.equal(r.run('organizations.length'),7);
for(const org of jsonRun('organizations')){
  const card=r.run(`organizationCard(organizations.find(x=>x.id===${JSON.stringify(org.id)}))`);
  assert.ok(card.includes('<img '),'Every confirmed institution must show a verified case photograph: '+org.id);
  assert.ok(!card.includes('org-card-no-photo'),'No empty institution photo block: '+org.id);
}
for(const id of ['suseong-nutrition-sharing','sdl-geochang-workshop']){
  const story=jsonRun(`findItem(${JSON.stringify(id)})`);
  assert.ok(story?.verified&&story.url?.startsWith('https://'),'Researched activity must retain its source: '+id);
  assert.ok(jsonRun(`newsForMember(organizations.find(x=>x.id===${JSON.stringify(story.memberId)}))`).some(x=>x.id===id),'Activity visible in its institution profile: '+id);
}
assert.deepEqual(JSON.parse(r.run(`JSON.stringify(directoryMembers().filter(x=>matchesDirectoryService(x,'병원동행')).map(x=>x.id))`)),['daegu-dounuri','woorihamkke','daegu-care','modoo-happy']);
assert.ok(r.run(`allMembers().some(x=>x.id==='daegu-medical')&&allMembers().some(x=>x.id==='byeolbom')`));
assert.equal(r.run(`DBKEY`),'daegu-care-on-demo-v1');
const existing={posts:[{id:'existing-news',type:'news',isLocal:true,status:'approved',org:'사회복지디자인연구소 사회적협동조합',title:'기존 활동 기록'}],applications:[],gifts:[{id:'existing-gift',memberId:'daegu-medical',amount:12000}],projects:[],affiliations:[],launch:[]};
const preserved=runtime('const onSocialThumbnails = '+JSON.stringify(manifest)+';',{'daegu-care-on-demo-v1':JSON.stringify(existing)});
assert.equal(preserved.run('db.gifts[0].id'),'existing-gift');
assert.equal(preserved.run('db.gifts[0].amount'),12000);
assert.equal(preserved.run('db.posts[0].title'),'기존 활동 기록');
assert.ok(preserved.run(`newsForMember(organizations.find(x=>x.id==='welfare-design')).some(x=>x.id==='existing-news')`));
const css=fs.readFileSync(path.join(root,'src/styles.css'),'utf8');
assert.ok(css.includes('[data-action="share"].icon-btn:active')&&css.includes('background:transparent!important'));
const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
new vm.Script('const onSocialThumbnails = '+JSON.stringify(manifest)+';\n'+app);
const unused=fs.readdirSync(path.join(docs,'media/social')).filter(x=>x.endsWith('.jpg')&&!images.has('social/'+x));
// Published image/script URLs may still be referenced by cached SNS messages.
const published=new Set(execFileSync('git',['ls-tree','-r','--name-only','HEAD','--','docs/media/social','docs/assets'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean));
for(const relative of published){
  const destination=path.resolve(root,relative);
  if(!destination.startsWith(path.resolve(docs)+path.sep))throw new Error('Invalid published asset path');
  if(!fs.existsSync(destination))fs.writeFileSync(destination,execFileSync('git',['show','HEAD:'+relative],{cwd:root,maxBuffer:5*1024*1024}));
}
let removed=0;
for(const file of unused)if(!published.has('docs/media/social/'+file)){fs.unlinkSync(path.join(docs,'media/social',file));removed++}
const keepAssets=new Set([`site-${audit.version}.js`,`site-${audit.version}.css`]);
for(const file of fs.readdirSync(path.join(docs,'assets')))if(/^site-[a-f0-9]{12}\.(js|css)$/.test(file)&&!keepAssets.has(file)&&!published.has('docs/assets/'+file))fs.unlinkSync(path.join(docs,'assets',file));
console.log(JSON.stringify({passed:true,routes:Object.keys(manifest).length,physicalRoutes:catalog.routes.length,sameCaseAliases:Object.keys(catalog.aliases).length,pages:audit.pages,images:images.size,privateRoutes:'excluded',confirmedOrganizations:7,hospitalEscort:4,unusedBuildFilesRemoved:removed,publishedAssetURLsPreserved:published.size}));
