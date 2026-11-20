/* Gather verified public institution photographs without changing article covers.
 * node scripts/prepare-service-share.cjs [--feed path/to/public-photo-feed.json]
 * Feed: {photos:[{owner,file,imageUrl,source,title,caption,credit,publishedDate,
 *                 activityDate,updatedAt,ingestedAt,verified:true}]}
 * Feed files are publication assets under docs/media, not unverified remote downloads.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.resolve(root, file), 'utf8').replace(/^\uFEFF/, ''));
const normalizedURL = value => {
  if (!value) return null;
  try {
    const u = new URL(value);
    if (/blog\.naver\.com$/.test(u.hostname)) {
      const match = u.pathname.match(/^\/([^/]+)\/(\d+)$/);
      const blog = u.searchParams.get('blogId') || match?.[1];
      const id = u.searchParams.get('logNo') || match?.[2];
      if (blog && id) return 'https://blog.naver.com/' + blog + '/' + id;
    }
    ['theme_type', 'redirect', 'utm_source', 'utm_medium', 'utm_campaign'].forEach(k => u.searchParams.delete(k));
    u.hash = ''; u.searchParams.sort();
    return u.href;
  } catch { return value; }
};
const validDay = value => {
  const v = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const date = new Date(v + 'T00:00:00Z');
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === v ? v : null;
};
const validTimestamp = value => {
  const v = String(value || '');
  if (validDay(v)) return v + 'T00:00:00.000Z';
  if (!/^\d{4}-\d\d-\d\dT/.test(v) || !/(Z|[+-]\d\d:\d\d)$/.test(v)) return null;
  const date = new Date(v);
  return Number.isFinite(date.valueOf()) ? date.toISOString() : null;
};
const activityFromStory = story => {
  if (validDay(story.activityDate)) return story.activityDate;
  const match = String(story.date || '').match(/^(\d{4})\.(\d{2})\.(\d{2})(?:$|부터|\s*식단)/);
  return match && validDay(match.slice(1, 4).join('-'));
};

function collectServiceShareCandidates({catalog, feed = [], values}) {
  const runtime = require('./runtime.cjs')('const onSocialThumbnails = {};');
  const json = exp => JSON.parse(runtime.run('JSON.stringify(' + exp + ')'));
  const organizations = json('organizations');
  const orgs = new Map(organizations.map(org => [org.id, org]));
  const bySource = new Map();
  for (const story of catalog.items.filter(s => s.verified && s.url)) {
    const key = normalizedURL(story.url);
    if (!bySource.has(key)) bySource.set(key, []);
    bySource.get(key).push(story);
  }
  const raw = [];
  for (const org of organizations) {
    const gallery = json('galleryPhotos("member",' + JSON.stringify(org.id) + ')');
    for (const entry of gallery) {
      const photo = catalog.photos[entry.key];
      assert.ok(photo && !photo.illustrative && photo.owner === org.id, 'Only institution-owned actual activity context: ' + entry.key);
      raw.push({...photo, key: entry.key, origin: 'institution-gallery'});
    }
  }
  for (const [i, photo] of feed.entries()) {
    assert.ok(photo.verified === true, 'Public feed photographs need verified=true: ' + i);
    assert.ok(orgs.has(photo.owner) && !photo.illustrative, 'Feed owner must be a confirmed institution: ' + i);
    assert.ok(photo.source && photo.caption && photo.credit, 'Feed needs source, caption and credit: ' + i);
    raw.push({...photo, imageURL: photo.imageUrl || photo.imageURL, key: photo.key || 'feed-' + i, origin: 'verified-public-feed'});
  }
  const photos = raw.map(photo => {
    const org = orgs.get(photo.owner);
    const file = String(photo.file || '').replace(/\\/g, '/');
    const absolute = path.resolve(root, 'docs/media', file);
    assert.ok(absolute.startsWith(path.resolve(root, 'docs/media') + path.sep), 'Photo path must remain under docs/media');
    assert.ok(fs.existsSync(absolute), 'Missing photograph: ' + file);
    const matching = bySource.get(normalizedURL(photo.source)) || [];
    // Only the exact source article can contribute a date. A historical article
    // that merely displays this photograph as a reference cannot date the image.
    const sourceStories = matching.filter(s => s.memberId === photo.owner);
    const publishedDate = validDay(photo.publishedDate) || sourceStories.map(s => validDay(s.publishedDate)).find(Boolean) || null;
    const activityDate = photo.activityDate ?? sourceStories.map(activityFromStory).find(Boolean) ?? null;
    const updatedAt = validTimestamp(photo.updatedAt);
    const ingestedAt = validTimestamp(photo.ingestedAt);
    const freshnessDate = updatedAt || ingestedAt || (publishedDate ? publishedDate + 'T00:00:00.000Z' : null);
    const imageUrl = photo.imageURL || values.canonicalURL + 'media/' + file;
    return {key: photo.key, owner: photo.owner, institutionName: org.name, file,
      originalFile: photo.originalFile || null, imageUrl, originalImageUrl: photo.imageURL || null,
      title: photo.title || photo.caption, caption: photo.caption || photo.title,
      credit: photo.credit || photo.publisher || photo.sourceLabel || org.name,
      source: photo.source || null, sourceLabel: photo.sourceLabel || null,
      sourceDocument: photo.source ? null : photo.sourceLabel || null,
      publishedDate, activityDate, activityDatePrecision: photo.datePrecision || (validDay(activityDate) ? 'day' : null),
      updatedAt, ingestedAt, freshnessDate, freshnessTimestamp: freshnessDate ? Date.parse(freshnessDate) : 0,
      dateEvidence: {publication: validDay(photo.publishedDate) ? 'photo metadata' : publishedDate ? 'same verified source article' : 'unknown',
        activity: photo.activityDate != null ? 'photo metadata' : activityDate ? 'same verified source article' : 'unknown'},
      sourceRawSHA256: photo.sourceRawSHA256 || photo.sourceSHA256 || null,
      rightsContext: photo.rightsContext || null, licenseURL: photo.licenseURL || null,
      origin: photo.origin, exactOwnershipConfirmed: true};
  });
  assert.deepEqual([...new Set(photos.map(p => p.owner))].sort(), [...orgs.keys()].sort(), 'Fallback must include all seven institutions');
  return {version: 1, values, organizations: organizations.map(({id, name}) => ({id, name})), photos,
    collectionRules: {source: 'runtime organizations + galleryPhotos(member, id)',
      datePolicy: values.ordering, remoteDownloads: false, originalArticlesModified: false}};
}

if (require.main === module) {
  const values = read('src/service-share-values.json');
  const feedFlag = process.argv.indexOf('--feed');
  const feedPath = feedFlag >= 0 ? process.argv[feedFlag + 1] : values.feedFile;
  const feedData = feedPath ? read(feedPath) : [];
  const feed = Array.isArray(feedData) ? feedData : feedData.photos;
  assert.ok(Array.isArray(feed), 'Feed must be an array or {photos:[]}');
  const data = collectServiceShareCandidates({catalog: require('./social-catalog.cjs')(), feed, values});
  const folder = path.join(root, 'output/verification/service-share');
  fs.mkdirSync(folder, {recursive: true});
  fs.writeFileSync(path.join(folder, 'candidates.json'), JSON.stringify(data, null, 2) + '\n');
  console.log(JSON.stringify({candidates: data.photos.length, institutions: data.organizations.length,
    knownPublicationDates: data.photos.filter(p => p.publishedDate).length, target: 'output/verification/service-share/candidates.json'}));
}
module.exports = {collectServiceShareCandidates, normalizedURL, validDay, validTimestamp};
