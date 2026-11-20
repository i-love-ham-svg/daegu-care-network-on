const offlineShare = null;
const onShareChannels = [
  ['facebook','페이스북·공통','02_Facebook_Link_1200x630.jpg',1200,630],
  ['kakao','카카오톡','01_KakaoTalk_Link_800x400.jpg',800,400],
  ['linkedin','링크드인','03_LinkedIn_Link_1200x627.jpg',1200,627],
  ['x','X','04_X_LargeCard_1200x600.jpg',1200,600],
  ['naver','네이버 블로그','05_NaverBlog_Cover_1080x1080.jpg',1080,1080],
  ['band','밴드','06_BAND_Post_1080x1080.jpg',1080,1080],
  ['instagram-feed','인스타그램 피드','07_Instagram_Feed_1080x1350.jpg',1080,1350],
  ['instagram-story','인스타그램 스토리·릴스','08_Instagram_Story_1080x1920.jpg',1080,1920],
  ['youtube','유튜브','09_YouTube_1280x720.jpg',1280,720]
];

const onShareAliases = {
  "gallery/field-launch": "detail/daegu-declaration",
  "gallery/field-agreement": "detail/daegu-agreement",
  "gallery/field-conference": "detail/daegu-national-conference",
  "gallery/field-seminar": "detail/daegu-seminar",
  "gallery/field-naeiln": "detail/daegu-naeiln-visit",
  "gallery/field-garden": "detail/daegu-garden-visit",
  "detail/event-daegu-health-symposium": "detail/daegu-health-symposium",
  "detail/event-daegu-university-symposium": "detail/daegu-university-symposium",
  "detail/event-daegu-national-conference": "detail/daegu-national-conference",
  "detail/event-daegu-seminar": "detail/daegu-seminar"
};
function canonicalShareRoute(route){ return onShareAliases[route]||(route==='demo'?'members':route); }

function shareImage(file) { return offlineShare?.[file] || '/media/share/'+file; }
function socialCover(route,channel='facebook') {
  route=canonicalShareRoute(route);
  return onSocialThumbnails[route]?.images[channel] || onSocialThumbnails[route]?.images.facebook;
}
function socialShareAddress(route,channel) {
  route=canonicalShareRoute(route);
  const asset=socialCover(route,channel),canonical=onPublicPagePath(route);
  if(!asset||!canonical)return '';
  const revision=asset.file.split('/').pop().split('-').pop().replace(/\.jpg$/,'');
  return new URL('/share/'+channel+'/'+revision+(canonical==='/'?'/index.html':canonical),siteBaseURL).href;
}
function shareMeta(path) {
  const [route,id] = path.split('/');
  if (route==='home') return {title:siteName};
  if (route==='gallery'&&onPublicPagePath(path)) {
    const photo=photoData[id];
    return {title:photo.title||photo.caption};
  }
  if (Object.hasOwn(onPublicSections,route)&&!id) {
    return {title:onPublicSections[route][1]};
  }
  if (!['member','detail'].includes(route)) return null;
  const item = findItem(id);
  if (!item || item.isLocal || (route==='member' && !directoryMembers().some(member=>member.id===id))) return null;
  return {title:item.name||item.title};
}
function sharePath(path) {
  return 'share/'+path.split('/').map(encodeURIComponent).join('/')+'.html';
}
function shareTarget(path) {
  const route=canonicalShareRoute(path);
  const meta=onSeoPage(route);
  return meta?{title:meta.title,url:meta.url}:null;
}
function localShareItem(path) {
  const [route,id]=path.split('/');
  const item=route==='project'?givingSubject(id):['member','detail'].includes(route)?findItem(id):null;
  return item?.isLocal?item:null;
}
function canPreviewShare(path) {return Boolean(shareTarget(path)||localShareItem(path));}
async function localSharePreview(path,local,channel) {
  const row=onShareChannels.find(([key])=>key===channel)||onShareChannels[0];
  const [key,,file,width,height]=row;
  const photo=[local.image,...(local.photos||[])].find(src=>typeof src==='string'&&src.startsWith('data:image/'));
  if(!photo) {
    openModal('공유 이미지',local.name||local.title,'<p>공유 이미지에 사용할 실제 활동 사진을 등록해 주세요.</p>');
    return;
  }
  try {
    const image=new Image();image.src=photo;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d'),scale=Math.max(width/image.width,height/image.height);
    ctx.drawImage(image,(width-image.width*scale)/2,(height-image.height*scale)/2,image.width*scale,image.height*scale);
    const shade=ctx.createLinearGradient(0,height*.25,0,height);shade.addColorStop(0,'#10233b00');shade.addColorStop(1,'#10233bee');
    ctx.fillStyle=shade;ctx.fillRect(0,0,width,height);
    const margin=width*.055,title=local.name||local.title;
    let size=width*.055;ctx.font='700 '+size+'px sans-serif';
    const words=[...title],lines=[];let line='';
    for(const char of words){if(ctx.measureText(line+char).width>width-margin*2){lines.push(line);line=char}else line+=char;}
    if(line)lines.push(line);
    if(lines.length>3)throw new Error('제목을 짧게 정리해 주세요.');
    ctx.fillStyle='white';ctx.shadowColor='#10233b';ctx.shadowBlur=5;
    ctx.font='600 '+width*.022+'px sans-serif';ctx.fillText('ON  대구 통합돌봄네트워크',margin,height*.1);
    ctx.font='700 '+size+'px sans-serif';lines.forEach((text,i)=>ctx.fillText(text,margin,height*.57+i*size*1.35));
    ctx.font='500 '+width*.021+'px sans-serif';ctx.fillText('브라우저에 저장된 콘텐츠 · 공개 링크 없음',margin,height*.9);
    const cover=canvas.toDataURL('image/jpeg',.9);
    openModal('공유 이미지',title,`<label class="field">공유 채널<select id="share-channel">${onShareChannels.map(([value,label])=>`<option value="${value}" ${key===value?'selected':''}>${label}</option>`).join('')}</select></label>
      <figure class="on-share-figure"><img src="${cover}" alt="${esc(title)}"><figcaption><span>${width} × ${height} px</span><a class="link" href="${cover}" download="local-${file}">JPG 저장</a></figcaption></figure>`);
    $('#share-channel').addEventListener('change',event=>localSharePreview(path,local,event.target.value));
  } catch(error) {openModal('공유 이미지',local.name||local.title,'<p>이미지를 만들 수 없습니다. 활동 사진과 제목을 확인해 주세요.</p>');}
}
function sharePreview(path, channel='facebook') {
  const target = shareTarget(path);
  const local = localShareItem(path);
  if (!target) {
    if (!local) return;
    return localSharePreview(path,local,channel);
  }
  const row = onShareChannels.find(([key])=>key===channel)||onShareChannels[0];
  const [key,,file,w,h] = row;
  const route=canonicalShareRoute(path);
  const directUpload = ['naver','band','instagram-feed','instagram-story','youtube'].includes(key);
  const canonicalPath=onPublicPagePath(route);
  const address = ['facebook','kakao','linkedin','x'].includes(key)?socialShareAddress(route,key):target.url;
  const cover = socialCover(route,key);
  const provenance=onSocialThumbnails[route];
  const image = cover ? '/media/'+cover.file : '';
  const width = cover?.width||w, height = cover?.height||h;
  const filename = cover ? cover.file.split('/').slice(-2).join('-') : file;
  const saveLabel = cover?.type==='image/webp' ? 'WebP 저장' : 'JPG 저장';
  const previous = $('#modal').hidden ? document.activeElement : lastFocus;
  openModal('공유하기',target.title,`
    <label class="field">공유 채널<select id="share-channel" data-path="${esc(path)}">${onShareChannels.map(([value,label])=>`<option value="${value}" ${key===value?'selected':''}>${label}</option>`).join('')}</select></label>
    ${image?`<figure class="on-share-figure"><img src="${esc(image)}" alt="${esc(cover?.alt||target.title+' 공유 이미지')}">
      <figcaption><span>${width} × ${height} px</span><a class="link" href="${esc(image)}" download="${esc(filename)}">${saveLabel}</a></figcaption></figure>`:''}
    ${provenance?`<p class="smalltext muted on-share-source">${esc(provenance.caseKind||'실제 사례 사진')} · ${provenance.background?.source?`<a class="link" href="${esc(cleanURL(provenance.background.source))}" target="_blank" rel="noopener noreferrer">사진 출처</a>`:esc(provenance.credit)}</p>`:''}
    ${directUpload?'<p class="muted smalltext">JPG를 저장해 게시물에 첨부하세요.</p>':''}<div class="field"><label for="share-url">공유 링크</label><input class="share-input" id="share-url" type="url" readonly value="${esc(address)}"></div>
    <p id="share-feedback" class="smalltext muted" role="status" hidden></p>
    <div class="form-actions"><button type="button" class="btn" data-action="copy-share-link">${icon('link')} 링크 복사</button>
      ${typeof navigator.share==='function'?'<button type="button" class="btn primary" data-on-action="system-share">공유하기</button>':''}</div>`);
  lastFocus = previous;
  $('#share-channel').addEventListener('change',event=>sharePreview(path,event.target.value));
}
async function systemShare() {
  const url = $('#share-url')?.value;
  if (!url) return;
  try {
    await navigator.share({url,title:$('#dialog-title').textContent});
  } catch (error) {
    if (error.name!=='AbortError') toast('공유 링크를 복사해 보내세요.');
  }
}

function onAdminNav() {
  return `<nav class="on-actions" aria-label="운영관리 메뉴">
    ${[['admin','등록 요청'],['admin-projects','사업 심사'],['admin-stories','회원사 소식'],['admin-affiliations','소속 신청'],['admin-gifts','후원 거래'],['admin-launch','공개 준비']].map(([path,label])=>`<a class="btn small" href="#/${path}" ${activeRoute.split('/')[0]===path?'aria-current="page"':''}>${label}</a>`).join('')}
  </nav>`;
}
function onAdminPage(title, content) {
  return pageHead(title,'브라우저에 저장되는 운영 시연입니다.')+`<div class="wrap page-content">${onAdminNav()}${content}</div>`;
}
function putOnRecord(collection,record) {
  const before=db[collection];
  const index=before.findIndex(item=>item.id===record.id);
  db[collection]=index<0?[record,...before]:before.map((item,i)=>i===index?record:item);
  if (persist()) return true;
  db[collection]=before;
  return false;
}

const projectStates = {pending:'심사 대기',revision:'보완 요청',approved:'공개'};
function onProject(id) { return db.projects.find(project=>project.id===id); }
function onProjectMember(project) {
  const org=directoryMembers().find(member=>member.id===project.orgId);
  if (!org) return null;
  return {id:project.id, name:project.name, owner:org.name, orgId:org.id, district:org.district||'', service:org.service, items:[], isLocal:true, isProject:true,
    body:project.body, campaign:{title:project.name, lead:project.body, goal:project.goal, raised:0, count:0, planText:project.plan}};
}
function publishedProjects() { return db.projects.filter(project=>project.status==='approved').map(onProjectMember).filter(Boolean); }
function givingSubject(id) { return allMembers().find(item=>item.id===id)||publishedProjects().find(item=>item.id===id); }
function givingPath(member) { return (member.isProject?'project/':'member/')+encodeURIComponent(member.id); }
function projectPage(id) {
  const project=onProject(id);
  const member=project?.status==='approved'&&onProjectMember(project);
  return member ? campaignDetail(member,member.campaign) : notFound();
}
function projectDirectory() {
  const projects=publishedProjects();
  const campaigns=directoryMembers().filter(campaignFor);
  return pageHead('돌봄사업','회원사의 모금과 돌봄 활동을 살펴보세요.',`<a class="btn primary" href="#/project-apply">돌봄사업 신청 ${icon('arrow')}</a>`)+`<div class="wrap page-content on-project-directory">
    <section aria-labelledby="member-campaigns-title"><h2 id="member-campaigns-title">회원사 모금</h2>${projectList(campaigns)}</section>
    ${projects.length?`<section aria-labelledby="approved-projects-title"><h2 id="approved-projects-title">신청 승인 사업 · 시연</h2>${projectList(projects)}</section>`:''}
  </div>`;
}
function projectList(entries) {
  return entries.length ? `<div class="on-project-grid">${entries.map(member=>`<article class="campaign-panel on-project-card">
      <small class="muted">${esc(member.owner||member.name)}</small><h3><a href="#/${givingPath(member)}">${esc(campaignFor(member).title)} ${icon('chevron')}</a></h3>
      ${campaignCardPreview(member,false)}${campaignButton(member)}
    </article>`).join('')}</div>` : '<p class="muted">공개된 돌봄사업이 없습니다.</p>';
}
function projectApply(id) {
  const project=id?onProject(id):null;
  if (id && project?.status!=='revision') return notFound();
  return pageHead(project?'사업 신청 보완':'돌봄사업 신청','',`<a class="btn small" href="#/project-status">내 신청 내역</a>`)+`<div class="wrap page-content on-form-width">
    ${project?.feedback?`<p class="form-info">보완 요청 · ${esc(project.feedback)}</p>`:''}
    <form class="campaign-panel" id="on-project-form" data-id="${esc(id||'')}">
      <p class="form-info">신청 시연 · 입력 내용은 이 브라우저에 저장됩니다.</p>
      <label class="field">신청 회원사<select name="orgId" required><option value="">회원사 선택</option>${directoryMembers().map(org=>`<option value="${esc(org.id)}" ${org.id===project?.orgId?'selected':''}>${esc(org.name)}</option>`).join('')}</select></label>
      <label class="field">사업명<input name="name" required maxlength="90" value="${esc(project?.name)}"></label>
      <label class="field">활동 계획<textarea name="body" required maxlength="1800">${esc(project?.body)}</textarea></label>
      <label class="field">후원금 사용 계획<textarea name="plan" required maxlength="1600">${esc(project?.plan)}</textarea></label>
      <label class="field">목표 금액 (원)<input name="goal" type="number" min="1000" max="100000000" required value="${project?.goal||''}"></label>
      <div class="form-actions"><a class="btn" href="#/projects">돌봄사업 목록</a><button class="btn primary">${project?'보완 내용 제출':'사업 신청 제출'}</button></div>
    </form></div>`;
}
function projectStatus(id) {
  const project=id?onProject(id):null;
  if (id && !project) return notFound();
  return pageHead('사업 신청 내역','',`<a class="btn small" href="#/project-apply">새 사업 신청</a>`)+`<div class="wrap page-content on-form-width">
    ${project?`<section class="campaign-panel"><span class="tag blue">${projectStates[project.status]}</span>
      <h2>${esc(project.name)}</h2><p class="muted">신청번호 ${esc(project.number)}</p>
      ${project.feedback?`<p class="form-info">${esc(project.feedback)}</p>`:''}
      <div class="on-actions">${project.status==='revision'?`<a class="btn primary" href="#/project-apply/${esc(id)}">신청서 보완</a>`:''}
        ${project.status==='approved'?`<a class="btn primary" href="#/project/${esc(id)}">공개 사업 보기</a>`:''}
        <a class="btn" href="#/project-status">신청 목록</a></div></section>`:
    `<div class="row-list">${db.projects.map(item=>`<a class="list-row" href="#/project-status/${esc(item.id)}"><span class="row-main"><strong>${esc(item.name)}</strong><small> · ${esc(item.number)}</small></span><span class="tag blue">${projectStates[item.status]}</span>${icon('chevron')}</a>`).join('')||'<p class="muted">접수된 사업 신청이 없습니다.</p>'}</div>`}</div>`;
}
function saveProject(form) {
  const old=form.dataset.id?onProject(form.dataset.id):null;
  if (form.dataset.id && old?.status!=='revision') return;
  const values=Object.fromEntries(new FormData(form));
  const name=values.name.trim(),body=values.body.trim(),plan=values.plan.trim(),goal=Number(values.goal);
  if (!name||!body||!plan||!Number.isSafeInteger(goal)||goal<1000||goal>100000000||!directoryMembers().some(org=>org.id===values.orgId)) {
    toast('회원사, 사업 정보, 사용 계획과 목표 금액을 확인해 주세요.');
    return;
  }
  const id=old?.id||'project-'+uid();
  const number=old?.number||'ON-'+String(db.projects.length+1).padStart(4,'0');
  if (putOnRecord('projects',{id,number,orgId:values.orgId,name,body,plan,goal,status:'pending',feedback:''})) go('project-status/'+id);
}
function projectAdmin(id) {
  const project=onProject(id);
  if (!project) return onAdminPage('돌봄사업 심사',`<div class="row-list">${db.projects.map(item=>`<a class="list-row" href="#/admin-projects/${esc(item.id)}"><span class="row-main"><strong>${esc(item.name)}</strong><small> · ${esc(item.number)}</small></span><span class="tag blue">${projectStates[item.status]}</span>${icon('chevron')}</a>`).join('')||'<p class="muted">접수된 사업 신청이 없습니다.</p>'}</div>`);
  const org=directoryMembers().find(item=>item.id===project.orgId);
  return onAdminPage('돌봄사업 심사',`<section class="campaign-panel on-form-width"><a class="backlink" href="#/admin-projects">${icon('back')} 심사 목록</a>
    <h2>${esc(project.name)}</h2><p class="muted">${esc(org?.name)} · ${esc(project.number)} · ${projectStates[project.status]}</p>
    <h3>활동 계획</h3><p class="campaign-prose">${esc(project.body)}</p><h3>사용 계획 · 목표 ${money(project.goal)}</h3><p class="campaign-prose">${esc(project.plan)}</p>
    ${project.status==='pending'?`<form id="on-project-review" data-id="${esc(id)}">
      <label class="field">보완 요청 사유<textarea name="feedback" maxlength="600"></textarea></label><div class="form-actions">
      <button type="button" class="btn" data-on-action="project-review" data-decision="revision">보완 요청</button><button type="button" class="btn primary" data-on-action="project-review" data-decision="approved">승인하고 공개</button></div>
    </form>`:''}${project.status==='approved'?`<a class="btn" href="#/project/${esc(id)}">공개 사업 보기</a>`:''}</section>`);
}
function reviewProject(form,decision) {
  const project=onProject(form.dataset.id);
  if (project?.status!=='pending' || !['revision','approved'].includes(decision)) return;
  const feedback=form.elements.feedback.value.trim();
  if (decision==='revision'&&!feedback) {toast('보완 요청 사유를 적어 주세요.');return;}
  if (putOnRecord('projects',{...project,status:decision,feedback:decision==='revision'?feedback:''})) {
    renderPreserve();
    toast(decision==='approved'?'돌봄사업을 공개했습니다.':'신청 화면에 보완 요청을 표시했습니다.');
  }
}


function newsForMember(member) {
  return publishedNews().filter(story=>story.memberId===member.id||story.members?.includes(member.id)||
    (!story.memberId&&(story.org===member.name||member.aliases?.includes(story.org))));
}
function storyPhotos(story) {
  if (story.photos?.length) return story.photos.map(src=>({src,story}));
  if (story.image) return [{src:story.image,story}];
  const key=storyPhotoKey(story);
  return key?[{key,story}]:[];
}
function galleryPhotos(scope,id) {
  if (scope==='story') {
    const story=findItem(id);
    return story?.type==='news'?storyPhotos(story):[];
  }
  if (scope==='network') {
    return ['field-agreement','field-launch','field-conference','field-seminar','field-naeiln','field-garden'].map(key=>({key,story:publishedNews().find(item=>item.photoKey===key)}));
  }
  const member=givingSubject(id);
  if (!member) return [];
  const key=organizationReferences[id]||(photoData[id]?id:'');
  const sources=[key,member.photo].filter(source=>source&&photoData[source]);
  const stories=newsForMember(member).flatMap(storyPhotos);
  const photos=[...sources.map(key=>stories.find(photo=>photo.key===key)||{key}),...stories];
  const seen=new Set();
  return photos.filter(photo=>{
    const identity=photo.key||photo.src;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}
function galleryImage(photo,eager=false) {
  return photo.key ? referencePhoto(photo.key,eager) : `<img src="${esc(photo.src)}" alt="${esc(photo.story?.title||'현장 사진')}" ${eager?'':'loading="lazy"'} decoding="async">`;
}

function galleryShareRoute(photo) {
  if (photo.key&&!photoData[photo.key].illustrative&&photoData[photo.key].gallery!==false) return 'gallery/'+photo.key;
  return photo.story?'detail/'+photo.story.id:'';
}
function contentShareButton(route,title) {
  if (!canPreviewShare(route)) return '';
  return `<button type="button" class="icon-btn on-tile-share" data-action="share" data-route-share="${esc(route)}" aria-label="${esc(title)} 공유하기" title="공유하기">${icon('share')}</button>`;
}
function galleryTile(photo,scope,id,index,label='') {
  const title=label||photoData[photo.key]?.title||photo.story?.title||'현장 사진';
  const credit=photo.key?photoData[photo.key]?.sourceLabel||photoData[photo.key]?.publisher:'';
  return `<figure class="documented-photo on-gallery-tile">
    <button class="on-gallery-trigger" type="button" data-on-action="gallery" data-scope="${scope}" data-id="${esc(id)}" data-index="${index}" aria-haspopup="dialog" aria-label="${esc(title)} 사진 확대">${galleryImage(photo)}</button>
    <figcaption><strong>${esc(title)}</strong>${photoData[photo.key]?.illustrative?'<small>분야 참고 이미지 · AI 생성</small>':credit?`<small>사진 출처 · ${esc(credit)}</small>`:''}</figcaption>
    ${contentShareButton(galleryShareRoute(photo),title)}
  </figure>`;
}
function onGallery(scope,id,index) {
  const photos=galleryPhotos(scope,id);
  if (!photos.length) return;
  const i=Number.isSafeInteger(index)?((index%photos.length)+photos.length)%photos.length:0;
  const photo=photos[i];
  const title=photoData[photo.key]?.title||photo.story?.title||'현장 사진';
  const origin=$('#modal').hidden?document.activeElement:lastFocus;
  const source=photo.key?photoCredit(photo.key):`<div class="photo-credit">사진 · ${esc(photo.story.org)}</div>`;
  const links=`${photo.story&&scope!=='story'?`<a class="btn small" href="#/detail/${esc(photo.story.id)}">관련 소식</a>`:''}
    ${scope==='member'&&activeRoute!=='member/'+id?`<a class="btn small" href="#/member/${esc(id)}">회원사 상세</a>`:''}`;
  const control=(delta,label)=>`<button class="btn small" data-on-action="gallery" data-scope="${scope}" data-id="${esc(id)}" data-index="${i+delta}" data-gallery-step="${delta}">${label}</button>`;
  openModal(title,'',`<div class="full-photo-wrap on-gallery-full">${galleryImage(photo,true)}</div>${source}
    <div class="on-actions on-gallery-actions">${photos.length>1?control(-1,'이전 사진'):''}<span role="status">${i+1} / ${photos.length}</span>${photos.length>1?control(1,'다음 사진'):''}${links}${contentShareButton(galleryShareRoute(photo),title)}</div>`);
  lastFocus=origin;
  const dialog=$('#modal .dialog');
  dialog.classList.add('photo-dialog');
  $('.on-gallery-full img',dialog).classList.add('full-photo');
  dialog.addEventListener('keydown',event=>{
    const step=event.key==='ArrowLeft'?-1:event.key==='ArrowRight'?1:0;
    if (step&&photos.length>1) {event.preventDefault();onGallery(scope,id,i+step);}
  });
  const surface=$('.on-gallery-full',dialog);
  let start;
  surface.addEventListener('pointerdown',event=>{
    if (event.pointerType!=='mouse'&&event.isPrimary) start=[event.clientX,event.clientY];
  });
  surface.addEventListener('pointercancel',()=>{start=null;});
  surface.addEventListener('pointerup',event=>{
    if (!start||photos.length<2) return;
    const dx=event.clientX-start[0],dy=event.clientY-start[1];
    start=null;
    if (Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.3) onGallery(scope,id,i+(dx<0?1:-1));
  });
}
function onNetworkGallery() {
  const network=galleryPhotos('network','').map((photo,index)=>({photo,scope:'network',id:'',index}));
  const memberCovers=directoryMembers().flatMap(member=>{
    const [photo]=galleryPhotos('member',member.id);
    return photo?[{photo,scope:'member',id:member.id,index:0,label:member.name}]:[];
  });
  return `<div class="section"><div class="wrap">${feedSection('home-gallery','대구 돌봄 현장 갤러리',[...network,...memberCovers],item=>galleryTile(item.photo,item.scope,item.id,item.index,item.label),{layout:'grid',initial:4,kind:'gallery'})}</div></div>`;
}
function onMemberMedia(member,kind) {
  if (kind==='news') {
    const stories=newsForMember(member);
    return feedSection('member-news-'+member.id,'활동소식',stories,newsCard,{kind:'news',layout:'list',emptyText:'등록된 활동소식이 없습니다.'});
  }
  const photos=galleryPhotos('member',member.id);
  return feedSection('member-gallery-'+member.id,'현장 갤러리',photos,(photo,index)=>galleryTile(photo,'member',member.id,index),{kind:'gallery',layout:'grid',initial:4,emptyText:'등록된 현장 사진이 없습니다.'});
}
function articleMedia(story) {
  const photos=storyPhotos(story);
  if (!photos.length) return story.verified?'':newsArt(story.style);
  return `<div class="on-story-photos">${photos.map((photo,i)=>galleryTile(photo,'story',story.id,i)).join('')}</div>`;
}
function relatedStoryActions(story) {
  const owners=directoryMembers().filter(member=>story.memberId===member.id||story.members?.includes(member.id)||story.org===member.name);
  const related=[...new Map(owners.flatMap(newsForMember).filter(item=>item.id!==story.id).map(item=>[item.id,item])).values()].slice(0,2);
  if (!owners.length) return '';
  return `<section class="body-block"><h2>관련 회원사</h2><div class="on-actions">${owners.map(member=>`<a class="btn small" href="#/member/${esc(member.id)}">${esc(member.name)} ${icon('arrow')}</a>`).join('')}
    ${owners.length===1&&campaignFor(owners[0])?`<button class="btn primary small" data-action="campaign-give" data-id="${esc(owners[0].id)}">이 회원사 후원하기</button>`:''}</div>
    ${related.length?`<h3>다른 활동소식</h3><div class="row-list">${related.map(policyRow).join('')}</div>`:''}</section>`;
}
function adminStories(orgId='',id='') {
  const orgs=directoryMembers();
  const post=id?db.posts.find(item=>item.id===id&&item.type==='news'):null;
  const org=orgs.find(member=>member.id===orgId);
  if (!org) return onAdminPage('회원사 활동소식 관리',`<div class="row-list">${orgs.map(member=>`<a class="list-row" href="#/admin-stories/${esc(member.id)}"><span class="row-main">${esc(member.name)}</span>${icon('chevron')}</a>`).join('')}</div>`);
  if (id&&(!post||(post.memberId?post.memberId!==org.id:post.org!==org.name))) return notFound();
  const base='admin-stories/'+org.id;
  const posts=db.posts.filter(item=>item.type==='news'&&(item.memberId?item.memberId===org.id:item.org===org.name));
  const savedPhotos=post?.photos||(post?.image?[post.image]:[]);
  return onAdminPage(post?'활동소식 수정':'활동소식 작성',`<div class="on-form-width">
    <p class="muted">${esc(org.name)}</p>
    <form id="on-story-form" class="campaign-panel" data-id="${esc(id)}" data-org="${esc(org.id)}">
      <div class="field-row"><label class="field">분류<select name="category">${['현장 이야기','교육·소식','서비스 소개'].map(value=>`<option ${post?.category===value?'selected':''}>${value}</option>`).join('')}</select></label>
      <label class="field">활동 날짜<input type="date" name="date" value="${esc(/^\d{4}-\d{2}-\d{2}$/.test(post?.date||'')?post.date:'')}" required></label></div>
      <label class="field">제목<input name="title" required maxlength="90" value="${esc(post?.title)}"></label>
      <label class="field">본문<textarea name="body" required maxlength="5000">${esc(post?.body)}</textarea></label>
      <label class="field">원문 링크 (선택)<input type="url" name="url" value="${esc(post?.url)}"></label>
      <label class="field">활동 사진 · 최대 3장<input type="file" id="on-story-files" accept="image/jpeg,image/png,image/webp" multiple></label>
      <div id="on-story-previews" class="on-photo-previews">${storyPhotoPreviews(savedPhotos)}</div>
      <div class="form-actions">${post?`<a class="btn" href="#/${esc(base)}">새 소식 작성</a>`:''}<button class="btn primary" type="submit">${post?'수정본 검토 요청':'게시 요청'}</button></div>
    </form>
    <section class="campaign-panel"><h2>작성한 소식</h2><div class="row-list">${posts.map(item=>`<div class="list-row"><div class="row-main"><h3>${esc(item.title)}</h3><small>${{pending:'검토 대기',approved:'공개',rejected:'반려'}[item.status]}</small></div>
      ${item.status==='approved'?`<a class="btn small" href="#/detail/${esc(item.id)}">소식 보기</a>`:''}
      <a class="btn small" href="#/${esc(base)}/${esc(item.id)}">수정</a></div>`).join('')||'<p class="muted">작성한 소식이 없습니다.</p>'}</div></section></div>`);
}
const photoDrafts=new WeakMap();
function storyPhotoDraft(form) {
  if (!photoDrafts.has(form)) {
    const post=db.posts.find(item=>item.id===form.dataset.id);
    photoDrafts.set(form,post?.photos?.slice()||(post?.image?[post.image]:[]));
  }
  return photoDrafts.get(form);
}
function storyPhotoPreviews(photos) {
  return photos.map((src,i)=>`<div><img src="${esc(src)}" alt="활동 사진 ${i+1}"><small>${i===0?'대표 사진':'사진 '+(i+1)}</small><button class="link" type="button" data-on-action="remove-story-photo" data-index="${i}" aria-label="사진 ${i+1} 삭제">삭제</button></div>`).join('');
}
async function encodeStoryPhoto(file) {
  const url=URL.createObjectURL(file);
  try {
    const image=new Image();
    image.src=url;
    await image.decode();
    const ratio=Math.min(1,1200/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));
    canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    const data=canvas.toDataURL('image/webp',.78);
    if (data.length>700000) throw new Error('photo-size');
    return data;
  } finally {URL.revokeObjectURL(url);}
}
async function addStoryPhotos(input) {
  const form=input.form;
  const files=[...input.files];
  input.value='';
  const photos=storyPhotoDraft(form);
  if (!files.length) return;
  if (files.length+photos.length>3 || files.some(file=>file.size>10*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))) {
    toast('10MB 이하 JPG·PNG·WebP 사진을 최대 3장까지 등록할 수 있습니다.');
    return;
  }
  const submit=$('button[type="submit"]',form);
  input.disabled=submit.disabled=true;
  try {
    const added=await Promise.all(files.map(encodeStoryPhoto));
    if (!form.isConnected) return;
    photos.push(...added);
    $('#on-story-previews').innerHTML=storyPhotoPreviews(photos);
  } catch {
    if (form.isConnected) toast('사진을 열 수 없습니다. 다른 사진을 선택해 주세요.');
  } finally {input.disabled=submit.disabled=false;}
}
function saveOnStory(form) {
  const org=directoryMembers().find(item=>item.id===form.dataset.org);
  const old=db.posts.find(item=>item.id===form.dataset.id);
  if (!org || (form.dataset.id&&(!old||old.type!=='news'||(old.memberId?old.memberId!==org.id:old.org!==org.name)))) return;
  const values=Object.fromEntries(new FormData(form));
  if (!values.title.trim()||!values.body.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(values.date)||(values.url&&!cleanURL(values.url))) {
    toast('제목, 본문, 날짜와 링크를 확인해 주세요.');
    return;
  }
  const photos=storyPhotoDraft(form).slice();
  const post={...old,id:old?.id||'local-'+uid(),type:'news',org:org.name,memberId:org.id,title:values.title.trim(),body:values.body.trim(),category:values.category,date:values.date,
    url:cleanURL(values.url),photos,image:photos[0]||'',isLocal:true,status:'pending'};
  if (putOnRecord('posts',post)) {
    const next='admin-stories/'+org.id;
    if (activeRoute===next) renderPreserve();else go(next);
    toast('운영관리의 등록 요청에서 승인할 수 있습니다.');
  }
}


