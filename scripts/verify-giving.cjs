const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const runtime=require('./runtime.cjs');

const root=path.join(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'src/social-manifest.json'),'utf8'));
const dbKey='daegu-care-on-demo-v1';
const baseline={
  posts:[{id:'retained-post',type:'news',isLocal:true,status:'approved',title:'기존 게시물'}],
  applications:[],
  gifts:[{id:'retained-gift',memberId:'daegu-medical',type:'once',amount:12000,method:'toss',provider:'kakao',affiliation:{id:'fixture',name:'검증용 소속'},at:'2026-11-01T00:00:00.000Z'}],
  projects:[],affiliations:[],launch:[]
};

// Every fixture uses memory-only storage and captures rendered dialogs. No browser
// account, user ledger, network request, or payment provider is touched.
function fixture(){
  const store={[dbKey]:JSON.stringify(baseline)};
  const r=runtime('const onSocialThumbnails='+JSON.stringify(manifest)+';',store);
  let storageWrites=0,failStorage=false;
  const nodes=new Map();
  function element(selector){
    if(!nodes.has(selector))nodes.set(selector,{
      selector,disabled:false,listeners:{},
      addEventListener(type,listener){this.listeners[type]=listener;},
      querySelector(child){return element(selector+' '+child);},
      querySelectorAll(){return [];},
      classList:{add(){},remove(){}},focus(){}
    });
    return nodes.get(selector);
  }
  r.context.document.querySelector=element;
  r.context.localStorage={
    getItem(key){return store[key]??null;},
    setItem(key,value){if(failStorage)throw Error('Fixture storage failure');store[key]=value;storageWrites++;}
  };
  r.context.matchMedia=()=>({matches:false});
  r.context.FormData=class{
    constructor(form){this.values=new Map(Object.entries(form.values));}
    get(name){return this.values.get(name)??null;}
  };
  r.run(`
    globalThis.__dialogs=[];globalThis.__routes=[];globalThis.__toasts=[];
    openModal=(title,subtitle,html)=>__dialogs.push({title,subtitle,html});
    closeModal=()=>{};renderPreserve=()=>{};
    toast=text=>__toasts.push(text);
    go=route=>__routes.push(route);
  `);
  return {
    r,store,nodes,
    get writes(){return storageWrites;},
    failStorage(){failStorage=true;},
    json(code){return JSON.parse(r.run('JSON.stringify('+code+')'));},
    dialog(){return this.json('__dialogs.at(-1)||null');},
    signIn(){r.run(`demoAccount={provider:'kakao',affiliation:'검증용 소속',affiliationId:'fixture'};`);}
  };
}

