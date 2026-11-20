const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync}=require('node:child_process');
const runtime = require('./runtime.cjs');
const catalog = require('./social-catalog.cjs')();
const root=path.join(__dirname,'..'),docs=path.join(root,'docs');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'src/social-manifest.json'),'utf8'));
const recipes=JSON.parse(fs.readFileSync(path.join(root,'src/social-covers.json'),'utf8'));
const sourceAudit=JSON.parse(fs.readFileSync(path.join(root,'output/verification/social/uniqueness-audit.json'),'utf8'));
const auditedSources=new Map(sourceAudit.sourceAudit.map(entry=>[entry.route,entry.raw]));
const sourceHashes=new Map(),renderHashes=new Map();
for(const route of catalog.canonicalRoutes){
  const entry=manifest[route],recipe=recipes[route];
  if(!entry||!recipe)throw new Error('Missing content cover: '+route);
  for(const key of Object.keys(recipe))if(JSON.stringify(entry[key])!==JSON.stringify(recipe[key]))throw new Error('Regenerate changed cover: '+route+'/'+key);
  const photo=catalog.photos[entry.photo];
  const digest=crypto.createHash('sha256').update(fs.readFileSync(path.join(docs,'media',photo.file))).digest('hex');
  if(auditedSources.get(route)!==digest)throw new Error('Source photo changed; run metadata/uniqueness checks: '+route);
  if(sourceHashes.has(digest))throw new Error('Repeated source photograph: '+sourceHashes.get(digest)+' / '+route);
  sourceHashes.set(digest,route);
  for(const [channel,image] of Object.entries(entry.images)){
    const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(docs,'media',image.file))).digest('hex');
    if(renderHashes.has(hash))throw new Error('Repeated thumbnail: '+renderHashes.get(hash)+' / '+route+'/'+channel);
    renderHashes.set(hash,route+'/'+channel);
  }
}
const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8').replace(/\r\n/g,'\n');
const contentPhotos=JSON.parse(fs.readFileSync(path.join(root,'src/content-photos.json'),'utf8'));
const researchedNews=JSON.parse(fs.readFileSync(path.join(root,'src/researched-news.json'),'utf8'));
const css=fs.readFileSync(path.join(root,'src/styles.css'),'utf8').replace(/\r\n/g,'\n').trimEnd()+'\n';
const version=crypto.createHash('sha256').update(app+css+JSON.stringify(manifest)+JSON.stringify(contentPhotos)+JSON.stringify(researchedNews)).digest('hex').slice(0,12);
const r=runtime('const onSocialThumbnails = '+JSON.stringify(manifest)+';');
for(const organization of catalog.organizations){
  if(!r.run(`Boolean(campaignFor(organizations.find(x=>x.id===${JSON.stringify(organization.id)})))`)){
    throw new Error('Confirmed institution is missing its donation campaign: '+organization.id);
  }
}
const shell=fs.readFileSync(path.join(root,'src/shell.html'),'utf8').replaceAll('{{VERSION}}',version);
fs.mkdirSync(path.join(docs,'assets'),{recursive:true});
fs.writeFileSync(path.join(docs,`assets/site-${version}.js`),'const onContentCasePhotos = '+JSON.stringify(contentPhotos)+';\nconst onResearchedNews = '+JSON.stringify(researchedNews)+';\nconst onSocialThumbnails = '+JSON.stringify(manifest)+';\n'+app);
fs.writeFileSync(path.join(docs,`assets/site-${version}.css`),css);
const generated=[];
function page(route,channel='facebook',legacy=false,versioned=false,outputOverride='') {
  const canonicalRoute=catalog.aliases[route]||route;
  if(!manifest[canonicalRoute])throw new Error('Missing cover: '+route);
  const meta=r.run(`onSeoPage(${JSON.stringify(route)})`);
  if(!meta)throw new Error('Missing metadata: '+route);
  const canonical=r.run(`onPublicPagePath(${JSON.stringify(route)})`);
  const relative=canonical==='/'?'/index.html':canonical;
  const publicPath=outputOverride||(versioned?new URL(r.run(`socialShareAddress(${JSON.stringify(route)},${JSON.stringify(channel)})`)).pathname:legacy?'/share/'+channel+'.html':channel==='facebook'?relative:'/share/'+channel+relative);
  const sharePage=publicPath.startsWith('/share/');
  if(sharePage){meta.socialCover=manifest[canonicalRoute].images[channel];meta.shareURL=new URL(publicPath,meta.url).href;}
  const tags='<meta id="on-metadata" name="on-site-version" content="1.19">\n'+r.run(`seoTags(${JSON.stringify(meta)})`)+'\n<!-- on-metadata:end -->';
  const html=shell.replace('{{METADATA}}',tags).replace('<html lang="ko">',`<html lang="ko" data-on-route="${route}" data-share-channel="${sharePage?channel:''}">`);
  const target=path.join(docs,publicPath);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,html);
  generated.push({route,canonicalRoute,channel,path:publicPath,canonical:meta.url,image:meta.socialCover.url});
}
for(const route of catalog.routes){
  for(const channel of ['facebook','kakao','linkedin','x'])page(route,channel);
}
for(const route of catalog.canonicalRoutes){
  for(const channel of ['facebook','kakao','linkedin','x'])page(route,channel,false,true);
}
for(const [channel] of catalog.channels)if(channel!=='facebook')page('home',channel,true);
// Existing shared URLs keep working and receive corrected metadata and application.
const currentPaths=new Set(generated.map(entry=>entry.path));
const publishedSharePages=new Set(execFileSync('git',['ls-tree','-r','--name-only','HEAD','--','docs/share'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/));
for(const file of fs.readdirSync(path.join(docs,'share'),{recursive:true})){
  const relative='/share/'+file.replaceAll(path.sep,'/');
  if(!/^\/share\/(facebook|kakao|linkedin|x)\/[a-f0-9]{10}\/.*\.html$/.test(relative)||currentPaths.has(relative))continue;
  const html=fs.readFileSync(path.join(docs,relative),'utf8');
  const route=html.match(/data-on-route="([^"]+)"/)?.[1],channel=relative.split('/')[2];
  if(catalog.routes.includes(route)){
    if(!publishedSharePages.has('docs'+relative)&&html.includes('id="on-metadata"')){fs.unlinkSync(path.join(docs,relative));continue;}
    page(route,channel,false,true,relative);
  }
}
fs.copyFileSync(path.join(docs,'media',manifest.home.images.facebook.file),path.join(docs,'proposal-preview.jpg'));
const report={version,pages:generated.length,routes:catalog.routes.length,canonicalContents:catalog.canonicalRoutes.length,aliases:catalog.aliases,images:Object.keys(manifest).length*catalog.channels.length,generated};
fs.mkdirSync(path.join(root,'output/verification/social'),{recursive:true});
fs.writeFileSync(path.join(root,'output/verification/social/pages-audit.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({version,pages:generated.length,routes:catalog.routes.length,images:report.images}));