const onProfileKey='daegu-on-provider-profiles-v1';
let onProfiles={};
try {onProfiles=JSON.parse(sessionStorage.getItem(onProfileKey)||'{}')||{};} catch {}
function onAffiliationChoices() {
  return [{id:'individual',name:'개인 후원자'},...directoryMembers().map(org=>({id:org.id,name:org.name,area:org.district})),
    ...db.affiliations.filter(item=>item.status==='approved')];
}
function onAffiliationOptions(query,selected) {
  const words=query.normalize('NFKC').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches=onAffiliationChoices().filter(item=>words.every(word=>(item.name+' '+(item.area||'')).toLowerCase().includes(word)));
  return `<option value="">소속 선택 · ${matches.length}개</option>${matches.map(item=>`<option value="${esc(item.id)}" ${selected===item.id?'selected':''}>${esc(item.name)}${item.area?' · '+esc(item.area):''}</option>`).join('')}`;
}
function setOnProfile(account,memberId='') {
  demoAccount=account;
  onProfiles[account.provider]=account;
  try {
    sessionStorage.setItem(accountKey,JSON.stringify(account));
    sessionStorage.setItem(onProfileKey,JSON.stringify(onProfiles));
  } catch {}
  updateAccountButton();
  const origin=lastFocus;
  if (memberId) {showGiftForm(memberId);lastFocus=origin;}
  else {closeModal();if (activeRoute==='my') renderPreserve();toast('시연 계정의 소속을 저장했습니다.');}
}
function openOnAffiliation(provider,memberId='',editing=false) {
  if (!Object.hasOwn(signInProviders,provider)) return;
  if (!editing&&onProfiles[provider]?.affiliation) {setOnProfile(onProfiles[provider],memberId);return;}
  const current=editing?demoAccount:null;
  const selected=current?.affiliationId||onAffiliationChoices().find(item=>item.name===current?.affiliation)?.id||'';
  const mode=current&&!selected?'direct':'select';
  const origin=lastFocus;
  openModal(editing?'소속 변경':'소속을 선택해 주세요',signInProviders[provider].name+' 로그인 시연',`
    <form id="on-affiliation-form" data-provider="${provider}" data-member="${esc(memberId)}">
      <label class="field">등록 방식<select name="mode" id="on-affiliation-mode">
        <option value="select">등록 소속·개인 후원자 선택</option><option value="direct" ${mode==='direct'?'selected':''}>직접 입력</option><option value="request">소속 추가 신청</option></select></label>
      <div id="on-affiliation-select" ${mode==='select'?'':'hidden'}>
        <label class="field">소속명·지역 검색<input id="on-affiliation-search" type="search" placeholder="예: 동구 또는 기관명"></label>
        <label class="field">검색 결과<select name="affiliation" id="on-affiliation-result">${onAffiliationOptions('',selected)}</select></label></div>
      <div id="on-affiliation-manual" ${mode==='direct'?'':'hidden'}>
        <label class="field">소속명<input name="affiliationName" maxlength="60" value="${mode==='direct'?esc(current.affiliation):''}"></label>
        <div id="on-affiliation-area" hidden><label class="field">지역 (선택)<input name="area" maxlength="40"></label><p class="muted smalltext">신청한 이름은 바로 사용하고, 승인되면 검색 목록에 표시됩니다.</p></div>
      </div><div class="form-actions"><button type="button" class="btn" data-action="${editing?'close':'sign-in-back'}" data-id="${esc(memberId)}">${editing?'취소':'이전'}</button>
      <button class="btn primary">${memberId?'저장하고 후원 계속':'소속 저장'}</button></div>
    </form>`);
  lastFocus=origin;
}
function saveOnAffiliation(form) {
  const {provider,member}=form.dataset;
  if (!Object.hasOwn(signInProviders,provider)) return;
  const values=Object.fromEntries(new FormData(form));
  let choice=onAffiliationChoices().find(item=>item.id===values.affiliation);
  if (values.mode!=='select') {
    const name=values.affiliationName.trim().replace(/\s+/g,' ');
    if (!name) {toast('소속명을 입력해 주세요.');return;}
    const area=values.area.trim();
    const existing=db.affiliations.find(item=>item.name===name&&item.area===area);
    choice=values.mode==='request'?(existing||{id:'aff-'+uid(),name,area,status:'pending'}):{id:'name:'+name.normalize('NFKC').toLowerCase(),name};
    if (values.mode==='request'&&!existing&&!putOnRecord('affiliations',choice)) return;
  }
  if (!choice) {toast('소속을 선택해 주세요.');return;}
  setOnProfile({provider,affiliation:choice.name,affiliationId:choice.id},member);
}
function adminAffiliations() {
  return onAdminPage('소속 추가 신청',`<div class="row-list">${db.affiliations.map(item=>`<div class="list-row"><div class="row-main"><h3>${esc(item.name)}</h3><small>${esc(item.area)}</small></div>
    ${item.status==='pending'?`<button class="btn small" data-on-action="approve-affiliation" data-id="${esc(item.id)}">검색 목록에 추가</button>`:'<span class="tag green">목록 등록</span>'}</div>`).join('')||'<p class="muted">접수된 신청이 없습니다.</p>'}</div>`);
}
let giftAffiliationFilter='';
function recordedOnAffiliation(gift) {
  return gift.affiliation||{id:'legacy',name:'소속이 저장되기 전 거래'};
}
function adminGifts() {
  const groups=new Map();
  for (const gift of db.gifts) {
    const {id,name}=recordedOnAffiliation(gift);
    const group=groups.get(id)||{id,name,amount:0,count:0};
    group.amount+=gift.amount;
    group.count++;
    groups.set(id,group);
  }
  const aggregate=[...groups.values()].sort((a,b)=>b.amount-a.amount);
  const gifts=db.gifts.filter(gift=>!giftAffiliationFilter||recordedOnAffiliation(gift).id===giftAffiliationFilter).slice().reverse();
  return onAdminPage('후원 거래 내역',`<section class="campaign-panel"><h2>소속별 후원 집계</h2>
    <div class="row-list">${aggregate.map(group=>`<div class="list-row"><div class="row-main">${esc(group.name)}</div><strong>${money(group.amount)}</strong><small>${group.count}건</small></div>`).join('')||'<p class="muted">집계된 후원이 없습니다.</p>'}</div>
    </section><section class="campaign-panel"><h2>거래 목록</h2><label class="field on-filter">후원 당시 소속<select id="on-gift-filter"><option value="">전체</option>
    ${aggregate.map(group=>`<option value="${esc(group.id)}" ${giftAffiliationFilter===group.id?'selected':''}>${esc(group.name)}</option>`).join('')}</select></label>
    <div class="row-list">${gifts.map(gift=>{
      const subject=givingSubject(gift.memberId);
      return `<div class="list-row on-transaction"><div class="row-main"><h3>${esc(subject?.name||'이전 후원 대상')}</h3>
      <p>${esc(recordedOnAffiliation(gift).name)} · ${giftTypes[gift.type]} · ${paymentMethods[gift.method]}</p>
      <small>${gift.at?kstDate.format(new Date(gift.at))+' · ':''}${esc(gift.id)}</small></div><strong>${money(gift.amount)}</strong></div>`;
    }).join('')||'<p class="muted">표시할 후원 거래가 없습니다.</p>'}</div></section>`);
}
function onGivingSummary() {
  const orgs=directoryMembers();
  const totals=[...orgs,...publishedProjects()].filter(campaignFor).map(campaignTotals);
  const stats=[['참여 확정기관',organizations.length+'곳'],['누적 후원금',money(totals.reduce((sum,t)=>sum+t.raised,0))],['후원 건수',campaignAmountFormat.format(totals.reduce((sum,t)=>sum+t.count,0))+'건']];
  return `<section class="on-summary" aria-label="전체 후원 현황"><div class="wrap on-summary-inner">
    <h2>전체 후원 현황 <small>시연</small></h2>
    <dl>${stats.map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl><a class="link" href="#/giving-guide">후원 안내 ${icon('arrow')}</a>
  </div></section>`;
}
const givingQuestions=[
  ['어디에 후원할 수 있나요?','회원사의 모금 페이지 또는 승인된 돌봄사업 페이지에서 후원할 수 있습니다.'],
  ['후원금 사용 계획은 어디에서 보나요?','각 모금 페이지의 후원금 사용 계획에서 확인할 수 있습니다.'],
  ['일시후원과 정기후원은 어떻게 다른가요?','일시후원은 한 번, 정기후원은 매월 참여하는 방식입니다. 정기후원 시연에서는 첫 회 금액을 집계에 반영합니다.'],
  ['후원 내역은 어디에서 확인하나요?','로그인 후 오른쪽 상단의 내 후원을 누르세요.'],
  ['기부금영수증은 어떻게 확인하나요?','시연에서는 영수증이 발급되지 않습니다. 실제 모금의 발급 안내는 운영이 시작되면 제공됩니다.']
];
function givingGuide() {
  return pageHead('후원 안내','',`<a class="btn primary" href="#/members">후원할 회원사 찾기 ${icon('arrow')}</a>`)+`<div class="wrap page-content on-form-width">
    ${givingQuestions.map(([q,a])=>`<details class="on-faq"><summary>${q}</summary><p>${a}</p></details>`).join('')}
    ${onCoverFigure('field-garden')}
  </div>`;
}
const launchChecks=[
  ['members','회원사·사업 정보 확인','담당자, 연락처, 후원금 사용 계획'],
  ['media','공개 자료와 공유 확인','사진 출처, 게시 승인, SNS 링크 미리보기'],
  ['affiliation','로그인·소속 흐름 확인','소속 검색, 추가 신청, 승인과 변경'],
  ['giving','후원·집계 흐름 확인','일시·정기, 실패 재시도, 거래 내역'],
  ['operations','운영 전 연동 준비','실제 인증, 결제, 권한, 정산·증빙 안내']
];
function launchPage() {
  return onAdminPage('공개 준비',`<section class="campaign-panel on-form-width">
    <h2>화면·운영 검수</h2><p class="muted"><strong id="on-launch-count">${db.launch.length}</strong> / ${launchChecks.length} 확인</p>
    <progress id="on-launch-progress" class="campaign-progress" value="${db.launch.length}" max="${launchChecks.length}" aria-label="공개 준비 완료 수"></progress>
    ${launchChecks.map(([key,title,desc])=>`<label class="on-check"><input type="checkbox" data-on-launch="${key}" ${db.launch.includes(key)?'checked':''}><span><strong>${title}</strong><small>${desc}</small></span></label>`).join('')}
    </section>
    <section class="campaign-panel on-form-width">
      <div class="campaign-panel-heading"><h2>실서비스 전환</h2><span class="tag demo">연동 전</span></div>
      <dl class="campaign-facts">
        <div><dt>회원 인증</dt><dd>SNS 로그인, 회원사 소속 검증, 운영자 권한</dd></div>
        <div><dt>운영 서버</dt><dd>신청·승인·게시·후원 내역의 서버 저장과 접근 제어</dd></div>
        <div><dt>후원 결제</dt><dd>일시·정기 결제, 승인·실패 처리, 정산·영수증</dd></div>
        <div><dt>공개 검수</dt><dd>운영 주체와 문의처, 공개할 기관·모금 정보, 사진 사용 범위 확인</dd></div>
      </dl>
    </section>`);
}
function onFeatureClick(event) {
  const target=event.target.closest('[data-on-action]');
  if (!target) return;
  const {onAction,id,scope,index}=target.dataset;
  if (onAction==='system-share') systemShare();
  if (onAction==='project-review') reviewProject(target.closest('form'),target.dataset.decision);
  if (onAction==='gallery') onGallery(scope,id,Number(index));
  if (onAction==='edit-affiliation'&&demoAccount) openOnAffiliation(demoAccount.provider,'',true);
  if (onAction==='approve-affiliation') {
    const item=db.affiliations.find(entry=>entry.id===id);
    if (item?.status==='pending'&&putOnRecord('affiliations',{...item,status:'approved'})) renderPreserve();
  }
  if (onAction==='remove-story-photo') {
    const form=target.closest('form');
    const photos=storyPhotoDraft(form);
    photos.splice(Number(index),1);
    $('#on-story-previews').innerHTML=storyPhotoPreviews(photos);
    $('#on-story-files').focus();
  }
}
function onFeatureInput(event) {
  if (event.target.id==='on-affiliation-search') {
    const select=$('#on-affiliation-result');
    select.innerHTML=onAffiliationOptions(event.target.value,select.value);
  }
}
function onFeatureChange(event) {
  const target=event.target;
  if (target.id==='on-story-files') addStoryPhotos(target);
  if (target.id==='on-affiliation-mode') {
    $('#on-affiliation-select').hidden=target.value!=='select';
    $('#on-affiliation-manual').hidden=target.value==='select';
    $('#on-affiliation-area').hidden=target.value!=='request';
  }
  if (target.id==='on-gift-filter') {
    giftAffiliationFilter=target.value;
    renderPreserve();
  }
  if (target.dataset.onLaunch) {
    const key=target.dataset.onLaunch,before=db.launch;
    db.launch=target.checked?[...new Set([...before,key])]:before.filter(value=>value!==key);
    if (!persist()) {db.launch=before;target.checked=before.includes(key);}
    $('#on-launch-count').textContent=db.launch.length;
    $('#on-launch-progress').value=db.launch.length;
  }
}
function onFeatureSubmit(event) {
  const form=event.target;
  switch(form.id) {
    case 'on-project-form':event.preventDefault();saveProject(form);break;
    case 'on-project-review':event.preventDefault();break;
    case 'on-story-form':event.preventDefault();saveOnStory(form);break;
    case 'on-affiliation-form':event.preventDefault();saveOnAffiliation(form);break;
  }
}

// Generated by scripts/build-image-previews.py.
const onImagePreviews = {
  "policy/01-integrated-care.jpg": {
    "original": [
      "policy/01-integrated-care.jpg",
      640,
      360,
      "image/jpeg"
    ],
    "wide": [
      "policy/01-integrated-care.jpg",
      640,
      360,
      "image/jpeg"
    ],
    "classic": [
      "previews/01-integrated-care/classic-480x360.webp",
      480,
      360,
      "image/webp"
    ],
    "square": [
      "previews/01-integrated-care/square-360x360.webp",
      360,
      360,
      "image/webp"
    ],
    "social": [
      "previews/01-integrated-care/social-640x336.jpg",
      640,
      336,
      "image/jpeg"
    ],
    "x": [
      "previews/01-integrated-care/x-640x320.jpg",
      640,
      320,
      "image/jpeg"
    ]
  },
  "policy/02-daegu-services.jpg": {
    "original": [
      "policy/02-daegu-services.jpg",
      640,
      360,
      "image/jpeg"
    ],
    "wide": [
      "policy/02-daegu-services.jpg",
      640,
      360,
      "image/jpeg"
    ],
    "classic": [
      "previews/02-daegu-services/classic-480x360.webp",
      480,
      360,
      "image/webp"
    ],
    "square": [
      "previews/02-daegu-services/square-360x360.webp",
      360,
      360,
      "image/webp"
    ],
    "social": [
      "previews/02-daegu-services/social-640x336.jpg",
      640,
      336,
      "image/jpeg"
    ],
    "x": [
      "previews/02-daegu-services/x-640x320.jpg",
      640,
      320,
      "image/jpeg"
    ]
  },
  "policy/03-policy-resources.jpg": {
    "original": [
      "policy/03-policy-resources.jpg",
      640,
      360,
      "image/jpeg"
    ],
    "wide": [
      "policy/03-policy-resources.jpg",
      640,
      360,
      "image/jpeg"
    ],
    "classic": [
      "previews/03-policy-resources/classic-480x360.webp",
      480,
      360,
      "image/webp"
    ],
    "square": [
      "previews/03-policy-resources/square-360x360.webp",
      360,
      360,
      "image/webp"
    ],
    "social": [
      "previews/03-policy-resources/social-640x336.jpg",
      640,
      336,
      "image/jpeg"
    ],
    "x": [
      "previews/03-policy-resources/x-640x320.jpg",
      640,
      320,
      "image/jpeg"
    ]
  },
  "policy/04-care-application.jpg": {
    "original": [
      "policy/04-care-application.jpg",
      640,
      360,
      "image/jpeg"
    ],
    "wide": [
      "policy/04-care-application.jpg",
      640,
      360,
      "image/jpeg"
    ],
    "classic": [
      "previews/04-care-application/classic-480x360.webp",
      480,
      360,
      "image/webp"
    ],
    "square": [
      "previews/04-care-application/square-360x360.webp",
      360,
      360,
      "image/webp"
    ],
    "social": [
      "previews/04-care-application/social-640x336.jpg",
      640,
      336,
      "image/jpeg"
    ],
    "x": [
      "previews/04-care-application/x-640x320.jpg",
      640,
      320,
      "image/jpeg"
    ]
  },
  "policy/05-care-act.jpg": {
    "original": [
      "policy/05-care-act.jpg",
      640,
      360,
      "image/jpeg"
    ],
    "wide": [
      "policy/05-care-act.jpg",
      640,
      360,
      "image/jpeg"
    ],
    "classic": [
      "previews/05-care-act/classic-480x360.webp",
      480,
      360,
      "image/webp"
    ],
    "square": [
      "previews/05-care-act/square-360x360.webp",
      360,
      360,
      "image/webp"
    ],
    "social": [
      "previews/05-care-act/social-640x336.jpg",
      640,
      336,
      "image/jpeg"
    ],
    "x": [
      "previews/05-care-act/x-640x320.jpg",
      640,
      320,
      "image/jpeg"
    ]
  },
  "policy/06-regional-directory.jpg": {
    "original": [
      "policy/06-regional-directory.jpg",
      640,
      360,
      "image/jpeg"
    ],
    "wide": [
      "policy/06-regional-directory.jpg",
      640,
      360,
      "image/jpeg"
    ],
    "classic": [
      "previews/06-regional-directory/classic-480x360.webp",
      480,
      360,
      "image/webp"
    ],
    "square": [
      "previews/06-regional-directory/square-360x360.webp",
      360,
      360,
      "image/webp"
    ],
    "social": [
      "previews/06-regional-directory/social-640x336.jpg",
      640,
      336,
      "image/jpeg"
    ],
    "x": [
      "previews/06-regional-directory/x-640x320.jpg",
      640,
      320,
      "image/jpeg"
    ]
  },
  "care-pilot-reference.webp": {
    "original": [
      "care-pilot-reference.webp",
      1536,
      1024,
      "image/webp"
    ],
    "wide": [
      "previews/care-pilot-reference/wide-1200x675.webp",
      1200,
      675,
      "image/webp"
    ],
    "classic": [
      "previews/care-pilot-reference/classic-1200x900.webp",
      1200,
      900,
      "image/webp"
    ],
    "square": [
      "previews/care-pilot-reference/square-960x960.webp",
      960,
      960,
      "image/webp"
    ],
    "social": [
      "previews/care-pilot-reference/social-1200x630.jpg",
      1200,
      630,
      "image/jpeg"
    ],
    "x": [
      "previews/care-pilot-reference/x-1200x600.jpg",
      1200,
      600,
      "image/jpeg"
    ]
  },
  "health-forum-reference.webp": {
    "original": [
      "health-forum-reference.webp",
      1536,
      1024,
      "image/webp"
    ],
    "wide": [
      "previews/health-forum-reference/wide-1200x675.webp",
      1200,
      675,
      "image/webp"
    ],
    "classic": [
      "previews/health-forum-reference/classic-1200x900.webp",
      1200,
      900,
      "image/webp"
    ],
    "square": [
      "previews/health-forum-reference/square-960x960.webp",
      960,
      960,
      "image/webp"
    ],
    "social": [
      "previews/health-forum-reference/social-1200x630.jpg",
      1200,
      630,
      "image/jpeg"
    ],
    "x": [
      "previews/health-forum-reference/x-1200x600.jpg",
      1200,
      600,
      "image/jpeg"
    ]
  },
  "community-care-forum-reference.webp": {
    "original": [
      "community-care-forum-reference.webp",
      1536,
      1024,
      "image/webp"
    ],
    "wide": [
      "previews/community-care-forum-reference/wide-1200x675.webp",
      1200,
      675,
      "image/webp"
    ],
    "classic": [
      "previews/community-care-forum-reference/classic-1200x900.webp",
      1200,
      900,
      "image/webp"
    ],
    "square": [
      "previews/community-care-forum-reference/square-960x960.webp",
      960,
      960,
      "image/webp"
    ],
    "social": [
      "previews/community-care-forum-reference/social-1200x630.jpg",
      1200,
      630,
      "image/jpeg"
    ],
    "x": [
      "previews/community-care-forum-reference/x-1200x600.jpg",
      1200,
      600,
      "image/jpeg"
    ]
  },
  "seoul-home-care.jpg": {
    "original": [
      "seoul-home-care.jpg",
      760,
      570,
      "image/jpeg"
    ]
  },
  "gangnam-home-health.webp": {
    "original": [
      "gangnam-home-health.webp",
      1200,
      779,
      "image/webp"
    ]
  },
  "guro-home-repair.webp": {
    "original": [
      "guro-home-repair.webp",
      1200,
      900,
      "image/webp"
    ]
  },
  "guro-meal-support.webp": {
    "original": [
      "guro-meal-support.webp",
      1200,
      900,
      "image/webp"
    ]
  },
  "guro-senior-exercise.webp": {
    "original": [
      "guro-senior-exercise.webp",
      1027,
      680,
      "image/webp"
    ]
  },
  "seoul-digital-learning.jpg": {
    "original": [
      "seoul-digital-learning.jpg",
      1200,
      750,
      "image/jpeg"
    ]
  },
  "guro-community-garden.webp": {
    "original": [
      "guro-community-garden.webp",
      1200,
      900,
      "image/webp"
    ]
  },
  "field-agreement.webp": {
    "original": [
      "field-agreement.webp",
      1200,
      734,
      "image/webp"
    ],
    "wide": [
      "previews/field-agreement/wide-1200x675.webp",
      1200,
      675,
      "image/webp"
    ],
    "classic": [
      "previews/field-agreement/classic-976x732.webp",
      976,
      732,
      "image/webp"
    ],
    "square": [
      "previews/field-agreement/square-734x734.webp",
      734,
      734,
      "image/webp"
    ],
    "social": [
      "previews/field-agreement/social-1200x630.jpg",
      1200,
      630,
      "image/jpeg"
    ],
    "x": [
      "previews/field-agreement/x-1200x600.jpg",
      1200,
      600,
      "image/jpeg"
    ]
  },
  "field-launch.webp": {
    "original": [
      "field-launch.webp",
      1400,
      933,
      "image/webp"
    ],
    "wide": [
      "previews/field-launch/wide-1200x675.webp",
      1200,
      675,
      "image/webp"
    ],
    "classic": [
      "previews/field-launch/classic-1200x900.webp",
      1200,
      900,
      "image/webp"
    ],
    "square": [
      "previews/field-launch/square-933x933.webp",
      933,
      933,
      "image/webp"
    ],
    "social": [
      "previews/field-launch/social-1200x630.jpg",
      1200,
      630,
      "image/jpeg"
    ],
    "x": [
      "previews/field-launch/x-1200x600.jpg",
      1200,
      600,
      "image/jpeg"
    ]
  },
  "field-conference.webp": {
    "original": [
      "field-conference.webp",
      1381,
      987,
      "image/webp"
    ],
    "wide": [
      "previews/field-conference/wide-1200x675.webp",
      1200,
      675,
      "image/webp"
    ],
    "classic": [
      "previews/field-conference/classic-1200x900.webp",
      1200,
      900,
      "image/webp"
    ],
    "square": [
      "previews/field-conference/square-960x960.webp",
      960,
      960,
      "image/webp"
    ],
    "social": [
      "previews/field-conference/social-1200x630.jpg",
      1200,
      630,
      "image/jpeg"
    ],
    "x": [
      "previews/field-conference/x-1200x600.jpg",
      1200,
      600,
      "image/jpeg"
    ]
  },
  "field-seminar.webp": {
    "original": [
      "field-seminar.webp",
      1400,
      1050,
      "image/webp"
    ],
    "wide": [
      "previews/field-seminar/wide-1200x675.webp",
      1200,
      675,
      "image/webp"
    ],
    "classic": [
      "previews/field-seminar/classic-1200x900.webp",
      1200,
      900,
      "image/webp"
    ],
    "square": [
      "previews/field-seminar/square-960x960.webp",
      960,
      960,
      "image/webp"
    ],
    "social": [
      "previews/field-seminar/social-1200x630.jpg",
      1200,
      630,
      "image/jpeg"
    ],
    "x": [
      "previews/field-seminar/x-1200x600.jpg",
      1200,
      600,
      "image/jpeg"
    ]
  },
  "field-naeiln.webp": {
    "original": [
      "field-naeiln.webp",
      1071,
      803,
      "image/webp"
    ],
    "wide": [
      "previews/field-naeiln/wide-1056x594.webp",
      1056,
      594,
      "image/webp"
    ],
    "classic": [
      "previews/field-naeiln/classic-1068x801.webp",
      1068,
      801,
      "image/webp"
    ],
    "square": [
      "previews/field-naeiln/square-803x803.webp",
      803,
      803,
      "image/webp"
    ],
    "social": [
      "previews/field-naeiln/social-1040x546.jpg",
      1040,
      546,
      "image/jpeg"
    ],
    "x": [
      "previews/field-naeiln/x-1070x535.jpg",
      1070,
      535,
      "image/jpeg"
    ]
  },
  "field-garden.webp": {
    "original": [
      "field-garden.webp",
      1071,
      803,
      "image/webp"
    ],
    "wide": [
      "previews/field-garden/wide-1056x594.webp",
      1056,
      594,
      "image/webp"
    ],
    "classic": [
      "previews/field-garden/classic-1068x801.webp",
      1068,
      801,
      "image/webp"
    ],
    "square": [
      "previews/field-garden/square-803x803.webp",
      803,
      803,
      "image/webp"
    ],
    "social": [
      "previews/field-garden/social-1040x546.jpg",
      1040,
      546,
      "image/jpeg"
    ],
    "x": [
      "previews/field-garden/x-1070x535.jpg",
      1070,
      535,
      "image/jpeg"
    ]
  },
  "seoul-visiting-health.jpg": {
    "original": [
      "seoul-visiting-health.jpg",
      630,
      425,
      "image/jpeg"
    ]
  },
  "gimpo-disability-photo-exhibition.webp": {
    "original": [
      "gimpo-disability-photo-exhibition.webp",
      1280,
      853,
      "image/webp"
    ]
  },
  "gimpo-small-library.webp": {
    "original": [
      "gimpo-small-library.webp",
      1280,
      853,
      "image/webp"
    ]
  }
};
const offlinePreviewImages = null;

const onPublicSections = {
  home: ['/', '홈', '대구 지역의 통합돌봄 참여기관, 돌봄 활동, 정책정보와 공식 안내를 확인하세요.'],
  about: ['/about.html', '네트워크 소개', '대구광역 통합돌봄 네트워크의 설립 경과, 참여기관과 활동 기록을 확인하세요.'],
  members: ['/members.html', '참여기관', '대구의 방문요양·방문진료·생활지원 등 통합돌봄 참여기관을 분야와 지역별로 찾아보세요.'],
  news: ['/news.html', '활동소식', '대구 통합돌봄 현장의 활동소식과 관련 기관, 사진 출처를 확인하세요.'],
  policy: ['/policy.html', '통합돌봄 정책정보', '통합돌봄 제도, 대구 지역 서비스, 신청 절차와 정책자료의 공식 원문을 확인하세요.'],
  events: ['/events.html', '교육·행사', '대구 통합돌봄 교육과 행사 기록을 확인하세요.'],
  resources: ['/resources.html', '자료실', '대구 통합돌봄 관련 정책 자료와 운영 서식을 확인하세요.'],
  'giving-guide': ['/giving-guide.html', '후원 안내', '후원 대상, 일시·정기후원 방식과 시연 내역 확인 방법을 알아보세요.'],
  projects: ['/projects.html','돌봄사업','지역의 돌봄사업과 후원 안내를 확인하세요.'],
  proposal: ['/proposal.html','플랫폼 운영안','대구 통합돌봄네트워크 ON의 운영안을 확인하세요.']
};

const onSectionPhotos = {
  home: ['field-launch','field-agreement','field-garden','field-conference'],
  about: ['field-agreement'],
  members: ['m4','m1','sector-home-health','m5','field-seminar','sector-disability-activity','sector-community-library','m3'],
  news: ['field-conference','field-launch','care-pilot-reference','field-agreement','health-forum-reference','community-care-forum-reference','field-seminar','field-naeiln','field-garden'],
  policy: ['policy-p1','policy-p2','policy-p3','policy-p4','policy-p5','policy-p6'],
  events: ['field-seminar'],
  resources: ['policy-p3'],
  'giving-guide': ['field-garden'],
  projects: ['field-garden'],
  proposal: ['field-agreement']
};

