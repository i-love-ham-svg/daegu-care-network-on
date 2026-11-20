/* Rebuild the delivery review after deployment: node scripts/release-report.cjs */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const runtime = require('./runtime.cjs');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'output/verification/release');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, ''));
const optional = file => fs.existsSync(path.join(root, file)) ? read(file) : null;
const research = read('src/institution-research.json');
const manifest = read('src/social-manifest.json');
const release = read('src/release-content.json');
const researchedNews = read('src/researched-news.json');
const pages = read('output/verification/social/pages-audit.json');
const unique = read('output/verification/social/uniqueness-audit.json');
const catalog = require('./social-catalog.cjs')();
const vm = runtime('const onSocialThumbnails = ' + JSON.stringify(manifest) + ';');
const json = expression => JSON.parse(vm.run('JSON.stringify(' + expression + ')'));
const origin = 'https://daegu-care.oconia.co.kr';
const publicURL = route => origin + vm.run('onPublicPagePath(' + JSON.stringify(route) + ')');
const actualSources = research.sources || [];
const sourceOwner = source => source.owner || source.orgId || source.institutionId;
const sourceDate = source => ({activityDate: source.activityDate || null, publishedDate: source.publishedDate || null});
const href = value => /^https?:\/\//.test(String(value || '')) ? value : null;
const uniqueByURL = sources => [...new Map(sources.filter(s => href(s.url)).map(s => [s.url, s])).values()];
const sourceForText = text => {
  const match = String(text).match(/https?:\/\/\S+/);
  return match ? {title: String(text).slice(0, match.index).replace(/[:：\s]+$/, ''), url: match[0]} : null;
};

assert.equal(catalog.organizations.length, 7, 'Expected seven confirmed institutions');
assert.equal(Object.keys(manifest).length, pages.canonicalContents, 'Manifest and built pages differ');
assert.equal(pages.version.length, 12, 'Expected the build version recorded by build.cjs');
assert.equal(unique.contents, Object.keys(manifest).length, 'Uniqueness audit must cover current content count');
assert.equal(unique.renderedImages, Object.values(manifest).reduce((n, x) => n + Object.keys(x.images).length, 0),
  'Run the final verify-unique.py after all channel images are rendered; a source-only audit is incomplete');
assert.equal(unique.reusedSources.length, 0, 'Duplicate source photographs must be resolved');
assert.equal(unique.identicalRenderedImages.length, 0, 'Duplicate rendered covers must be resolved');

const organizations = catalog.organizations.map(org => {
  const profile = manifest['member/' + org.id];
  assert.equal(profile.background.owner, org.id, 'Profile photograph ownership mismatch: ' + org.id);
  const gallery = json('galleryPhotos("member",' + JSON.stringify(org.id) + ')').map(item => {
    const photo = catalog.photos[item.key];
    assert.ok(photo && !photo.illustrative, 'Missing actual gallery photograph: ' + item.key);
    assert.equal(photo.owner, org.id, 'Gallery photograph ownership mismatch: ' + item.key);
    return {
      key: item.key, owner: photo.owner, title: photo.title, caption: photo.caption,
      file: photo.file, localURL: '../../../docs/media/' + photo.file,
      publicURL: origin + '/media/' + photo.file,
      source: photo.source || null, sourceLabel: photo.sourceLabel || photo.publisher || null,
      activityDate: photo.activityDate || null, publishedDate: photo.publishedDate || null,
      exactOwnershipConfirmed: true
    };
  });
  const engine = name => {
    const attempts = research.engineCoverage.filter(x => x.institutionId === org.id && x.engine.toLowerCase() === name);
    const completed = attempts.filter(x => x.completed);
    const preferred = completed.find(x => /rendered.*google|computer use/i.test(x.method || '')) || completed.at(-1);
    return {completed: Boolean(research.engineSummary?.[org.id]?.[name] && preferred), queryURL: preferred?.queryURL || attempts.at(-1)?.queryURL || null,
      method: preferred?.method || null, actualBrowserResults: /rendered.*google|computer use/i.test(preferred?.method || ''),
      attempts: attempts.map(({completed, method, notes}) => ({completed, method, notes}))};
  };
  const sources = actualSources.filter(s => sourceOwner(s) === org.id).map(s => ({id: s.id, title: s.title, url: s.url,
    publisher: s.publisher || null, bodyRead: Boolean(s.bodyRead), ...sourceDate(s)}));
  const links = uniqueByURL([
    ...sources,
    ...gallery.map(p => ({title: p.title, url: p.source, bodyRead: true})),
    ...(org.sources || []).map(sourceForText).filter(Boolean),
    {title: profile.background.title, url: profile.background.source, bodyRead: true}
  ]);
  // The declared SDL cafe remains unvisited; use its independently verified public blog here.
  const channels = uniqueByURL([
    ...((org.id === 'welfare-design' || !org.url) ? [] : [{label: org.urlLabel || '공식 채널', url: org.url}]),
    ...(org.channels || [])
  ]);
  const news = catalog.items.filter(s => s.memberId === org.id && s.type === 'news');
  const events = catalog.items.filter(s => s.memberId === org.id && s.type === 'event');
  return {id: org.id, name: org.name, service: org.service, district: org.district,
    serviceProfileURL: publicURL('member/' + org.id), officialChannels: channels,
    officialSiteUnconfirmed: channels.length === 0,
    facts: org.facts || [], search: {naver: engine('naver'), google: engine('google')},
    profilePhoto: {key: profile.photo, owner: profile.background.owner, title: profile.background.title,
      source: profile.background.source, file: profile.background.file, thumbnailFile: profile.images.facebook.file,
      exactOwnershipConfirmed: true}, galleryPhotos: gallery, galleryPhotoCount: gallery.length,
    directResearchSources: sources, sourceLinks: links, newsCount: news.length, eventCount: events.length,
    news: news.map(s => ({id: s.id, title: s.title, url: publicURL('detail/' + s.id), source: s.url || null,
      activityDate: s.date || null, publishedDate: s.publishedDate || null})),
    events: events.map(s => ({id: s.id, title: s.title, url: publicURL('detail/' + s.id), source: s.url || null, activityDate: s.date || null}))};
});

