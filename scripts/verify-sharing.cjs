const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const runtime=require('./runtime.cjs');
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/social-manifest.json')));
const results=[];
function fixture(){
  const r=runtime('const onSocialThumbnails='+JSON.stringify(manifest)+';globalThis.__clicks=[];document.addEventListener=(type,fn)=>{if(type==="click")__clicks.push(fn)};');
  const calls=[],dialogs=[],toasts=[];
  r.context.__recordDialog=(...args)=>dialogs.push(args);
  r.context.__recordToast=text=>toasts.push(text);
  r.run('openModal=(...args)=>__recordDialog(...args);toast=text=>__recordToast(text);activeRoute="members";');
  r.context.navigator.share=data=>{calls.push(data);return Promise.resolve();};
  r.context.File=File;
  r.context.navigator.canShare=()=>true;
  return {r,calls,dialogs,toasts};
}
async function check(label,fn){await fn();results.push({label,passed:true});}
(async()=>{
  await check('all public targets invoke the native picker synchronously without a dialog or download',async()=>{
    const {r,calls,dialogs}=fixture();
    r.context.fetch=()=>{throw Error('A click must not fetch an image');};
    for(const route of require('./social-catalog.cjs')().routes){
      const before=calls.length,action=r.run(`shareContent(${JSON.stringify(route)})`);
      assert.equal(calls.length,before+1,'Native share must run before the first await: '+route);
      assert.match(calls.at(-1).url,/^https:\/\/daegu-care\.oconia\.co\.kr\/share\/facebook\//);
      assert.ok(calls.at(-1).title);
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
  await check('a ready actual thumbnail is shared as one JPEG with its own title and public link',async()=>{
    const {r,calls}=fixture();
    const route='member/daegu-dounuri',image=manifest[route].images.facebook;
    r.context.fetch=async url=>{
      assert.equal(url,'/media/'+image.file);
      return {ok:true,blob:async()=>new Blob([fs.readFileSync(path.join(__dirname,'../docs/media',image.file))],{type:'image/jpeg'})};
    };
    await r.run(`warmShareFile(${JSON.stringify(route)})`);
    await r.run(`shareContent(${JSON.stringify(route)})`);
    assert.equal(calls[0].files.length,1);
    assert.equal(calls[0].files[0].type,'image/jpeg');
    assert.ok(calls[0].files[0].size>1000);
    assert.match(calls[0].text,/대구도우누리/);
    assert.ok(calls[0].text.includes(r.run(`socialShareAddress(${JSON.stringify(route)},'facebook')`)));
    assert.equal(calls[0].url,undefined,'Use image and text together, as in the renewal site');
  });
  await check('an unfinished image download does not delay the app picker',async()=>{
    const {r,calls}=fixture();let finish;
    r.context.fetch=()=>new Promise(resolve=>{finish=resolve;});
    const warm=r.run('warmShareFile("home")');
    const action=r.run('shareContent("home")');
    assert.equal(calls.length,1);
    assert.ok(calls[0].url);
    await action;
    finish({ok:false});await warm;
  });
  await check('image download failure and unsupported file sharing preserve immediate link sharing',async()=>{
    for(const imageSupported of [false,true]){
      const {r,calls}=fixture();
      r.context.navigator.canShare=()=>imageSupported;
      r.context.fetch=async()=>({ok:!imageSupported,blob:async()=>new Blob(['image'],{type:'image/jpeg'})});
      await r.run('warmShareFile("home")');
      await r.run('shareContent("home")');
      assert.ok(calls[0].url);assert.equal(calls[0].files,undefined);
    }
  });
  await check('cancellation remains silent and a later click can share again',async()=>{
    const {r,calls,dialogs,toasts}=fixture();
    r.context.navigator.share=data=>{calls.push(data);return Promise.reject({name:'AbortError'});};
    await r.run('shareContent("home")');await r.run('shareContent("home")');
    assert.equal(calls.length,2);assert.equal(dialogs.length,0);assert.equal(toasts.length,0);
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