function onPublicPagePath(route) {
  if (Object.hasOwn(onPublicSections,route)) return onPublicSections[route][0];
  const [area,id,extra]=route.split('/');
  if (!id||extra||!/^[a-z0-9-]+$/.test(id)) return '';
  if (area==='member'&&organizations.some(org=>org.id===id)) return '/members/'+id+'.html';
  if (area==='gallery'&&Object.hasOwn(photoData,id)&&!photoData[id].illustrative&&photoData[id].gallery!==false) return '/gallery/'+id+'.html';
  if (area==='detail') {
    const item=findItem(id);
    if (item?.type&&!item.isLocal&&contentRoutes[item.type]) return '/'+contentRoutes[item.type]+'/'+id+'.html';
  }
  return '';
}
function readOnRoute() {
  const hash=location.hash;
  if (hash.startsWith('#/')) return hash.slice(2)||'home';
  if (location.pathname.startsWith('/share/')) return document.documentElement.dataset.onRoute||'home';
  const section=Object.entries(onPublicSections).find(([,entry])=>entry[0]===location.pathname);
  if (section) return section[0];
  const match=location.pathname.match(/^\/(members|gallery|news|policy|events|resources)\/([a-z0-9-]+)\.html$/);
  if (!match) return 'home';
  const [,folder,id]=match;
  return (folder==='members'?'member':folder==='gallery'?'gallery':'detail')+'/'+id;
}
function publicLinks(markup) {
  if (offlinePhotoData) return markup;
  return markup.replace(/href="#\/([^"#]+)"/g,(_,route)=>{
    const path=onPublicPagePath(route)||'/#/'+route;
    return `href="${esc(path)}" data-on-route="${esc(route)}"`;
  });
}
function navigateOnClick(event) {
  if (event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey) return false;
  const anchor=event.target.closest('a[data-on-route],a[href^="#/"]');
  if (!anchor||anchor.target||anchor.hasAttribute('download')) return false;
  const path=anchor.dataset.onRoute||anchor.getAttribute('href').slice(2);
  event.preventDefault();
  go(path);
  return true;
}

function galleryPage(key) {
  if (!onPublicPagePath('gallery/'+key)) return notFound();
  const photo=photoData[key];
  const title=photo.title||photo.caption;
  const stories=publishedNews().filter(item=>!item.isLocal&&storyPhotoKey(item)===key);
  const members=directoryMembers().filter(member=>organizationReferences[member.id]===key||member.photo===key);
  return pageHead(title,'',contentShareButton('gallery/'+key,title))+`<div class="wrap page-content">
    <div class="full-photo-wrap on-gallery-detail">${referencePhoto(key,true)}</div>
    ${photoCredit(key)}
    <div class="on-actions">${stories.map(item=>`<a class="btn small" href="#/detail/${esc(item.id)}">${esc(item.title)} ${icon('arrow')}</a>`).join('')}
    ${members.map(member=>`<a class="btn small" href="#/member/${esc(member.id)}">${esc(member.name)} ${icon('arrow')}</a>`).join('')}</div>
  </div>`;
}

function onCoverFigure(key) {
  if (!key) return '';
  return `<figure class="on-content-photo">${referencePhoto(key)}<figcaption>${photoCredit(key)}</figcaption></figure>`;
}

function onPagePhotoKeys(route,item) {
  if (Object.hasOwn(onSectionPhotos,route)) return onSectionPhotos[route];
  const [area,id]=route.split('/');
  if (area==='gallery') return [id];
  if (area==='member') return [organizationReferences[id],item.photo].filter(key=>photoData[key]);
  const key=storyPhotoKey(item);
  return key?[key]:[];
}

function onPreviewPhoto(key) {
  const photo=photoData[key];
  const sizes=onImagePreviews[photo.file];
  const alt=photo.caption+(photo.illustrative?' (AI 생성 참고 이미지)':'');
  const credit=photo.illustrative?'대구 통합돌봄네트워크 ON · AI 생성 참고 이미지':photo.sourceLabel||photo.publisher;
  const asset=([file,width,height,type])=>({file,width,height,type,url:new URL('media/'+file,siteBaseURL).href,alt});
  return {key,alt,credit,source:photo.source,original:asset(sizes.original),
    primary:asset(sizes.wide||sizes.original),social:asset(sizes.social||sizes.original),x:asset(sizes.x||sizes.original),
    variants:['wide','classic','square'].map(label=>sizes[label]).filter(Boolean).map(asset)};
}

function onSeoPage(route) {
  route=canonicalShareRoute(route);
  const canonicalPath=onPublicPagePath(route);
  if (!canonicalPath) return null;
  const [area,id]=route.split('/');
  const section=onPublicSections[route];
  const item=area==='detail'?findItem(id):area==='member'?organizations.find(org=>org.id===id):null;
  const photo=area==='gallery'?photoData[id]:null;
  const title=section?(route==='home'?siteName:section[1]):area==='gallery'?(photo.title||photo.caption):item.title||item.name;
  const description=(section?.[2]||(area==='gallery'?photo.caption:area==='member'?[item.desc,item.district?'대구 '+item.district:'대구광역시',item.service].filter(Boolean).join(' · '):item.body)||title)
    .replace(/\s+/g,' ').trim().slice(0,160);
  const parent=area==='gallery'?'':area==='member'?'members':item?contentRoutes[item.type]:'';
  const url=new URL(canonicalPath,siteBaseURL).href;
  const photoKeys=onPagePhotoKeys(route,item);
  const photos=[...new Map(photoKeys.map(key=>[photoData[key].file,key])).values()].map(onPreviewPhoto);
  const mainPhoto=photos[0];
  const indexable=!item?.type||item.type==='policy'||item.verified||item.past||item.type==='resource'&&Boolean(item.url);
  const organizationId=siteBaseURL+'#organization', websiteId=siteBaseURL+'#website';
  const publisher={'@id':organizationId};
  const graph=[
    {'@type':'Organization','@id':organizationId,name:siteName,url:siteBaseURL,areaServed:{'@type':'City',name:'대구광역시'}},
    {'@type':'WebSite','@id':websiteId,name:siteName,url:siteBaseURL,inLanguage:'ko-KR',publisher}
  ];
  const crumbs=[['홈',siteBaseURL]];
  if (parent) crumbs.push([onPublicSections[parent][1],new URL(onPublicSections[parent][0],siteBaseURL).href]);
  if (route!=='home') {
    crumbs.push([title,url]);
    graph.push({'@type':'BreadcrumbList','@id':url+'#breadcrumb',itemListElement:crumbs.map(([name,item],i)=>({'@type':'ListItem',position:i+1,name,item}))});
  }
  const page={'@type':section&&['members','news','policy','events','resources'].includes(route)?'CollectionPage':'WebPage','@id':url,
    url,name:title,description,inLanguage:'ko-KR',isPartOf:{'@id':websiteId},publisher};
  if (route!=='home') page.breadcrumb={'@id':url+'#breadcrumb'};
  if (area==='member') page.about={'@type':'Organization',name:item.name,areaServed:item.district?'대구광역시 '+item.district:'대구광역시'};
  if (mainPhoto) {
    const images=photos.map(entry=>{
      const {primary:{url:contentUrl,width,height},alt:caption,credit,source}=entry;
      return {'@type':'ImageObject','@id':url+'#image-'+entry.key,contentUrl,width,height,caption,
        ...(credit?{creditText:credit}:{}),...(source?{isBasedOn:source}:{})};
    });
    page.primaryImageOfPage={'@id':images[0]['@id']};
    page.image=images.map(image=>({'@id':image['@id']}));
    graph.push(...images);
  }
  graph.push(page);
  const article=indexable&&(item?.type==='policy'||item?.type==='news');
  if (article) {
    const source=cleanURL(item.url)||item.source;
    const published=item.type==='news'?(item.publishedDate||(/^\d{4}\.\d{2}\.\d{2}$/.test(item.date||'')?item.date.replaceAll('.','-'):'')):'';
    const image=mainPhoto?[...new Set([mainPhoto.primary,...mainPhoto.variants].map(asset=>asset.url))]:[];
    graph.push({'@type':'Article','@id':url+'#article',headline:title,description,inLanguage:'ko-KR',
      mainEntityOfPage:{'@id':url},publisher,...(image.length?{image}:{}),
      ...(published?{datePublished:published}:{}),...(source?{citation:source}:{})});
  }
  return {url,title:route==='home'?siteName:title+' | '+siteName,description,photos,indexable,article,
    socialCover:socialCover(route),xCover:socialCover(route,'x'),
    jsonld:{'@context':'https://schema.org','@graph':graph}};
}
function onOpenGraphImage(asset) {
  return `<meta property="og:image" content="${esc(asset.url)}">
<meta property="og:image:type" content="${esc(asset.type)}">
<meta property="og:image:width" content="${asset.width}">
<meta property="og:image:height" content="${asset.height}">
<meta property="og:image:alt" content="${esc(asset.alt)}">`;
}
function seoTags(meta) {
  const twitter=meta.xCover;
  return `<title>${esc(meta.title)}</title>
<meta name="description" content="${esc(meta.description)}">
<meta name="robots" content="noindex,follow,max-image-preview:large">
<link rel="canonical" href="${esc(meta.url)}">
<meta property="og:type" content="${meta.article?'article':'website'}">
<meta property="og:locale" content="ko_KR">
<meta property="og:site_name" content="${esc(siteName)}">
<meta property="og:title" content="${esc(meta.title)}">
<meta property="og:description" content="${esc(meta.description)}">
<meta property="og:url" content="${esc(meta.shareURL||meta.url)}">
${meta.socialCover?onOpenGraphImage(meta.socialCover):''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(meta.title)}">
<meta name="twitter:description" content="${esc(meta.description)}">
${twitter?`<meta name="twitter:image" content="${esc(twitter.url)}">
<meta name="twitter:image:alt" content="${esc(twitter.alt)}">`:''}
<script type="application/ld+json" id="on-jsonld">${JSON.stringify(meta.jsonld).replaceAll('<','\\u003c')}<\/script>`;
}
function refreshOnMetadata(route) {
  const old=$('#on-metadata');
  if (!old||offlinePhotoData) return false;
  const meta=onSeoPage(route);
  const shareChannel=location.pathname.startsWith('/share/')?document.documentElement.dataset.shareChannel:'';
  if(meta&&shareChannel) {meta.socialCover=socialCover(route,shareChannel);meta.shareURL=location.href.split('#')[0];}
  const holder=document.createElement('template');
  holder.innerHTML=meta?seoTags(meta):'<meta name="robots" content="noindex,follow">';
  while (old.nextSibling&&!(old.nextSibling.nodeType===8&&old.nextSibling.nodeValue.trim()==='on-metadata:end')) {
    old.nextSibling.remove();
  }
  old.after(holder.content);
  return Boolean(meta);
}