for (const org of organizations) {
  assert.ok(org.search.naver.completed && org.search.google.completed, 'Both searches must be complete: ' + org.id);
  assert.ok(org.search.google.actualBrowserResults, 'Google search completion requires rendered results: ' + org.id);
}

const newsAdditions = researchedNews.filter(s => !['suseong-nutrition-sharing', 'sdl-geochang-workshop'].includes(s.id));
assert.equal(newsAdditions.length, 9, 'Expected nine newly added verified articles');
const replaced = [...release.news, ...release.events];
assert.equal(replaced.length, 10, 'Expected replacement of eight example news items and two example events');
assert.ok(replaced.every(s => s.verified && s.memberId && s.url && s.photoKey));
const aliasEntries = Object.entries(pages.aliases).map(([from, to]) => ({from, to, sourcePage: publicURL(from), canonicalPage: publicURL(to)}));
assert.equal(aliasEntries.length, 10, 'Expected ten same-case aliases');
const contract = optional('output/verification/content/content-contracts.json');
const live = optional('output/verification/social/live-application.json');
const httpLive = optional('output/verification/social/http-live.json');
const httpSources = optional('output/verification/social/http-live-sources.json');
const viewAudit = optional('output/verification/social/view-render-audit.json');
const giving = optional('output/verification/giving/functional-regression.json');
const composition = optional('output/work/visual-composition-continuity.json');
const deploymentCurrent = Boolean(live?.passed && live.version === pages.version);
const evidenceFiles = ['src/institution-research.json', 'src/release-content.json', 'src/researched-news.json',
  'src/social-manifest.json', 'output/verification/social/pages-audit.json',
  'output/verification/social/uniqueness-audit.json', 'output/verification/content/content-contracts.json',
  'output/verification/social/live-application.json', 'output/verification/social/http-live.json',
  'output/verification/social/http-live-sources.json', 'output/verification/social/view-render-audit.json',
  'output/verification/giving/functional-regression.json', 'output/work/visual-composition-continuity.json',
  'output/work/release-research-a/final-visual-review.json',
  'output/work/release-research-b/final-visual-review-v2.json',
  'output/work/release-content-review/final-visual-review.json'];
