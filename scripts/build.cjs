const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const runtime = require('./runtime.cjs');
const catalog = require('./social-catalog.cjs')();
const root=path.join(__dirname,'..'),docs=path.join(root,'docs');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'src/social-manifest.json'),'utf8'));
const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8').replace(/\r\n/g,'\n');
const css=fs.readFileSync(path.join(root,'src/styles.css'),'utf8').replace(/\r\n/g,'\n').trimEnd()+'\n';
const version=crypto.createHash('sha256').update(app+css+JSON.stringify(manifest)).digest('hex').slice(0,12);
const r=runtime('const onSocialThumbnails = '+JSON.stringify(manifest)+';');
const shell=fs.readFileSync(path.join(root,'src/shell.html'),'utf8').replaceAll('{{VERSION}}',version);
fs.mkdirSync(path.join(docs,'assets'),{recursive:true});
fs.writeFileSync(path.join(docs,`assets/site-${version}.js`),'const onSocialThumbnails = '+JSON.stringify(manifest)+';\n'+app);
fs.writeFileSync(path.join(docs,`assets/site-${version}.css`),css);
const generated=[];
function page(route,channel='facebook',legacy=false) {
  if(!manifest[route])throw new Error('Missing cover: '+route);
  const meta=r.run(`onSeoPage(${JSON.stringify(route)})`);
  if(!meta)throw new Error('Missing metadata: '+route);
  const canonical=new URL(meta.url).pathname;
  const relative=canonical==='/'?'/index.html':canonical;
  const publicPath=legacy?'/share/'+channel+'.html':channel==='facebook'?relative:'/share/'+channel+relative;
  if(channel!=='facebook'||legacy){meta.socialCover=manifest[route].images[channel];meta.shareURL=new URL(publicPath,meta.url).href;}
  const tags='<meta id="on-metadata" name="on-site-version" content="1.19">\n'+r.run(`seoTags(${JSON.stringify(meta)})`)+'\n<!-- on-metadata:end -->';
  const html=shell.replace('{{METADATA}}',tags).replace('<html lang="ko">',`<html lang="ko" data-on-route="${route}" data-share-channel="${channel==='facebook'?'':channel}">`);
  const target=path.join(docs,publicPath);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,html);
  generated.push({route,channel,path:publicPath,canonical:meta.url,image:meta.socialCover.url});
}
for(const route of catalog.routes){
  for(const channel of ['facebook','kakao','linkedin','x'])page(route,channel);
}
for(const [channel] of catalog.channels)if(channel!=='facebook')page('home',channel,true);
fs.copyFileSync(path.join(docs,'media',manifest.home.images.facebook.file),path.join(docs,'proposal-preview.jpg'));
const report={version,pages:generated.length,routes:catalog.routes.length,images:Object.keys(manifest).length*catalog.channels.length,generated};
fs.mkdirSync(path.join(root,'output/verification/social'),{recursive:true});
fs.writeFileSync(path.join(root,'output/verification/social/pages-audit.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({version,pages:generated.length,routes:catalog.routes.length,images:report.images}));
