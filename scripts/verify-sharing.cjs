const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const runtime=require('./runtime.cjs');
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/social-manifest.json')));
const service=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/service-share-config.json')));
const results=[];
function fixture(){
  const r=runtime('const onSocialThumbnails='+JSON.stringify(manifest)+';globalThis.__clicks=[];document.addEventListener=(type,fn)=>{if(type==="click")__clicks.push(fn)};');
  const calls=[],dialogs=[],toasts=[],records=[];
  r.context.crypto=require('node:crypto').webcrypto;
  r.context.fetch=(url,options)=>{records.push({url,options});return Promise.resolve({ok:true});};
  r.context.__recordDialog=(...args)=>dialogs.push(args);
  r.context.__recordToast=text=>toasts.push(text);
  r.run('openModal=(...args)=>__recordDialog(...args);toast=text=>__recordToast(text);activeRoute="members";');
  r.context.navigator.share=data=>{calls.push(data);return Promise.resolve();};
  r.context.navigator.canShare=()=>true;
  return {r,calls,dialogs,toasts,records};
}
async function check(label,fn){await fn();results.push({label,passed:true});}
(async()=>{
  await check('all public targets invoke the native picker synchronously without a dialog or download',async()=>{
    const {r,calls,dialogs}=fixture();
    r.context.fetch=()=>{throw Error('A click must not fetch an image');};
    for(const route of require('./social-catalog.cjs')().routes){
      const before=calls.length,action=r.run(`shareContent(${JSON.stringify(route)})`);
      assert.equal(calls.length,before+1,'Native share must run before the first await: '+route);
      if(route==='home')assert.ok(calls.at(-1).url.startsWith(service.baseURL));
      else assert.match(calls.at(-1).url,/^https:\/\/daegu-care\.oconia\.co\.kr\/share\/facebook\//);
      assert.ok(calls.at(-1).title);
      assert.deepEqual(Object.keys(calls.at(-1)).sort(),['title','url'],'Default sharing must send a link, never an image attachment');
      assert.equal(dialogs.length,0);
      await action;
    }
  });
  await check('the actual delegated click sends the clicked card instead of the active directory',async()=>{
    const {r,calls,dialogs}=fixture();
    const card={dataset:{action:'share',routeShare:'member/woorihamkke'}};
    r.context.__clickEvent={target:{closest:selector=>selector==='[data-action],[data-route]'?card:null},button:0,preventDefault(){}};
    r.run('__clicks.forEach(handler=>handler(__clickEvent))');
    assert.equal(calls.length,1);
    assert.match(calls[0].url,/members\/woorihamkke\.html$/);
    assert.match(calls[0].title,/우리함께/);
    assert.equal(dialogs.length,0);
    await Promise.resolve();
  });
  await check('every shared link exposes its own thumbnail, title, description and clickable canonical destination',async()=>{
    const {r,calls}=fixture(),{readMetadata}=require('./verify-http.cjs');
    for(const route of require('./social-catalog.cjs')().canonicalRoutes){
      await r.run(`shareContent(${JSON.stringify(route)})`);
      const url=new URL(calls.at(-1).url);
      if(route==='home'){
        assert.ok(url.href.startsWith(service.baseURL));
        assert.match(calls.at(-1).title,/돌봄이 필요한 순간/);
        continue; // Dynamic representative OG cards are covered by the server's SQLite tests.
      }
      assert.equal(url.origin,'https://daegu-care.oconia.co.kr');
      assert.ok(url.pathname.endsWith('.html'),'Share a page URL instead of a photograph URL');
      const metadata=readMetadata(fs.readFileSync(path.join(__dirname,'../docs',decodeURIComponent(url.pathname)),'utf8'));
      assert.equal(metadata.meta.get('og:image')?.[0],manifest[route].images.facebook.url);
      assert.ok(metadata.meta.get('og:title')?.[0]);
      assert.ok(metadata.meta.get('og:description')?.[0]);
      assert.equal(metadata.canonical[0],JSON.parse(r.run(`JSON.stringify(shareTarget(${JSON.stringify(route)}).url)`)));
    }
  });
  await check('file-capable mobile browsers still share a URL without querying or downloading attachments',async()=>{
    const {r,calls}=fixture();
    r.context.navigator.canShare=()=>{throw Error('File capability must not change link sharing');};
    r.context.fetch=()=>{throw Error('Default sharing must not download an image');};
    for(const route of ['home','member/daegu-dounuri','detail/n1']){
      await r.run(`shareContent(${JSON.stringify(route)})`);
      assert.deepEqual(Object.keys(calls.at(-1)).sort(),['title','url']);
      assert.ok(calls.at(-1).url);
    }
  });
  await check('sharing from image tools still sends the selected content link rather than an image file',async()=>{
    const {r,calls}=fixture();
    const route='member/daegu-dounuri';
    const url=r.run(`socialShareAddress(${JSON.stringify(route)},'kakao')`);
    const nodes={'#share-url':{value:url},'#share-channel':{dataset:{path:route}}};
    r.context.document.querySelector=selector=>nodes[selector];
    await r.run('systemShare()');
    assert.equal(calls.length,1);
    assert.equal(calls[0].url,url);
    assert.match(calls[0].title,/대구도우누리/);
    assert.deepEqual(Object.keys(calls[0]).sort(),['title','url']);
  });
  await check('cancellation remains silent and a later click can share again',async()=>{
    const {r,calls,dialogs,toasts,records}=fixture();
    r.context.navigator.share=data=>{calls.push(data);return Promise.reject({name:'AbortError'});};
    await r.run('shareContent("home")');await r.run('shareContent("home")');
    assert.equal(calls.length,2);assert.equal(dialogs.length,0);assert.equal(toasts.length,0);
    assert.equal(records.length,0,'Cancelled app selection must not POST a share registration');
  });
  await check('representative sharing registers the same UUID only after native handoff and does not await its server',async()=>{
    const {r,calls,records}=fixture();let finish;
    r.context.navigator.share=data=>{calls.push(data);return new Promise(resolve=>{finish=resolve;});};
    const action=r.run('shareContent("home")');
    assert.equal(calls.length,1);assert.equal(records.length,0);
    const token=new URL(calls[0].url).pathname.split('/').filter(Boolean).at(-1);
    assert.match(token,/^[0-9a-f-]{36}$/);
    finish();await action;
    assert.equal(records.length,1);
    assert.equal(records[0].url,service.recordEndpoint);
    assert.equal(JSON.parse(records[0].options.body).token,token);
    assert.equal(records[0].options.keepalive,true);
    assert.equal(records[0].options.credentials,'omit');
  });
  await check('the header represents the service on institution pages and clients create independent links',async()=>{
    const first=fixture(),second=fixture();
    const shell=fs.readFileSync(path.join(__dirname,'../src/shell.html'),'utf8');
    assert.match(shell,/<button[^>]*id="header-share"[^>]*data-route-share="home"/);
    for(const test of [first,second]){
      test.r.run('activeRoute="member/with-medical";');
      const header={dataset:{action:'share',routeShare:'home'}};
      test.r.context.__clickEvent={target:{closest:s=>s==='[data-action],[data-route]'?header:null},button:0,preventDefault(){}};
      test.r.run('__clicks.forEach(handler=>handler(__clickEvent))');
      assert.ok(test.calls[0].url.startsWith(service.baseURL));
      await Promise.resolve();
    }
    assert.notEqual(first.calls[0].url,second.calls[0].url);
  });
  await check('older secure browsers can mint a version-4 token and registration failures do not change native sharing',async()=>{
    const {r,calls,dialogs}=fixture(),crypto=require('node:crypto').webcrypto;
    r.context.crypto={getRandomValues:bytes=>crypto.getRandomValues(bytes)};
    r.context.fetch=()=>Promise.reject(Error('Offline registration'));
    await r.run('shareContent("home")');await Promise.resolve();
    assert.match(calls[0].url,/\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/$/);
    assert.equal(dialogs.length,0);
  });
  await check('opening the representative fallback does not register; copying its prepared link registers that same token',async()=>{
    const {r,dialogs,records}=fixture();
    r.context.navigator.share=undefined;
    await r.run('shareContent("home")');
    assert.equal(records.length,0);assert.equal(dialogs.length,1);
    assert.equal(dialogs[0][1],service.title);
    const address=dialogs[0][2].match(/id="share-url"[^>]*value="([^"]+)"/)?.[1];
    assert.ok(address?.startsWith(service.baseURL));
    assert.ok(!dialogs[0][2].includes('data-action="share-image"'));
    const field={value:address};
    r.context.document.querySelector=selector=>selector==='#share-url'?field:null;
    r.context.navigator.clipboard={writeText:async text=>assert.equal(text,address)};
    r.run('closeModal=()=>{};');
    await r.run('copyShareLink()');
    assert.equal(records.length,1);
    assert.ok(address.includes(JSON.parse(records[0].options.body).token));
  });
  await check('rapid taps open one picker until the pending operation ends',async()=>{
    const {r,calls}=fixture();let finish;
    r.context.navigator.share=data=>{calls.push(data);return new Promise(resolve=>{finish=resolve;});};
    const first=r.run('shareContent("home")');await r.run('shareContent("home")');
    assert.equal(calls.length,1);finish();await first;
    r.context.navigator.share=data=>{calls.push(data);return Promise.resolve();};
    await r.run('shareContent("home")');assert.equal(calls.length,2);
  });
  await check('unavailable or blocked native sharing provides app links and copy without the image settings step',async()=>{
    for(const blocked of [false,true]){
      const {r,dialogs}=fixture();
      r.context.navigator.share=blocked?()=>Promise.reject({name:'NotAllowedError'}):undefined;
      await r.run('shareContent("member/with-medical")');
      assert.equal(dialogs.length,1);
      const html=dialogs[0][2];
      for(const host of ['facebook.com/sharer','twitter.com/intent','share.naver.com','band.us/plugin'])assert.ok(html.includes(host));
      assert.ok(html.includes('data-action="copy-share-link"'));
      assert.ok(!html.includes('id="share-channel"'));
      assert.ok(!html.includes('<img '));
      assert.match(html,/members\/with-medical\.html/);
    }
  });
  await check('private and unpublished routes never produce a public share',async()=>{
    const {r,calls,dialogs}=fixture();
    for(const route of ['my','admin','admin-gifts','detail/local-private','member/private'])await r.run(`shareContent(${JSON.stringify(route)})`);
    assert.equal(calls.length,0);assert.equal(dialogs.length,0);
  });
  const report={passed:true,checks:results.length,publicViews:require('./social-catalog.cjs')().routes.length,verification:'Runtime contracts with the actual delegated click; native OS app selection requires device verification',results};
  const out=path.join(__dirname,'../output/verification/sharing');fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'sharing-contracts.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...report,results:undefined}));
})().catch(error=>{console.error(error);process.exitCode=1});