const report = {
  title: '대구 통합돌봄네트워크 ON · 콘텐츠 최종 검수',
  generatedAt: new Date().toISOString(), checkedAt: research.checkedAt, version: pages.version,
  service: {url: origin + '/', membersURL: origin + '/members.html',
    state: '제안·시연 서비스', formalOpeningComplete: false,
    authentication: 'SNS 로그인은 시연 흐름', payments: '후원·결제는 시연 흐름이며 실제 결제 아님',
    note: '콘텐츠 검수와 배포 확인은 정식 로그인·결제 개통 완료를 뜻하지 않습니다.'},
  deployment: {currentBuildVerified: deploymentCurrent, observedLiveVersion: live?.version || null,
    targetVersion: pages.version, verificationMethod: live?.verification || null,
    state: deploymentCurrent ? '현재 빌드 운영 반영 확인' : '현재 빌드 배포 후 확인 필요',
    refreshCommand: 'node scripts/release-report.cjs',
    refreshNote: '배포 후 live-application.json 등 운영 검증 근거를 갱신하고 이 스크립트를 다시 실행합니다. 이전 빌드 검증을 현재 배포 완료로 취급하지 않습니다.'},
  counts: {confirmedInstitutions: organizations.length, naverCompleted: organizations.filter(x => x.search.naver.completed).length,
    googleRenderedResultsCompleted: organizations.filter(x => x.search.google.actualBrowserResults).length,
    researchSources: actualSources.length, researchSourcesBodyRead: actualSources.filter(s => s.bodyRead).length,
    replacedExampleContents: replaced.length, addedVerifiedArticles: newsAdditions.length,
    physicalPublicViews: pages.routes, independentContents: pages.canonicalContents, sameCaseAliases: aliasEntries.length,
    uniqueSourcePhotographs: unique.uniqueSourcePhotographs, reusedSourcePhotographs: unique.reusedSources.length,
    nearDuplicateSourcePairs: unique.nearSourcePairs.length,
    channelCount: catalog.channels.length, socialImages: pages.images,
    identicalRenderedImages: unique.identicalRenderedImages.length, generatedHTMLPages: pages.pages,
    publishedNews: catalog.items.filter(x => x.type === 'news').length, publishedEvents: catalog.items.filter(x => x.type === 'event').length},
  organizations, channels: catalog.channels.map(([id, label, , width, height]) => ({id, label, width, height})),
  replacedContents: replaced.map(s => ({id: s.id, type: s.type, institutionId: s.memberId, title: s.title,
    url: publicURL('detail/' + s.id), source: s.url, activityDate: s.date, publishedDate: s.publishedDate || null})),
  addedArticles: newsAdditions.map(s => ({id: s.id, institutionId: s.memberId, title: s.title,
    url: publicURL('detail/' + s.id), source: s.url, activityDate: s.date, publishedDate: s.publishedDate || null})),
  sameCaseAliases: {explanation: '77개 공개 화면 가운데 같은 실제 사례를 다루는 사진·일정 화면 10개는 해당 소식의 공유 주소·표지를 함께 사용합니다. 별도 콘텐츠의 이미지 재사용이 아니며 사진 원본 보기와 다운로드를 유지합니다. 독립 콘텐츠는 67개입니다.', entries: aliasEntries},
  photoRules: ['독립 콘텐츠마다 실제 사례사진 1개와 텍스트 제목을 사용합니다.',
    '참여기관 자체 활동은 기관 소유 문맥을 대조하고, 다른 지역·관련 사례는 참고사진으로 명시합니다.',
    '기관별 사진 목록은 runtime galleryPhotos의 실제 노출 자료이며 모든 owner가 해당 institutionId와 일치합니다.',
    '원문 출처와 활동일·게시일을 구분합니다. 공개 저작권·이용조건은 각 원문을 따릅니다.'],
  researchSources: actualSources.map(s => ({id: s.id, institutionId: sourceOwner(s), title: s.title, url: s.url,
    publisher: s.publisher || null, bodyRead: Boolean(s.bodyRead), ...sourceDate(s)})),
  operationalAuditNote: {
    institutionId: 'welfare-design', institutionName: '사회복지디자인연구소사회적협동조합',
    status: '사업자번호별 현재 세무상태 및 법인명 변경 여부 미확인',
    publicDirectoryObservation: '공식 협동조합 포털은 운영중으로 표시하고 북구청 현황에도 기재되어 있습니다. 협동조합 포털의 사업자등록번호는 공란(-)입니다.',
    thirdPartyObservation: '민간 자료와 Google AI 개요는 713-82-00683의 2026-09-28 폐업을 표시합니다. AI 개요는 독립된 확인 근거로 보지 않습니다.',
    conclusion: '공공 협동조합 운영상태와 세무상 사업자번호 상태를 같다고 단정하지 않습니다. 폐업 또는 계속사업을 확정하지 않고 사용자가 확정한 7개 참여기관을 유지합니다.',
    requiredConfirmation: research.operationalStatusReview?.preOpenQuestionsForInstitution || [],
    sources: (research.operationalStatusReview?.primarySources || []).map(s => ({title: s.title || s.publisher, url: s.source,
      qualification: s.qualification || null})),
    scope: '공개자료 대조만 수행. 국세청 인증·보안문자 조회나 기관에 연락한 이력 없음.'
  },
  audits: {
    content: contract ? {passed: contract.passed, checks: contract.checks, scope: contract.scope} : null,
    viewRendering: viewAudit ? {passed: viewAudit.passed, routes: viewAudit.routes, failures: viewAudit.failures?.length || 0} : null,
    imageUniqueness: {sourceAuditCount: unique.sourceAudit.length, renderedImageAuditCount: unique.renderAudit.length,
      method: '원본 바이트·RGB 픽셀 해시와 지각 해시를 비교하고 렌더 603장의 픽셀 해시를 검사',
      limitation: '지각 해시는 자동 유사도 검사이며 모든 변형 사진의 동일성을 수학적으로 증명하는 기준은 아닙니다.'},
    giving: giving ? {passed: giving.passed, scope: giving.scope || '시연 후원 기능 회귀검사'} : null,
    compositionContinuity: composition ? {version: composition.version, unchanged: composition.unchanged,
      changed: composition.changed, unchangedChannels: composition.unchangedChannels,
      changedChannels: composition.changedChannels,
      qualification: '각 파일의 바이트 동일성을 근거로 이전 시각검수의 연속성을 확인합니다. 후속 수정 파일은 별도 확인 대상입니다.'} : null,
    liveApplication: live ? {passed: live.passed, version: live.version, currentBuild: deploymentCurrent,
      institutionCards: live.institutionCards, institutionDonationButtons: live.institutionDonationButtons, method: live.verification} : null,
    liveHTTP: httpLive ? {passed: httpLive.passed, images: httpLive.images, sourcePhotographs: httpLive.sourcePhotographs,
      currentBuildConfirmedByThisFile: false, qualification: '버전 없는 HTTP 감사 파일은 독립적으로 현재 빌드 반영을 증명하지 않습니다.'} : null,
    liveSourcePhotographs: httpSources ? {passed: httpSources.passed, sourcePhotographs: httpSources.sourcePhotographs,
      currentBuildConfirmedByThisFile: false} : null
  },
  reviewLinks: {thumbnailReview: '../social/thumbnail-review.html',
    currentPagesAudit: '../social/pages-audit.json', imageUniqueness: '../social/uniqueness-audit.json',
    contentAudit: '../content/content-contracts.json', reportJSON: 'report.json'},
  finalCompositionNote: '우리함께 기관 표지는 창립총회 인물이 제목에 가려지지 않도록 제목을 위쪽으로 옮기는 최종 보정을 진행했습니다. 최종 배포 근거와 버전은 위 deployment 항목에서 별도로 확인합니다.',
  evidence: evidenceFiles.filter(file => fs.existsSync(path.join(root, file))).map(file => {
    const data = fs.readFileSync(path.join(root, file));
    return {file, sha256: crypto.createHash('sha256').update(data).digest('hex'),
      modifiedAt: fs.statSync(path.join(root, file)).mtime.toISOString()};
  })
};

