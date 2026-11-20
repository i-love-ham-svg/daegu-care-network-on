import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setImmediate as tick } from 'node:timers/promises';
import { handleDaeguShare } from './daegu-share.mjs';

const SQL = readFileSync(new URL('./daegu-share.sql', import.meta.url), 'utf8');
const ORIGIN = 'https://renewal.oconia.co.kr';
const MAIN = 'https://daegu-care.oconia.co.kr';
const API = `${ORIGIN}/api/daegu-care/service-shares`;
const BASE = `${ORIGIN}/share/daegu-care/`;
const STATUS = `${ORIGIN}/api/daegu-care/service-share-status`;
const OWNERS = ['daegu-dounuri', 'woorihamkke', 'with-medical',
  'welfare-design', 'daegu-care', 'naeiln', 'modoo-happy'];

// Uses real SQLite transactions and the production migration/triggers. The async
// boundary lets concurrent HTTP handlers interleave reads before their batches.
class D1SQLite {
  constructor(sql = SQL) {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys = ON');
    this.sqlite.exec('CREATE TABLE national_counter (id INTEGER PRIMARY KEY, count INTEGER); INSERT INTO national_counter VALUES (1, 271);');
    this.sqlite.exec(sql);
  }
  prepare(sql) {
    const db = this;
    return {
      sql, values: [],
      bind(...values) { return { ...this, values }; },
      async first(column) {
        await tick();
        const row = db.sqlite.prepare(this.sql).get(...this.values) ?? null;
        return column && row ? row[column] : row;
      },
      async all() {
        await tick();
        return { success: true, results: db.sqlite.prepare(this.sql).all(...this.values) };
      },
      async run() {
        await tick();
        const meta = db.sqlite.prepare(this.sql).run(...this.values);
        return { success: true, results: [], meta };
      },
    };
  }
  async batch(statements) {
    await tick();
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map(statement => ({ success: true,
        results: this.sqlite.prepare(statement.sql).all(...statement.values) }));
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
  count() { return this.sqlite.prepare('SELECT COUNT(*) AS n FROM daegu_share_events').get().n; }
  expireFeed() { this.sqlite.exec('UPDATE daegu_share_state SET feed_checked_at_ms = 0, refresh_lease_until_ms = NULL'); }
  close() { this.sqlite.close(); }
}

function catalog(size = 12) {
  const photos = Array.from({ length: size }, (_, index) => {
    const id = createHash('sha256').update(`real-pixels-${index}`).digest('hex');
    const stamp = Date.UTC(2026, 10, 20) - index * 86_400_000;
    return { id, owner: OWNERS[index % OWNERS.length],
      poster: `${MAIN}/media/service-share/${id.slice(0, 16)}-render20.jpg`,
      updatedAt: null, freshnessTimestamp: stamp, freshnessDate: new Date(stamp).toISOString(),
      caption: `기관의 실제 활동 ${index}`, credit: `기관 출처 ${index}`,
      source: `https://example.org/article/${index}` };
  });
  return { version: 1, batchSize: 10, latestLimit: 10,
    title: '대구 통합돌봄네트워크 ON',
    description: '돌봄기관과 이웃을 잇고, 함께하는 일상을 만듭니다',
    canonicalURL: `${MAIN}/`, photos, latest: photos.slice(0, 10).map(photo => photo.id) };
}

function fixture(t, feed = catalog()) {
  const DB = new D1SQLite();
  let currentFeed = feed;
  let calls = 0;
  let unavailable = false;
  const env = { DB, photoFetcher: async (url, options) => {
    calls += 1;
    assert.ok([`${MAIN}/service-share-catalog.json`, 'https://raw.githubusercontent.com/i-love-ham-svg/daegu-care-network-on/main/docs/service-share-catalog.json'].includes(url));
    assert.equal(options.redirect, 'manual');
    if (unavailable) throw new Error('offline');
    return Response.json(currentFeed, { headers: { ETag: 'fixture-feed' } });
  } };
  t.after(() => DB.close());
  return { DB, env, get calls() { return calls; },
    feed(next) { currentFeed = next; DB.expireFeed(); },
    offline() { unavailable = true; DB.expireFeed(); } };
}

function post(token = randomUUID(), origin = MAIN, extra = {}) {
  return new Request(API, { method: 'POST', headers: { Origin: origin,
    'Content-Type': 'application/json', ...extra }, body: JSON.stringify({ token }) });
}
async function allocate(env, token = randomUUID()) {
  const response = await handleDaeguShare(post(token), env);
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}
async function httpShare(env, method, token) {
  const response = await handleDaeguShare(new Request(`${BASE}${token}/`, { method }), env);
  assert.equal(response.status, 200, await response.clone().text());
  return response;
}

test('migration is namespaced, rerunnable, and preserves the existing national counter', () => {
  const db = new D1SQLite();
  try {
    db.sqlite.exec(SQL);
    assert.equal(db.sqlite.prepare('SELECT count FROM national_counter WHERE id=1').get().count, 271);
    const objects = db.sqlite.prepare("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all();
    assert.ok(objects.every(({ name }) => name === 'national_counter' || name.startsWith('daegu_share_')));
  } finally { db.close(); }
});

test('first 10 allocations use A; 11th uses B; duplicate POST consumes no sequence', async t => {
  const f = fixture(t);
  const first = await allocate(f.env);
  assert.equal(first.sequence, 1);
  assert.equal(first.countDefinition, 'unique-representative-links-allocated');
  for (let sequence = 2; sequence <= 10; sequence++) {
    const row = await allocate(f.env);
    assert.equal(row.sequence, sequence);
    assert.equal(row.photo.id, first.photo.id);
    assert.equal(row.batchIndex, 0);
  }
  for (let index = 0; index < 15; index++) {
    const duplicate = await allocate(f.env, first.token.toUpperCase());
    assert.equal(duplicate.sequence, 1);
    assert.equal(duplicate.poster, first.poster);
  }
  const next = await allocate(f.env);
  assert.equal(next.sequence, 11);
  assert.equal(next.batchIndex, 1);
  assert.notEqual(next.photo.id, first.photo.id);
  assert.equal(f.DB.count(), 11);
  assert.equal(f.calls, 1);
});

test('100 simultaneous mixed GET/HEAD/POST for one UUID allocate exactly once, no gaps', async t => {
  const f = fixture(t);
  const token = randomUUID();
  await Promise.all(Array.from({ length: 100 }, (_, index) =>
    index % 3 === 0 ? allocate(f.env, token) : httpShare(f.env, index % 3 === 1 ? 'GET' : 'HEAD', token)));
  assert.equal(f.DB.count(), 1);
  const row = await allocate(f.env, token);
  assert.equal(row.sequence, 1);
  assert.ok(row.poster);
  const next = await allocate(f.env);
  assert.equal(next.sequence, 2);
  assert.equal(next.poster, row.poster);
  assert.equal(f.calls, 1);
});

test('100 simultaneous distinct mixed requests form exactly ten coherent batches', async t => {
  const f = fixture(t);
  await Promise.all(Array.from({ length: 100 }, (_, index) => {
    const token = randomUUID();
    return index % 3 === 0 ? allocate(f.env, token) : httpShare(f.env, index % 3 === 1 ? 'GET' : 'HEAD', token);
  }));
  const rows = f.DB.sqlite.prepare('SELECT * FROM daegu_share_events ORDER BY sequence').all();
  assert.equal(rows.length, 100);
  rows.forEach((row, index) => {
    assert.equal(row.sequence, index + 1);
    assert.equal(row.batch_index, Math.floor(index / 10));
    assert.equal(row.photo_id, rows[Math.floor(index / 10) * 10].photo_id);
    assert.ok(row.poster);
  });
  const batches = f.DB.sqlite.prepare('SELECT photo_id FROM daegu_share_batches ORDER BY batch_index').all();
  assert.equal(batches.length, 10);
  assert.equal(new Set(batches.map(row => row.photo_id)).size, 10);
});

test('latest ten never-used first, then unused archive and LRU; no adjacent repeats', async t => {
  const feed = catalog(12), f = fixture(t, feed);
  for (let index = 0; index < 141; index++) await allocate(f.env);
  const batches = f.DB.sqlite.prepare('SELECT photo_id FROM daegu_share_batches ORDER BY batch_index').all().map(row => row.photo_id);
  assert.deepEqual(batches.slice(0, 12), feed.photos.map(photo => photo.id));
  assert.equal(batches[12], batches[0]);
  assert.equal(batches[13], batches[1]);
  assert.equal(batches[14], batches[2]);
  assert.ok(batches.every((photo, index) => index === 0 || photo !== batches[index - 1]));
});

test('new latest photo takes the next boundary, current batch and old token stay immutable', async t => {
  const feed = catalog(3), f = fixture(t, feed);
  const old = await allocate(f.env);
  for (let index = 0; index < 4; index++) await allocate(f.env);
  const replacement = structuredClone(feed);
  replacement.photos[0].poster = `${MAIN}/media/service-share/same-pixels-new-render.jpg`;
  const fresh = { ...feed.photos[1], id: 'f'.repeat(64), owner: 'welfare-design',
    poster: `${MAIN}/media/service-share/new-real-photo.jpg`, updatedAt: null,
    freshnessTimestamp: Date.UTC(2026, 10, 21) };
  replacement.photos.push(fresh);
  replacement.latest.unshift(fresh.id);
  f.feed(replacement);
  for (let sequence = 6; sequence <= 10; sequence++) {
    const row = await allocate(f.env);
    assert.equal(row.sequence, sequence);
    assert.equal(row.poster, old.poster);
  }
  const next = await allocate(f.env);
  assert.equal(next.sequence, 11);
  assert.equal(next.photo.id, fresh.id);
  assert.equal(next.photo.updatedAt, null);
  assert.equal((await allocate(f.env, old.token)).poster, old.poster);
  const landing = await httpShare(f.env, 'GET', old.token);
  const html = await landing.text();
  assert.ok(html.includes(`property="og:image" content="${old.poster}"`));
  assert.ok(html.includes(`property="og:title" content="${old.title}"`));
  assert.ok(html.includes(`property="og:url" content="${old.shareURL}"`));
  assert.ok(html.includes('location.replace("https://daegu-care.oconia.co.kr/")'));
  assert.ok(html.includes('대구 통합돌봄 ON 열기'));
});

test('duplicate pixel IDs are one registry slot and one candidate', async t => {
  const feed = catalog(2);
  feed.photos.push({ ...feed.photos[0], poster: `${MAIN}/media/service-share/duplicate-alias.jpg` });
  feed.latest.push(feed.photos[0].id);
  const f = fixture(t, feed);
  for (let index = 0; index < 31; index++) await allocate(f.env);
  assert.equal(f.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM daegu_share_photos').get().n, 2);
  const ids = f.DB.sqlite.prepare('SELECT photo_id FROM daegu_share_batches ORDER BY batch_index').all().map(row => row.photo_id);
  assert.deepEqual(ids, [feed.photos[0].id, feed.photos[1].id, feed.photos[0].id, feed.photos[1].id]);
});

test('one-photo catalog can repeat without aborting the next batch', async t => {
  const f = fixture(t, catalog(1));
  const one = await allocate(f.env);
  for (let index = 0; index < 10; index++) assert.equal((await allocate(f.env)).poster, one.poster);
  assert.equal(f.DB.count(), 11);
});

test('removed photo remains registered and old token works, but future batches exclude it', async t => {
  const feed = catalog(3), f = fixture(t, feed);
  const first = await allocate(f.env);
  const changed = structuredClone(feed);
  changed.photos.shift(); changed.latest.shift();
  f.feed(changed);
  for (let index = 0; index < 30; index++) await allocate(f.env);
  const batches = f.DB.sqlite.prepare('SELECT photo_id FROM daegu_share_batches WHERE batch_index > 0').all();
  assert.ok(batches.every(row => row.photo_id !== first.photo.id));
  assert.equal(f.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM daegu_share_photos').get().n, 3);
  assert.equal((await allocate(f.env, first.token)).poster, first.poster);
});

test('feed failure keeps last-good photos and metadata; initial failure consumes nothing', async t => {
  const f = fixture(t);
  const first = await allocate(f.env);
  f.offline();
  const second = await allocate(f.env);
  assert.equal(second.poster, first.poster);
  const response = await handleDaeguShare(new Request(STATUS), f.env);
  assert.equal(response.status, 200);
  const info = await response.json();
  assert.equal(info.feed.state, 'stale');
  assert.equal(info.count, 2);
  assert.equal(info.photos.active, 12);
  const empty = fixture(t);
  empty.offline();
  for (const method of ['GET', 'HEAD']) {
    const fail = await handleDaeguShare(new Request(`${BASE}${randomUUID()}/`, { method }), empty.env);
    assert.equal(fail.status, 503);
  }
  assert.equal((await handleDaeguShare(post(), empty.env)).status, 503);
  assert.equal(empty.DB.count(), 0);
});

test('status and UUID-free preview are nonallocating and predict the next poster', async t => {
  const f = fixture(t);
  const statusResponse = await handleDaeguShare(new Request(STATUS, { headers: { Origin: MAIN } }), f.env);
  assert.equal(statusResponse.status, 200);
  const info = await statusResponse.json();
  assert.equal(info.count, 0);
  assert.equal(info.currentBatch, null);
  assert.equal(info.latest.length, 10);
  const preview = await handleDaeguShare(new Request(BASE), f.env);
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get('Cache-Control'), 'no-store');
  const html = await preview.text();
  const previewHead = await handleDaeguShare(new Request(BASE, { method: 'HEAD' }), f.env);
  assert.equal(previewHead.status, 200);
  assert.equal(await previewHead.text(), '');
  assert.equal(f.DB.count(), 0);
  assert.equal(f.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM daegu_share_batches').get().n, 0);
  const first = await allocate(f.env);
  assert.ok(html.includes(`property="og:image" content="${first.poster}"`));
  for (let index = 0; index < 9; index++) await allocate(f.env);
  const nextPreview = await handleDaeguShare(new Request(BASE), f.env);
  const nextHTML = await nextPreview.text();
  assert.equal(f.DB.count(), 10);
  const next = await allocate(f.env);
  assert.ok(nextHTML.includes(`property="og:image" content="${next.poster}"`));
  assert.notEqual(next.poster, first.poster);
});

test('GET/HEAD first creates one stable card, scraper retries and POST preserve it', async t => {
  const f = fixture(t), token = randomUUID();
  const head = await httpShare(f.env, 'HEAD', token);
  assert.equal(await head.text(), '');
  assert.equal(f.DB.count(), 1);
  const firstHTML = await (await httpShare(f.env, 'GET', token)).text();
  const card = await allocate(f.env, token);
  assert.equal(card.sequence, 1);
  for (let index = 0; index < 10; index++) {
    const html = await (await httpShare(f.env, 'GET', token)).text();
    assert.equal(html, firstHTML);
  }
  assert.equal(f.DB.count(), 1);
});

test('module re-import reads old token snapshots from storage with the network unavailable', async t => {
  const f = fixture(t), original = await allocate(f.env);
  const restarted = await import(`./daegu-share.mjs?restart=${randomUUID()}`);
  const env = { DB: f.DB, photoFetcher: () => { throw new Error('no network after restart'); } };
  const response = await restarted.handleDaeguShare(new Request(`${BASE}${original.token}/`), env);
  assert.equal(response.status, 200);
  assert.ok((await response.text()).includes(`property="og:image" content="${original.poster}"`));
  const replay = await restarted.handleDaeguShare(post(original.token), env);
  assert.equal((await replay.json()).sequence, 1);
  assert.equal(f.DB.count(), 1);
});

test('strict CORS, UUIDv4 and payload validation; unrelated routes untouched', async t => {
  const f = fixture(t);
  assert.equal(await handleDaeguShare(new Request(`${ORIGIN}/api/existing-counter`), f.env), null);
  assert.equal((await handleDaeguShare(post(randomUUID(), 'https://evil.example'), f.env)).status, 403);
  const preflight = await handleDaeguShare(new Request(API, { method: 'OPTIONS', headers: { Origin: MAIN } }), f.env);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), MAIN);
  assert.equal(preflight.headers.has('Access-Control-Allow-Credentials'), false);
  assert.equal((await handleDaeguShare(new Request(API, { method: 'OPTIONS', headers: { Origin: 'null' } }), f.env)).status, 403);
  assert.equal((await handleDaeguShare(post('not-a-uuid'), f.env)).status, 400);
  assert.equal((await handleDaeguShare(post('00000000-0000-1000-8000-000000000000'), f.env)).status, 400);
  assert.equal((await handleDaeguShare(new Request(API, { method: 'POST', body: '{bad' }), f.env)).status, 415);
  assert.equal((await handleDaeguShare(new Request(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' }), f.env)).status, 400);
  assert.equal((await handleDaeguShare(new Request(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({token: 'x'.repeat(1500)}) }), f.env)).status, 413);
  assert.equal((await handleDaeguShare(new Request(`${BASE}invalid/`), f.env)).status, 404);
  assert.equal(f.DB.count(), 0);
  const sameHost = await handleDaeguShare(post(randomUUID(), ORIGIN), f.env);
  assert.equal(sameHost.status, 200);
  assert.equal(sameHost.headers.get('Access-Control-Allow-Origin'), ORIGIN);
});

test('malformed/foreign catalog is rejected atomically, last-good registry survives', async t => {
  const feed = catalog(2), f = fixture(t, feed);
  const first = await allocate(f.env);
  const invalid = structuredClone(feed);
  invalid.photos[0].poster = 'https://evil.example/stolen.jpg';
  f.feed(invalid);
  const row = await allocate(f.env);
  assert.equal(row.poster, first.poster);
  assert.equal(f.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM daegu_share_photos WHERE active=1').get().n, 2);
  const before = f.DB.count();
  await handleDaeguShare(new Request(BASE), f.env);
  assert.equal(f.DB.count(), before);
});

test('HTML escapes content while retaining service headline and real photo alt', async t => {
  const feed = catalog(1);
  feed.title = '대구 통합돌봄네트워크 ON <연결>';
  feed.description = '돌봄기관과 이웃을 잇는 서비스입니다. <script>alert(1)</script>';
  feed.photos[0].caption = '기관 활동 "실제 사례" <사진>';
  const f = fixture(t, feed), card = await allocate(f.env);
  const html = await (await httpShare(f.env, 'GET', card.token)).text();
  assert.ok(html.includes('대구 통합돌봄네트워크 ON &lt;연결&gt;'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('기관 활동 &quot;실제 사례&quot; &lt;사진&gt;'));
});

test('actual published feed accepts null update dates and poster filenames independent of full SHA', async t => {
  const actual = JSON.parse(readFileSync(new URL('../docs/service-share-catalog.json', import.meta.url), 'utf8'));
  const f = fixture(t, actual);
  const row = await allocate(f.env);
  const latest = actual.photos.filter(photo => actual.latest.includes(photo.id))
    .sort((a, b) => b.freshnessTimestamp - a.freshnessTimestamp || a.id.localeCompare(b.id));
  assert.equal(row.photo.id, latest[0].id);
  assert.equal(row.photo.updatedAt, latest[0].updatedAt);
  assert.equal(f.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM daegu_share_photos WHERE active=1').get().n,
    new Set(actual.photos.map(photo => photo.id)).size);
});

 test('each immutable share card has its own canonical identity while opening the main service', async t => {
  const f = fixture(t), row = await allocate(f.env);
  const response = await handleDaeguShare(new Request(row.shareURL), f.env), html = await response.text();
  assert.ok(html.includes('<link rel="canonical" href="'+row.shareURL+'">'));
  assert.ok(html.includes('property="og:url" content="'+row.shareURL+'"'));
  assert.ok(html.includes('location.replace('+JSON.stringify(row.canonicalURL)+')'));
});

test('compressed feed bytes are safely decoded without double decoding plain JSON', async t => {
  const f = fixture(t), feed = catalog();
  const { gzipSync } = await import('node:zlib');
  f.env.photoFetcher = async (url, options) => {
    assert.equal(options.headers['Accept-Encoding'], 'identity');
    return new Response(gzipSync(JSON.stringify(feed)), {headers:{'Content-Encoding':'gzip'}});
  };
  const row = await allocate(f.env);
  assert.equal(row.sequence,1);assert.equal(f.DB.count(),1);
});

test('the same verified public catalog is available from the fixed source repository backup', async t => {
  const f = fixture(t), seen=[];
  f.env.photoFetcher = async url => {seen.push(url);if(url.startsWith(MAIN))throw Error('temporary custom-domain failure');return Response.json(catalog());};
  const row = await allocate(f.env);assert.equal(row.sequence,1);
  assert.equal(seen.length,2);assert.ok(seen[1].startsWith('https://raw.githubusercontent.com/i-love-ham-svg/daegu-care-network-on/'));
});

test('document-backed photos remain usable with legacy mandatory-source columns without inventing a URL', async t => {
  const actual=JSON.parse(readFileSync(new URL('../docs/service-share-catalog.json',import.meta.url),'utf8'));
  const docs=actual.photos.filter(p=>p.source==null&&p.sourceDocument);assert.ok(docs.length>1);
  const legacy=SQL.replace('source TEXT,\n  active INTEGER','source TEXT NOT NULL,\n  active INTEGER').replace('source TEXT,\n  created_at_ms','source TEXT NOT NULL,\n  created_at_ms');
  assert.notEqual(legacy,SQL);const db=new D1SQLite(legacy);t.after(()=>db.close());
  const env={DB:db,photoFetcher:async()=>Response.json({...actual,photos:docs,latest:docs.map(p=>p.id)})};
  const first=await allocate(env);assert.equal(first.photo.source,null);
  for(let i=0;i<9;i++)await allocate(env);const next=await allocate(env);
  assert.equal(next.sequence,11);assert.notEqual(next.photo.id,first.photo.id);assert.equal(next.photo.source,null);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM daegu_share_photos WHERE source=''").get().n,docs.length);
});

test('edge-supported manual redirects reject foreign redirects and use only the fixed backup', async t => {
 const f=fixture(t),seen=[];
 f.env.photoFetcher=async (url,options)=>{assert.equal(options.redirect,'manual');seen.push(url);if(url.startsWith(MAIN))return new Response(null,{status:302,headers:{Location:'https://untrusted.invalid/catalog'}});return Response.json(catalog());};
 const row=await allocate(f.env);assert.equal(row.sequence,1);assert.equal(seen.length,2);assert.ok(!seen.some(url=>url.includes('untrusted.invalid')));
});
