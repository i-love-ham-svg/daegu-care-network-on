const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'..');
const publicOrigin='https://daegu-care.oconia.co.kr';
const headers={'User-Agent':'facebookexternalhit/1.1','Cache-Control':'no-cache'};
const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const mime=value=>(value||'').split(';')[0].trim().toLowerCase();
const requireMatch=(actual,expected,label)=>{if(actual!==expected)throw new Error(label+' differs from build')};
const decode=value=>String(value||'').replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi,(_,entity)=>{
  if(entity[0]==='#')return String.fromCodePoint(parseInt(entity.slice(entity[1].toLowerCase()==='x'?2:1),entity[1].toLowerCase()==='x'?16:10));
  return {amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'}[entity.toLowerCase()];
});
function attributes(tag){
  const attrs={};
  for(const match of tag.matchAll(/([^\s<>\/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))attrs[match[1].toLowerCase()]=decode(match[2]??match[3]??match[4]);
  return attrs;
}
function readMetadata(html){
  const head=html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1];
  if(!head)throw new Error('Missing HTML head');
  const meta=new Map();
  for(const tag of head.matchAll(/<meta\b[^>]*>/gi)){
    const attrs=attributes(tag[0]),key=(attrs.property||attrs.name||'').toLowerCase();
    if(key)meta.set(key,[...(meta.get(key)||[]),attrs.content||'']);
  }
  const canonical=[];
  for(const tag of head.matchAll(/<link\b[^>]*>/gi)){
    const attrs=attributes(tag[0]);
    if((attrs.rel||'').toLowerCase().split(/\s+/).includes('canonical'))canonical.push(attrs.href||'');
  }
  return {meta,canonical,title:decode(head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]).trim()};
}
const single=(metadata,key)=>{
  const values=metadata.meta.get(key)||[];
  if(values.length!==1||!values[0].trim())throw new Error('Missing or repeated '+key);
  return values[0];
};
function absolutePublicURL(value,label){
  let url;try{url=new URL(value)}catch{throw new Error('Invalid '+label+' URL')}
  if(url.origin!==publicOrigin||url.hash)throw new Error('Noncanonical '+label+' URL');
}
function pageExpectation(page,entry,html){
  const expected=readMetadata(html),image=entry?.images[page.channel],xImage=entry?.images.x;
  if(!image||!xImage)throw new Error('Missing channel cover: '+page.route+'/'+page.channel);
  if(expected.canonical.length!==1)throw new Error('Missing or repeated canonical in build');
  requireMatch(expected.canonical[0],page.canonical,'Build canonical');
  requireMatch(single(expected,'og:image'),page.image,'Build OG image');
  requireMatch(single(expected,'og:image'),image.url,'Build channel image');
  requireMatch(single(expected,'twitter:image'),xImage.url,'Build X image');
  for(const key of ['og:url','og:title','og:description','og:image:type','og:image:width','og:image:height','og:image:alt','twitter:card','twitter:title','twitter:description','twitter:image:alt'])single(expected,key);
  if(!expected.title)throw new Error('Missing build document title');
  requireMatch(single(expected,'twitter:card'),'summary_large_image','Build X card');
  requireMatch(single(expected,'og:image:type'),image.type,'Build image MIME');
  for(const key of ['width','height']){
    const value=single(expected,'og:image:'+key);
    if(!/^\d+$/.test(value)||Number(value)!==image[key]||Number(value)<=0)throw new Error('Incorrect build OG '+key);
  }
  for(const [key,value] of [['canonical',page.canonical],['og:url',single(expected,'og:url')],['og:image',image.url],['twitter:image',xImage.url]])absolutePublicURL(value,key);
  return expected;
}
function loadPlan(){
  const pages=JSON.parse(fs.readFileSync(path.join(root,'output/verification/social/pages-audit.json'),'utf8'));
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'src/social-manifest.json'),'utf8'));
  const pageChecks=pages.generated.map(page=>({kind:'page',path:page.path,expected:pageExpectation(page,manifest[page.canonicalRoute||page.route],fs.readFileSync(path.join(root,'docs',page.path),'utf8'))}));
  const imageChecks=Object.values(manifest).flatMap(entry=>Object.values(entry.images)).map(image=>({kind:'image',path:'/media/'+image.file,localFile:path.join(root,'docs/media',image.file),allowedMimes:[image.type]}));
  const sourceChecks=Object.entries(manifest).map(([route,entry])=>{
    const file=entry.background?.file;
    if(!file)throw new Error('Missing source photograph: '+route);
    const extension=path.extname(file).toLowerCase();
    const allowedMimes={'.jpg':['image/jpeg'],'.jpeg':['image/jpeg'],'.png':['image/png'],'.webp':['image/webp'],'.mpo':['image/mpo','image/jpeg','application/octet-stream']}[extension];
    if(!allowedMimes)throw new Error('Unknown source image type: '+file);
    return {kind:'source',route,path:'/media/'+file,localFile:path.join(root,'docs/media',file),allowedMimes};
  });
  if(new Set(sourceChecks.map(check=>check.path)).size!==sourceChecks.length)throw new Error('Repeated source photograph path');
  return [...pageChecks,...imageChecks,...sourceChecks];
}
async function request(check,base,method,fetchImpl){
  return fetchImpl(new URL(check.path,base),{method,headers,signal:AbortSignal.timeout(20000)});
}
async function verifyResource(check,base,fetchImpl=fetch){
  if(check.kind==='page'){
    const response=await request(check,base,'GET',fetchImpl);
    if(!response.ok)throw new Error('HTTP '+response.status);
    if(!['text/html','application/xhtml+xml'].includes(mime(response.headers.get('content-type'))))throw new Error('Incorrect HTML MIME type');
    const actual=readMetadata(await response.text()),expected=check.expected;
    if(actual.canonical.length!==1)throw new Error('Missing or repeated canonical');
    requireMatch(actual.canonical[0],expected.canonical[0],'Canonical');
    requireMatch(actual.title,expected.title,'Document title');
    for(const key of ['og:url','og:title','og:description','og:image','og:image:type','og:image:width','og:image:height','og:image:alt','twitter:card','twitter:title','twitter:description','twitter:image','twitter:image:alt'])requireMatch(single(actual,key),single(expected,key),key);
    return {kind:check.kind,path:check.path,sha256Verified:false};
  }
  // Source files are checked byte-for-byte. Covers use HEAD normally, downloading
  // only when a proxy compresses the response, omits length, or disallows HEAD.
  let response=await request(check,base,check.kind==='source'?'GET':'HEAD',fetchImpl);
  let downloaded=check.kind==='source';
  if(!downloaded&&[405,501].includes(response.status)){response=await request(check,base,'GET',fetchImpl);downloaded=true}
  if(!response.ok)throw new Error('HTTP '+response.status);
  const localBytes=fs.readFileSync(check.localFile);
  const encoding=(response.headers.get('content-encoding')||'identity').toLowerCase();
  const length=Number(response.headers.get('content-length'));
  if(!downloaded&&(encoding!=='identity'||!length||length!==localBytes.length)){
    response=await request(check,base,'GET',fetchImpl);downloaded=true;
    if(!response.ok)throw new Error('HTTP '+response.status);
  }
  if(!check.allowedMimes.includes(mime(response.headers.get('content-type'))))throw new Error('Incorrect '+check.kind+' MIME type');
  if(downloaded){
    // fetch automatically decodes gzip/br/deflate; Content-Length can describe
    // the encoded stream and must never be compared with these decoded bytes.
    const bytes=Buffer.from(await response.arrayBuffer());
    if(sha256(bytes)!==sha256(localBytes))throw new Error('Downloaded '+check.kind+' differs from build');
  }
  return {kind:check.kind,path:check.path,sha256Verified:downloaded,contentEncoding:response.headers.get('content-encoding')||'identity'};
}
async function runVerification(base,checks,options={}){
  const failures=[],verified=[];let cursor=0;
  async function worker(){while(cursor<checks.length){const check=checks[cursor++];try{verified.push(await verifyResource(check,base,options.fetchImpl||fetch))}catch(error){failures.push({kind:check.kind,path:check.path,error:error.message})}}}
  await Promise.all(Array.from({length:options.concurrency||8},worker));
  return {base,pages:checks.filter(x=>x.kind==='page').length,images:checks.filter(x=>x.kind==='image').length,sourcePhotographs:checks.filter(x=>x.kind==='source').length,
    sourcePhotographsVerifiedBySHA256:verified.filter(x=>x.kind==='source'&&x.sha256Verified).length,
    compressedAssetBodiesVerifiedBySHA256:verified.filter(x=>x.sha256Verified&&x.contentEncoding!=='identity').length,
    passed:!failures.length,failures};
}
module.exports={loadPlan,readMetadata,pageExpectation,verifyResource,runVerification};
if(require.main===module){
  (async()=>{
    const base=process.argv[2]||'http://127.0.0.1:8766/';
    const report=await runVerification(base,loadPlan());
    const production=new URL(base).hostname==='daegu-care.oconia.co.kr';
    const directory=path.join(root,'output/verification/social');fs.mkdirSync(directory,{recursive:true});
    fs.writeFileSync(path.join(directory,'http-'+(production?'live':'local')+'.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({...report,failures:report.failures.slice(0,8)}));
    if(!report.passed)process.exitCode=1;
  })().catch(error=>{console.error(error.message);process.exitCode=1});
}