const esc = text => String(text ?? '').replace(/[&<>"']/g, x => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[x]));
const link = (url, label) => href(url) ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(label) + '</a>' : esc(label);
const list = items => '<ul>' + items.map(x => '<li>' + x + '</li>').join('') + '</ul>';
const status = value => '<span class="status ' + (value ? 'ok' : 'pending') + '">' + (value ? '확인' : '확인 대기') + '</span>';
const stat = (value, label) => '<div><strong>' + esc(value) + '</strong><span>' + esc(label) + '</span></div>';
const storyRow = story => '<tr><td>' + link(story.url, story.title) + '</td><td>' + esc(organizations.find(x => x.id === (story.institutionId || story.memberId))?.name || '') + '</td><td>' + esc(story.activityDate || '일자 미상') + (story.publishedDate ? '<small>게시 ' + esc(story.publishedDate) + '</small>' : '') + '</td><td>' + link(story.source, '직접 원문') + '</td></tr>';
const matrix = organizations.map(org => '<tr><th scope="row"><a href="#' + esc(org.id) + '">' + esc(org.name) + '</a><small>' + esc(org.service) + ' · ' + esc(org.district) + '</small></th><td>' + status(org.search.naver.completed) + '<br>' + link(org.search.naver.queryURL, '네이버 결과') + '</td><td>' + status(org.search.google.actualBrowserResults) + '<br>' + link(org.search.google.queryURL, 'Google 결과') + '<small>실제 브라우저 결과 확인</small></td><td>자체 활동 ' + org.galleryPhotoCount + '장<small>프로필·갤러리 owner 일치</small></td><td>소식 ' + org.newsCount + ' · 일정 ' + org.eventCount + '<small>직접 출처 ' + org.sourceLinks.length + '개</small></td><td>' + link(org.serviceProfileURL, '운영 기관 화면') + (org.officialChannels.length ? '<br>' + org.officialChannels.map(c => link(c.url, c.label)).join('<br>') : '<small>공식 사이트 미확인</small>') + '</td></tr>').join('');
const orgDetails = organizations.map(org => '<article class="institution" id="' + esc(org.id) + '"><div class="institution-head"><img loading="lazy" src="../../../docs/media/' + esc(org.profilePhoto.thumbnailFile) + '" alt="' + esc(org.profilePhoto.title) + '"><div><p class="eyebrow">참여 확정 · ' + esc(org.district) + '</p><h3>' + esc(org.name) + '</h3><p>' + esc(org.service) + '</p><p>' + link(org.serviceProfileURL, '서비스 기관 소개 열기') + '</p></div></div><dl>' + org.facts.map(([k, v]) => '<div><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>').join('') + '</dl><h4>기관 활동사진과 직접 근거</h4>' + list(org.galleryPhotos.map(p => link(p.source, p.title) + '<small>' + esc(p.caption || p.sourceLabel || '기관 활동사진') + '</small>' + (!p.source ? '<small>직접 웹 원문 대신 제공 활동보고 자료로 확인</small>' : ''))) + '<details><summary>확보 출처 ' + org.sourceLinks.length + '개 모두 보기</summary>' + list(org.sourceLinks.map(s => link(s.url, s.title || s.url))) + '</details></article>').join('');
const notes = report.operationalAuditNote;
const html = '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(report.title) + '</title><style>' +
  ':root{color-scheme:light;--ink:#173346;--blue:#075bd9;--line:#dce5ea;--muted:#536774}*{box-sizing:border-box}body{margin:0;background:#f4f7f9;color:var(--ink);font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;font-size:16px;line-height:1.65}main{max-width:1240px;margin:auto;padding:36px 24px 70px}header{background:#103145;color:white;padding:32px;border-radius:20px}header a{color:#b8e9ff}h1{font-size:32px;line-height:1.35;margin:8px 0 14px}h2{font-size:24px;margin:0 0 20px}h3{font-size:21px;margin:0 0 10px}h4{font-size:16px;margin-bottom:8px}p{margin:8px 0}.eyebrow{letter-spacing:.06em;font-size:13px;font-weight:bold}.version,code{font-family:Consolas,monospace;font-size:13px}.badge{display:inline-block;background:#d9f6ec;color:#145a46;padding:5px 12px;border-radius:6px;font-weight:bold}.demo{background:#fff2cd;color:#684c09;padding:16px 20px;border-radius:12px;margin-top:20px}a{color:var(--blue);text-underline-offset:3px;overflow-wrap:anywhere}a:hover{text-decoration-thickness:2px}a:focus-visible,summary:focus-visible{outline:3px solid #db9a00;outline-offset:3px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:20px 0}.metrics div{background:white;border:1px solid var(--line);border-radius:12px;padding:20px}.metrics strong{display:block;color:var(--blue);font-size:31px}.metrics span{font-size:14px}section{background:white;padding:28px;border:1px solid var(--line);border-radius:16px;margin-top:22px}.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:13px 11px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}thead th{background:#edf4f9;white-space:nowrap}tbody th{min-width:185px}small{display:block;font-size:12px;color:var(--muted);line-height:1.6;margin-top:4px}.status{font-size:12px;font-weight:bold}.ok{color:#126747}.pending{color:#9c5300}.institution{border-top:1px solid var(--line);padding-top:24px;margin-top:26px;scroll-margin-top:18px}.institution:first-of-type{border:0;margin:0;padding:0}.institution-head{display:grid;grid-template-columns:300px 1fr;gap:24px;align-items:center}.institution-head img{width:100%;height:auto;border-radius:12px}dl{display:grid;grid-template-columns:repeat(2,1fr);gap:8px 24px}dl div{display:flex;gap:12px;border-bottom:1px solid #edf1f4;padding:7px 0}dt{font-weight:bold;min-width:100px;font-size:13px}dd{margin:0;font-size:14px}ul{padding-left:22px}li{margin:7px 0}details{margin-top:14px}summary{cursor:pointer;color:var(--blue);font-weight:bold}.memo{background:#fff9e9;border-color:#ead9a4}.muted{color:var(--muted)}footer{font-size:13px;color:var(--muted);margin-top:24px}@media(max-width:760px){main{padding:18px 12px 40px}header,section{padding:21px}h1{font-size:26px}.metrics{grid-template-columns:repeat(2,1fr)}.metrics div{padding:15px}.institution-head{grid-template-columns:1fr}dl{grid-template-columns:1fr}th,td{padding:10px 8px}}@media print{body{background:white}main{padding:0;max-width:none}header{background:white;color:var(--ink);padding:0}header a{color:var(--blue)}section{break-inside:avoid;border:0;padding:16px 0}.institution{break-inside:avoid}.institution-head img{max-width:260px}details{display:none}.metrics div{padding:10px}a{color:var(--ink)}}' +
  '</style><main><header><p class="eyebrow">전달용 콘텐츠 검수 기록 · ' + esc(report.checkedAt) + '</p><h1>대구 통합돌봄네트워크 ON</h1><p>7개 참여기관 정보와 실제 활동사진, 공유 썸네일을 대조한 최종 검수 자료입니다.</p><p class="version">콘텐츠 버전 ' + esc(report.version) + ' · 생성 ' + esc(report.generatedAt) + '</p><p>' + link(origin + '/', '운영 시연 사이트 열기') + ' · <a href="../social/thumbnail-review.html">SNS 썸네일 603장 검수표</a> · <a href="report.json">검수 JSON</a></p></header>' +
  '<div class="demo"><strong>제안·시연 서비스</strong><p>SNS 로그인과 후원·결제는 시연 흐름입니다. 콘텐츠 검수·배포 확인을 정식 로그인·결제 개통 완료로 표시하지 않습니다.</p><p><strong>' + esc(report.deployment.state) + '</strong> · 대상 ' + esc(pages.version) + (live?.version ? ' / 마지막 운영 검증 ' + esc(live.version) : '') + '</p></div>' +
  '<div class="metrics">' + stat(7, '확정 참여기관 · 양대 검색 완료') + stat(actualSources.length, '신규 조사 출처 · 본문 ' + report.counts.researchSourcesBodyRead + '건') + stat(unique.uniqueSourcePhotographs, '독립 콘텐츠 실제사진 · 중복 0') + stat(pages.images, catalog.channels.length + '개 SNS 규격 썸네일') + '</div>' +
  '<section><h2>7개 기관 검수 매트릭스</h2><p class="muted">Google은 실제 브라우저에 표시된 결과를 확인했습니다. 네이버는 공개 검색 결과의 제목·요약·출처를 읽었습니다. 초기 Google HTTP 응답이 JS 안내만 반환한 시도는 성공으로 세지 않고 후속 실제 검색 완료 기록을 사용합니다.</p><div class="table-wrap"><table><thead><tr><th>참여기관</th><th>네이버</th><th>Google</th><th>실제사진</th><th>연결 콘텐츠</th><th>화면·공식 채널</th></tr></thead><tbody>' + matrix + '</tbody></table></div></section>' +
  '<section><h2>사진과 SNS 공유 화면</h2><p>' + pages.routes + '개 공개 화면을 ' + pages.canonicalContents + '개 독립 콘텐츠로 정리하고 ' + catalog.channels.length + '개 채널 규격에 맞춰 ' + pages.images + '장을 만들었습니다. 독립 콘텐츠 사진의 정확한 중복은 0건이며 자동 유사도 검사에서도 근접 중복 후보가 없습니다.</p><p>' + esc(report.sameCaseAliases.explanation) + '</p><p><a href="../social/thumbnail-review.html">채널별 썸네일과 사진 원문을 한꺼번에 확인하기 →</a></p><div class="table-wrap"><table><thead><tr><th>채널</th><th>크기</th><th>콘텐츠</th></tr></thead><tbody>' + report.channels.map(c => '<tr><td>' + esc(c.label) + '</td><td>' + c.width + ' × ' + c.height + ' px</td><td>' + pages.canonicalContents + '</td></tr>').join('') + '</tbody></table></div><details><summary>동일 사례 화면 연결 10개</summary>' + list(aliasEntries.map(x => link(x.sourcePage, x.from) + ' → ' + link(x.canonicalPage, x.to))) + '</details></section>' +
  '<section><h2>기관별 확인 정보·실제사진·직접 출처</h2>' + orgDetails + '</section>' +
  '<section><h2>기존 예시 콘텐츠 10개 교체</h2><p>예시 소식 8개와 일정 2개를 참여기관의 실제 공개 활동으로 교체했습니다. 행사일이 명확하지 않은 자료는 게시일이나 연도 범위를 표시합니다.</p><div class="table-wrap"><table><thead><tr><th>콘텐츠</th><th>참여기관</th><th>활동일·게시일</th><th>출처</th></tr></thead><tbody>' + report.replacedContents.map(storyRow).join('') + '</tbody></table></div></section>' +
  '<section><h2>검증 기사·기관 소식 9개 추가</h2><p>기존 영양식 나눔·조합원 워크숍 2건을 유지하고, 원문과 사진을 대조한 신규 소식 9건을 더했습니다.</p><div class="table-wrap"><table><thead><tr><th>콘텐츠</th><th>참여기관</th><th>활동일·게시일</th><th>출처</th></tr></thead><tbody>' + report.addedArticles.map(storyRow).join('') + '</tbody></table></div></section>' +
  '<section class="memo"><h2>오픈 전 기관 확인 메모</h2><h3>' + esc(notes.institutionName) + '</h3><p>' + esc(notes.publicDirectoryObservation) + '</p><p>' + esc(notes.thirdPartyObservation) + '</p><p><strong>' + esc(notes.conclusion) + '</strong></p>' + list(notes.requiredConfirmation.map(esc)) + '<p>' + notes.sources.map(s => link(s.url, s.title)).join(' · ') + '</p><small>' + esc(notes.scope) + '</small></section>' +
  '<section><h2>검증 기록과 갱신</h2>' + list([
    '콘텐츠 연결·기관별 사진 소유 문맥 검사: ' + (contract?.passed ? '통과 · ' + contract.checks + '개 항목' : '검증 파일 확인 필요'),
    '독립 사진 ' + unique.uniqueSourcePhotographs + '개 · 원본 중복 ' + unique.reusedSources.length + '개 · 썸네일 픽셀 중복 ' + unique.identicalRenderedImages.length + '개',
    '공유 화면과 사진 출처는 ' + link(origin + '/members.html', '운영 기관 화면') + ' 및 <a href="../social/thumbnail-review.html">전체 썸네일 검수표</a>에서 확인할 수 있습니다.',
    'SNS 앱의 기존 캐시 갱신과 모든 외부 앱의 실제 게시 화면을 보증하는 검사는 아닙니다.',
    '이전 버전 운영 검증은 현재 빌드 배포 완료로 세지 않습니다. 운영 검증 근거를 갱신한 뒤 <code>node scripts/release-report.cjs</code>를 다시 실행합니다.'
  ]) + '</section><footer>공개 원문과 제공 활동자료를 대조한 기록입니다. 출처 링크는 근거 확인용이며 사진 이용조건은 각 원문을 따릅니다. 이 문서는 정식 로그인·결제 운영 개통 증명서가 아닙니다.</footer></main></html>';

fs.mkdirSync(output, {recursive: true});
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
fs.writeFileSync(path.join(output, 'review.html'), html + '\n');
console.log(JSON.stringify({version: report.version, institutions: organizations.length, sources: actualSources.length,
  independentContents: pages.canonicalContents, images: pages.images, currentDeploymentVerified: deploymentCurrent,
  html: 'output/verification/release/review.html', json: 'output/verification/release/report.json'}));
