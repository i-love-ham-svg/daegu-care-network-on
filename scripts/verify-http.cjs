const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const base=process.argv[2]||'http://127.0.0.1:8766/';
const production=new URL(base).hostname==='daegu-care.oconia.co.kr';
const pages=JSON.parse(fs.readFileSync(path.join(root,'output/verification/social/pages-audit.json'),'utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'src/social-manifest.json'),'utf8'));
const images=Object.values(manifest).flatMap(x=>Object.values(x.images));
const checks=[...pages.generated.map(page=>({type:'page',path:page.path,expected:page.image})),...images.map(image=>({type:'image',path:'/media/'+image.file,expected:image}))];
const failures=[];let cursor=0;
async function worker(){
  while(cursor<checks.length){
    const check=checks[cursor++];
    try{
      const response=await fetch(new URL(check.path,base),{method:check.type==='image'?'HEAD':'GET',headers:{'User-Agent':'facebookexternalhit/1.1','Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw new Error('HTTP '+response.status);
      if(check.type==='page'){
        const html=await response.text();
        const image=html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
        if(image!==check.expected)throw new Error('Incorrect OG image');
        if(!html.includes('twitter:image'))throw new Error('Missing X metadata');
      }else{
        if(!response.headers.get('content-type')?.includes('image/jpeg'))throw new Error('Incorrect image MIME type');
        const length=Number(response.headers.get('content-length'));
        if(length&&length!==fs.statSync(path.join(root,'docs',check.path)).size)throw new Error('Image differs from build');
      }
    }catch(error){failures.push({path:check.path,error:error.message})}
  }
}
(async()=>{
  await Promise.all(Array.from({length:8},worker));
  const report={base,pages:pages.generated.length,images:images.length,passed:!failures.length,failures};
  fs.writeFileSync(path.join(root,'output/verification/social/http-'+(production?'live':'local')+'.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({...report,failures:failures.slice(0,8)}));
  if(failures.length)process.exitCode=1;
})();