'use strict';
const $=(q,el=document)=>el.querySelector(q), $$=(q,el=document)=>[...el.querySelectorAll(q)];
const icons={
  layoutCards:'<rect x="4" y="3.5" width="16" height="7" rx="1.1"/><rect x="4" y="13.5" width="16" height="7" rx="1.1"/>',
  layoutGrid:'<rect x="3.5" y="3.5" width="6.5" height="6.5" rx=".8"/><rect x="14" y="3.5" width="6.5" height="6.5" rx=".8"/><rect x="3.5" y="14" width="6.5" height="6.5" rx=".8"/><rect x="14" y="14" width="6.5" height="6.5" rx=".8"/>',
  layoutList:'<path d="M8 5.5h12M8 12h12M8 18.5h12M3.5 5.5h1M3.5 12h1M3.5 18.5h1"/>',
  down:'<path d="m6 9 6 6 6-6"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',chevron:'<path d="m9 5 7 7-7 7"/>',back:'<path d="M19 12H5m6-6-6 6 6 6"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',building:'<path d="M4 21V6h10v15M14 10h6v11M2 21h20M7 9h3M7 13h3M7 17h3M17 13h1M17 17h1"/>',people:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v1"/>',news:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h4v4H7zM14 8h3M14 12h3M7 16h10"/>',policy:'<path d="m12 3 9 5H3l9-5ZM5 10v8m5-8v8m4-8v8m5-8v8M3 21h18M3 18h18"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18M7 15h2m4 0h2m-8 3h2"/>',file:'<path d="M14 3H5v18h14V8l-5-5Z"/><path d="M14 3v5h5M8 12h8m-8 4h6"/>',pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2.4"/>',heart:'<path d="M20.8 5.7c-2-2-5.3-1.7-7.3.3L12 7.5 10.5 6c-2-2-5.3-2.3-7.3-.3s-1.7 5.3.3 7.3L12 21l8.5-8c2-2 2.3-5.3.3-7.3Z"/>',home:'<path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/>',medical:'<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3Z"/>',leaf:'<path d="M20 3c-1 6 1 11-5 15-5 3-11-1-10-6C6 5 13 6 20 3Z"/><path d="m4 21 11-11"/>',meal:'<path d="M5 3v6c0 3 4 3 4 0V3M7 3v18M17 3v18m0-18c-5 4-4 10 0 10"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.3"/>',external:'<path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',plus:'<path d="M12 5v14M5 12h14"/>',check:'<path d="m5 12 4 4L19 6"/>',share:'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m9 10 6-3M9 14l6 3"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',link:'<path d="m9 15 6-6m-7 3-2 2a4 4 0 0 0 6 6l3-3m-3-10 2-2a4 4 0 0 1 6 6l-3 3"/>'};
function icon(n){return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">'+(icons[n]||icons.file)+'</svg>'}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function cleanURL(s){try{const u=new URL(s);return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}}
const hospitalEscortService = '병원동행';
const services=['전체',hospitalEscortService,'방문진료','의료','장애인 돌봄','장애인 직업재활','자립준비청년','공동체 돌봄','방문요양','방문목욕','장기요양','일상돌봄','방문간호','주거복지','생활지원','건강관리','의료지원','디지털 교육','지역복지'];
const districts=['전체 지역','중구','동구','서구','남구','북구','수성구','달서구','달성군','군위군'];
const photoLicense='https://www.kogl.or.kr/info/license.do';
const photoData={
  "policy-p1": {"illustrative": true, "file": "policy/01-integrated-care.jpg", "caption": "가정에서 돌봄 상담을 받는 모습"},
  "policy-p2": {"illustrative": true, "file": "policy/02-daegu-services.jpg", "caption": "지역 복지시설을 찾은 주민"},
  "policy-p3": {"illustrative": true, "file": "policy/03-policy-resources.jpg", "caption": "정책 및 교육자료"},
  "policy-p4": {"illustrative": true, "file": "policy/04-care-application.jpg", "caption": "행정복지센터 신청 상담"},
  "policy-p5": {"illustrative": true, "file": "policy/05-care-act.jpg", "caption": "법률 서적"},
  "policy-p6": {"illustrative": true, "file": "policy/06-regional-directory.jpg", "caption": "지역사회 주거와 공공시설"},

  "care-pilot-reference": {"file": "care-pilot-reference.webp", "title": "가정에서 연결되는 통합돌봄", "caption": "어르신과 돌봄 인력이 가정에서 건강과 식사 지원 계획을 함께 확인하는 참고 이미지입니다.", "illustrative": true},
  "health-forum-reference": {"file": "health-forum-reference.webp", "title": "지역 건강과 마을돌봄 논의", "caption": "보건·복지 관계자가 작은 회의실에서 마을의 건강과 돌봄을 논의하는 참고 이미지입니다.", "illustrative": true},
  "community-care-forum-reference": {"file": "community-care-forum-reference.webp", "title": "도서관을 중심으로 이어지는 공동체 돌봄", "caption": "마을도서관에서 지역 복지 실무자들이 공동체 돌봄 사례를 정리하는 참고 이미지입니다.", "illustrative": true},

  "m1": {
    "slug": "seoul-home-care",
    "source": "https://mediahub.seoul.go.kr/archives/2002309",
    "publisher": "서울시 내 손안에 서울 · 윤혜숙",
    "caption": "서울 방문돌봄 사례 · 어르신이 요양보호사와 함께 학습지 문제를 풀고 있습니다.",
    "license": 4,
    "file": "seoul-home-care.jpg",
    "title": "어르신 방문요양",
    "cardRatio": "760/570"
  },
  "m2": {
    "slug": "gangnam-home-health",
    "source": "https://www.gangnam.go.kr/board/B_000031/1074866/view.do?mid=ID01_0313",
    "publisher": "서울 강남구청",
    "caption": "서울 강남구 방문건강관리 현장 · 방문 인력이 가정에서 이용자의 혈압을 확인하고 있습니다.",
    "license": 2,
    "file": "gangnam-home-health.webp"
  },
  "m3": {
    "slug": "guro-home-repair",
    "source": "https://www.guro.go.kr/www/selectBbsNttView.do?bbsNo=665&key=1793&nttNo=236410",
    "publisher": "서울 구로구청",
    "caption": "서울 구로구 집수리 봉사 · 맥가이버봉사단이 홀몸 어르신 가정의 주거환경을 손보고 있습니다.",
    "license": 2,
    "file": "guro-home-repair.webp",
    "title": "가정 내 생활환경 지원"
  },
  "m4": {
    "slug": "guro-meal-support",
    "source": "https://www.guro.go.kr/www/selectBbsNttView.do?bbsNo=665&key=1793&nttNo=236410",
    "publisher": "서울 구로구청",
    "caption": "서울 구로구 식사지원 봉사 · 구로2동 자원봉사협력단이 이웃에게 전할 삼계탕을 준비하고 있습니다.",
    "license": 2,
    "file": "guro-meal-support.webp",
    "title": "이웃을 위한 식사지원"
  },
  "m5": {
    "slug": "guro-senior-exercise",
    "source": "https://www.guro.go.kr/www/selectBbsNttView.do?bbsNo=665&key=1793&nttNo=190656",
    "publisher": "서울 구로구청",
    "caption": "서울 구로구 어르신 건강소모임 · 참여자들이 의자에 앉아 근력운동을 하고 있습니다.",
    "license": 2,
    "file": "guro-senior-exercise.webp",
    "title": "어르신 생활운동"
  },
  "m6": {
    "slug": "gangnam-home-health",
    "source": "https://www.gangnam.go.kr/board/B_000031/1074866/view.do?mid=ID01_0313",
    "publisher": "서울 강남구청",
    "caption": "서울 강남구 방문건강관리 현장 · 방문 인력이 가정에서 이용자의 혈압을 확인하고 있습니다.",
    "license": 2,
    "file": "gangnam-home-health.webp",
    "title": "가정 방문 건강관리"
  },
  "m7": {
    "slug": "seoul-digital-learning",
    "source": "https://mediahub.seoul.go.kr/archives/2011035",
    "publisher": "서울시 내 손안에 서울 · 문청야",
    "caption": "서울 어디나지원단 디지털 교육 · 강사와 어르신이 일대일로 스마트폰 사용법을 익힙니다.",
    "license": 4,
    "file": "seoul-digital-learning.jpg",
    "cardRatio": "1200/750"
  },
  "m8": {
    "slug": "guro-community-garden",
    "source": "https://www.guro.go.kr/www/selectBbsNttView.do?bbsNo=665&key=1793&nttNo=109354",
    "publisher": "서울 구로구청",
    "caption": "서울 구로구 치매안심센터 ‘행복한 농부’ · 텃밭에서 함께 작물을 재배하는 활동입니다.",
    "license": 2,
    "file": "guro-community-garden.webp"
  },
  "field-agreement": {
    "title": "복현어울림센터 업무협약식",
    "caption": "복현어울림센터 업무협약식에서 협약서를 들어 보이는 참여기관 관계자들",
    "sourceLabel": "대구광역 통합돌봄 네트워크 경과보고 3쪽",
    "file": "field-agreement.webp"
  },
  "field-launch": {
    "title": "대구광역 통합돌봄 네트워크 발대식 현장",
    "caption": "대구광역 통합돌봄 네트워크 발대식에서 참여자들이 함께 찍은 사진",
    "sourceLabel": "대구광역 통합돌봄 네트워크 경과보고 3쪽",
    "file": "field-launch.webp"
  },
  "field-conference": {
    "title": "통합돌봄 광역 네트워크 전국대회",
    "caption": "통합돌봄 광역 네트워크 전국대회 참가자들의 단체 사진",
    "sourceLabel": "대구광역 통합돌봄 네트워크 경과보고 3쪽",
    "file": "field-conference.webp"
  },
  "field-seminar": {
    "title": "대구경북 의료사회복지사 세미나",
    "caption": "대구경북 의료사회복지사 세미나에서 지역 통합돌봄 강의가 진행되는 모습",
    "sourceLabel": "대구광역 통합돌봄 네트워크 경과보고 3쪽",
    "file": "field-seminar.webp"
  },
  "field-naeiln": {
    "title": "내일앤 보호작업장·주간활동 공간 방문",
    "caption": "내일앤 발달장애인 주간활동 공간을 방문한 관계자들",
    "sourceLabel": "달구벌사회적협동조합연합회 2025년 활동보고 4쪽",
    "file": "field-naeiln.webp"
  },
  "field-garden": {
    "title": "복현 어르신 힐링 텃밭 가꾸기",
    "caption": "복현어울림센터 어르신 텃밭 가꾸기 사업 설명 현장",
    "sourceLabel": "달구벌사회적협동조합연합회 2025년 활동보고 4쪽",
    "file": "field-garden.webp"
  },
  "sector-home-health": {
    "title": "가정 방문 건강관리",
    "caption": "서울시 찾아가는 건강돌봄서비스 보도에 실린 어르신 가정 방문 현장입니다.",
    "publisher": "서울시 내 손안에 서울",
    "source": "https://mediahub.seoul.go.kr/archives/1174737",
    "license": 4,
    "file": "seoul-visiting-health.jpg",
    "cardRatio": "630/425"
  },
  "sector-disability-activity": {
    "title": "발달장애인 문화활동",
    "caption": "김포아트홀에서 열린 제6회 발달장애인 사진전 「빛 그리다」의 현장입니다.",
    "publisher": "김포시 뉴스포털",
    "source": "https://m1.gimpo.go.kr/news/selectBbsNttView.do?bbsNo=466&key=9377&nttNo=988568",
    "license": 2,
    "file": "gimpo-disability-photo-exhibition.webp"
  },
  "sector-community-library": {
    "title": "마을 작은도서관",
    "caption": "김포시 향산작은도서관 조성을 앞두고 관계자들이 현장을 살펴보고 있습니다.",
    "publisher": "김포시 뉴스포털",
    "source": "https://m1.gimpo.go.kr/news/selectBbsNttView.do?bbsNo=466&key=9377&nttNo=969172",
    "license": 2,
    "file": "gimpo-small-library.webp"
  }
};
const offlinePhotoData=null;
const organizationReferences={
  "woorihamkke": "m1",
  "daegu-medical": "sector-home-health",
  "with-medical": "m5",
  "daegu-care": "m4",
  "welfare-design": "field-seminar",
  "naeiln": "field-naeiln",
  "byeolbom": "sector-community-library",
  "modoo-happy": "m3"
};
const members=[
  {id:'m1',name:'온마을 방문요양',service:'방문요양',district:'수성구',icon:'heart',tone:'#e3f0e8',color:'#438567',desc:'익숙한 집에서 일상을 이어가도록 돕습니다.',body:'일상생활에 도움이 필요한 어르신의 식사와 이동, 집 안에서의 생활을 지원하는 방문요양 예시입니다. 가족과 생활의 변화를 공유하고 필요한 도움을 살핍니다.',items:['일상생활 지원','안부와 생활 변화 확인','보호자 소통'],story:['가정 방문에서 살피는 어르신의 하루','현장 이야기','방문요양 담당자가 첫 방문에서 평소 식사와 이동 습관을 듣고, 어르신이 스스로 할 수 있는 일과 도움이 필요한 일을 함께 정리하는 활동 예시입니다.']},
  {id:'m2',name:'이음 방문간호',service:'방문간호',district:'달서구',icon:'medical',tone:'#e3ecfb',color:'#4274bd',desc:'가정에서의 건강 관찰과 가족 교육을 돕습니다.',body:'거동이 불편한 어르신을 위한 방문간호 분야 예시입니다. 가정에서 살피는 건강 상태와 생활 변화, 보호자에게 안내하는 내용을 소개합니다.',items:['가정 방문간호','건강 상태 관찰','가족 건강관리 교육'],story:['가정에서 혈압 기록을 함께 살피는 법','교육·소식','어르신과 보호자가 가정에서 혈압을 기록하고, 평소와 다른 수치나 불편을 어떻게 간호 인력에게 전달할지 함께 살펴보는 교육 예시입니다.']},
  {id:'m3',name:'다정한 주거연구소',service:'주거복지',district:'북구',icon:'home',tone:'#fff0d9',color:'#ad7a37',desc:'안전하게 움직일 수 있는 집 안 환경을 살핍니다.',body:'어르신이 익숙한 집에서 생활할 수 있도록 출입구, 욕실, 주방처럼 자주 이용하는 공간의 안전과 이동 편의를 살피는 주거복지 분야 예시입니다.',items:['주거환경 점검','이동 동선 개선 안내','안전 손잡이 등 설치 상담'],story:['넘어지기 쉬운 집 안 동선 살피기','서비스 소개','현관 문턱, 주방에서 이동하는 길, 욕실의 미끄러운 바닥처럼 일상에서 자주 마주치는 위험 요소를 점검하는 활동 예시입니다.']},
  {id:'m4',name:'한끼이음',service:'생활지원',district:'동구',icon:'meal',tone:'#f8e5e1',color:'#b57364',desc:'이웃의 식사를 챙기고 안부를 나눕니다.',body:'식사를 준비하기 어려운 이웃에게 도시락과 반찬을 전하는 생활지원 분야 예시입니다. 식사를 전하면서 안부를 살피고 필요한 생활지원 정보를 안내합니다.',items:['도시락·반찬 준비','식사 전달과 안부 확인','생활지원 정보 안내'],story:['이웃에게 전할 도시락 준비','현장 이야기','지역 자원봉사자들이 배식 용기에 반찬을 나누어 담고 전달할 가구와 일정을 확인하는 식사지원 활동 예시입니다.']},
  {id:'m5',name:'늘봄 건강파트너',service:'건강관리',district:'중구',icon:'leaf',tone:'#e9e8f8',color:'#8072b3',desc:'몸 상태에 맞는 생활운동과 건강습관을 소개합니다.',body:'동네에서 쉽게 참여할 수 있는 건강관리 분야 예시입니다. 체력과 움직임에 맞춰 의자 스트레칭, 가벼운 근력운동, 걷기 활동을 소개합니다.',items:['생활운동 교실','걷기와 균형 활동','건강습관 교육'],story:['의자에 앉아 함께하는 생활운동','현장 이야기','참여자가 각자의 움직임에 맞춰 앉은 자세로 팔과 어깨를 움직이고, 일상에서 이어갈 가벼운 스트레칭을 익히는 모임 예시입니다.']},
  {id:'m6',name:'우리동네 의료지원',service:'의료지원',district:'남구',icon:'people',tone:'#def0f1',color:'#4c8d96',desc:'지역 의료기관과 퇴원 후 돌봄 정보를 안내합니다.',body:'어르신과 가족이 필요한 지역 의료정보를 찾고 퇴원 후 집에서의 생활을 준비할 수 있도록 돕는 의료지원 분야 예시입니다.',items:['지역 의료정보 안내','진료 준비 정보 제공','퇴원 후 돌봄 정보 안내'],story:['퇴원 후 집에서의 생활 준비하기','서비스 소개','가족이 퇴원 전에 확인해 둘 이동 보조기구, 진료 일정, 집에서 받을 수 있는 돌봄 정보를 정리하는 안내 활동 예시입니다.']},
  {id:'m7',name:'온디지털 배움터',service:'디지털 교육',district:'서구',icon:'info',tone:'#e5edfc',color:'#426eb1',desc:'휴대전화와 생활에 필요한 디지털 기능을 함께 배웁니다.',body:'스마트폰과 태블릿이 익숙하지 않은 어르신을 대상으로 일상에서 자주 쓰는 기능을 연습하는 디지털 교육 분야 예시입니다.',items:['스마트폰 기초 교육','영상통화·지도 사용 연습','온라인 공공서비스 찾기'],story:['스마트폰으로 가족과 영상통화 연습','교육·소식','참여자가 화면 글자 크기를 조절하고, 연락처를 찾아 영상통화를 걸고 받는 순서를 자기 기기로 연습하는 소그룹 교육 예시입니다.']},
  {id:'m8',name:'이웃정원 복지모임',service:'지역복지',district:'달성군',icon:'leaf',tone:'#e5f0e4',color:'#4c8258',desc:'함께 가꾸는 정원에서 주민이 정기적으로 만납니다.',body:'지역 주민과 어르신이 작은 정원을 함께 가꾸며 교류하는 지역복지 분야 예시입니다. 원예와 일상 모임을 통해 이웃을 만나고 동네 활동에 참여합니다.',items:['세대가 함께하는 원예 활동','주민 소모임 운영','이웃 교류와 안부 나눔'],story:['함께 심고 가꾸는 동네 화분','현장 이야기','주민들이 화분에 모종을 옮겨 심고, 다음 모임까지 물주기와 관리 일정을 나누는 공동 원예 활동 예시입니다.']}
];
const campaigns = {
  m1: {
    title: '익숙한 집에서 이어가는 하루',
    lead: '식사와 이동에 도움이 필요한 어르신이 익숙한 집에서 일상을 이어갈 수 있도록 돕습니다.',
    goal: 3000000, raised: 1260000, count: 42,
    audience: '일상생활에 도움이 필요한 어르신 20가구',
    need: '혼자 식사를 차리거나 집 안에서 움직이기 어려워지면 익숙한 일상도 조금씩 줄어듭니다. 방문할 때 어르신과 함께 하루의 생활을 살피고, 가족과 달라진 점을 공유합니다.',
    result: '20가구의 방문 지원과 생활 변화 기록을 모아 활동소식으로 공유합니다.',
    uses: [
      ['방문 활동비', '가정 방문과 생활지원 활동에 필요한 이동비와 운영비', 50],
      ['일상생활 보조물품', '미끄럼 방지용품과 식사 보조도구 등 가구별 필요 물품', 30],
      ['보호자 소통', '가정별 생활 안내자료와 보호자 소통 모임 운영', 20]
    ]
  },
  m2: {
    title: '집에서 함께 살피는 건강',
    lead: '이동이 어려운 어르신이 집에서 건강 상태를 살피고 보호자와 기록을 나눌 수 있도록 돕습니다.',
    goal: 4000000, raised: 1320000, count: 38,
    audience: '건강관리가 필요한 어르신 25가구',
    need: '가정에서 관찰한 작은 변화를 정리해 두면 어르신, 보호자, 담당 인력이 같은 정보를 바탕으로 이야기할 수 있습니다. 방문 때 활용할 기록 도구와 가족 교육을 준비합니다.',
    result: '가정 방문 횟수와 보호자 교육 참여 현황을 공유합니다.',
    uses: [
      ['방문건강관리 활동비', '방문 활동을 준비하고 가정을 오가는 데 필요한 비용', 50],
      ['측정·기록 물품', '건강 상태를 관찰하고 기록하는 데 필요한 소모품과 기록지', 30],
      ['보호자 교육 자료', '가족이 평소 변화를 기록하고 전달하는 방법을 안내할 자료', 20]
    ]
  },
  m3: {
    title: '한 걸음 더 안전한 집',
    lead: '욕실과 현관처럼 자주 이용하는 공간을 살피고, 어르신이 집 안에서 편하게 움직일 수 있도록 돕습니다.',
    goal: 5000000, raised: 2100000, count: 59,
    audience: '집 안 이동에 불편을 겪는 어르신 10가구',
    need: '작은 문턱과 미끄러운 바닥도 거동이 불편한 어르신에게는 매일 마주치는 장애물이 됩니다. 주민과 함께 위험한 동선을 찾고, 가구 상황에 맞는 개선 작업을 진행합니다.',
    result: '10가구를 목표로 공간별 개선 항목과 완료 건수를 공유합니다.',
    uses: [
      ['안전 설비와 설치', '안전 손잡이, 문턱 보완재 및 설치 비용', 65],
      ['현장 점검', '가정별 이동 동선 점검과 작업 준비', 20],
      ['사용 안내와 확인', '개선 후 사용법 안내와 후속 방문', 15]
    ]
  },
  m4: {
    title: '따뜻한 한 끼와 안부',
    lead: '식사를 준비하기 어려운 이웃에게 도시락과 반찬을 전하고, 문 앞에서 안부를 나눕니다.',
    goal: 3600000, raised: 2340000, count: 76,
    audience: '식사 지원이 필요한 이웃 30가구',
    need: '식사 준비와 장보기가 어려운 가구에 주민 봉사자들이 음식을 준비해 전합니다. 방문할 때 안부를 묻고 도움이 더 필요한 이웃에게 생활지원 정보를 안내합니다.',
    result: '가구별 전달 기록을 바탕으로 도시락·반찬 제공 건수와 활동 소식을 공유합니다.',
    uses: [
      ['식재료 구입', '도시락과 밑반찬을 만드는 식재료', 65],
      ['포장과 전달', '식품 포장 용기와 배달에 필요한 물품', 25],
      ['봉사 운영', '봉사 일정 조율과 위생·안전 교육', 10]
    ]
  },
  m5: {
    title: '동네에서 함께 시작하는 생활운동',
    lead: '어르신이 가까운 곳에서 자기 속도로 움직이고, 집에서도 이어갈 수 있는 운동을 익히도록 돕습니다.',
    goal: 2500000, raised: 775000, count: 27,
    audience: '일상에서 운동을 시작하고 싶은 어르신 20명',
    need: '멀리 이동하지 않고도 동네에서 정기적으로 운동할 수 있는 자리가 필요합니다. 의자 스트레칭과 가벼운 근력 활동을 중심으로 참여자에게 맞는 프로그램을 운영합니다.',
    result: '생활운동 교실 8회를 목표로 운영하고 출석 현황과 집에서 활용할 자료를 공유합니다.',
    uses: [
      ['운동 교실 운영', '지도 인력과 동네 운동 교실 운영비', 50],
      ['운동 보조도구', '탄력 밴드와 가벼운 운동 도구 준비', 30],
      ['가정용 활동 자료', '집에서 따라 할 수 있는 운동 카드와 기록지', 20]
    ]
  },
  m6: {
    title: '퇴원 뒤에도 이어지는 돌봄',
    lead: '어르신과 가족이 퇴원 후 필요한 지역 의료·돌봄 정보를 확인하고 일상을 준비하도록 돕습니다.',
    goal: 4500000, raised: 1485000, count: 36,
    audience: '퇴원 후 일상 준비가 필요한 어르신과 가족 20가구',
    need: '퇴원 후에는 이동과 진료 일정, 집에서 받을 수 있는 지원을 한꺼번에 준비해야 할 때가 많습니다. 가족이 필요한 정보를 찾아볼 수 있도록 상담과 지역자원 안내를 제공합니다.',
    result: '20가구를 목표로 정보 안내를 진행하고 자주 필요한 지역자원을 정리합니다.',
    uses: [
      ['퇴원 준비 상담', '가족과 필요한 지원을 확인하고 준비하는 상담 활동', 50],
      ['지역자원 안내자료', '주거·이동·돌봄 정보를 담은 안내자료 제작', 30],
      ['후속 확인', '가정 복귀 뒤 필요한 정보가 연결됐는지 확인하는 활동', 20]
    ]
  },
  m7: {
    title: '내 스마트폰으로 연결되는 일상',
    lead: '전화와 사진 공유부터 영상통화까지, 어르신이 자신의 스마트폰으로 자주 쓰는 기능을 연습합니다.',
    goal: 2200000, raised: 990000, count: 33,
    audience: '스마트폰 사용을 배우고 싶은 어르신 24명',
    need: '스마트폰 메뉴가 익숙하지 않으면 연락이나 생활 정보 확인에도 어려움이 생깁니다. 소그룹에서 자신의 기기로 충분히 연습하고 필요한 기능을 다시 물어볼 수 있게 합니다.',
    result: '소그룹 교육 6회를 목표로 운영하고 연습 자료와 교육 진행 결과를 공유합니다.',
    uses: [
      ['소그룹 교육 운영', '강사와 실습 보조 인력, 교육 공간 운영', 55],
      ['실습용 도구', '충전기, 거치대 등 교육을 위한 실습 물품', 25],
      ['큰 글씨 교재', '영상통화, 지도, 문자 사용법을 담은 교재 제작', 20]
    ]
  },
  m8: {
    title: '정원에서 만나는 우리 이웃',
    lead: '어르신과 이웃이 작은 텃밭에서 함께 심고 가꾸며 일상적으로 만날 수 있는 자리를 만듭니다.',
    goal: 2800000, raised: 952000, count: 31,
    audience: '지역 어르신과 주민 25명',
    need: '동네에 부담 없이 다시 찾을 수 있는 모임이 있으면 이웃과 만날 기회가 늘어납니다. 함께 심을 작물을 고르고 물주기와 정원 관리를 나누며 계절별 활동을 이어갑니다.',
    result: '공동 원예 모임 8회를 목표로 운영하고 참여 기록과 정원 사진을 공유합니다.',
    uses: [
      ['텃밭과 화분 준비', '모종, 흙, 화분, 공동 원예 도구 마련', 45],
      ['원예 모임 운영', '세대가 함께 참여하는 원예 프로그램 운영', 35],
      ['정원 관리와 기록', '물주기, 안전관리, 사진과 활동 기록 정리', 20]
    ]
  }
};
const campaignAmountFormat = new Intl.NumberFormat('ko-KR');
const minimumGift = 1000;
const maximumGift = 100000;
const giftTypes = {once: '일시후원', monthly: '정기후원'};
const organizationCampaigns = {
  'daegu-dounuri': {
    title:'병원 가는 길을 함께합니다',
    lead:'혼자 병원을 방문하기 어려운 이웃이 이동부터 진료와 귀가까지 필요한 동행을 받을 수 있도록 지원합니다.',
    need:'병원에 가는 길에는 이동뿐 아니라 예약 확인과 접수, 진료와 약 수령 등 도움이 필요한 순간이 있습니다. 병원동행 매니저가 이용자의 상황을 함께 살피고 병원 방문과 귀가를 돕는 사업 예시입니다.',
    audience:'병원 방문에 동행과 이동 지원이 필요한 대구 주민',
    goal:3000000, raised:0, count:0,
    uses:[
      ['병원동행 지원', '병원 방문과 접수·진료·약 수령 과정의 동행', 60],
      ['이동 지원', '병원 방문과 귀가에 필요한 이동 지원', 25],
      ['일정과 상담', '예약·일정 확인과 이용자 상담', 15]
    ],
    result:'병원동행 횟수와 지원 내용을 개인정보 없이 활동소식으로 공유합니다.'
  },
  woorihamkke: {
    title:'익숙한 집에서 이어가는 하루',
    lead:'식사 준비와 이동에 도움이 필요한 어르신이 집에서 일상을 이어갈 수 있도록 방문요양과 가사지원을 연결합니다.',
    need:'혼자 식사를 준비하거나 집 안에서 움직이기 어려워지면 익숙했던 일상이 달라집니다. 어르신이 스스로 할 수 있는 일과 도움을 받고 싶은 일을 함께 살피고, 방문 때마다 필요한 지원을 조율합니다.',
    audience:'대구 동구의 일상 돌봄이 필요한 어르신과 가족',
    goal:3000000, raised:1260000, count:42,
    uses:[
      ['방문 돌봄', '식사 준비, 실내 이동 등 일상생활 지원', 55],
      ['생활용품', '위생·안전 관리에 필요한 소모품', 25],
      ['돌봄 상담', '가족 상담과 필요한 서비스 연결', 20]
    ],
    result:'방문 횟수와 지원 항목을 집계해 활동소식으로 공유합니다.'
  },
  'daegu-medical': {
    title:'집으로 찾아가는 건강 돌봄',
    lead:'이동이 어려운 이웃이 집에서도 건강 상태를 살피고 필요한 진료와 돌봄을 연결받을 수 있도록 지원합니다.',
    need:'퇴원 후 이동이 어렵거나 만성질환을 관리하는 주민에게는 집에서 건강 상태를 살필 기회가 필요합니다. 방문으로 생활 여건을 확인하고, 추가 진료나 지역 돌봄이 필요한 경우 이용할 자원을 안내합니다.',
    audience:'외출이 어렵거나 퇴원 후 건강관리가 필요한 대구 주민',
    goal:5000000, raised:1950000, count:61,
    uses:[
      ['방문건강관리', '가정 방문에 필요한 이동과 현장 운영', 55],
      ['건강관리 물품', '가정에서 사용하는 기초 건강 측정 소모품', 25],
      ['지역 자원 연계', '방문 후 복지·돌봄 서비스 안내와 상담', 20]
    ],
    result:'방문 지원 현황과 연계한 돌봄 서비스 유형을 집계해 공유합니다.'
  },
  'with-medical': {
    title:'집에서도 이어가는 생활운동',
    lead:'거동이 불편한 주민이 자신의 움직임에 맞는 운동을 배우고 생활 속에서 꾸준히 실천하도록 돕습니다.',
    need:'외출이 어려운 주민은 운동을 배울 기회가 줄어들 수 있습니다. 몸 상태와 집 안 동선을 살핀 뒤 앉아서 하는 운동과 가벼운 근력운동을 안내하고, 다음 방문 때 실천 경험을 함께 점검합니다.',
    audience:'방문운동과 일상 움직임 지원이 필요한 어르신과 주민',
    goal:4000000, raised:1120000, count:38,
    uses:[
      ['방문운동 운영', '가정 방문과 개인별 운동 지도', 50],
      ['운동 도구', '탄력밴드와 쉬운 운동 안내 자료', 30],
      ['실천 점검', '가정에서 실천하는 운동과 안전 수칙 안내', 20]
    ],
    result:'방문운동 횟수와 가정에서 활용할 수 있는 운동 안내 자료를 공유합니다.'
  },
  'daegu-care': {
    title:'한 끼를 전하고 안부를 묻습니다',
    lead:'식사 준비가 어려운 이웃에게 도시락과 반찬을 전하고, 방문할 때 필요한 도움이 있는지 살핍니다.',
    need:'몸이 불편하면 장보기와 조리가 일상의 큰 부담이 됩니다. 지역에서 준비한 식사를 가정에 전달하면서 식사와 생활에 필요한 지원을 살펴보고 지역 돌봄 서비스와 연결합니다.',
    audience:'식사 준비에 도움이 필요한 대구 주민',
    goal:3500000, raised:1575000, count:54,
    uses:[
      ['식재료와 조리', '도시락·반찬에 사용할 식재료와 조리 소모품', 60],
      ['포장과 전달', '포장 용기와 가정 방문 전달 비용', 25],
      ['안부 확인', '식사 전달 뒤 필요한 생활지원 안내', 15]
    ],
    result:'전달한 식사 수와 지원 가구 수를 활동소식으로 공유합니다.'
  },
  'welfare-design': {
    title:'자립을 준비하는 청년의 일상을 함께합니다',
    lead:'자립준비청년이 지역에서 필요한 정보를 찾고 생활 기반을 마련할 수 있도록 돕는 모금 시연입니다.',
    need:'자립을 준비하는 과정에서 생활 정보와 지속적인 관계가 필요합니다. 청년의 상황을 함께 살피고 생활 준비와 지역 자원 이용을 지원하는 사업 예시입니다.',
    audience:'자립을 준비하는 청년',
    goal:3000000, raised:780000, count:27,
    uses:[
      ['생활 준비', '자립에 필요한 생활 정보와 준비 물품', 45],
      ['청년 지원', '상담과 멘토링 프로그램 운영', 35],
      ['서비스 연결', '필요한 복지 자원 안내와 이용 절차 지원', 20]
    ],
    result:'청년 지원과 상담의 참여 현황을 개인정보 없이 공유합니다.'
  },
  naeiln: {
    title:'배움과 일로 넓어지는 하루',
    lead:'발달장애인이 자신에게 맞는 주간활동과 직업 경험을 통해 지역사회 안에서 일상의 선택지를 넓히도록 돕습니다.',
    need:'지역 안에서 취미를 발견하고 일의 경험을 쌓으려면 각자의 속도에 맞춘 기회가 필요합니다. 주간활동에서 문화·여가를 경험하고 보호작업장에서는 다양한 실습을 통해 자신에게 맞는 활동을 찾아갑니다.',
    audience:'대구 달성군의 발달장애인과 가족',
    goal:4500000, raised:1440000, count:49,
    uses:[
      ['주간활동', '문화·여가 프로그램 재료와 진행비', 45],
      ['직업훈련', '보호작업장 실습 재료와 훈련 도구', 40],
      ['지역사회 활동', '지역 체험 참여에 필요한 이동 지원', 15]
    ],
    result:'프로그램 운영 횟수와 참여 현황을 개인정보 없이 공유합니다.'
  },
  byeolbom: {
    title:'마을도서관에서 만나는 돌봄',
    lead:'마을도서관에서 발달장애인과 이웃이 함께 책을 읽고 활동하며 서로를 만나는 시간을 늘립니다.',
    need:'가까운 마을도서관은 이웃과 꾸준히 만날 수 있는 생활 공간입니다. 읽기 쉬운 책과 함께할 활동을 마련하고, 발달장애인과 지역 주민이 각자의 방식으로 모임에 참여할 수 있도록 돕습니다.',
    audience:'지역의 발달장애인과 도서관을 이용하는 이웃',
    goal:2500000, raised:925000, count:32,
    uses:[
      ['독서 활동', '읽기 쉬운 도서와 공동 활동 교구', 40],
      ['마을 모임', '주민과 함께하는 독서·문화 프로그램 운영', 40],
      ['참여 지원', '활동 보조와 이용 안내 자료', 20]
    ],
    result:'진행한 모임 횟수와 프로그램 활동 내용을 공유합니다.'
  },
  'modoo-happy': {
    title:'익숙한 집에서 이어지는 요양과 목욕 돌봄',
    lead:'방문요양과 방문목욕이 필요한 어르신의 일상생활을 지원하는 모금 시연입니다.',
    need:'집에서 생활하는 어르신에게는 일상생활과 위생 관리에 필요한 도움이 중요합니다. 방문요양과 방문목욕으로 익숙한 생활을 이어가도록 지원하는 사업 예시입니다.',
    audience:'방문요양과 방문목욕 지원이 필요한 어르신',
    goal:4000000, raised:1240000, count:41,
    uses:[
      ['방문요양', '일상생활을 돕는 방문 지원', 50],
      ['방문목욕', '위생 관리에 필요한 소모품과 목욕 지원', 35],
      ['이용 안내', '지역 돌봄 서비스와 후속 일정 안내', 15]
    ],
    result:'방문요양과 방문목욕의 지원 현황을 개인정보 없이 공유합니다.'
  }
};

function money(amount) {
  return campaignAmountFormat.format(amount) + '원';
}
function campaignFor(member) {
  return organizationCampaigns[member.id] || campaigns[member.id] || member.campaign;
}
function campaignTotals(member) {
  const campaign = campaignFor(member);
  const gifts = db.gifts.filter(gift => gift.memberId === member.id);
  const raised = campaign.raised + gifts.reduce((sum, gift) => sum + gift.amount, 0);
  return {
    raised, count: campaign.count + gifts.length,
    percent: Math.floor(raised / campaign.goal * 100)
  };
}
function campaignProgress(totals) {
  return `<progress class="campaign-progress" max="100" value="${Math.min(100,totals.percent)}" aria-label="후원 목표 달성률"></progress>`;
}
function campaignButton(member) {
  return `<button type="button" class="btn primary campaign-give" data-action="campaign-give" data-id="${esc(member.id)}" aria-haspopup="dialog" aria-label="${esc(member.name)} 후원하기">후원하기</button>`;
}
function campaignCardPreview(member, showTitle=true) {
  const campaign = campaignFor(member);
  if (!campaign) return '';
  const totals = campaignTotals(member);
  return `<div class="card-campaign">${showTitle?`<div class="card-campaign-title">${esc(campaign.title)}</div>`:''}
    <div class="card-campaign-numbers"><span><small>누적</small>${money(totals.raised)}</span><strong>${totals.percent}%</strong></div>
    ${campaignProgress(totals)}<small>목표 ${money(campaign.goal)} · 모금 시연</small></div>`;
}
function campaignFunding(member, campaign) {
  const totals = campaignTotals(member);
  return `<section id="campaign-funding" class="campaign-funding" aria-labelledby="campaign-funding-title">
    <div class="campaign-funding-head"><h2 id="campaign-funding-title">후원 현황</h2><span class="tag demo">모금 시연</span></div>
    <div class="campaign-amount"><span class="sr-only">누적 후원금</span><strong>${money(totals.raised)}</strong><span>${totals.percent}%</span></div>
    ${campaignProgress(totals)}
    <div class="campaign-metrics"><span>목표 <b>${money(campaign.goal)}</b></span><span>후원 <b>${campaignAmountFormat.format(totals.count)}건</b></span></div>
    ${campaignButton(member)}
    <p>예시 모금액 · 결제 없이 후원 체험</p>
  </section>`;
}
function campaignUsePlan(campaign) {
  if (campaign.planText) return `<p class="campaign-prose">${esc(campaign.planText)}</p>`;
  return `<ul class="campaign-budget">${campaign.uses.map(([name, detail, percent]) => `
    <li><span class="campaign-budget-icon">${icon('check')}</span>
      <div><h3>${esc(name)}</h3><p>${esc(detail)}</p></div>
      <div class="campaign-budget-number"><strong>${money(campaign.goal * percent / 100)}</strong><span>${percent}%</span></div>
    </li>`).join('')}</ul>`;
}
function campaignDetail(member, campaign) {
  const photo = photoData[member.id];
  const sections = [
    ['campaign-about', '사업 소개'],
    ['campaign-budget', '후원금 사용 계획'],
    ['campaign-updates', '활동소식']
  ];
  if (galleryPhotos('member',member.id).length) sections.push(['campaign-gallery', '현장 갤러리']);
  const website = cleanURL(member.url);
  return `<div class="campaign-page">
    <div class="wrap campaign-toolbar">
      <a class="backlink" href="#/${member.isProject?'projects':'members'}">${icon('back')} ${member.isProject?'돌봄사업 목록':'회원사 목록'}</a>
    </div>
    <section class="wrap campaign-hero" aria-labelledby="campaign-title">
      <div class="campaign-heading">
        <div class="tags"><span class="tag blue">${esc(member.service)}</span><span class="tag">${esc(member.district)}</span><span class="tag demo">${member.isLocal?'등록 시연':'예시 회원사'}</span></div>
        <p class="campaign-owner">${esc(member.owner||member.name)}</p>
        <h1 id="campaign-title">${esc(campaign.title)}</h1>
        <p class="campaign-lead">${esc(campaign.lead)}</p>
      </div>
      ${photo?`<figure class="campaign-cover">
        <button class="campaign-cover-photo" data-action="photo" data-id="${esc(member.id)}" aria-label="국내 사례 사진 크게 보기" aria-haspopup="dialog">${referencePhoto(member.id,true)}<span>${icon('search')}</span></button>
        <figcaption>국내 돌봄 사례 · <a href="${photoSource(member.id)}" target="_blank" rel="noopener noreferrer">${esc(photo.publisher)}</a></figcaption>
      </figure>`:`<div class="campaign-cover campaign-cover-placeholder" aria-hidden="true">${icon('heart')}</div>`}
      ${campaignFunding(member,campaign)}
    </section>
    <nav class="campaign-sections" aria-label="회원사 상세 메뉴"><div class="wrap">
      ${sections.map(([id, label])=>`<button type="button" data-action="campaign-jump" data-id="${id}">${label}</button>`).join('')}
    </div></nav>
    <div class="wrap campaign-content">
      <section id="campaign-about" class="campaign-panel" tabindex="-1">
        <h2>사업 소개</h2><p class="campaign-prose">${esc(member.isLocal?(member.body||member.desc):campaign.need)}</p>
        <dl class="campaign-facts">
          <div><dt>모집 회원사</dt><dd>${member.isProject?`<a class="link" href="#/member/${esc(member.orgId)}">${esc(member.owner)}</a>`:esc(member.name)}</dd></div>
          <div><dt>활동 지역</dt><dd>대구 ${esc(member.district)}</dd></div>
          ${campaign.audience?`<div><dt>지원 대상</dt><dd>${esc(campaign.audience)}</dd></div>`:''}
        </dl>
        ${member.isLocal?'':`<p class="campaign-org-copy">${esc(member.body||member.desc)}</p>`}
        <ul class="campaign-services">${member.items.map(item=>`<li>${esc(item)}</li>`).join('')}</ul>
        ${website?`<a class="link" href="${esc(website)}" target="_blank" rel="noopener noreferrer">회원사 홈페이지 ${icon('external')}</a>`:''}
      </section>
      <section id="campaign-budget" class="campaign-panel" tabindex="-1">
        <div class="campaign-panel-heading"><h2>후원금 사용 계획</h2><span>목표 ${money(campaign.goal)} 기준</span></div>
        ${campaignUsePlan(campaign)}
        ${campaign.result?`<div class="campaign-outcome"><h3>활동 결과 공유</h3><p>${esc(campaign.result)}</p></div>`:''}
      </section>
      <section id="campaign-updates" class="campaign-panel" tabindex="-1">
        ${onMemberMedia(member,'news')}
      </section>
      ${galleryPhotos('member',member.id).length?`<section id="campaign-gallery" class="campaign-panel" tabindex="-1">
        ${onMemberMedia(member,'gallery')}
      </section>`:''}
    </div>
    ${mobileGiftBar(member)}
  </div>`;
}
function mobileGiftBar(member) {
  return `<div class="campaign-mobile">
    <div><small>누적 후원금 · 시연</small><strong>${money(campaignTotals(member).raised)}</strong></div>
    ${campaignButton(member)}
  </div>`;
}
function jumpToCampaignSection(id) {
  const section = document.getElementById(id);
  if (!section) return;
  section.focus({preventScroll:true});
  section.scrollIntoView({block:'start'});
}
function showGiftForm(memberId, selection = {type:'once', preset:'10000', custom:'', method:'toss'}) {
  const member = givingSubject(memberId);
  if (!member || !campaignFor(member)) return;
  if (!demoAccount) { signInDialog(memberId); return; }
  const campaign = campaignFor(member);
  const choices = [1000, 5000, 10000, 30000, 50000, 'custom'];
  const radios = (name, values, checked, label) => values.map(value => `
    <label class="gift-choice"><input type="radio" name="${name}" value="${value}" ${String(value)===checked?'checked':''}><span>${label(value)}</span></label>`).join('');
  openModal('후원하기', member.name + ' · ' + campaign.title, `
    <form id="campaign-gift-form" data-member="${esc(member.id)}">
      <div class="form-info compact-info">후원 시연 · 결제 및 출금 없음</div>
      <fieldset class="gift-field"><legend>후원 방식</legend><div class="gift-type">
        ${radios('type',Object.keys(giftTypes),selection.type,value=>giftTypes[value])}
      </div></fieldset>
      <fieldset class="gift-field"><legend>후원 금액</legend><div class="gift-presets">
        ${radios('preset',choices,selection.preset,value=>value==='custom'?'직접 입력':money(value))}
      </div>
      <div class="field gift-custom" id="gift-custom-wrap" ${selection.preset==='custom'?'':'hidden'}>
        <label for="gift-custom">직접 입력할 금액</label>
        <input id="gift-custom" name="custom" type="number" inputmode="numeric" min="${minimumGift}" max="${maximumGift}" step="1" placeholder="${campaignAmountFormat.format(minimumGift)}~${money(maximumGift)}" value="${esc(selection.custom)}" ${selection.preset==='custom'?'required':'disabled'}>
      </div></fieldset>
      <fieldset class="gift-field"><legend>결제 수단</legend><div class="gift-presets">
        ${radios('method',Object.keys(paymentMethods),selection.method,value=>paymentMethods[value])}
      </div></fieldset>
      <div class="form-actions"><button type="button" class="btn" data-action="close">취소</button><button class="btn primary">후원 내용 확인 ${icon('arrow')}</button></div>
    </form>`);
}
function updateGiftAmountOption(form) {
  const custom = form.elements.preset.value === 'custom';
  const input = form.elements.custom;
  $('#gift-custom-wrap').hidden = !custom;
  input.disabled = !custom;
  input.required = custom;
  if (custom) input.focus();
}
function validGiftAmount(amount) {
  return Number.isSafeInteger(amount) && amount >= minimumGift && amount <= maximumGift;
}
function giftConfirmation(form) {
  const values = new FormData(form);
  const member = givingSubject(form.dataset.member);
  if (!member || !campaignFor(member)) return;
  const type = values.get('type');
  const method = values.get('method');
  const preset = values.get('preset');
  const custom = values.get('custom') || '';
  const amount = Number(preset === 'custom' ? custom : preset);
  if (!demoAccount) { signInDialog(member.id); return; }
  if (!Object.hasOwn(paymentMethods,method)) { toast('결제 수단을 선택해 주세요.'); return; }
  if (!Object.hasOwn(giftTypes,type) || !validGiftAmount(amount)) {
    toast(money(minimumGift)+'에서 '+money(maximumGift)+' 사이의 금액을 선택해 주세요.');
    return;
  }
  renderGiftReview(member,{type,method,preset,custom,amount});
}
function renderGiftReview(member,selection) {
  const {type,method,preset,custom,amount}=selection;
  const originalFocus = lastFocus;
  openModal('후원 내용 확인', member.name + ' · ' + campaignFor(member).title, `
    <form id="campaign-confirm-form">
      <dl class="gift-review"><div><dt>후원 대상</dt><dd>${esc(member.name)}</dd></div>
      ${member.owner&&member.owner!==member.name?`<div><dt>모집 회원사</dt><dd>${esc(member.owner)}</dd></div>`:''}
      <div><dt>후원 목적</dt><dd>${esc(campaignFor(member).title)}</dd></div><div><dt>후원 방식</dt><dd>${giftTypes[type]}</dd></div>
      <div><dt>후원 금액</dt><dd>${type==='monthly'?'월 ':''}${money(amount)}</dd></div>
      <div><dt>결제 수단</dt><dd>${paymentMethods[method]}</dd></div></dl>
      <div class="form-info">${type==='monthly'?'정기후원 시연은 첫 회 금액을 예시 현황에 반영합니다.':'일시후원 시연 내역은 이 브라우저에 저장됩니다.'}</div>
      <div class="form-actions">
        <button type="button" id="gift-edit" class="btn">금액·방식 수정</button>
        <button class="btn primary">결제 시연하기 ${icon('arrow')}</button>
      </div>
    </form><button type="button" id="gift-fail-demo" class="link">결제 오류 재현</button>`);
  lastFocus = originalFocus;
  $('#gift-fail-demo').addEventListener('click',()=>showGiftFailure(member,selection));
  $('#gift-edit').addEventListener('click',()=>{
    showGiftForm(member.id,{type,preset,custom,method});
    lastFocus = originalFocus;
  });
  $('#campaign-confirm-form').addEventListener('submit',event=>{
    event.preventDefault();
    const submit = $('button[type=submit],button:not([type])',event.currentTarget);
    if (submit.disabled) return;
    submit.disabled = true;
    if (!recordGift(member,type,amount,method)) submit.disabled = false;
  });
}
function showGiftFailure(member,selection) {
  const origin=lastFocus;
  openModal('결제를 완료하지 못했습니다','결제 오류 시연입니다. 후원 기록은 저장되지 않았습니다.',`
    <div class="form-actions"><button type="button" id="gift-failure-edit" class="btn">금액·방식 수정</button>
      <button type="button" id="gift-retry" class="btn primary">다시 확인하기</button></div>`);
  lastFocus=origin;
  $('#gift-failure-edit').addEventListener('click',()=>{showGiftForm(member.id,selection);lastFocus=origin;});
  $('#gift-retry').addEventListener('click',()=>renderGiftReview(member,selection));
}
function recordGift(member, type, amount, method) {
  if (!demoAccount || !Object.hasOwn(giftTypes,type) || !Object.hasOwn(paymentMethods,method) || !validGiftAmount(amount)) return false;
  const previous = db;
  try {
    const stored = readDemoDB();
    if (stored) db = stored;
  } catch {
    // Keep the in-memory state when browser storage cannot be read.
  }
  const confirmedMember = givingSubject(member.id);
  if (!confirmedMember || !campaignFor(confirmedMember)) {
    db = previous;
    toast('회원사 모금 정보를 다시 열어 주세요.');
    return false;
  }
  const gift = {id:uid(),memberId:member.id,type,amount,method,provider:demoAccount.provider,affiliation:{id:demoAccount.affiliationId||onAffiliationChoices().find(item=>item.name===demoAccount.affiliation)?.id||'name:'+demoAccount.affiliation.normalize('NFKC').toLowerCase(),name:demoAccount.affiliation},at:new Date().toISOString()};
  db.gifts.push(gift);
  if (!persist('이 브라우저에 후원 시연 내역을 저장할 수 없습니다.')) {
    db.gifts.pop();
    return false;
  }
  const totals = campaignTotals(confirmedMember);
  closeModal(false);
  renderPreserve();
  openModal('후원 시연을 완료했습니다', '선택한 후원 대상의 현황에 반영했습니다.', `
    <dl class="gift-review"><div><dt>후원 대상</dt><dd>${esc(member.name)}</dd></div>
      <div><dt>거래번호</dt><dd>${esc(gift.id)}</dd></div>
      <div><dt>${giftTypes[type]}</dt><dd>${type==='monthly'?'월 ':''}${money(amount)}</dd></div>
      <div><dt>누적 후원금</dt><dd>${money(totals.raised)}</dd></div></dl>
    <div class="form-actions"><button class="btn" data-action="close">상세로 돌아가기</button>
      <a class="btn primary" href="#/my">내 후원 보기 ${icon('arrow')}</a></div>`);
  lastFocus = matchMedia('(max-width:680px)').matches ? $('.campaign-mobile .campaign-give') : $('#campaign-funding .campaign-give');
  return true;
}
function readJoinCampaign(values) {
  const title = values.campaignTitle.trim();
  const goal = Number(values.campaignGoal);
  const purpose = values.campaignPurpose.trim();
  const planText = values.campaignPlan.trim();
  if (!title && !goal && !purpose && !planText) return null;
  if (!title || !purpose || !planText || !Number.isSafeInteger(goal) || goal < 1000 || goal > 100000000) {
    throw new Error('모금 제목과 목적, 사용 계획, 목표 금액을 모두 입력해 주세요.');
  }
  return {title, lead:purpose, need:purpose, goal, raised:0, count:0, planText};
}

const networkReport = '대구광역 통합돌봄 네트워크 경과보고';
const associationReport = '달구벌사회적협동조합연합회 2025년 활동보고';
const participationReport = '통합돌봄 플랫폼 동의 기관 · 2026.11.20';
const participationDate = '2026.11.20';
const organizations = [
  {
    id:'daegu-dounuri', name:'사회적협동조합 대구도우누리', service:'병원동행', district:'수성구', icon:'medical',
    aliases:['대구도우누리'],
    desc:'혼자 병원을 방문하기 어려운 이웃의 이동과 진료 동행을 지원합니다.',
    body:'병원동행 분야로 플랫폼 참여가 확정된 기관입니다. 공식 안내에서는 예약·일정 관리, 접수·수납 보조, 진료 동행, 처방전·약 수령과 귀가 동행을 소개합니다. 방문요양·가족요양, 복지용구, 통합돌봄과 가사돌봄 사업도 안내합니다.',
    items:['병원동행','이동지원'],
    url:'https://linktr.ee/dgdounuri_official', urlLabel:'공식 채널',
    facts:[['참여 확인',participationDate],['주요 분야','병원동행·이동지원'],['소재지','대구 수성구 범안로16길 5 1층']],
    sources:[participationReport,'대구도우누리 공식 채널','병원동행 안내: https://www.dgdounuri.kr/36','수성구 영양식 기탁 활동: '+"https://www.suseong.kr/news/index.do?menu_id=00031461&menu_link=%2Ffront%2Fnews%2FselectIcmsArticle.do%3Farticle_id%3DARTICLE_00019243",'공동체 밥집 한끼라면: https://www.dgdounuri.kr/39']
  },
  {
    id:'woorihamkke', name:'우리함께통합돌봄사회적협동조합', service:'방문요양', district:'동구', icon:'heart',
    desc:'장기요양과 일상돌봄, 병원동행으로 생활을 지원합니다.',
    body:'장기요양, 일상돌봄, 병원동행 분야로 플랫폼 참여가 확정된 기관입니다. 보건의료, 요양과 일상생활 돌봄을 연계해 지역 주민의 생활을 지원합니다.',
    items:['장기요양','방문요양','일상돌봄','병원동행'],
    url:'',
    facts:[['참여 확인',participationDate],['설립인가','2025년 5월 1일 · 보건복지부'],['주사무소','대구광역시 동구 신암동']],
    extraTitle:'등기상 주요 사업',
    extra:['통합돌봄 전문인력 양성 교육','재가장기요양','중·장년층 일상생활 돌봄','가사·간병 방문지원','장애인 돌봄','긴급돌봄'],
    sources:[participationReport,'사회적협동조합 설립인가증', '등기사항전부증명서 1쪽', networkReport+' 4쪽']
  },
  {
    id:'with-medical', name:'위드의료복지사회적협동조합', service:'의료', district:'서구', icon:'medical',
    aliases:['위드의료사회적협동조합'],
    desc:'방문진료와 방문운동을 통해 일상 가까이에서 돌봄을 지원합니다.',
    body:'방문진료와 방문운동으로 지역 주민의 건강을 돌봅니다. 공식 홈페이지에는 의료사랑방, 의대생 의료현장 실습, 건강동아리 등 실제 활동이 게시되어 있습니다. 기존 네트워크 자료에는 지역통합돌봄 시범사업의 방문진료 참여와 의료 영역의 돌봄 사례 발표가 기록되어 있습니다.',
    items:['의료','방문진료','방문운동'],
    url:'https://www.withmedcoop.com/', urlLabel:'홈페이지',
    facts:[['참여 확인',participationDate],['소재지','대구 서구 통학로32길 8 2층'],['시범사업','방문진료 · 2025년 10월~2026년 1월']],
    sources:[participationReport,'위드 공식 의료사랑방 활동: https://www.withmedcoop.com/bbs/board.php?bo_table=sub0204&wr_id=34&theme_type=main1',networkReport+' 2~4쪽']
  },
  {
    id:'welfare-design', name:'사회복지디자인연구소사회적협동조합', service:'자립준비청년', icon:'people',
    aliases:['사회복지디자인연구소 사회적협동조합'],
    desc:'자립준비청년의 지역사회 생활과 자립을 지원합니다.',
    body:'자립준비청년 분야로 플랫폼 참여가 확정된 기관입니다. 대구시민공익활동지원센터에 조합원 워크숍 후기가 공개되어 있으며, 거창에서 쉼과 대화를 나누고 일상과 통합돌봄을 돌아본 활동을 확인할 수 있습니다.',
    items:['자립준비청년'],
    url:'https://cafe.daum.net/SDL2023', urlLabel:'공식 카페',
    facts:[['참여 확인',participationDate],['주요 분야','자립준비청년']],
    photo:'field-seminar',
    sources:[participationReport,'조합원 워크숍 참여후기: https://www.dgpublic.org/web/jhboard/view.php?id=active1&no=4054']
  },
  {
    id:'daegu-care', name:'대구돌봄사회적협동조합', service:'생활지원', icon:'meal',
    desc:'아동·노인·청중년층의 일상에 필요한 돌봄을 지원합니다.',
    body:'아동, 노인, 청중년층을 위한 돌봄 분야로 플랫폼 참여가 확정된 기관입니다. 공식 블로그의 일상돌봄 안내에서는 가사지원, 식사지원, 병원동행, 안부확인과 정서지원을 소개합니다. 식사영양관리 게시글에는 실제 조리·포장과 전달 사례가 기록되어 있습니다.',
    items:['아동 돌봄','노인 돌봄','청중년층 돌봄','일상돌봄','가사지원','식사지원','병원동행'],
    url:'https://blog.naver.com/dgcare1', urlLabel:'공식 블로그',
    facts:[['참여 확인',participationDate],['주요 대상','아동·노인·청중년층'],['시범사업','식사지원 · 2025년 10월~2026년 1월']],
    sources:[participationReport,'일상돌봄 공식 안내(2026.07.14): https://blog.naver.com/dgcare1/224346356301','실제 식사영양관리 사례: https://blog.naver.com/dgcare1/223802349837',networkReport+' 2·4쪽', associationReport+' 2쪽']
  },
  {
    id:'naeiln', name:'내일앤사회적협동조합', service:'장애인 직업재활', district:'달성군', icon:'people',
    desc:'장애인의 직업재활과 지역사회 자립을 지원합니다.',
    body:'장애직업재활 분야로 플랫폼 참여가 확정된 기관입니다. 더봄 장애인직업재활시설을 운영하며 보호환경에서 직업훈련과 교육을 제공합니다. 공식 홈페이지에서는 환경위생용품 제작, 소독·청소, 냉난방기 종합세척과 판촉물·기념품 제작 사업을 안내합니다. 법무부가 공개한 언론보도에는 2025년 5월 더봄에서 진행한 읍내중고 제과반의 마들렌 나눔 활동도 소개되어 있습니다.',
    items:['장애인 직업재활','직업훈련','환경위생용품 제작','소독·청소'],
    url:'https://www.naeiland.org/', urlLabel:'홈페이지',
    facts:[['참여 확인',participationDate],['소재지','대구 달성군 옥포읍 돌미로 85 301호'],['운영 시설','더봄 장애인직업재활시설']],
    photo:'field-naeiln',
    sources:[participationReport,'내일앤사회적협동조합 공식 홈페이지','직업재활 안내: https://thebom.clickn.co.kr/pages/job','더봄 나눔 언론보도: https://www.cppb.go.kr/cppb/596/subview.do?enc=Zm5jdDF8QEB8JTJGYmJzJTJGY3BwYiUyRjMzJTJGNTk1ODY3JTJGYXJ0Y2xWaWV3LmRvJTNG','더봄 개소식 영상: https://www.youtube.com/watch?v=93piMxXQ14M',networkReport+' 4쪽', associationReport+' 4쪽']
  },
  {
    id:'modoo-happy', name:'사회적협동조합 모두행복센터', service:'방문요양', icon:'heart',
    desc:'방문요양·방문목욕과 일상돌봄으로 생활을 지원합니다.',
    body:'방문요양과 방문목욕은 참여 동의 자료에서 확인한 분야입니다. 공식 블로그에서는 일상돌봄과 가사·간병 방문지원, 가정방문 후 생활지원과 병원동행의 실제 사례를 확인했습니다. 서비스별 이용 가능 여부는 기관에 확인할 수 있습니다.',
    items:['방문요양','방문목욕','일상돌봄','가사·간병 지원','병원동행'],
    url:'https://blog.naver.com/dasahappy', urlLabel:'공식 블로그',
    facts:[['참여 확인',participationDate],['주요 분야','방문요양·방문목욕']],
    sources:[participationReport,'병원동행 실제 사례(2026.05.14): https://blog.naver.com/dasahappy/224285448077','가정방문 지원 사례(2026.06.14): https://blog.naver.com/dasahappy/224315829543',networkReport+' 2·4쪽']
  }
];
const archivedOrganizations = [
  {
    id:'daegu-medical', name:'대구의료복지사회적협동조합', service:'방문진료', icon:'medical',
    desc:'방문진료와 재택의료를 통해 지역 안에서 건강을 돌봅니다.',
    body:'네트워크 참가현황에는 재택의료센터, 노인장기요양, 장애인 활동지원 분야의 서비스 제공기관으로 소개되어 있습니다. 대구 지역통합돌봄 모델발굴 시범사업에 방문진료 분야로 참여했습니다.',
    items:['재택의료센터','방문진료','노인장기요양','장애인 활동지원'],
    facts:[['시범사업','방문진료 · 2025년 10월~2026년 1월']],
    sources:[networkReport+' 2·4쪽', associationReport+' 2·3쪽']
  },
  {
    id:'byeolbom', name:'별봄사회적협동조합', service:'공동체 돌봄', icon:'home',
    desc:'발달장애인 주간활동과 마을공동체 돌봄을 연결합니다.',
    body:'네트워크 참가현황에는 발달장애인 주간활동, 마을공동체, 마을기업 분야에 참여하는 기관으로 소개되어 있습니다. 영남대학교 생활과학연구소 심포지엄에서 마을도서관을 중심으로 공동체 돌봄을 넓힌 사례를 발표했습니다.',
    items:['발달장애인 주간활동','마을공동체','마을기업'],
    facts:[['사례 발표','마을도서관에서 공동체 돌봄 확장 · 2025년 11월 18일']],
    sources:[networkReport+' 2·4쪽']
  }
];

const documentedNews = [
  {
    id:'daegu-declaration', type:'news', verified:true, category:'네트워크 활동',
    date:'2026.03.11', title:'대구광역 통합돌봄 네트워크 출범 선언',
    org:'대구광역 통합돌봄 네트워크', photoKey:'field-launch',
    source:networkReport+' 3·9~10쪽',
    body:'대구의 사회적경제 조직과 마을공동체, 민간지원조직이 살던 곳에서 존엄하게 생활할 수 있는 지역 돌봄을 함께 만들겠다고 선언했습니다. 출범 선언문에는 시민의 거주권과 존엄, 돌봄 노동의 가치, 지역 조직 간 협력이 주요 약속으로 담겼습니다.'
  },
  {
    id:'daegu-care-pilot', type:'news', verified:true, category:'시범사업', photoKey:'care-pilot-reference',
    date:'2025.10~2026.01', title:'대구 지역통합돌봄 시범사업에 4개 기관 참여',
    org:'대구광역 통합돌봄 네트워크', members:['daegu-medical','with-medical','daegu-care','welfare-design'],
    source:networkReport+' 1~2쪽',
    body:'대구 지역통합돌봄 모델발굴 시범사업에 대구의료복지사회적협동조합과 위드의료복지사회적협동조합은 방문진료, 대구돌봄사회적협동조합은 식사지원, 사회복지디자인연구소 사회적협동조합은 가사지원 분야로 참여했습니다.'
  },
  {
    id:'daegu-agreement', type:'news', verified:true, category:'네트워크 활동',
    date:'2025.11.04', title:'복현어울림센터에서 15개 기관 업무협약',
    org:'대구광역 통합돌봄 네트워크', photoKey:'field-agreement',
    source:networkReport+' 2~3쪽',
    body:'복현어울림센터에서 대구광역 통합돌봄 네트워크 준비위원회 발대식과 업무협약식이 열렸습니다. 지역 돌봄 네트워크를 구축하고 활성화하는 데 뜻을 모아 15개 기관이 업무협약을 맺었습니다.'
  },
  {
    id:'daegu-health-symposium', type:'news', verified:true, category:'교육·포럼', photoKey:'health-forum-reference',
    date:'2026.02.27', title:'대구가톨릭대 심포지엄에서 의료와 마을돌봄 논의',
    org:'대구광역 통합돌봄 네트워크', members:['with-medical'],
    source:networkReport+' 2~3쪽',
    body:'‘통합돌봄시대, 건강공동체를 그리다’ 심포지엄에서 대구시마을공동체만들기지원센터와 위드의료복지사회적협동조합이 각각 지역사회와 의료의 관점에서 통합돌봄을 발표했습니다.'
  },
  {
    id:'daegu-university-symposium', type:'news', verified:true, category:'교육·포럼', photoKey:'community-care-forum-reference',
    date:'2025.11.18', title:'영남대 심포지엄에서 기관 세 곳의 돌봄 사례 발표',
    org:'대구광역 통합돌봄 네트워크', members:['with-medical','byeolbom','modoo-happy'],
    source:networkReport+' 2쪽',
    body:'위드의료복지사회적협동조합은 의료복지사회적협동조합의 돌봄활동을, 별봄사회적협동조합은 마을도서관 중심 공동체 돌봄을, 사회적협동조합 모두행복센터는 일상돌봄에서 노인돌봄으로 역할을 넓힌 사례를 발표했습니다.'
  },
  {
    id:'daegu-national-conference', type:'news', verified:true, category:'네트워크 활동',
    date:'2025.10.24', title:'통합돌봄 광역 네트워크 전국대회에서 대구 사례 발표',
    org:'달구벌사회적협동조합연합회', photoKey:'field-conference',
    source:networkReport+' 1·3쪽',
    body:'전주시청에서 열린 사회연대경제 통합돌봄 광역 네트워크 전국대회에서 달구벌사회적협동조합연합회가 대구지역 통합돌봄 사례를 발표했습니다.'
  },
  {
    id:'daegu-seminar', type:'news', verified:true, category:'교육·포럼',
    date:'2025.05.22', title:'대구경북 의료사회복지사와 통합돌봄 과제 논의',
    org:'사회복지디자인연구소 사회적협동조합', members:['welfare-design'], photoKey:'field-seminar',
    source:networkReport+' 1·3쪽',
    body:'대구파티마병원에서 열린 대한의료사회복지사협회 대구경북지회 세미나에서 사회복지디자인연구소 사회적협동조합이 통합돌봄 추진현황과 향후 과제를 주제로 강의했습니다.'
  },
  {
    id:'daegu-naeiln-visit', type:'news', verified:true, category:'현장 방문',
    date:'2025.06.04', title:'내일앤 보호작업장과 주간활동 공간 방문',
    org:'내일앤사회적협동조합', members:['naeiln'], photoKey:'field-naeiln',
    source:associationReport+' 4쪽',
    body:'달구벌사회적협동조합연합회가 대구 달성군 옥포읍의 내일앤사회적협동조합을 방문해 장애인 보호작업장과 발달장애인 주간활동 공간을 살펴봤습니다.'
  },
  {
    id:'daegu-garden-visit', type:'news', verified:true, category:'현장 방문',
    date:'2025.05.09', title:'복현어울림센터에서 어르신 텃밭 가꾸기 사업 방문',
    org:'복현마을관리사회적협동조합', photoKey:'field-garden',
    source:associationReport+' 4쪽',
    body:'달구벌사회적협동조합연합회가 복현마을관리사회적협동조합의 어르신 텃밭 가꾸기 사업을 복현어울림센터에서 살펴봤습니다.'
  }
];

const networkTimeline = [
  ['2024.10', '통합돌봄 교육 3회와 워크숍 1회', '광주 서구, 경북 안동 사례와 통합돌봄 정책을 함께 살폈습니다.'],
  ['2025.04~12', '돌봄분과 내부학습 8회', '달구벌사회적협동조합연합회 돌봄분과가 통합돌봄 학습을 진행했습니다.'],
  ['2025.08.18', '대구지역 통합돌봄 네트워크 결성', '지역 돌봄을 함께 논의할 협력 기반을 마련했습니다.'],
  ['2025.11.04', '복현어울림센터 업무협약', '준비위원회 발대식에서 15개 기관이 협약했습니다.', 'daegu-agreement'],
  ['2025.10~2026.01', '지역통합돌봄 모델발굴 시범사업', '4개 기관이 방문진료, 식사지원, 가사지원 분야에 참여했습니다.', 'daegu-care-pilot'],
  ['2026.02.27', '대구가톨릭대학교 심포지엄', '의료와 지역사회의 관점에서 돌봄 사례를 공유했습니다.', 'daegu-health-symposium'],
  ['2026.03.11', '대구광역 통합돌봄 네트워크 출범 선언', '지역사회에서 존엄하게 살아갈 수 있는 돌봄을 함께 만들기로 했습니다.', 'daegu-declaration']
];

const networkRoster = [
  ['사회적협동조합', [
    '대구돌봄사회적협동조합','대구의료복지사회적협동조합','위드의료복지사회적협동조합',
    '사회적협동조합 모두행복센터','우리함께통합돌봄사회적협동조합','사회복지디자인연구소 사회적협동조합',
    '내일앤사회적협동조합','별봄사회적협동조합','사회적협동조합 행복림','사회적협동조합 대구도우누리','사회적협동조합 와룡'
  ]],
  ['협동조합', ['모두의도시협동조합','반야월공동체살림협동조합']],
  ['협동조합연합회', ['대구경북로컬푸드이종협동조합연합회','달구벌사회적협동조합연합회']],
  ['사회적기업', ['㈜대구주거환경개선센터','㈜운동명가조아짐','㈜청소하는 마을']],
  ['기관·단체', ['대구광역자활센터','대구시마을공동체만들기지원센터','대구시사회적경제지원센터']],
  ['전문가', ['영남대학교 휴먼서비스학과 · 복지정책 자문']]
];

function directoryMembers() {
  return [...organizations,...allMembers().filter(member=>member.isLocal)];
}
function participationNote() {
  return `<p class="smalltext muted">참여 확정 ${organizations.length}개 기관 · ${participationDate} 기준</p>`;
}
function publishedNews() {
  return items('news').filter(story=>story.verified||story.isLocal);
}
function storyPhotoKey(story) {
  const key = story.photoKey||story.memberId;
  return photoData[key] ? key : '';
}
function documentedPhoto(key, eager=false, showIcon=true) {
  const photo = photoData[key];
  return `<figure class="documented-photo">
    <button type="button" data-action="photo" data-id="${key}" aria-label="${esc(photo.title)} 사진 확대" aria-haspopup="dialog">${referencePhoto(key,eager)}${showIcon?`<span>${icon('search')}</span>`:''}</button>
    <figcaption>${esc(photo.title)}<small>사진 출처 · ${esc(photo.sourceLabel)}</small></figcaption>
  </figure>`;
}
function organizationOwnCase(org) {
  const primary=photoData['org-'+org.id];
  if(primary?.owner===org.id)return primary;
  const photo=onSocialThumbnails['member/'+org.id]?.background;
  return photo?.owner===org.id?photo:null;
}
function organizationCaseImage(photo,eager=false) {
  return `<img src="/media/${esc(photo.displayFile||photo.file)}" width="${photo.displayWidth||photo.width}" height="${photo.displayHeight||photo.height}" alt="${esc(photo.caption)}" ${eager?'':'loading="lazy"'} decoding="async">`;
}
function organizationReferenceFigure(org, eager=true) {
  const ownCase=organizationOwnCase(org);
  if(ownCase) return `<figure class="documented-photo org-reference">
    <a class="case-photo-link" href="/media/${esc(ownCase.file)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(org.name)} 실제 활동 사진 보기">${organizationCaseImage(ownCase,eager)}</a>
    <figcaption><span class="org-reference-label">${esc(ownCase.contextLabel||'기관 실제 활동사진')}</span><strong>${esc(ownCase.caption)}</strong>
      <a href="${esc(cleanURL(ownCase.source))}" target="_blank" rel="noopener noreferrer">${esc(ownCase.publisher)} 원문 보기</a></figcaption>
  </figure>`;
  const key = organizationReferences[org.id];
  const photo = photoData[key];
  if (photo.sourceLabel) return documentedPhoto(key,eager).replace('class="documented-photo"','class="documented-photo org-reference"');
  return `<figure class="documented-photo org-reference">
    <button type="button" data-action="photo" data-id="${key}" aria-label="${esc(photo.title)} 참고 사진 확대" aria-haspopup="dialog">${referencePhoto(key,eager)}<span>${icon('search')}</span></button>
    <figcaption>
      <span class="org-reference-label">${esc(photo.contextLabel||'분야 참고 사례')}</span>
      <strong>${esc(photo.title)}</strong>
      <small>${esc(photo.caption)}</small>
      <a href="${esc(photo.source)}" target="_blank" rel="noopener noreferrer">${esc(photo.publisher)} 원문 보기 ${icon('external')}</a>
    </figcaption>
  </figure>`;
}
function organizationCard(org) {
  const photoKey = organizationReferences[org.id] || (photoData[org.id] ? org.id : '');
  const ownCase=organizationOwnCase(org);
  const photo = ownCase||photoData[photoKey];
  const route = 'member/'+org.id;
  const campaign = campaignFor(org);
  const label = org.isLocal ? '등록 시연' : photo?.contextLabel || (ownCase||photo?.sourceLabel ? '기관 활동 사진' : '분야 참고 사례');
  const escortTag = org.service!==hospitalEscortService&&matchesDirectoryService(org,hospitalEscortService)
    ? `<span class="tag blue">${hospitalEscortService}</span>` : '';
  const tags = `<div class="tags org-card-tags"><span class="tag blue">${esc(org.service)}</span>${escortTag}${org.district?`<span class="tag">${esc(org.district)}</span>`:''}</div>`;
  return `<article class="org-card">
    <div class="org-card-main">
      ${photo?`<div class="org-card-photo${photo.cardRatio?' org-card-photo-original':''}"${photo.cardRatio?` style="--card-photo-ratio:${photo.cardRatio}"`:''}>
        ${ownCase?organizationCaseImage(ownCase):referencePhoto(photoKey)}
        ${tags}
        <div class="org-card-overlay"><span class="org-card-reference-label">${label}</span><p>${esc(org.desc)}</p></div>
      </div>`:`<div class="org-card-photo org-card-no-photo"><span class="avatar" style="--tone:#e3edf9;--color:#537cb0">${icon(org.icon)}</span></div>`}
      <div class="org-card-copy">
        ${photo?'':tags}
        <h3><a class="org-card-title-link" href="#/${esc(route)}" aria-label="${esc(org.name)} 상세 보기">${esc(org.name)}</a></h3>${photo?`<span class="tag on-member-reference">${label}</span>`:''}
        ${photo?'':`<p>${esc(org.desc)}</p>`}
        ${campaignCardPreview(org)}
      </div>
    </div>
    ${canPreviewShare(route)?`<button type="button" class="icon-btn org-card-share" data-action="share" data-route-share="${esc(route)}" aria-label="${esc(org.name)} 공유하기" title="공유하기">${icon('share')}</button>`:''}
    ${campaign?`<div class="org-card-actions">${campaignButton(org)}</div>`:''}
  </article>`;
}
function organizationSource(source) {
  const match=source.match(/https?:\/\/\S+/);
  return match?esc(source.slice(0,match.index).replace(/:\s*$/,''))+` <a class="link" href="${esc(cleanURL(match[0]))}" target="_blank" rel="noopener noreferrer">원문 보기</a>`:esc(source);
}
function organizationInfo(org) {
  return `<h2>기관 소개</h2><p class="campaign-prose">${esc(org.body)}</p>
    ${org.url?`<a class="btn" href="${esc(cleanURL(org.url))}" target="_blank" rel="noopener noreferrer">${esc(org.urlLabel||'홈페이지')}</a>`:'<p class="smalltext muted">홈페이지 미등록</p>'}
    ${org.facts.length?`<dl class="org-facts">${org.facts.map(([term,value])=>`<div><dt>${esc(term)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`:''}
    ${org.extra?`<h3>${esc(org.extraTitle)}</h3><ul>${org.extra.map(item=>`<li>${esc(item)}</li>`).join('')}</ul>`:''}
    <details class="org-source-details"><summary>확인 자료</summary><ul>${org.sources.map(source=>`<li>${organizationSource(source)}</li>`).join('')}</ul></details>`;
}
function organizationProfile(org) {
  return pageHead(org.name,org.desc)+`<div class="wrap page-content on-form-width">
    <a class="backlink" href="#/members">회원사 목록</a>
    <section class="campaign-panel org-source-panel">${organizationInfo(org)}
      <h3>주요 활동 분야</h3><ul class="campaign-services">${org.items.map(item=>`<li>${esc(item)}</li>`).join('')}</ul>
    </section>${onMemberMedia(org,'news')}
  </div>`;
}
function organizationDetail(org) {
  const campaign = campaignFor(org);
  if (!campaign) return organizationProfile(org);
  const sections = [['campaign-about','사업 소개'],['campaign-budget','후원금 사용 계획'],
    ['campaign-updates','활동소식'],['campaign-gallery','사진']];
  return `<div class="campaign-page organization-page">
    <div class="wrap campaign-toolbar">
      <a class="backlink" href="#/members">${icon('back')} 회원사 목록</a>
    </div>
    <section class="wrap campaign-hero" aria-labelledby="campaign-title">
      <div class="campaign-heading">
        <div class="tags"><span class="tag blue">${esc(org.service)}</span><span class="tag">${org.district?'대구 '+esc(org.district):'대구'}</span></div>
        <p class="campaign-owner">${esc(org.name)}</p>
        <h1 id="campaign-title">${esc(campaign.title)}</h1><p class="campaign-lead">${esc(campaign.lead)}</p>
      </div>
      <div class="on-member-cover">${organizationReferenceFigure(org)}<button class="icon-btn on-cover-share" data-action="share" aria-label="회원사 공유하기">${icon('share')}</button></div>
      ${campaignFunding(org,campaign)}
    </section>
    <nav class="campaign-sections" aria-label="모금 페이지 메뉴"><div class="wrap">
      ${sections.map(([id,label])=>`<button type="button" data-action="campaign-jump" data-id="${id}">${label}</button>`).join('')}
    </div></nav>
    <div class="wrap org-detail-layout">
      <div>
        <section id="campaign-about" class="campaign-panel" tabindex="-1">
          <h2>사업 소개</h2><p class="campaign-prose">${esc(campaign.need)}</p>
          <dl class="campaign-facts"><div><dt>모금 회원사</dt><dd>${esc(org.name)}</dd></div>
            <div><dt>활동 지역</dt><dd>${esc(org.district?'대구 '+org.district:'대구광역시')}</dd></div>
            <div><dt>지원 대상 예시</dt><dd>${esc(campaign.audience)}</dd></div></dl>
          <h3>주요 활동 분야</h3><ul class="campaign-services">${org.items.map(item=>`<li>${esc(item)}</li>`).join('')}</ul>
        </section>
        <section id="campaign-budget" class="campaign-panel" tabindex="-1">
          <div class="campaign-panel-heading"><h2>후원금 사용 계획</h2><span>목표 ${money(campaign.goal)} 기준 · 예시</span></div>
          ${campaignUsePlan(campaign)}
          <div class="campaign-outcome"><h3>활동 결과 공유</h3><p>${esc(campaign.result)}</p></div>
        </section>
        <section id="campaign-updates" class="campaign-panel" tabindex="-1">
          ${onMemberMedia(org,'news')}
        </section>
        <section id="campaign-gallery" class="campaign-panel" tabindex="-1">
          ${onMemberMedia(org,'gallery')}
        </section>
        ${publishedProjects().some(project=>project.orgId===org.id)?`<section class="campaign-panel"><h2>공개 돌봄사업</h2>${projectList(publishedProjects().filter(project=>project.orgId===org.id))}</section>`:''}
      </div>
      <aside class="org-detail-aside">
        <section class="campaign-panel org-source-panel">
          ${organizationInfo(org)}
        </section>
      </aside>
    </div>
    ${mobileGiftBar(org)}
  </div>`;
}
function demoPage() {
  return membersPage();
}
function documentedAbout() {
  return pageHead('네트워크 소개','대구광역 통합돌봄 네트워크의 출범과 활동을 살펴보세요.')+`<div class="wrap page-content">
    <section class="network-intro">
      <div><h2 class="intro-big">살던 곳에서<br>존엄하게 살아가는 돌봄</h2>
        <p>대구의 사회적경제 조직과 마을공동체, 민간지원조직이 보건의료·요양·주거·일상생활 지원을 잇는 지역 돌봄을 함께 만들어갑니다.</p>
        <a class="link" href="#/detail/daegu-declaration">출범 선언 요약 보기 ${icon('arrow')}</a></div>
      ${documentedPhoto('field-agreement',true)}
    </section>
    <section class="body-block network-content-block"><h2>네트워크 경과</h2>
      <ol class="network-timeline">${networkTimeline.map(([date,title,description,id])=>`<li>
        <span>${date}</span><div><h3>${id?`<a href="#/detail/${id}">${esc(title)} ${icon('arrow')}</a>`:esc(title)}</h3><p>${esc(description)}</p></div>
      </li>`).join('')}</ol>
      <p class="network-source">출처 · ${networkReport} 1~3·9~10쪽</p>
    </section>
    <section class="body-block network-content-block"><h2>플랫폼 참여 확정기관</h2>
      ${participationNote()}
      <div class="network-roster"><section><h3>참여기관 ${organizations.length}곳</h3><ul>${organizations.map(org=>`<li><a href="#/member/${org.id}">${esc(org.name)}</a></li>`).join('')}</ul></section></div>
      <p class="network-source">출처 · ${participationReport}</p>
    </section>
    <section class="body-block network-content-block"><h2>네트워크 참가현황 기록</h2>
      <div class="network-roster">${networkRoster.map(([group,names])=>`<section><h3>${esc(group)}</h3><ul>${names.map(name=>{
        const org=[...organizations,...archivedOrganizations].find(item=>item.name===name||item.aliases?.includes(name));
        return org?`<li><a href="#/member/${org.id}">${esc(name)} ${icon('chevron')}</a></li>`:`<li>${esc(name)}</li>`;
      }).join('')}</ul></section>`).join('')}</div>
      <p class="network-source">출처 · ${networkReport} 4~5쪽의 참가현황</p>
    </section>
    <section class="campaign-panel network-support"><span class="tag blue">네트워크 지원</span><h2>달구벌사회적협동조합연합회</h2>
      <p class="campaign-prose">대구의 사회적협동조합 활동을 지원하는 연합회입니다. 통합돌봄 분과에서 교육과 내부학습을 진행했고, 단체소개서에는 2026년 네트워크 교육·연구·프로그램 개발 지원 계획이 기재돼 있습니다.</p>
      <dl class="org-facts"><div><dt>연합회 설립</dt><dd>2024년 8월 12일</dd></div><div><dt>연합회 소속</dt><dd>24개사 · 단체소개서 기준</dd></div></dl>
      <p class="network-source">출처 · 달구벌사회적협동조합연합회 단체소개서 1쪽, ${networkReport} 1·5쪽</p>
    </section>
  </div>`;
}

for(const [key,photo] of Object.entries(onContentCasePhotos)){
  photoData[key]=photo;
  onImagePreviews[photo.file]={original:[photo.file,photo.width,photo.height,photo.file.endsWith('.png')?'image/png':'image/jpeg']};
  if(photo.displayFile)onImagePreviews[photo.file].wide=[photo.displayFile,photo.displayWidth,photo.displayHeight,'image/jpeg'];
}
documentedNews.unshift(...onResearchedNews);
for(const org of organizations){
  if(photoData['org-'+org.id])organizationReferences[org.id]='org-'+org.id;
}

const news=members.map((member,index)=>({
  id:'n'+(index+1),type:'news',memberId:member.id,title:member.story[0],org:member.name,
  category:member.story[1],body:member.story[2],tone:member.tone
}));
const onExampleEditorial = {
  "n1": {
    "title": "의료사랑방에서 함께하는 한 끼",
    "photoKey": "with-34-2",
    "body": "의료사랑방에서 함께하는 한 끼에 관한 화면 구성 예시입니다.\n\n사진은 의료사랑방 현장에서 어르신들이 식사하는 모습\n\n사진 속 실제 기관·지역의 활동을 참고하며, 예시 회원사의 수행 실적으로 표시하지 않습니다."
  },
  "n2": {
    "title": "의료현장에서 배우는 건강 돌봄",
    "photoKey": "example-n2",
    "body": "의료현장에서 배우는 건강 돌봄에 관한 화면 구성 예시입니다.\n\n사진은 의료현장 실습에 참여한 의대생과 주민들\n\n사진 속 실제 기관·지역의 활동을 참고하며, 예시 회원사의 수행 실적으로 표시하지 않습니다."
  },
  "n3": {
    "title": "청소·정리로 살피는 집안 안전",
    "photoKey": "example-n3",
    "body": "청소·정리로 살피는 집안 안전에 관한 화면 구성 예시입니다.\n\n사진은 가사지원 후 정돈된 주방\n\n사진 속 실제 기관·지역의 활동을 참고하며, 예시 회원사의 수행 실적으로 표시하지 않습니다."
  },
  "n4": {
    "title": "이웃에게 전하는 한 끼",
    "photoKey": "example-n4",
    "body": "이웃에게 전하는 한 끼에 관한 화면 구성 예시입니다.\n\n사진은 생선까스 식단 포장\n\n사진 속 실제 기관·지역의 활동을 참고하며, 예시 회원사의 수행 실적으로 표시하지 않습니다."
  },
  "n5": {
    "title": "의자에 앉아 함께하는 생활운동",
    "photoKey": "example-n5",
    "body": "의자에 앉아 함께하는 생활운동에 관한 화면 구성 예시입니다.\n\n사진은 250416 （사진1） 지난해 건강돌봄 소모임에서 어르신들이 건강증진 체험 활동을 하고 있다.\n\n사진 속 실제 기관·지역의 활동을 참고하며, 예시 회원사의 수행 실적으로 표시하지 않습니다."
  },
  "n6": {
    "title": "퇴원 후 돌봄을 잇는 지역 정보",
    "photoKey": "example-n6",
    "body": "퇴원 후 돌봄을 잇는 지역 정보에 관한 화면 구성 예시입니다.\n\n사진은 260319 （사진1） 퇴원환자 지역사회 연계 체계 구축을 위한 업무협약 기념촬영\n\n사진 속 실제 기관·지역의 활동을 참고하며, 예시 회원사의 수행 실적으로 표시하지 않습니다."
  },
  "n7": {
    "title": "스마트폰으로 찍은 나의 인생사진",
    "photoKey": "digital-photo-example",
    "body": "스마트폰으로 찍은 나의 인생사진에 관한 화면 구성 예시입니다.\n\n사진은 김포시 스마트폰 교육 참가자들이 직접 촬영한 인물사진을 펼쳐 보이는 실제 교육 현장입니다.\n\n사진 속 실제 기관·지역의 활동을 참고하며, 예시 회원사의 수행 실적으로 표시하지 않습니다."
  },
  "n8": {
    "title": "가족과 함께하는 자연 체험",
    "photoKey": "example-n8",
    "body": "가족과 함께하는 자연 체험에 관한 화면 구성 예시입니다.\n\n사진은 250121 （사진1） 아이들과 그 가족들이 딸기농장에서 딸기따기 체험을 하고 있다\n\n사진 속 실제 기관·지역의 활동을 참고하며, 예시 회원사의 수행 실적으로 표시하지 않습니다."
  }
};
for(const item of news)Object.assign(item,onExampleEditorial[item.id]||{});
const policies=[
 {id:'p1',type:'policy',photoKey:'policy-p1',title:'지역사회 통합돌봄 제도, 한눈에 보기',org:'보건복지부',category:'제도 안내',date:'2026.11.11 확인',url:'https://www.mohw.go.kr/menu.es?mid=a60100000000',body:'지역사회 통합돌봄은 일상생활에 어려움이 있는 사람이 살던 곳에서 지낼 수 있도록 의료·요양·돌봄 서비스를 연결하는 제도입니다.\n\n의료·요양 등 지역 돌봄의 통합지원에 관한 법률과 관련 하위법령은 2026년 3월 27일 시행되었습니다.\n\n보건복지부 공식 안내에서 제도의 목적, 대상자와 지원절차를 확인할 수 있습니다. 이 게시물은 공식 자료를 요약한 정보입니다.'},
 {id:'p2',type:'policy',photoKey:'policy-p2',title:'대구지역 통합돌봄 서비스 정보 확인',org:'보건복지부 · 대구광역시',category:'지역 정보',date:'2026.11.11 확인',url:'https://www.mohw.go.kr/board.es?mid=a60603000000&bid=0077',body:'보건복지부 통합돌봄 전용 누리집의 「지방정부 서비스 메뉴판 → 대구광역시」에서 지역별 서비스 안내를 확인할 수 있습니다.\n\n대구지역 안내를 모으는 게시판의 초기 연결 자료입니다. 실제 이용 가능 여부와 상세 조건은 각 안내의 담당 기관에 확인해야 합니다.'},
 {id:'p3',type:'policy',photoKey:'policy-p3',title:'통합돌봄 정책자료와 교육자료 모아보기',org:'보건복지부',category:'정책자료',date:'2026.11.11 확인',url:'https://www.mohw.go.kr/integratedcare/',body:'보건복지부 지역사회 통합돌봄 전용 누리집에는 정책자료, 교육자료와 지방정부 사례가 정리되어 있습니다.\n\n회원사가 관련 제도와 현장 사례를 확인할 수 있도록 공식 자료실을 연결합니다. 새로운 자료의 게시 여부와 개정본은 원문에서 확인해 주세요.'},
 {id:'p4',type:'policy',photoKey:'policy-p4',title:'통합돌봄 신청과 이용 절차',org:'보건복지부',category:'제도 안내',date:'2026.11.11 확인',url:'https://mohw.go.kr/menu.es?mid=a60200000000',body:'통합돌봄은 주소지 읍·면·동 행정복지센터 또는 국민건강보험공단 지사 등에서 신청할 수 있습니다.\n\n신청 방법, 사전조사와 개인별 지원계획은 보건복지부 이용안내에서 확인하세요.'},
 {id:'p5',type:'policy',photoKey:'policy-p5',title:'돌봄통합지원법 원문',org:'국가법령정보센터',category:'정책자료',date:'2026.11.11 확인',url:'https://www.law.go.kr/LSW/lsInfoP.do?lsId=014633',body:'의료·요양 등 지역 돌봄의 통합지원에 관한 법률 원문입니다. 통합지원의 정의, 기본계획과 서비스 연계에 관한 조문을 확인할 수 있습니다.'},
 {id:'p6',type:'policy',photoKey:'policy-p6',title:'시·도별 통합돌봄 서비스 메뉴판',org:'보건복지부',category:'지역 정보',date:'2026.11.11 확인',url:'https://www.mohw.go.kr/menu.es?mid=a60600000000',body:'지방정부 서비스 메뉴판에서 시·도별 통합돌봄 안내로 이동할 수 있습니다. 지역을 선택해 지자체별 자료를 확인해 보세요.'}
];
const pastEvents = ['daegu-health-symposium','daegu-university-symposium','daegu-national-conference','daegu-seminar'].map(id=>{
  const story=documentedNews.find(item=>item.id===id);
  const [,month,day]=story.date.split('.');
  return {...story,id:'event-'+id,type:'event',past:true,storyId:id,month:Number(month)+'월',day:Number(day)};
});
const events=[
 {id:'e1',type:'event', photoKey:'m7',title:'회원사 담당자 플랫폼 이용 안내',org:'사무국',category:'이용교육',day:'20',month:'11월',date:'예시 일정 · 2026.11.20',body:'플랫폼 이용교육을 표시하는 예시입니다. 실제 개최 예정인 행사가 아닙니다.\n\n교육·행사 페이지에서는 행사명, 대상, 일정, 장소와 신청 안내를 함께 제공합니다.\n\n이 예시는 회원사 담당자를 대상으로 기업정보 등록, 활동소식 작성, 정책정보 확인 방법을 안내하는 내용입니다.'},
 {id:'e2',type:'event', photoKey:'health-forum-reference',title:'통합돌봄 현장 이야기 나눔',org:'운영위원회',category:'간담회',day:'27',month:'11월',date:'예시 일정 · 2026.11.27',body:'간담회 안내를 보여주는 예시 콘텐츠이며 확정된 행사가 아닙니다.\n\n기관의 경험과 정보공유를 위한 정기 간담회를 이곳에 안내할 수 있습니다. 행사 확정 후 실제 신청 경로와 담당 연락처를 등록합니다.'},
 ...pastEvents
];
const resources=[
 {id:'r1',type:'resource', photoKey:'policy-p3',title:'회원사 기본정보 취합 양식',org:'플랫폼 제안 자료',category:'운영서식',format:'CSV',body:'신규 회원사의 정보를 취합하기 위한 기본 양식입니다.\n\n기관명, 활동 분야, 주요 사업, 서비스 지역, 홈페이지·블로그와 담당자 정보를 정리할 수 있습니다. 담당자의 개인정보 공개 범위는 별도로 확인해야 합니다.',download:'members'},
 {id:'r2',type:'resource', photoKey:'community-care-forum-reference',title:'회원사 활동소식 작성 가이드',org:'플랫폼 제안 자료',category:'이용안내',format:'TXT',body:'활동소식은 이렇게 작성합니다.\n\n1. 사진 또는 자료를 준비합니다.\n2. 활동 제목과 기관명을 입력합니다.\n3. 언제, 어디서, 어떤 활동을 했는지 설명합니다.\n4. 관련 홈페이지나 블로그 링크를 연결합니다.\n5. 게시 요청 후 사무국의 확인을 기다립니다.\n\n회원사별 담당자를 지정하고 월 1회 이상 활동소식 등록을 권장합니다. 사진과 자료의 공개 동의를 확인해 주세요.',download:'guide'},
 {id:'r3',type:'resource', photoKey:'policy-p3',title:'보건복지부 통합돌봄 공식 자료실',org:'보건복지부',category:'정책자료',format:'LINK',url:'https://www.mohw.go.kr/integratedcare/',body:'보건복지부 통합돌봄 전용 누리집에서 정책자료와 교육자료를 확인할 수 있습니다.\n\n공식 누리집의 「자료실」 메뉴에서 최신 자료를 확인해 주세요.'}
];
const signInProviders = {
  kakao: {name:'카카오', mark:'<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 3.5C6.5 3.5 2 6.8 2 10.8c0 2.6 1.8 4.9 4.5 6.2l-1 3.6a.4.4 0 0 0 .6.4l4.2-2.8c.5.1 1.1.1 1.7.1 5.5 0 10-3.4 10-7.5S17.5 3.5 12 3.5Z"/></svg>'},
  naver: {name:'네이버', mark:'<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 4h5.5l5 7.5V4H20v16h-5.5l-5-7.5V20H4Z"/></svg>'},
  google: {name:'Google', mark:'<svg viewBox="0 0 24 24"><path fill="#4285f4" d="M22 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.6a4.8 4.8 0 0 1-2.1 3.1v2.6h3.4c2-1.8 3.1-4.5 3.1-7.6Z"/><path fill="#34a853" d="M12 22c2.8 0 5.2-.9 6.9-2.6l-3.4-2.6a6.2 6.2 0 0 1-9.1-3.2H2.9v2.7A10 10 0 0 0 12 22Z"/><path fill="#fbbc05" d="M6.4 13.6a6 6 0 0 1 0-3.2V7.7H2.9a10 10 0 0 0 0 8.6l3.5-2.7Z"/><path fill="#ea4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A9.7 9.7 0 0 0 12 2a10 10 0 0 0-9.1 5.7l3.5 2.7A6 6 0 0 1 12 6Z"/></svg>'}
};
const accountKey = 'daegu-care-on-demo-account';
const paymentMethods = {toss:'토스페이', kakao:'카카오페이', naver:'네이버페이'};
const kstDate = new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul', dateStyle:'medium'});
let demoAccount = null;
try {
  const savedAccount = JSON.parse(sessionStorage.getItem(accountKey) || 'null');
  if (savedAccount && Object.hasOwn(signInProviders,savedAccount.provider) && typeof savedAccount.affiliation === 'string') {
    demoAccount = savedAccount;
  }
} catch {
  // The session stays in memory when browser storage is unavailable.
}

function updateAccountButton() {
  const button = $('#account-button');
  button.textContent = demoAccount ? '내 후원' : '로그인';
}

function signInDialog(memberId = '') {
  const member = givingSubject(memberId);
  openModal('로그인·회원가입', member ? '' : '대구 통합돌봄네트워크 ON', `
    ${member?`<div class="sign-in-context"><span>후원 대상</span><strong>${esc(member.name)}</strong></div>`:''}
    <div class="sign-in-options" role="group" aria-label="SNS 로그인 선택">
      ${Object.entries(signInProviders).map(([id,provider])=>`
        <button type="button" class="sign-in-option ${id}" data-action="sign-in-provider" data-value="${id}" data-id="${esc(memberId)}">
          <span class="sign-in-mark" aria-hidden="true">${provider.mark}</span>
          <strong>${provider.name}로 계속하기</strong>${icon('chevron')}
        </button>`).join('')}
    </div>
    <p class="sign-in-note">시연용 로그인 · SNS 계정 정보 입력 없음</p>`);
}

function signOut() {
  demoAccount = null;
  try { sessionStorage.removeItem(accountKey); } catch {}
  renderPreserve();
  toast('로그아웃했습니다.');
}

function myGiving() {
  if (!demoAccount) {
    return pageHead('내 후원','')+`<div class="wrap page-content"><section class="campaign-panel account-panel">
      <h2>로그인하고 후원 내역을 확인하세요</h2><button class="btn primary" data-action="account">로그인 ${icon('arrow')}</button>
    </section></div>`;
  }
  const gifts = db.gifts.filter(gift => gift.provider === demoAccount.provider).slice().reverse();
  return pageHead('내 후원','')+`<div class="wrap page-content account-content">
    <section class="campaign-panel account-panel">
      <div class="account-heading"><div><h2>${esc(demoAccount.affiliation)}</h2><p>${signInProviders[demoAccount.provider].name} · 시연 계정</p></div>
        <div class="on-actions"><button class="btn small" data-on-action="edit-affiliation">소속 변경</button><button class="btn small" data-action="sign-out">로그아웃</button></div></div>
    </section>
    <section class="campaign-panel"><div class="account-heading"><h2>후원 내역</h2><span class="tag demo">시연</span></div>
      ${gifts.length?`<ul class="giving-list">${gifts.map(gift=>{
        const member = givingSubject(gift.memberId);
        return `<li><div>${member?`<a href="#/${givingPath(member)}">${esc(member.name)}</a>`:'<strong>이전 회원사</strong>'}
          <small>${giftTypes[gift.type]} · ${paymentMethods[gift.method]} · ${esc(recordedOnAffiliation(gift).name)}${gift.at?' · '+kstDate.format(new Date(gift.at)):''}</small></div>
          <strong>${gift.type==='monthly'?'월 ':''}${money(gift.amount)}</strong></li>`;
      }).join('')}</ul>`:`<div class="account-empty"><p>아직 후원 내역이 없습니다.</p><a class="btn" href="#/members">후원할 회원사 찾기 ${icon('arrow')}</a></div>`}
    </section>
  </div>`;
}

const DBKEY='daegu-care-on-demo-v1';
const uid=()=>typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
const initial={posts:[],applications:[],gifts:[],projects:[],affiliations:[],launch:[]};
function readDemoDB() {
  const stored = JSON.parse(localStorage.getItem(DBKEY)||'null');
  if (!stored || !Array.isArray(stored.posts) || !Array.isArray(stored.applications)) return null;
  return Object.fromEntries(Object.keys(initial).map(key=>[key,Array.isArray(stored[key])?stored[key]:[]]));
}
let db;
try {
  db = readDemoDB() || structuredClone(initial);
} catch {
  db = structuredClone(initial);
}
function persist(message = '저장 공간이 부족합니다. 첨부파일 크기를 줄여 다시 시도해 주세요.') {
  try {
    localStorage.setItem(DBKEY,JSON.stringify(db));
    return true;
  } catch {
    toast(message);
    return false;
  }
}
let homeService='전체',memberFilter='전체',memberDistrict='전체 지역',memberQuery='',sort='default',newsFilter='전체',policyFilter='전체',globalQuery='',adminFilter='pending';
let uploadImage='',uploadFile=null,lastFocus=null,toastTimer,pendingGift='',activeRoute='',routeScroll=new Map(),modalCloseFn=null;
function approved(type){return db.posts.filter(p=>p.status==='approved'&&p.type===type)}
function allMembers(){return [...organizations,...archivedOrganizations,...members,...db.applications.filter(x=>x.status==='approved').map(x=>({...x,service:x.service||'생활지원',tone:'#e3edf9',color:'#537cb0',icon:'building',items:[x.service+' 분야 소개'],isLocal:true}))]}
function items(type){return [...approved(type),...({news:[...documentedNews,...news],policy:policies,event:events,resource:resources}[type]||[])]}
function findItem(id){return [...allMembers(),...items('news'),...items('policy'),...items('event'),...items('resource')].find(x=>x.id===id)}
function toast(t){clearTimeout(toastTimer);$('#toast').textContent=t;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,3800)}
const navs=[['about','네트워크 소개'],['members','회원사'],['news','활동소식'],['policy','정책정보'],['events','교육·행사'],['resources','자료실']];
const contentRoutes = {news:'news',policy:'policy',event:'events',resource:'resources'};
const contentLabels = {news:'활동소식',policy:'정책정보',event:'교육·행사',resource:'자료실'};

function toggleMenu(open) {
  $('.nav').classList.toggle('open',open);
  const button = $('[data-action=menu]');
  button.setAttribute('aria-expanded',String(open));
  button.setAttribute('aria-label',open?'메뉴 닫기':'메뉴 열기');
}
function navigation() {
  const [route,id] = activeRoute.split('/');
  const area = route==='member'||route==='demo' ? 'members' :
    route==='detail' ? contentRoutes[findItem(id)?.type] : route;
  $('.nav').innerHTML = publicLinks(navs.map(([id,label])=>`<a href="#/${id}" class="${area===id?'active':''}" ${area===id?'aria-current="page"':''}>${label}</a>`).join(''));
  const shareButton = $('#header-share');
  shareButton.hidden = !canPreviewShare(activeRoute);
  shareButton.innerHTML = icon('share');
  $('[data-action=search]').innerHTML=icon('search');
  $('[data-action=menu]').innerHTML=icon('menu');
}
function go(path) {
  if (readOnRoute()===path) {
    closeModal();
    if ($('.nav').classList.contains('open')) {
      toggleMenu(false);
      $('[data-action=menu]').focus();
    }
    return;
  }
  if (offlinePhotoData) {location.hash='/'+path;return;}
  history.pushState(null,'',onPublicPagePath(path)||'/#/'+path);
  render();
}
function beginGiving(id) {
  const member = givingSubject(id);
  if (!member || !campaignFor(member)) return;
  const path = givingPath(member);
  if (activeRoute===path) {
    showGiftForm(id);
    return;
  }
  pendingGift = id;
  go(path);
}
function pageHead(title,desc,action='',parent=''){return `<section class="page-head"><div class="wrap"><div class="crumb"><a href="#/home">홈</a>${icon('chevron')}${parent?esc(parent)+icon('chevron'):''}<span>${esc(title)}</span></div><div class="page-head-row"><div><h1>${esc(title)}</h1>${desc?`<p>${esc(desc)}</p>`:''}</div>${action}</div></div></section>`}
function note(text='회원사와 활동소식은 구성 검토를 위한 예시입니다. 실제 등록 정보와 운영 실적이 아닙니다.'){return `<div class="quiet-note">${icon('info')}<span>${esc(text)}</span></div>`}
function photoSource(key){
  return photoData[key].source;
}
function referencePhoto(key,eager=false){
  const photo=photoData[key];
  const src=offlinePhotoData?.[key]||'/media/'+(photo.displayFile||photo.file);
  const preserveOriginal=photo.license===3||photo.license===4;
  const [,width,height]=photo.displayFile?onImagePreviews[photo.file].wide:onImagePreviews[photo.file].original;
  return `<img src="${esc(src)}" width="${width}" height="${height}" alt="${esc(photo.caption)}" class="${preserveOriginal?'reference-original':''}" style="--photo-y:${photo.y||50}%" ${eager?'':'loading="lazy"'} decoding="async">`;
}
function photoCredit(key){
  const photo=photoData[key];
  if(photo.illustrative) return `<div class="photo-credit"><span class="photo-caption">${esc(photo.caption)}</span><span>분야 참고 이미지 · AI 생성</span></div>`;
  if(photo.sourceLabel) return `<div class="photo-credit"><span class="photo-caption">${esc(photo.caption)}</span><span>사진 출처 · ${esc(photo.sourceLabel)}</span>${photo.source?`<a href="${esc(cleanURL(photo.source))}" target="_blank" rel="noopener noreferrer">원문 보기</a>`:''}${photo.licenseURL?`<a href="${esc(cleanURL(photo.licenseURL))}" target="_blank" rel="noopener noreferrer">이용 조건</a>`:''}</div>`;
  const licenseLink=photo.licenseURL?`<a href="${esc(cleanURL(photo.licenseURL))}" target="_blank" rel="noopener noreferrer">이용 조건</a>`:[1,2,3,4].includes(photo.license)?`<a href="${photoLicense}" target="_blank" rel="noopener noreferrer">공공누리 제${photo.license}유형</a>`:'';
  return `<div class="photo-credit"><span class="photo-caption">${esc(photo.caption)}</span><span>사진 출처 · ${esc(photo.publisher)}</span><a href="${esc(cleanURL(photoSource(key)))}" target="_blank" rel="noopener noreferrer">원문 보기 ${icon('external')}</a>${licenseLink}</div>`;
}
function detailPhoto(key){
  return `<button class="detail-photo-button" data-action="photo" data-id="${key}" aria-label="참고 사진 크게 보기">${referencePhoto(key)}</button>${photoCredit(key)}`;
}
function showPhoto(key){
  const photo=photoData[key];
  if(!photo)return;
  const title=photo.title||(members.find(member=>member.id===key)?.service||'활동')+' 참고 사진';
  openModal(title,'',`<div class="full-photo-wrap">${referencePhoto(key,true)}</div>${photoCredit(key)}`);
  $('#modal .dialog').classList.add('photo-dialog');
  $('#modal .full-photo-wrap img').classList.add('full-photo');
}
function showUploadedPhoto(id) {
  const story = publishedNews().find(item=>item.id===id);
  if (!story?.image) return;
  openModal('활동 사진','',`<div class="full-photo-wrap"><img class="full-photo" src="${esc(story.image)}" alt="${esc(story.title)}"></div>`);
  $('#modal .dialog').classList.add('photo-dialog');
}
function newsArt(style=0){if(style===1)return `<svg viewBox="0 0 480 260" role="img" aria-label="교육과 정보교류 일러스트"><rect width="480" height="260" fill="#e1eaf6"/><circle cx="370" cy="72" r="83" fill="#d6e2f3"/><rect x="99" y="40" width="282" height="159" rx="9" fill="#f9fcff"/><path d="M129 73h125M129 94h191M129 115h152" stroke="#a1bad7" stroke-width="9" stroke-linecap="round"/><path d="M129 157h24v19h-24zM166 143h24v33h-24zM204 129h24v47h-24z" fill="#799fc7"/><path d="M77 218h331" stroke="#c0d3e9" stroke-width="6"/><g fill="#99b8d6"><circle cx="279" cy="178" r="19"/><path d="M247 247v-30a32 32 0 0 1 64 0v30"/></g><g fill="#6f98c2"><circle cx="174" cy="190" r="18"/><path d="M142 260v-29a32 32 0 0 1 64 0v29"/></g></svg>`;if(style===2)return `<svg viewBox="0 0 480 260" role="img" aria-label="편안한 주거환경 일러스트"><rect width="480" height="260" fill="#f7ead7"/><circle cx="370" cy="52" r="86" fill="#f1dbbb"/><path d="m111 114 120-79 120 79" fill="#c2aa8a"/><path d="M131 108h201v127H131z" fill="#fffaf3"/><rect x="159" y="134" width="47" height="48" rx="3" fill="#c9d7ce"/><path d="M182 134v48M159 158h47" stroke="#fffaf3" stroke-width="5"/><path d="M254 165h42v70h-42z" fill="#cfb798"/><path d="M121 238h222" stroke="#d4bfa3" stroke-width="6"/><path d="M79 236v-61" stroke="#a5ab8b" stroke-width="6"/><ellipse cx="79" cy="161" rx="24" ry="36" fill="#bdc3a3"/><path d="M373 236v-48" stroke="#a5ab8b" stroke-width="6"/><ellipse cx="373" cy="176" rx="19" ry="30" fill="#bdc3a3"/></svg>`;return `<svg viewBox="0 0 480 260" role="img" aria-label="회원사 교류 일러스트"><rect width="480" height="260" fill="#dfece4"/><circle cx="70" cy="50" r="87" fill="#d2e3d7"/><circle cx="425" cy="258" r="126" fill="#d2e3d7"/><path d="M92 220h296" stroke="#b6cfbe" stroke-width="7" stroke-linecap="round"/><rect x="169" y="126" width="148" height="12" rx="6" fill="#9bb6a5"/><path d="M188 138v84m110-84v84" stroke="#b0c6b6" stroke-width="7"/><g fill="#79a58b"><circle cx="142" cy="92" r="23"/><path d="M107 194v-57a35 35 0 0 1 69 0v57"/></g><g fill="#c4a886"><circle cx="346" cy="92" r="23"/><path d="M312 194v-57a35 35 0 0 1 69 0v57"/></g><path d="m166 143 42-6m107 6-38-6" stroke="#d5b494" stroke-width="13" stroke-linecap="round"/><path d="m120 193-5 47m47-47 4 47m158-47-4 47m47-47 4 47" stroke="#9ab4a4" stroke-width="11" stroke-linecap="round"/><rect x="221" y="112" width="44" height="19" rx="3" fill="#fffaf3"/><path d="M240 78v27m-8-18 8-9 9 9" stroke="#b4cdbc" stroke-width="3" fill="none"/></svg>`}
function chips(list,selected,action){return `<div class="tabs" aria-label="분야 선택">${list.map(x=>`<button class="chip ${x===selected?'active':''}" data-action="${action}" data-value="${esc(x)}" aria-pressed="${x===selected}">${esc(x)}</button>`).join('')}</div>`}
function memberCard(m){
  const photo=photoData[m.id];
  return `<a class="member-card ${photo?'has-photo':''}" href="#/member/${esc(m.id)}">${photo?`<span class="member-photo">${referencePhoto(m.id)}<span class="member-photo-source">${esc(photo.publisher)}</span></span>`:''}<div class="member-card-content"><div class="member-top">${photo?`<span class="tag blue">${esc(m.service)}</span>`:`<span class="avatar" style="--tone:${m.tone};--color:${m.color}">${icon(m.icon)}</span>`}<span class="tag ${m.isLocal?'green':'demo'}">${m.isLocal?'등록 시연':'예시 회원사'}</span></div><h3>${esc(m.name)}</h3><p>${esc(m.desc)}</p>${campaignCardPreview(m)}<div class="member-foot"><span>${icon('pin')}${esc(m.district)}${photo?'':' · '+esc(m.service)}</span><span>${campaignFor(m)?'모금 상세':'자세히 보기'} ${icon('arrow')}</span></div></div></a>`;
}
function newsCard(n) {
  const key=storyPhotoKey(n), route='detail/'+n.id;
  const cover=n.photos?.length?galleryImage(storyPhotos(n)[0]):n.image?`<img src="${esc(n.image)}" alt="${esc(n.title)}" loading="lazy">`:key?referencePhoto(key):newsArt(n.style);
  return `<article class="on-news-tile"><a class="news-card" href="#/${esc(route)}">
    <div class="news-cover" style="--tone:${n.tone||'#e3ecf9'}">${cover}${key&&(photoData[key].illustrative||photoData[key].relatedReference)?'<span class="on-news-image-label">'+(photoData[key].relatedReference?'관련 사례사진':'AI 참고 이미지')+'</span>':''}<span class="tag on-news-category">${esc(n.category)}</span></div>
    <div class="on-news-copy">${n.verified?'':`<span class="tag demo">${n.isLocal?'등록 시연':'예시 소식'}</span>`}
      <h3>${esc(n.title)}</h3><div class="news-meta">${esc(n.org)}${n.date?' · '+esc(n.date):''}</div>
    </div>
  </a>${contentShareButton(route,n.title)}</article>`;
}
function relatedContentRow(p){return `<a class="list-row" href="#/detail/${esc(p.id)}"><div class="row-main"><span class="tag blue">${esc(p.category)}</span><h3>${esc(p.title)}</h3><small>${esc(p.org)}${p.date?' · '+esc(p.date):''}</small></div>${icon('chevron')}</a>`}

function policyThumbnail(item, informative=false) {
  const key=storyPhotoKey(item);
  if (!key) return '';
  const src=offlinePhotoData?.[key]||'/media/'+photoData[key].file;
  return `<img class="policy-thumbnail" src="${esc(src)}" width="640" height="360" alt="${informative?esc(photoData[key].caption+' (AI 생성 참고 이미지)'):''}" loading="lazy" decoding="async">`;
}
function policyRow(p) {
  if (p.type!=='policy') return relatedContentRow(p);
  return `<a class="policy-card" href="#/detail/${esc(p.id)}">
    ${policyThumbnail(p)}
    <div class="policy-card-copy">
      <div><span class="tag blue">${esc(p.category)}</span><h3>${esc(p.title)}</h3><small>${esc(p.org)}${p.date?' · '+esc(p.date):''}</small></div>
      ${icon('chevron')}
    </div>
  </a>`;
}
function eventRow(e){return `<a class="list-row" href="#/detail/${esc(e.id)}"><div class="datebox"><span>${esc(e.month||'일정')}</span><strong>${esc(e.day||'미정')}</strong></div><div class="row-main"><span class="tag ${e.past?'blue':e.isLocal?'green':'orange'}">${e.past?'지난 행사':e.isLocal?'등록 시연':'예시 일정'} · ${esc(e.category)}</span><h3>${esc(e.title)}</h3><small>${esc(e.org)}</small></div>${icon('chevron')}</a>`}
function empty(msg){return `<div class="empty"><p>${esc(msg)}</p></div>`;}
const layoutOptions = {
  cards:['카드형','layoutCards'],
  grid:['그리드형','layoutGrid'],
  list:['목록형','layoutList']
};
const feedLayouts = new Map();
const feedLimits = new Map();
const feedObserver = typeof ResizeObserver==='function'
  ? new ResizeObserver(entries=>entries.forEach(({target})=>syncFeed(target)))
  : null;

function feedSection(id, title, items, renderItem, {layout='list', initial=3, before='', kind=id, emptyText='표시할 콘텐츠가 없습니다.'}={}) {
  const selected=feedLayouts.get(id)||layout;
  const tools=Object.entries(layoutOptions).map(([value,[label,mark]])=>
    `<button class="layout-choice icon-btn" type="button" data-action="feed-layout" data-value="${value}" aria-label="${label}" title="${label}" aria-pressed="${selected===value}" aria-controls="${id}-items">${icon(mark)}</button>`).join('');
  return `<section class="content-feed" data-feed="${id}" data-feed-kind="${kind}" data-layout="${selected}" data-initial="${initial}" aria-labelledby="${id}-title">
    <div class="feed-heading"><h2 id="${id}-title" ${title?'':'class="sr-only"'}>${esc(title||'콘텐츠 목록')}</h2>
      <div class="layout-choices" role="group" aria-label="${esc(title||'콘텐츠')} 레이아웃">${tools}</div>
    </div>
    ${before}
    <div class="feed-items" id="${id}-items">${items.map((item,index)=>`<div class="feed-item" tabindex="-1" ${index>=initial?'hidden':''}>${renderItem(item,index)}</div>`).join('')}</div>
    ${items.length?'':empty(emptyText)}
    <div class="feed-footer" hidden><button class="btn feed-more" type="button" data-action="feed-more" aria-controls="${id}-items">더보기 ${icon('down')}</button></div>
    <span class="sr-only" data-feed-status role="status"></span>
  </section>`;
}
function feedColumns(feed) {
  return Number(getComputedStyle($('.feed-items',feed)).getPropertyValue('--feed-columns'))||1;
}
function syncFeed(feed) {
  const columns=feedColumns(feed);
  const initial=Math.max(columns,Math.floor(Number(feed.dataset.initial)/columns)*columns);
  const saved=feedLimits.get(feed.dataset.feed);
  const limit=saved?Math.max(initial,Math.ceil(saved/columns)*columns):initial;
  const entries=$$('.feed-item',$('.feed-items',feed));
  entries.forEach((entry,index)=>{entry.hidden=index>=limit});
  $('.feed-footer',feed).hidden=limit>=entries.length;
}
function refreshFeeds() {
  feedObserver?.disconnect();
  $$('.content-feed').forEach(feed=>{
    syncFeed(feed);
    feedObserver?.observe(feed);
  });
}
function selectFeedLayout(button,layout) {
  if(!Object.hasOwn(layoutOptions,layout)) return;
  const feed=button.closest('.content-feed');
  feedLayouts.set(feed.dataset.feed,layout);
  feed.dataset.layout=layout;
  $$('[data-action=feed-layout]',feed).forEach(choice=>choice.setAttribute('aria-pressed',String(choice===button)));
  syncFeed(feed);
}
function extendFeed(button) {
  const feed=button.closest('.content-feed');
  const entries=$$('.feed-item',$('.feed-items',feed));
  const visible=entries.findIndex(entry=>entry.hidden);
  if(visible<0) return;
  const next=Math.min(entries.length,visible+feedColumns(feed)*3);
  feedLimits.set(feed.dataset.feed,next);
  syncFeed(feed);
  $('[data-feed-status]',feed).textContent=`${next-visible}개 추가 · ${entries.length}개 중 ${next}개 표시`;
  entries[visible].focus({preventScroll:true});
}


const homeHeroSlides = [
  {photo:'field-agreement', route:'about', title:['대구의 돌봄,','서로를 알 때','더 가까워집니다.'],
    summary:'대구의 방문진료, 요양, 일상돌봄을 이어가는 회원사를 만나고 응원하고 싶은 사업을 골라보세요.'},
  {photo:'field-launch', route:'detail/daegu-declaration', title:['살던 곳에서','돌봄을 받는','대구를 만듭니다.'],
    summary:'사회적경제 조직과 마을공동체가 함께 대구의 통합돌봄 네트워크를 시작했습니다.', layout:'reverse'},
  {photo:'field-conference', route:'detail/daegu-national-conference', title:['지역을 넘어','돌봄의 경험을','나눕니다.'],
    summary:'통합돌봄 전국대회에서 대구의 현장 사례를 공유하고 다른 지역의 경험을 들었습니다.', layout:'photo-wide', tone:'warm'},
  {photo:'field-seminar', route:'detail/daegu-seminar', title:['현장에서 배우고','더 나은 돌봄을','함께 고민합니다.'],
    summary:'대구경북 의료사회복지사들이 세미나에서 통합돌봄의 과제를 논의했습니다.', layout:'reverse'},
  {photo:'field-naeiln', route:'member/naeiln', title:['나에게 맞는','일과 활동을','만납니다.'],
    summary:'내일앤의 보호작업장과 발달장애인 주간활동 공간을 살펴보세요.', tone:'green'},
  {photo:'field-garden', route:'detail/daegu-garden-visit', title:['동네에서 만나','함께 돌보는','일상을 만듭니다.'],
    summary:'복현어울림센터의 어르신 텃밭 가꾸기 사업을 소개합니다.', layout:'reverse', tone:'green'}
];
const heroMotionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
let stopHomeHero = () => {};

function homeHero() {
  return `<div class="hero-carousel" role="region" aria-roledescription="슬라이드 모음" aria-label="대구 돌봄 메인 소식" tabindex="0">
    ${homeHeroSlides.map((slide,index)=>`<a class="hero-grid hero-slide${slide.layout?' hero-slide--'+slide.layout:''}" href="#/${esc(slide.route)}" aria-labelledby="hero-title-${index}" aria-hidden="${index!==0}" ${index===0?'':'inert'} data-tone="${slide.tone||''}">
      <div class="hero-copy"><${index===0?'h1':'h2'} class="hero-title" id="hero-title-${index}">${esc(slide.title[0])}<br>${esc(slide.title[1])}<br><em>${esc(slide.title[2])}</em></${index===0?'h1':'h2'}>
        <p>${esc(slide.summary)}</p>
      </div>
      <figure class="documented-photo">
        <div class="hero-slide-image">${referencePhoto(slide.photo,index===0)}</div>
        <figcaption>${esc(photoData[slide.photo].title)}<small>사진 출처 · ${esc(photoData[slide.photo].sourceLabel)}</small></figcaption>
      </figure>
    </a>`).join('')}
    <span class="sr-only" role="status" data-hero-status></span>
  </div>`;
}
function startHomeHero() {
  const carousel = $('.hero-carousel');
  const slides = $$('.hero-slide', carousel);
  const status = $('[data-hero-status]', carousel);
  const controller = new AbortController();
  const {signal} = controller;
  let current = 0;
  let timer;
  let hovered = false;
  let visible = !('IntersectionObserver' in window);
  let gesture;
  let suppressClickUntil = 0;

  function show(step, announce=false) {
    const previous = slides[current];
    current = (current + step + slides.length) % slides.length;
    if (previous.contains(document.activeElement)) carousel.focus({preventScroll:true});
    previous.setAttribute('aria-hidden','true');
    previous.setAttribute('inert','');
    previous.removeAttribute('data-enter');
    const active = slides[current];
    carousel.dataset.direction = step < 0 ? 'previous' : 'next';
    active.setAttribute('aria-hidden','false');
    active.removeAttribute('inert');
    active.setAttribute('data-enter','');
    if (announce) status.textContent = (current+1)+' / '+slides.length+' · '+homeHeroSlides[current].title.join(' ');
    schedule();
  }
  function schedule() {
    clearTimeout(timer);
    const focused = carousel.contains(document.activeElement);
    if (signal.aborted || !visible || document.hidden || hovered || focused || gesture || heroMotionPreference.matches) return;
    timer = setTimeout(() => $('#modal').hidden ? show(1) : schedule(),7000);
  }
  carousel.addEventListener('keydown',event=>{
    if (!['ArrowLeft','ArrowRight'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    show(event.key==='ArrowLeft'?-1:1,true);
  },{signal});
  carousel.addEventListener('pointerdown',event=>{
    if (!event.isPrimary || event.pointerType==='mouse') return;
    gesture = {id:event.pointerId,x:event.clientX,y:event.clientY};
    clearTimeout(timer);
  },{signal});
  carousel.addEventListener('pointerup',event=>{
    if (!gesture || event.pointerId!==gesture.id) return;
    const dx = event.clientX-gesture.x;
    const dy = event.clientY-gesture.y;
    gesture = null;
    if (Math.abs(dx)>=48 && Math.abs(dx)>Math.abs(dy)*1.25) {
      suppressClickUntil = performance.now()+400;
      show(dx<0?1:-1,true);
    } else schedule();
  },{signal});
  carousel.addEventListener('pointercancel',()=>{
    gesture = null;
    schedule();
  },{signal});
  carousel.addEventListener('click',event=>{
    if (event.detail>0 && performance.now()<suppressClickUntil) {
      event.preventDefault();
      event.stopPropagation();
      suppressClickUntil = 0;
    }
  },{capture:true,signal});
  carousel.addEventListener('pointerenter',event=>{
    if (event.pointerType==='mouse') {hovered=true;schedule();}
  },{signal});
  carousel.addEventListener('pointerleave',event=>{
    if (event.pointerType==='mouse') {hovered=false;schedule();}
  },{signal});
  carousel.addEventListener('focusin',schedule,{signal});
  carousel.addEventListener('focusout',()=>queueMicrotask(()=>{if(!signal.aborted)schedule()}),{signal});
  document.addEventListener('visibilitychange',schedule,{signal});
  heroMotionPreference.addEventListener('change',schedule,{signal});
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(([entry])=>{
    visible = entry.intersectionRatio>=.2;
    schedule();
  },{threshold:.2}) : null;
  observer?.observe(carousel);
  schedule();
  return () => {
    clearTimeout(timer);
    observer?.disconnect();
    controller.abort();
  };
}

function home(){return `<section class="hero"><div class="wrap">${homeHero()}<form class="find-bar" id="home-search"><label for="home-q">통합검색</label><div class="searchbox"><input id="home-q" name="q" type="search" placeholder="기관명·돌봄 분야·자료 검색" aria-label="통합검색 키워드"><button aria-label="검색">${icon('search')}</button></div></form></div></section>${onGivingSummary()}<div class="wrap"><div class="shortcut-row">${[['members','building','회원사 찾기','분야별 전문성 한눈에'],['news','news','활동소식','회원사의 현장 이야기'],['policy','policy','정책정보','돌봄의 변화를 빠르게'],['resources','file','자료실','필요한 자료를 한곳에']].map(([r,i,t,d])=>`<a href="#/${r}" class="shortcut"><span class="shortcut-icon">${icon(i)}</span><span><strong>${t}</strong><small>${d}</small></span>${icon('arrow')}</a>`).join('')}</div></div><div class="section"><div class="wrap">${homeMembers()}</div></div>
  <div class="section bg"><div class="wrap">${feedSection('home-news','대구 돌봄 활동소식',publishedNews(),newsCard,{kind:'news'})}</div></div>
  ${onNetworkGallery()}
  <div class="section"><div class="wrap split-grid">
    ${feedSection('home-policy','통합돌봄 정책정보',policies,policyRow,{kind:'policy'})}
    ${feedSection('home-events','교육·행사',items('event'),eventRow,{kind:'events',initial:2})}
  </div></div><section class="wrap" style="padding-bottom:20px"><div class="band"><div><h2>회원사 활동소식 등록</h2></div><span class="band-illustration" aria-hidden="true">ON.</span><button class="btn dark" data-action="post">소식 등록 ${icon('arrow')}</button></div></section>`}
function directoryServices(){
  return [...new Set(['전체',hospitalEscortService,...directoryMembers().map(member=>member.service)])];
}
function matchesDirectoryService(member, service){
  return service==='전체'||member.service===service||member.items?.includes(service);
}
function homeMembers(){
  const entries = directoryMembers().filter(member=>matchesDirectoryService(member,homeService));
  return `<div id="home-members">${feedSection('home-member','대구 통합돌봄 참여기관',entries,organizationCard,{
    layout:'cards',kind:'members',before:participationNote()+chips(directoryServices(),homeService,'home-service'),
    emptyText:'표시할 회원사가 없습니다.'
  })}</div>`;
}
function matchingMembers(){
  const query = memberQuery.trim();
  const matches = directoryMembers().filter(member=>
    matchesDirectoryService(member,memberFilter)&&
    (memberDistrict==='전체 지역'||member.district===memberDistrict)&&
    matchesSearch(query,[member.name,...(member.aliases||[]),member.desc,member.service,member.district,'대구광역시',campaignFor(member)?.title,...member.items])
  );
  if(sort==='name') matches.sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  return matches;
}
function memberCount(matches) {
  return `<strong>${matches.length}</strong>개 기관`;
}
function memberResults(matches=matchingMembers()){
  return feedSection('member-directory','',matches,organizationCard,{layout:'cards',kind:'members',emptyText:'검색 조건에 맞는 회원사가 없습니다.'});
}
function updateMemberResults(){
  const matches = matchingMembers();
  $('#member-count').innerHTML = memberCount(matches);
  feedLimits.delete('member-directory');
  $('#member-results').innerHTML = publicLinks(memberResults(matches));
  refreshFeeds();
  $('[data-action=clear-filters]').hidden = memberFilter==='전체'&&memberDistrict==='전체 지역'&&!memberQuery;
}
function membersPage(){
  const matches = matchingMembers();
  return pageHead('회원사','',
    `<div class="on-actions"><a class="btn" href="#/projects">돌봄사업</a><button class="btn" type="button" data-action="join">${icon('plus')} 회원사 등록</button></div>`)+
    `<div class="wrap page-content">
      ${participationNote()}${chips(directoryServices(),memberFilter,'member-service')}
      <form class="filters" id="member-filters" role="search" aria-label="회원사 검색">
        <div class="searchbox"><input id="member-q" value="${esc(memberQuery)}" placeholder="기관명 또는 활동 검색" type="search" aria-label="회원사 검색어"><button aria-label="회원사 검색">${icon('search')}</button></div>
        <select id="district" aria-label="지역 선택">${districts.map(value=>`<option ${value===memberDistrict?'selected':''}>${value}</option>`).join('')}</select>
        <select id="sort" aria-label="정렬 기준"><option value="default" ${sort==='default'?'selected':''}>기본순</option><option value="name" ${sort==='name'?'selected':''}>가나다순</option></select>
        <button class="btn small" type="button" data-action="clear-filters" ${memberFilter==='전체'&&memberDistrict==='전체 지역'&&!memberQuery?'hidden':''}>필터 초기화</button>
      </form>
      <div class="result-head" role="status" id="member-count">${memberCount(matches)}</div>
      <div id="member-results">${memberResults(matches)}</div>
    </div>`;
}
function setChip(action,value) {
  $$('[data-action="'+action+'"]').forEach(button=>{
    const selected = button.dataset.value===value;
    button.classList.toggle('active',selected);
    button.setAttribute('aria-pressed',String(selected));
  });
}
function memberDetail(id){const organization=organizations.find(item=>item.id===id);if(organization)return organizationDetail(organization);const m=allMembers().find(x=>x.id===id);if(!m)return notFound();const campaign=campaignFor(m);if(campaign)return campaignDetail(m,campaign);const stories=items('news').filter(n=>n.memberId===m.id||(!n.memberId&&n.org===m.name));return pageHead('회원사 소개','서로의 일을 알아가는 연결의 시작.')+`<div class="wrap page-content"><a class="backlink" href="#/members">${icon('back')} 회원사 목록</a><div class="detail-layout"><article class="detail-main"><span class="avatar" style="--tone:${m.tone};--color:${m.color};width:75px;height:75px">${icon(m.icon)}</span><h1>${esc(m.name)}</h1><div class="tags"><span class="tag blue">${esc(m.service)}</span><span class="tag">${esc(m.district)}</span><span class="tag demo">${m.isLocal?'브라우저 등록 시연':'예시 회원사'}</span></div><p class="bodytext">${esc(m.body||m.desc)}</p><div class="body-block"><h2>주요 사업 및 서비스</h2><div class="specs">${m.items.map(s=>`<div class="spec"><small>사업 분야</small><strong>${esc(s)}</strong></div>`).join('')}</div></div><div class="body-block"><h2>활동소식</h2>${stories.map(policyRow).join('')||'<p>활동소식을 등록하면 이곳에서 함께 확인할 수 있습니다.</p>'}</div>${photoData[m.id]?`<div class="body-block"><h2>현장 갤러리</h2>${detailPhoto(m.id)}</div>`:''}</article><aside class="detail-aside"><h3>회원사 정보</h3><div class="spec"><small>주요 활동 지역</small><strong>${esc(m.district)}</strong></div>${m.url?`<a class="btn" href="${esc(cleanURL(m.url))}" target="_blank" rel="noopener noreferrer">홈페이지 ${icon('external')}</a>`:'<p>홈페이지·블로그·연락처는 실제 회원사 등록 후 연결합니다.</p>'}${note(m.isLocal?'이 브라우저에서 등록한 시연 정보입니다.':'실제 기관이나 서비스 이용을 안내하는 정보가 아닌 예시입니다.')}</aside></div></div>`}
function newsPage(){
  const ns=publishedNews().filter(story=>newsFilter==='전체'||story.category===newsFilter);
  const filters=['전체',...new Set(publishedNews().map(story=>story.category))];
  return pageHead('활동소식','',`<button class="btn primary" data-action="post">${icon('plus')} 활동소식 등록</button>`)+
    `<div class="wrap page-content">${feedSection('news-directory','',ns,newsCard,{
      layout:'list',kind:'news',before:chips(filters,newsFilter,'news-category'),emptyText:'등록된 활동소식이 없습니다.'
    })}</div>`;
}
function policyPage(){
  const list=policies.filter(item=>policyFilter==='전체'||item.category===policyFilter);
  return pageHead('통합돌봄 정책정보','')+`<div class="wrap page-content">${feedSection('policy-directory','',list,policyRow,{
    kind:'policy',before:chips(['전체','제도 안내','지역 정보','정책자료'],policyFilter,'policy-category')
  })}</div>`;
}
function eventsPage(){
  return pageHead('교육·행사','',`<button class="btn" data-action="post" data-type="event">${icon('plus')} 행사 등록 시연</button>`)+
    `<div class="wrap page-content">${feedSection('event-directory','',items('event'),eventRow,{kind:'events',initial:2})}${onCoverFigure('field-seminar')}</div>`;
}
function resourceRow(r){
  return `<div class="resource-row"><span class="file-icon">${esc(r.format||'FILE')}</span><div>
    <a href="#/detail/${esc(r.id)}"><h3>${esc(r.title)}</h3></a><p>${esc(r.category)} · ${esc(r.org)}</p>
    </div>${r.url?`<a class="btn small" href="${esc(cleanURL(r.url))}" target="_blank" rel="noopener noreferrer">공식 자료실 ${icon('external')}</a>`:
      `<button class="btn small" data-action="download" data-id="${esc(r.id)}">${icon('download')} 다운로드</button>`}</div>`;
}
function resourcesPage(){
  return pageHead('자료실','',`<button class="btn" data-action="post" data-type="resource">${icon('plus')} 자료 등록 시연</button>`)+
    `<div class="wrap page-content">${feedSection('resource-directory','',items('resource'),resourceRow,{kind:'resources',initial:2})}${onCoverFigure('policy-p3')}</div>`;
}
function detail(id) {
  const item=findItem(id);
  if (!item?.type) return notFound();
  const route=contentRoutes[item.type],label=contentLabels[item.type];
  const actions=item.type==='news'?relatedStoryActions(item):'';
  const original=cleanURL(item.url);
  const paragraphs=String(item.body||'').split(/\n\s*\n/).filter(Boolean);
  const answer=item.type==='policy'?paragraphs.shift():'';
  return `<div class="wrap page-content">
    <div class="campaign-toolbar"><a class="backlink" href="#/${route}">${icon('back')} ${label} 목록</a></div>
    <div class="detail-layout"><article class="detail-main">
      <div class="tags"><span class="tag blue">${esc(item.category)}</span>${(item.type==='news'||item.type==='event')&&!item.verified?`<span class="tag demo">${item.isLocal?'등록 시연':'예시 콘텐츠'}</span>`:''}</div>
      <div class="on-article-title"><h1>${esc(item.title)}</h1>${item.type==='news'&&canPreviewShare('detail/'+id)?`<button class="icon-btn" data-action="share" aria-label="소식 공유하기">${icon('share')}</button>`:''}</div>
      <div class="detail-meta">${item.type==='policy'&&original?`<a href="${esc(original)}" target="_blank" rel="noopener noreferrer">${esc(item.org)}</a>`:esc(item.org)}${item.date?' · '+esc(item.date):''}</div>
      ${answer?`<p class="on-policy-answer">${esc(answer)}</p>`:''}
      ${item.type==='news'?articleMedia(item):item.type==='policy'?`<figure class="policy-detail-photo">${policyThumbnail(item,true)}<figcaption>분야 참고 이미지 · AI 생성</figcaption></figure>`:onCoverFigure(storyPhotoKey(item))}
      <div class="bodytext">${paragraphs.map(paragraph=>`<p>${esc(paragraph)}</p>`).join('')}</div>${item.source?`<p class="network-source">출처 · ${esc(item.source)}</p>`:''}${actions}
      ${item.type==='policy'&&original?`<a class="btn primary" href="${esc(original)}" target="_blank" rel="noopener noreferrer">공식 원문 보기 ${icon('external')}</a>`:''}
      ${item.type==='resource'?`<button class="btn primary" data-action="${original?'external':'download'}" data-id="${esc(id)}">${icon(original?'external':'download')} ${original?'공식 자료실 열기':'자료 다운로드'}</button>`:''}
      ${item.past?`<a class="btn" href="#/detail/${esc(item.storyId)}">관련 활동소식 보기 ${icon('arrow')}</a>`:item.type==='event'?`<div class="specs"><div class="spec"><small>일정</small><strong>${esc(item.date||'일정 미정')}</strong></div><div class="spec"><small>장소</small><strong>확정 후 안내</strong></div></div>${note('행사 신청은 실제 일정과 접수 경로 확정 후 제공됩니다.')}`:''}
      ${item.type==='news'&&original?`<a class="btn" href="${esc(original)}" target="_blank" rel="noopener noreferrer">원문 보기 ${icon('external')}</a>`:''}
    </article><aside class="detail-aside"><h3>${label}</h3><a class="btn" href="#/${route}">${label} 전체 보기 ${icon('arrow')}</a>
      ${item.type==='news'&&!item.verified?note(item.isLocal?'브라우저에서 등록한 시연 소식입니다.':'사진은 참고 사례이며 소식은 예시입니다.'):''}</aside></div>
  </div>`;
}

function about(){return documentedAbout()}
function proposal(){return pageHead('플랫폼 구축·운영 제안','대구 통합돌봄네트워크 ON · 회원사 정보공유와 후원')+`<div class="wrap page-content"><div class="proposal-kicker"><span class="tag blue">제안 검토용 · v1.18 · 2026.11</span><button class="btn small" data-action="print">${icon('file')} 운영안 인쇄 / PDF 저장</button></div><div class="prose"><h2 class="intro-big">먼저 정보를 모으고,<br>꾸준히 교류하는 기반을 만듭니다.</h2><p class="muted">회원사는 각자의 돌봄 사업을 알리고 모금을 운영합니다. 사무국은 회원사 정보와 등록 요청을 관리합니다. 실제 매출 연계와 공동사업 실행 기능은 향후 별도 협의를 거쳐 확장합니다.</p></div><section class="proposal-section"><div class="step">01 / BUILD SCOPE</div><h2>초기 구축과 향후 확장</h2><div class="scope"><div class="scope-box"><span class="tag blue">이번 제안 · 초기 구축</span><h3>회원사와 정보를 연결하는 플랫폼</h3><ul><li>네트워크 소개 및 운영체계 안내</li><li>회원사 기업정보·서비스·외부 링크</li><li>회원사별 모금 목표·사용 계획·후원 현황 및 후원 시연</li><li>회원사 활동소식 및 사진·자료 공유</li><li>정책정보와 공식 원문 연결</li><li>교육·행사 안내 및 자료실</li><li>검색·분류 및 사무국 게시물 관리</li></ul></div><div class="scope-box future"><span class="tag demo">향후 확장 · 별도 협의</span><h3>민간협력 비즈니스 플랫폼</h3><ul><li>회원사 간 사업제휴와 서비스 연계</li><li>실제 매출 및 공동사업 성과 관리</li><li>대구병원동행사업 등 공동사업 모델</li><li>참여기업 모집·업무협약·공동홍보</li></ul><p class="smalltext muted">초기 화면의 활성 메뉴와 운영 기능에는 포함하지 않습니다.</p></div></div><div class="table-wrap"><table><thead><tr><th>초기 메뉴</th><th>제공 내용</th><th>운영 담당</th></tr></thead><tbody>${[['네트워크 소개','목적, 운영 방향, 역할 안내','사무국'],['회원사 소개','기업정보, 서비스 분야, 지역, 외부 링크','회원사 · 사무국'],['회원사 활동소식','사진, 행사, 사업과 교육 소식','회원사 · 사무국'],['통합돌봄 정책정보','정부·대구지역 정책의 공식 출처 연결','사무국'],['교육·행사 정보','교육, 세미나, 간담회 안내','사무국 · 회원사'],['자료실','정책자료, 홍보자료, 운영서식','사무국 · 회원사']].map(r=>`<tr>${r.map(t=>`<td>${t}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section><section class="proposal-section"><div class="step">02 / OPERATION</div><h2>회원사는 공유하고, 사무국은 정리합니다</h2><div class="role-list">${[['운영위원회','운영 방향과 게시 기준, 공개 범위 결정'],['사무국','회원사 정보 확인, 게시물 승인 및 정책정보 업데이트'],['회원사 담당자','기업정보 제공, 월 1회 이상 활동소식 등록 권장'],['정기 운영점검','정보의 정확성, 참여도와 사용성을 함께 점검']].map(([t,d])=>`<div class="role"><b>${t}</b><p>${d}</p></div>`).join('')}</div><p>회원사가 사진·자료와 설명을 등록하면 사무국이 내용을 확인한 후 게시하는 방식으로 제안합니다. 정책·지원사업 정보는 출처와 확인일을 함께 표시합니다.</p></section><section class="proposal-section"><div class="step">03 / ROADMAP</div><h2>준비부터 시범 운영까지</h2><div class="roadmap">${[['01','자료 취합','회원사 명단, 기본정보, 홈페이지와 활동자료 수집'],['02','플랫폼 구축','초기 메뉴와 검색, 상세 화면, 게시 흐름 구성'],['03','시범 운영','회원사별 담당자 안내, 게시물 등록과 이용 의견 수렴'],['04','평가 후 확장','참여도와 운영효과 점검 후 공동사업 기능 검토']].map(([n,t,d])=>`<div class="stage"><small>STEP ${n}</small><h3>${t}</h3><p>${d}</p></div>`).join('')}</div><p>착수 일정, 개발 범위와 비용은 실제 회원사 수와 운영 방식, 인증·파일 저장 요구를 확인한 뒤 산정합니다.</p></section><section class="proposal-section"><div class="step">04 / SUCCESS CRITERIA</div><h2>운영의 기준도 함께 세웁니다</h2><div class="three-grid">${[['정보 완성도','등록 회원사 수, 기업정보 입력률과 정보 갱신 현황'],['참여 지속성','월간 활동소식 등록 기관 수와 게시물 승인 처리 현황'],['정보 활용도','정책·자료 열람과 이용 의견을 통해 개선점 확인']].map(([t,d])=>`<div class="value-card"><h3>${t}</h3><p>${d}</p></div>`).join('')}</div><p>위 항목은 향후 운영 지표 제안입니다. 현재 시연에 실제 이용 통계가 수집되거나 표시되는 것은 아닙니다.</p></section><section class="proposal-section"><div class="step">05 / DEMO & NEXT</div><h2>이번 시연에서 확인할 수 있는 것</h2><p>분야·지역별 회원사 찾기, 콘텐츠 상세 보기, 통합검색, 회원사·게시물 등록과 사무국 승인 흐름을 체험할 수 있습니다. 시연 입력은 현재 브라우저에만 저장됩니다. 실제 운영을 위한 로그인과 권한, 서버 저장, 파일 관리 및 개인정보 공개 기준은 다음 구축 단계에서 적용합니다.</p><div class="action-line"><a class="btn primary" href="#/home">플랫폼 둘러보기 ${icon('arrow')}</a><a class="btn" href="#/admin">운영관리 시연</a><button class="btn" data-action="template">회원사 취합 양식 ${icon('download')}</button></div></section><details class="future-detail"><summary>향후 확장 방향 자세히 보기</summary><p>궁극적으로 회원사들이 서로의 서비스를 이해하고 필요한 기업끼리 협력하여 실제 매출과 공동사업을 만들어 내는 대구 통합돌봄 민간협력 비즈니스 플랫폼으로 발전시키는 방향을 검토합니다.</p><p>대구병원동행사업을 향후 첫 공동사업 모델로 검토할 수 있습니다. 참여기업 모집, 업무협약, 서비스 연계와 공동홍보 등은 관계기관 협의와 운영체계 확정 후 별도 단계로 추가합니다.</p></details></div>`}
function matchesSearch(query,fields) {
  if (!query.trim()) return true;
  const words=query.normalize('NFKC').trim().split(/[\s·]+/).filter(Boolean);
  const normalize=value=>value.normalize('NFKC').toLowerCase().replace(/[\s·]+/g,'');
  const text=normalize(fields.filter(Boolean).join(' '));
  return words.length>0&&words.every(word=>text.includes(normalize(word)));
}
function searchPage(q){
  globalQuery=q;
  const groups=[
    ['돌봄사업',publishedProjects(),givingPath],
    ['회원사',directoryMembers(),item=>'member/'+item.id],
    ['활동소식',publishedNews()],
    ['정책정보',policies],
    ['교육·행사',items('event')],
    ['자료실',items('resource')]
  ];
  const matches=q?groups.flatMap(([kind,entries,path])=>entries
    .filter(item=>matchesSearch(q,[item.name,item.title,item.desc,item.body,item.service,item.category,item.district,item.org,
      item.owner,item.aliases?.join(' '),item.items?.join(' '),campaignFor(item)?.title,item.district?'대구광역시':'']))
    .map(item=>({item,kind,route:path?path(item):'detail/'+item.id}))):[];
  return pageHead('통합검색','')+`<div class="wrap page-content">
    <form id="global-search" class="filters" role="search" aria-label="통합검색">
      <div class="searchbox"><input name="q" type="search" value="${esc(q)}" placeholder="검색어를 입력해 주세요" aria-label="통합검색어"><button aria-label="검색">${icon('search')}</button></div>
    </form>
    <div class="result-head">${q?`‘${esc(q)}’ 검색결과 <strong>${matches.length}건</strong>`:'검색어를 입력해 주세요'}</div>
    <div class="row-list">${matches.map(({item,kind,route})=>`<a class="list-row" href="#/${esc(route)}"><div class="row-main">
      <span class="tag blue">${kind}</span><h3>${esc(item.name||item.title)}</h3><small>${esc(item.org||item.service||'')}</small></div>${icon('chevron')}</a>`).join('')||(q?empty('검색결과가 없습니다. 다른 키워드로 찾아보세요.'):'')}</div></div>`;
}

function adminCampaigns() {
  return `<section class="admin-campaigns">
    <div class="section-head"><div><h2>회원사별 모금 현황</h2><p>예시 집계와 현재 브라우저에서 완료한 후원을 표시합니다.</p></div></div>
    <div class="row-list">${[...directoryMembers(),...publishedProjects()].filter(campaignFor).map(member=>{
      const totals = campaignTotals(member);
      return `<a href="#/${givingPath(member)}"><div><strong>${esc(member.name)}</strong><small>${esc(campaignFor(member).title)}</small></div>
        <span><strong>${money(totals.raised)}</strong><small>${totals.percent}% · ${totals.count}건</small></span></a>`;
    }).join('')}</div>
  </section>`;
}
function adminPage(){const pending=db.posts.filter(x=>x.status==='pending').length+db.applications.filter(x=>x.status==='pending').length;const posts=[...db.applications.map(x=>({...x,application:true})),...db.posts].filter(x=>adminFilter==='all'||x.status===adminFilter);return pageHead('운영관리 시연','정보 등록부터 확인·승인까지, 사무국의 운영 흐름을 살펴보세요.')+`<div class="wrap page-content">${onAdminNav()}<div class="admin-banner">이 화면은 인증 없이 이용하는 운영 시연입니다. 실제 회원정보나 민감한 자료를 입력하지 마세요. 입력·승인 결과는 현재 브라우저에만 저장됩니다.</div><div class="metric-grid">${[['등록 시연 신청',db.applications.length],['확인 대기',pending],['승인 게시물',db.posts.filter(x=>x.status==='approved').length],['승인 회원사',db.applications.filter(x=>x.status==='approved').length]].map(([t,n])=>`<div class="metric"><small>${t}</small><strong>${n}</strong></div>`).join('')}</div>${adminCampaigns()}<div class="section-head"><h2>등록 요청 관리</h2><button class="btn small" data-action="reset">시연 데이터 초기화</button></div>${chips(['확인 대기','승인 완료','반려','전체'],{pending:'확인 대기',approved:'승인 완료',rejected:'반려',all:'전체'}[adminFilter],'admin-filter')}<div>${posts.map(x=>`<div class="manage-row"><span class="tag ${x.status==='approved'?'green':x.status==='pending'?'orange':'demo'}">${({pending:'확인 대기',approved:'승인 완료',rejected:'반려'})[x.status]}</span><div class="grow"><h3>${esc(x.name||x.title)}</h3><p>${x.application?'회원사 등록':({news:'활동소식',event:'교육·행사',resource:'자료'})[x.type]} · ${esc(x.org||x.service)}</p></div><button class="btn small" data-action="review" data-id="${esc(x.id)}">내용 확인</button>${x.status==='pending'?`<button class="btn primary small" data-action="approve" data-id="${esc(x.id)}">승인</button><button class="btn small danger" data-action="reject" data-id="${esc(x.id)}">반려</button>`:''}</div>`).join('')||`<div class="empty"><p>해당하는 등록 요청이 없습니다.</p><button class="btn" data-action="post">활동소식 등록 시연</button></div>`}</div><div class="body-block"><h2>제안 운영 원칙</h2><div class="role-list">${[['기업정보 확인','명칭·서비스·홈페이지 등 기본정보 확인'],['게시물 검토','공개 가능한 사진·자료와 내용인지 확인'],['출처 표시','정책자료의 출처와 확인일을 함께 관리'],['정기 업데이트','월 1회 이상 소식 등록 권장, 운영 현황 점검']].map(([t,d])=>`<div class="role"><b>${t}</b><p>${d}</p></div>`).join('')}</div></div></div>`}
function notFound(){return pageHead('페이지를 찾을 수 없습니다','시연 데이터가 초기화되었거나 주소가 변경되었을 수 있습니다.')+`<div class="wrap page-content"><a class="btn primary" href="#/home">홈으로 돌아가기</a></div>`}
function pageMarkup(route,id='',rest=[]) {let html;switch(route){case'home':html=home();break;case'members':html=membersPage();break;case'demo':html=demoPage();break;case'my':html=myGiving();break;case'member':html=memberDetail(id);break;case'news':html=newsPage();break;case'policy':html=policyPage();break;case'events':html=eventsPage();break;case'resources':html=resourcesPage();break;case'detail':html=detail(id);break;case'about':html=about();break;case'gallery':html=galleryPage(id);break;case'proposal':html=proposal();break;case'admin':html=adminPage();break;case'projects':html=projectDirectory();break;case'project':html=projectPage(id);break;case'project-apply':html=projectApply(id);break;case'project-status':html=projectStatus(id);break;case'admin-projects':html=projectAdmin(id);break;case'admin-stories':html=adminStories(id,rest[0]);break;case'admin-affiliations':html=adminAffiliations();break;case'admin-gifts':html=adminGifts();break;case'admin-launch':html=launchPage();break;case'giving-guide':html=givingGuide();break;case'search':try{html=searchPage(decodeURIComponent([id,...rest].filter(Boolean).join('/')))}catch{html=searchPage('')}break;default:html=notFound()}return html;}
function render(){stopHomeHero();stopHomeHero=()=>{};const raw=readOnRoute();if(activeRoute)routeScroll.set(activeRoute,window.scrollY);const returning=routeScroll.has(raw),savedY=routeScroll.get(raw)||0;activeRoute=raw;const [route,id,...rest]=raw.split('/');closeModal(false);toggleMenu(false);const giftId=pendingGift;pendingGift='';const html=pageMarkup(route,id,rest);$('#main').innerHTML='<div class="page-enter">'+publicLinks(html)+'</div>';if(route==='home')stopHomeHero=startHomeHero();navigation();updateAccountButton();refreshFeeds();if(!refreshOnMetadata(raw))document.title=({home:'홈',members:'참여기관',demo:'참여기관',my:'내 후원',member:allMembers().find(member=>member.id===id)?.name||'회원사 소개',news:'활동소식',policy:'정책정보',events:'교육·행사',resources:'자료실',proposal:'플랫폼 운영안',admin:'운영관리 시연',projects:'돌봄사업',project:onProject(id)?.name||'돌봄사업','project-apply':'사업 신청','project-status':'신청 내역','admin-projects':'사업 심사','admin-stories':'회원사 소식 관리','admin-affiliations':'소속 신청','admin-gifts':'후원 거래','admin-launch':'공개 준비','giving-guide':'후원 안내',about:'네트워크 소개',gallery:photoData[id]?.title||'현장 사진',detail:findItem(id)?.title||'콘텐츠',search:'통합검색'}[route]||'페이지')+' | 대구 통합돌봄네트워크 ON';requestAnimationFrame(()=>{window.scrollTo({top:giftId?0:returning?savedY:0,behavior:'instant'});$('#main').focus({preventScroll:true});if((route==='member'||route==='project')&&id===giftId){$('#campaign-funding .campaign-give')?.focus({preventScroll:true});showGiftForm(id)}})}
function openModal(title,desc,body) {
  lastFocus=document.activeElement;
  const layer=$('#modal');
  layer.innerHTML=`<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"${desc?' aria-describedby="dialog-description"':''}>
    <div class="dialog-top"><h2 id="dialog-title">${esc(title)}</h2><button class="icon-btn" data-action="close" aria-label="닫기">${icon('close')}</button></div>
    ${desc?`<p id="dialog-description">${esc(desc)}</p>`:''}${body}</div>`;
  layer.hidden=false;
  document.body.style.overflow='hidden';
  requestAnimationFrame(()=>{
    if (layer.hidden) return;
    const first=$$('input:not([type=file]):not([type=hidden]),select,textarea',layer)
      .find(control=>!control.disabled&&control.getClientRects().length)
      ||$('button:not([data-action=close]):not([disabled])',layer)||$('button',layer);
    first?.focus();
  });
}

function closeModal(restore=true){if($('#modal').hidden)return;$('#modal').hidden=true;$('#modal').innerHTML='';document.body.style.overflow='';uploadImage='';uploadFile=null;if(restore&&lastFocus?.isConnected)lastFocus.focus();if(modalCloseFn){const f=modalCloseFn;modalCloseFn=null;f()}}
function postModal(type='news'){if(type==='news'){go('admin-stories');return;}uploadImage='';uploadFile=null;openModal(({news:'활동소식 등록',event:'교육·행사 등록',resource:'자료 등록'})[type],'',`<form id="post-form"><div class="form-info">등록 시연 · 입력 내용은 이 브라우저에 저장됩니다.</div><div class="field"><label for="post-type">등록 구분</label><select id="post-type" name="type"><option value="news" ${type==='news'?'selected':''}>회원사 활동소식</option><option value="event" ${type==='event'?'selected':''}>교육·행사 안내</option><option value="resource" ${type==='resource'?'selected':''}>자료실</option></select></div><div class="field"><label for="post-file">1. 사진·자료 첨부 <span class="muted">· 선택 · 최대 4MB</span></label><input id="post-file" type="file" accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,text/csv,.docx,.pptx,.xlsx"><div id="upload-preview"></div></div><div class="field"><label for="post-title">2. 제목과 설명</label><input id="post-title" name="title" required maxlength="90" placeholder="소식의 제목을 입력해 주세요"></div><div class="field-row"><div class="field"><label for="post-org">기관명</label><input id="post-org" name="org" required maxlength="60" placeholder="예: 우리기관 (시연)"></div><div class="field"><label for="post-category">분류</label><select id="post-category" name="category"><option>현장 이야기</option><option>교육·소식</option><option>서비스 소개</option></select></div></div><div class="field"><label for="post-body" class="sr-only">내용</label><textarea id="post-body" name="body" required maxlength="5000" placeholder="어떤 활동인가요? 목적과 주요 내용을 알려주세요."></textarea></div><div class="field" id="date-field" ${type!=='event'?'hidden':''}><label for="post-date">행사일 · 선택</label><input id="post-date" name="date" type="date"></div><div class="field"><label for="post-url">3. 관련 링크 <span class="muted">· 선택</span></label><input id="post-url" name="url" type="url" placeholder="https:// 홈페이지·블로그·자료 링크"></div><label class="checkline"><input required type="checkbox"> 공개 가능한 내용과 사용 권한이 있는 파일로 시연합니다.</label><div class="form-actions"><button type="button" class="btn" data-action="close">취소</button><button class="btn primary">게시 요청 시연 ${icon('arrow')}</button></div></form>`);updatePostFields(type)}
function updatePostFields(type){$('#dialog-title').textContent=({news:'활동소식 등록',event:'교육·행사 등록',resource:'자료 등록'})[type];$('#date-field').hidden=type!=='event';const cats=type==='news'?['현장 이야기','교육·소식','서비스 소개']:type==='event'?['이용교육','세미나','간담회','포럼']:['운영서식','이용안내','정책자료','홍보자료'];$('#post-category').innerHTML=cats.map(x=>`<option>${x}</option>`).join('')}
function joinModal(){openModal('회원사 등록 시연','기관의 분야와 주요 사업을 알려주세요.',`<form id="join-form"><div class="form-info">등록 시연 · 입력 내용은 이 브라우저에 저장됩니다.</div><div class="field"><label for="join-name">기관명</label><input id="join-name" name="name" required maxlength="60" placeholder="기관명을 입력해 주세요"></div><div class="field-row"><div class="field"><label for="join-service">주요 분야</label><select id="join-service" name="service">${services.slice(1).map(s=>`<option>${s}</option>`).join('')}</select></div><div class="field"><label for="join-district">주요 활동 지역</label><select id="join-district" name="district">${districts.slice(1).map(s=>`<option>${s}</option>`).join('')}</select></div></div><div class="field"><label for="join-desc">기관·서비스 소개</label><textarea id="join-desc" name="desc" required maxlength="1500" placeholder="주요 사업과 서비스를 소개해 주세요."></textarea></div><div class="field"><label for="join-url">홈페이지·블로그 <span class="muted">· 선택</span></label><input id="join-url" name="url" type="url" placeholder="https://"></div><details class="join-campaign"><summary>회원사 모금 등록 · 선택</summary>
<div class="field"><label for="join-campaign-title">모금 제목</label><input id="join-campaign-title" name="campaignTitle" maxlength="90" placeholder="예: 따뜻한 한 끼와 안부"></div>
<div class="field"><label for="join-campaign-goal">목표 금액 (원)</label><input id="join-campaign-goal" name="campaignGoal" type="number" min="1000" max="100000000" step="1" inputmode="numeric" placeholder="예: 3000000"></div>
<div class="field"><label for="join-campaign-purpose">모금 목적</label><textarea id="join-campaign-purpose" name="campaignPurpose" maxlength="600" placeholder="누구를 위해 어떤 활동을 하는지 알려주세요."></textarea></div>
<div class="field"><label for="join-campaign-plan">후원금 사용 계획</label><textarea id="join-campaign-plan" name="campaignPlan" maxlength="1500" placeholder="후원금을 어디에 사용할지 입력해 주세요."></textarea></div></details><label class="checkline"><input required type="checkbox"> 공개 가능한 기관정보로 등록을 시연합니다.</label><div class="form-actions"><button type="button" class="btn" data-action="close">취소</button><button class="btn primary">등록 요청 시연 ${icon('arrow')}</button></div></form>`)}
function completion(title,desc){openModal(title,desc,`<div class="form-info">운영관리 시연에서 요청 내용을 확인하고 승인하면 현재 브라우저의 목록에 표시됩니다.</div><div class="form-actions"><button class="btn" data-action="close">닫기</button><a class="btn primary" href="#/admin">운영관리로 이동 ${icon('arrow')}</a></div>`)}
function review(id){const x=[...db.posts,...db.applications].find(p=>p.id===id);if(!x)return;openModal('등록 요청 확인','현재 브라우저에 저장된 시연 요청입니다.',`<h3>${esc(x.name||x.title)}</h3><div class="tags" style="margin:15px 0"><span class="tag blue">${esc(x.org||x.service)}</span>${x.district?`<span class="tag">${esc(x.district)}</span>`:''}</div>${(x.photos||[x.image]).filter(Boolean).map((src,index)=>`<img class="attached-image" src="${esc(src)}" alt="등록 이미지 ${index+1}">`).join('')}<p style="white-space:pre-wrap;font-size:14px;line-height:1.9">${esc(x.body||x.desc)}</p>${x.campaign?`<dl class="gift-review"><div><dt>모금 제목</dt><dd>${esc(x.campaign.title)}</dd></div><div><dt>목표 금액</dt><dd>${money(x.campaign.goal)}</dd></div></dl><p class="campaign-prose">${esc(x.campaign.planText)}</p>`:''}${x.file?`<p class="form-info">첨부자료: ${esc(x.file.name)}<br><button class="link" data-action="download" data-id="${esc(x.id)}">다운로드 ${icon('download')}</button></p>`:''}${x.url?`<div class="action-line"><a class="link" href="${esc(cleanURL(x.url))}" target="_blank" rel="noopener noreferrer">관련 링크 확인 ${icon('external')}</a></div>`:''}<div class="form-actions">${x.status==='pending'?`<button class="btn" data-action="reject" data-id="${esc(x.id)}">반려</button><button class="btn primary" data-action="approve" data-id="${esc(x.id)}">승인</button>`:`<button class="btn" data-action="close">닫기</button>`}</div>`)}
function approve(id,status){const x=[...db.posts,...db.applications].find(x=>x.id===id);if(!x)return;const old=x.status;x.status=status;if(!persist()){x.status=old;return}closeModal();if(activeRoute==='admin')render();toast(status==='approved'?'승인되었습니다. 이 브라우저의 목록에 표시됩니다.':'반려 처리되었습니다. 시연 기록에서 확인할 수 있습니다.')}
const siteBaseURL = 'https://daegu-care.oconia.co.kr/';
const siteName = '대구 통합돌봄네트워크 ON';

async function copyShareLink() {
  const field = $('#share-url');
  if (!field) return;
  try {
    await navigator.clipboard.writeText(field.value);
    closeModal();
    toast('공유 링크를 복사했습니다.');
    return;
  } catch {
    if (!field.isConnected) return;
  }
  field.focus();
  field.select();
  field.setSelectionRange(0,field.value.length);
  let copied = false;
  try { copied = document.execCommand('copy'); } catch {}
  if (copied) {
    closeModal();
    toast('공유 링크를 복사했습니다.');
  } else {
    const feedback = $('#share-feedback');
    feedback.textContent = '선택된 주소를 직접 복사할 수 있습니다.';
    feedback.hidden = false;
  }
}
function saveBlob(content,name,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000)}
function download(id){const x=resources.find(x=>x.id===id)||db.posts.find(x=>x.id===id);if(!x)return;if(x.url){window.open(cleanURL(x.url),'_blank','noopener,noreferrer');return}if(x.download==='members'){saveBlob('\uFEFF기관명,주요분야,주요사업및서비스,활동지역,홈페이지,블로그,담당자명(내부관리),업무연락처(내부관리),공개범위확인\r\n,,,,,,,,\r\n','회원사_기본정보_취합양식.csv','text/csv;charset=utf-8')}else if(x.download==='guide'){saveBlob('대구 통합돌봄네트워크 ON\n회원사 활동소식 작성 가이드\n\n'+x.body,'회원사_활동소식_작성가이드.txt','text/plain;charset=utf-8')}else if(x.file){const a=document.createElement('a');a.href=x.file.data;a.download=x.file.name;a.click()}else if(x.image){const a=document.createElement('a');a.href=x.image;a.download='등록_이미지.png';a.click()}else{saveBlob(x.title+'\n\n'+x.body,x.title.replace(/[\\/:*?"<>|]/g,'_')+'.txt','text/plain;charset=utf-8')}}
document.addEventListener('click',e=>{if(navigateOnClick(e))return;if(e.target.closest('.skip')){e.preventDefault();$('#main').focus();$('#main').scrollIntoView();return}const t=e.target.closest('[data-action],[data-route]');if(!t)return;if(t.dataset.route){go(t.dataset.route);return}const a=t.dataset.action,v=t.dataset.value,id=t.dataset.id;if(a==='menu')toggleMenu(t.getAttribute('aria-expanded')!=='true');else if(a==='search'){openModal('통합검색','',`<form id="modal-search"><div class="searchbox"><input name="q" required type="search" placeholder="검색어를 입력해 주세요" aria-label="통합검색 키워드"><button aria-label="검색">${icon('search')}</button></div></form>`)}else if(a==='join')joinModal();else if(a==='post')postModal(t.dataset.type||'news');else if(a==='close')closeModal();else if(a==='photo')showPhoto(id);else if(a==='uploaded-photo')showUploadedPhoto(id);else if(a==='campaign-give')beginGiving(id);else if(a==='account'){if(demoAccount)go('my');else signInDialog()}else if(a==='sign-in-provider')openOnAffiliation(v,id);else if(a==='sign-in-back'){const origin=lastFocus;signInDialog(id);lastFocus=origin}else if(a==='sign-out')signOut();else if(a==='campaign-jump')jumpToCampaignSection(id);else if(a==='feed-layout')selectFeedLayout(t,v);else if(a==='feed-more')extendFeed(t);else if(a==='home-service'){homeService=v;feedLimits.delete('home-member');$('#home-members').outerHTML=publicLinks(homeMembers());refreshFeeds();$('[data-action="home-service"][aria-pressed="true"]')?.focus({preventScroll:true})}else if(a==='member-service'){memberFilter=v;setChip(a,v);updateMemberResults()}else if(a==='news-category'){newsFilter=v;feedLimits.delete('news-directory');renderPreserve()}else if(a==='policy-category'){policyFilter=v;feedLimits.delete('policy-directory');renderPreserve()}else if(a==='clear-filters'){memberFilter='전체';memberDistrict='전체 지역';memberQuery='';$('#member-q').value='';$('#district').value=memberDistrict;setChip('member-service',memberFilter);updateMemberResults();$('#member-q').focus({preventScroll:true})}else if(a==='share')sharePreview(t.dataset.routeShare||activeRoute);else if(a==='copy-share-link')copyShareLink();else if(a==='print')window.print();else if(a==='download')download(id);else if(a==='external'){const x=findItem(id);if(x?.url)window.open(cleanURL(x.url),'_blank','noopener,noreferrer')}else if(a==='template')download('r1');else if(a==='admin-filter'){adminFilter={'확인 대기':'pending','승인 완료':'approved','반려':'rejected','전체':'all'}[v];renderPreserve()}else if(a==='review')review(id);else if(a==='approve')approve(id,'approved');else if(a==='reject')approve(id,'rejected');else if(a==='reset')openModal('시연 데이터를 초기화할까요?','이 브라우저에서 등록한 회원사·사업·소속 신청, 게시물, 후원 거래와 공개 준비 기록이 삭제됩니다. 기본 예시 콘텐츠는 유지됩니다.',`<div class="form-actions"><button class="btn" data-action="close">취소</button><button class="btn dark" data-action="confirm-reset">초기화</button></div>`);else if(a==='confirm-reset'){const old=db;db=structuredClone(initial);if(!persist()){db=old;return}closeModal();render();toast('브라우저의 시연 데이터를 초기화했습니다.')}});
function renderPreserve(){const y=window.scrollY;render();requestAnimationFrame(()=>window.scrollTo({top:y,behavior:'instant'}))}
document.addEventListener('input',e=>{if(e.target.id==='member-q'){memberQuery=e.target.value;updateMemberResults()}});
document.addEventListener('change',e=>{if(e.target.id==='district'){memberDistrict=e.target.value;updateMemberResults()}else if(e.target.id==='sort'){sort=e.target.value;updateMemberResults()}else if(e.target.name==='preset'&&e.target.form?.id==='campaign-gift-form')updateGiftAmountOption(e.target.form);else if(e.target.id==='post-type')updatePostFields(e.target.value);else if(e.target.id==='post-file'){const input=e.target;const f=input.files[0];uploadImage='';uploadFile=null;$('#upload-preview').innerHTML='';if(!f)return;if(f.size>4*1024*1024){toast('첨부파일은 최대 4MB까지 등록할 수 있습니다.');e.target.value='';return}const isImage=['image/png','image/jpeg','image/webp'].includes(f.type);const reader=new FileReader();reader.onload=()=>{if($('#post-file')!==input||input.files[0]!==f)return;if(isImage){uploadImage=reader.result;$('#upload-preview').innerHTML=`<img class="attached-image" src="${esc(uploadImage)}" alt="첨부 이미지 미리보기">`}else{uploadFile={name:f.name,data:reader.result};$('#upload-preview').textContent=f.name+' · 첨부됨'}};reader.onerror=()=>toast('파일을 읽을 수 없습니다. 다시 선택해 주세요.');reader.readAsDataURL(f)}});
document.addEventListener('submit',e=>{const form=e.target;if(form.id==='member-filters'){e.preventDefault();updateMemberResults();return}if(form.id==='campaign-gift-form'){e.preventDefault();giftConfirmation(form);return}if(['home-search','global-search','modal-search'].includes(form.id)){e.preventDefault();const q=new FormData(form).get('q').trim();closeModal();go(q?'search/'+encodeURIComponent(q):'search');return}if(form.id==='post-form'){e.preventDefault();const f=Object.fromEntries(new FormData(form));if(!f.title.trim()||!f.org.trim()||!f.body.trim()){toast('제목, 기관명과 내용을 입력해 주세요.');return}if(f.url&&!cleanURL(f.url)){toast('http 또는 https 주소를 입력해 주세요.');return}const date=f.date?new Date(f.date+'T12:00:00'):null;const post={id:'local-'+uid(),type:f.type,title:f.title.trim(),org:f.org.trim(),category:f.category,body:f.body.trim(),url:cleanURL(f.url),image:uploadImage,file:uploadFile,isLocal:true,status:'pending',date:f.date?'등록 시연 · '+f.date:'일정 미정',day:date?String(date.getDate()):'미정',month:date?(date.getMonth()+1)+'월':'일정',style:1,tone:'#e3ecf9',format:uploadFile?uploadFile.name.split('.').pop().toUpperCase().slice(0,5):uploadImage?'IMG':'TXT'};db.posts.unshift(post);if(!persist()){db.posts.shift();return}completion('게시 요청을 저장했습니다','현재 브라우저에서 등록 시연이 완료되었습니다.')}else if(form.id==='join-form'){e.preventDefault();const f=Object.fromEntries(new FormData(form));if(!f.name.trim()||!f.desc.trim()){toast('기관명과 소개를 입력해 주세요.');return}if(f.url&&!cleanURL(f.url)){toast('http 또는 https 주소를 입력해 주세요.');return}let campaign;
try {
  campaign = readJoinCampaign(f);
} catch(error) {
  toast(error.message);
  return;
}
db.applications.unshift({name:f.name.trim(),desc:f.desc.trim(),body:f.desc.trim(),service:f.service,district:f.district,url:cleanURL(f.url),id:'member-'+uid(),status:'pending',campaign});if(!persist()){db.applications.shift();return}completion('회원사 등록 요청을 저장했습니다','현재 브라우저에서 등록 시연이 완료되었습니다.')}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('.nav').classList.contains('open')){toggleMenu(false);$('[data-action=menu]').focus()}if(!$('#modal').hidden){if(e.key==='Escape')closeModal();if(e.key==='Tab'){const fs=$$('button,a[href],input,select,textarea',$('#modal')).filter(x=>!x.disabled&&x.getClientRects().length),first=fs[0],last=fs.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}}});
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal'))closeModal()});
document.addEventListener('click',onFeatureClick);
document.addEventListener('input',onFeatureInput);
document.addEventListener('change',onFeatureChange);
document.addEventListener('submit',onFeatureSubmit);
function followOnHistory(){if(readOnRoute()!==activeRoute)render();}
window.addEventListener('hashchange',followOnHistory);
window.addEventListener('popstate',followOnHistory);if('scrollRestoration'in history)history.scrollRestoration='manual';render();