const catalog=fixture();
const institutions=catalog.json('organizations');
assert.equal(institutions.length,7,'The confirmed institution list must remain intact');
const results=[];
for(const [index,org]of institutions.entries()){
  const f=fixture(),id=JSON.stringify(org.id);
  const campaign=f.json(`campaignFor(organizations.find(x=>x.id===${id}))||null`);
  assert.ok(campaign,'Missing donation campaign for confirmed institution: '+org.id);
  assert.ok(Number.isSafeInteger(campaign.goal)&&campaign.goal>0,org.id+' valid fundraising goal');
  assert.ok(Number.isSafeInteger(campaign.raised)&&campaign.raised>=0,org.id+' valid displayed amount');
  assert.ok(Number.isSafeInteger(campaign.count)&&campaign.count>=0,org.id+' valid donation count');

  const card=f.r.run(`organizationCard(organizations.find(x=>x.id===${id}))`);
  const cardButton=card.match(/<button\b[^>]*data-action="campaign-give"[^>]*>[\s\S]*?<\/button>/g)||[];
  assert.equal(cardButton.length,1,org.id+' has exactly one donation button in its directory card');
  assert.ok(cardButton[0].includes('data-id="'+org.id+'"'),org.id+' card donation target');
  assert.ok(cardButton[0].includes('후원하기'),org.id+' visible donation label');
  assert.ok(card.includes('card-campaign')&&card.includes('campaign-progress'),org.id+' fundraising summary remains visible');

  const detail=f.r.run(`memberDetail(${id})`);
  assert.ok(detail.includes('id="campaign-funding"'),org.id+' detail fundraising section');
  assert.ok(detail.includes('class="campaign-mobile"'),org.id+' mobile fixed donation bar');
  const detailButtons=detail.match(/<button\b[^>]*data-action="campaign-give"[^>]*>[\s\S]*?<\/button>/g)||[];
  assert.ok(detailButtons.length>=2,org.id+' detail contains the main and mobile donation buttons');
  for(const button of detailButtons)assert.ok(button.includes('data-id="'+org.id+'"'),org.id+' detail donation target');

  // The card action must select this institution, even when opened from another route.
  f.r.run(`activeRoute='members';pendingGift='';beginGiving(${id});`);
  assert.deepEqual(f.json('__routes'),['member/'+org.id],org.id+' card donation navigates to its own detail');
  assert.equal(f.r.run('pendingGift'),org.id,org.id+' selected institution survives navigation');
  assert.equal(f.writes,0,org.id+' navigation must not create a gift');

  f.r.run(`activeRoute='member/'+${id};beginGiving(${id});`);
  const login=f.dialog();
  assert.equal(login.title,'로그인·회원가입',org.id+' signed-out donation opens login');
  assert.ok(login.html.includes(org.name),org.id+' login preserves its donation context');
  assert.equal((login.html.match(new RegExp('data-id="'+org.id+'"','g'))||[]).length,3,org.id+' all provider choices preserve target');
  assert.equal(f.r.run(`recordGift(givingSubject(${id}),'once',10000,'toss')`),false,org.id+' cannot record an unsigned gift');
  assert.equal(f.writes,0,org.id+' login prompt must not change stored gifts');

  f.signIn();
  f.r.run(`beginGiving(${id});`);
  const form=f.dialog();
  assert.equal(form.title,'후원하기',org.id+' signed-in donation opens amount form');
  assert.ok(form.html.includes('id="campaign-gift-form"')&&form.html.includes('data-member="'+org.id+'"'),org.id+' amount form target');
  assert.ok(form.html.includes('결제 및 출금 없음'),org.id+' demo payment scope remains explicit');

  const amount=1000*(index+1),type=index%2?'monthly':'once';
  const before=f.json(`campaignTotals(givingSubject(${id}))`);
  f.r.context.__giftInput={dataset:{member:org.id},values:{type,method:'toss',preset:String(amount),custom:''}};
  f.r.run('giftConfirmation(__giftInput);');
  const confirmation=f.dialog();
  assert.equal(confirmation.title,'후원 내용 확인',org.id+' amount form opens confirmation');
  assert.ok(confirmation.html.includes(org.name)&&confirmation.html.includes(amount.toLocaleString('ko-KR')+'원'),org.id+' confirmation shows the intended recipient and amount');
  assert.equal(f.writes,0,org.id+' amount confirmation has no ledger side effect');
  const confirmNode=f.nodes.get('#campaign-confirm-form');
  assert.equal(typeof confirmNode?.listeners.submit,'function',org.id+' confirmation has a submit handler');
  confirmNode.listeners.submit({preventDefault(){},currentTarget:confirmNode});

  assert.equal(f.writes,1,org.id+' one confirmation creates exactly one stored demo gift');
  confirmNode.listeners.submit({preventDefault(){},currentTarget:confirmNode});
  assert.equal(f.writes,1,org.id+' repeated confirmation submission does not duplicate the gift');
  const stored=JSON.parse(f.store[dbKey]);
  assert.equal(stored.gifts.length,baseline.gifts.length+1,org.id+' gift appended');
  assert.deepEqual(stored.gifts[0],baseline.gifts[0],org.id+' historical gift remains intact');
  for(const collection of ['posts','applications','projects','affiliations','launch'])assert.deepEqual(stored[collection],baseline[collection],org.id+' existing '+collection+' remain intact');
  const gift=stored.gifts.at(-1);
  assert.equal(gift.memberId,org.id,org.id+' stored recipient');
  assert.equal(gift.amount,amount,org.id+' stored amount');
  assert.equal(gift.type,type,org.id+' stored gift type');
  assert.equal(gift.provider,'kakao',org.id+' stored provider');
  assert.equal(gift.affiliation.name,'검증용 소속',org.id+' stored affiliation');
  assert.notEqual(gift.id,'retained-gift',org.id+' new gift gets its own transaction identifier');
  assert.equal(f.dialog().title,'후원 시연을 완료했습니다',org.id+' successful completion dialog');
  assert.equal(f.json(`campaignTotals(givingSubject(${id}))`).raised,before.raised+amount,org.id+' campaign total updates for this recipient');
  const mine=f.r.run('myGiving()');
  assert.ok(mine.includes(org.name)&&mine.includes(amount.toLocaleString('ko-KR')+'원'),org.id+' recorded gift appears in My giving');
  results.push({institution:org.id,directoryButton:true,detailButton:true,mobileButton:true,navigationTarget:true,loginContext:true,amountConfirmation:true,savedGiftAmount:amount,historicalDataPreserved:true});
}

const rejected=fixture();rejected.signIn();
for(const amount of [0,999,100001,1234.5,NaN]){
  rejected.r.context.__invalidAmount=amount;
  assert.equal(rejected.r.run(`recordGift(givingSubject('daegu-dounuri'),'once',__invalidAmount,'toss')`),false,'Invalid amount rejected: '+amount);
}
assert.equal(rejected.r.run(`recordGift(givingSubject('daegu-dounuri'),'unrecognized',10000,'toss')`),false,'Unknown gift type rejected');
assert.equal(rejected.r.run(`recordGift(givingSubject('daegu-dounuri'),'once',10000,'unrecognized')`),false,'Unknown payment method rejected');
assert.equal(rejected.writes,0,'Invalid requests never change the stored ledger');
assert.deepEqual(rejected.json('db.gifts'),baseline.gifts,'Invalid requests preserve historical gifts');

const unavailable=fixture();unavailable.signIn();unavailable.failStorage();
assert.equal(unavailable.r.run(`recordGift(givingSubject('daegu-dounuri'),'once',10000,'toss')`),false,'Storage failure is reported');
assert.deepEqual(unavailable.json('db.gifts'),baseline.gifts,'Storage failure rolls back the in-memory gift');
assert.deepEqual(JSON.parse(unavailable.store[dbKey]).gifts,baseline.gifts,'Storage failure preserves saved gifts');

const report={passed:true,institutions:results.length,scope:'Isolated VM functional regression; no browser authentication, network, or payment',results,invalidInputsRejected:7,storageFailureRollback:true};
const destination=path.join(root,'output/verification/giving');fs.mkdirSync(destination,{recursive:true});
fs.writeFileSync(path.join(destination,'functional-regression.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,institutions:results.length,directoryButtons:results.length,mobileButtons:results.length,completedDemoFlows:results.length,invalidInputsRejected:7,storageFailureRollback:true}));
