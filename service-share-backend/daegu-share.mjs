// Dedicated namespace; importing this module has no side effects or Node imports.
const CANONICAL = 'https://daegu-care.oconia.co.kr/';
const FEED_URL = `${CANONICAL}service-share-catalog.json`;
const FEED_BACKUP = 'https://raw.githubusercontent.com/i-love-ham-svg/daegu-care-network-on/main/docs/service-share-catalog.json';
const CREATE_PATH = '/api/daegu-care/service-shares';
const STATUS_PATH = '/api/daegu-care/service-share-status';
const SHARE_PREFIX = '/share/daegu-care/';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHOTO_ID = /^[0-9a-f]{64}$/i;
const REFRESH_MS = 60_000;
const MAX_FEED_BYTES = 1_048_576;
const COUNT_DEFINITION = 'unique-representative-links-allocated';
const OWNERS = new Set(['daegu-dounuri', 'woorihamkke', 'with-medical',
  'welfare-design', 'daegu-care', 'naeiln', 'modoo-happy']);
const inFlight = new WeakMap();

const STATE_SQL = 'SELECT * FROM daegu_share_state WHERE id = 1';
const EVENT_SQL = `SELECT e.*, (SELECT COUNT(*) FROM daegu_share_events) AS total_count
  FROM daegu_share_events e WHERE e.token = ?`;
// One read snapshot predicts the next allocation without inserting an event/batch.
const PREVIEW_SQL = `WITH next AS (
  SELECT CAST(COUNT(*) / 10 AS INTEGER) AS batch_index, COUNT(*) AS total_count
  FROM daegu_share_events
), candidates AS (
  SELECT b.photo_id, b.owner, b.poster, b.updated_at, b.caption, b.credit, b.source,
    -1 AS priority, 0 AS freshness_ms, -1 AS last_used
  FROM daegu_share_batches b, next n WHERE b.batch_index = n.batch_index
  UNION ALL
  SELECT p.id, p.owner, p.poster, p.updated_at, p.caption, p.credit, p.source,
    CASE WHEN p.is_latest = 1 AND p.last_used_batch IS NULL THEN 0 ELSE 1 END,
    p.freshness_ms, COALESCE(p.last_used_batch, -1)
  FROM daegu_share_photos p, next n
  WHERE p.active = 1
    AND NOT EXISTS (SELECT 1 FROM daegu_share_batches WHERE batch_index = n.batch_index)
    AND ((SELECT COUNT(*) FROM daegu_share_photos WHERE active = 1) <= 1
      OR p.id <> COALESCE((SELECT photo_id FROM daegu_share_batches
        WHERE batch_index = n.batch_index - 1), ''))
)
SELECT c.*, s.title, s.description, s.canonical_url, n.batch_index, n.total_count,
  n.total_count + 1 AS sequence, '' AS token
FROM candidates c, daegu_share_state s, next n WHERE s.id = 1
ORDER BY c.priority ASC, CASE WHEN c.priority = 0 THEN c.freshness_ms END DESC,
  c.last_used ASC, c.freshness_ms DESC, c.photo_id ASC LIMIT 1`;

function cors(request) {
  const origin = request.headers.get('Origin');
  const sameOrigin = new URL(request.url).origin;
  if (origin && origin !== new URL(CANONICAL).origin && origin !== sameOrigin) return null;
  const headers = new Headers({
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

function json(data, status, headers = new Headers()) {
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(data), { status, headers });
}

function text(value, name, max, min = 1) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) {
    throw new Error(`invalid_${name}`);
  }
  return value.trim();
}

function publicURL(value, name, poster = false) {
  const url = new URL(text(value, name, 2048));
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error(`invalid_${name}`);
  }
  if (poster && (url.origin !== new URL(CANONICAL).origin ||
      !/\.jpe?g$/i.test(url.pathname) || url.hash)) throw new Error('invalid_poster');
  return url.href;
}

function validateFeed(feed) {
  if (!feed || feed.version !== 1 || feed.batchSize !== 10 || feed.latestLimit !== 10 ||
      feed.canonicalURL !== CANONICAL || !Array.isArray(feed.photos) ||
      !feed.photos.length || feed.photos.length > 1000 || !Array.isArray(feed.latest) ||
      feed.latest.length > 10) throw new Error('invalid_feed');
  const title = text(feed.title, 'title', 160);
  if (!title.includes('대구') || !title.includes('돌봄')) throw new Error('invalid_service_title');
  const description = text(feed.description, 'description', 600, 10);
  const photos = new Map();
  for (const item of feed.photos) {
    if (!item || !PHOTO_ID.test(item.id) || !OWNERS.has(item.owner)) throw new Error('invalid_photo');
    const id = item.id.toLowerCase();
    let updatedAt = null;
    if (item.updatedAt != null) {
      const stamp = Date.parse(item.updatedAt);
      if (typeof item.updatedAt !== 'string' || !Number.isFinite(stamp)) throw new Error('invalid_photo_date');
      updatedAt = new Date(stamp).toISOString();
    }
    let freshnessMs = updatedAt ? Date.parse(updatedAt) : 0;
    if (item.freshnessTimestamp != null) {
      if (!Number.isSafeInteger(item.freshnessTimestamp) || item.freshnessTimestamp < 0 ||
          item.freshnessTimestamp > 8_640_000_000_000_000) throw new Error('invalid_freshness');
      freshnessMs = item.freshnessTimestamp;
    } else {
      for (const value of [item.updatedAt, item.ingestedAt, item.freshnessDate, item.publishedDate]) {
        if (typeof value !== 'string') continue;
        if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) || !Number.isFinite(Date.parse(value))) {
          throw new Error('invalid_freshness_date');
        }
        freshnessMs = Date.parse(value);
        break;
      }
    }
    const photo = {
      id, owner: item.owner, poster: publicURL(item.poster, 'poster', true), updatedAt,
      freshnessMs,
      caption: text(item.caption, 'caption', 600),
      credit: text(item.credit, 'credit', 400),
      // Document-backed archive records truthfully have no original webpage URL.
      source: item.source == null && item.exactOwnershipConfirmed === true &&
        typeof item.sourceDocument === 'string' && item.sourceDocument.trim().length > 0
        ? null : publicURL(item.source, 'source'),
    };
    // Pixel SHA is the identity: alternate paths for the same pixels add no slot.
    if (!photos.has(id)) photos.set(id, photo);
  }
  const latest = new Set();
  for (const id of feed.latest) {
    if (typeof id !== 'string' || !PHOTO_ID.test(id) || !photos.has(id.toLowerCase())) {
      throw new Error('invalid_latest');
    }
    latest.add(id.toLowerCase());
  }
  return { title, description, photos: [...photos.values()], latest };
}

async function limitedBody(body, maximum, tooLarge, asBytes = false) {
  const reader = body?.getReader();
  if (!reader) throw new Error('empty_body');
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new Error(tooLarge);
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return asBytes ? bytes : new TextDecoder().decode(bytes);
}

async function limitedJSON(response) {
  if (!response.ok) throw new Error('feed_http');
  if (Number(response.headers.get('Content-Length')) > MAX_FEED_BYTES) throw new Error('feed_too_large');
  const bytes = await limitedBody(response.body, MAX_FEED_BYTES, 'feed_too_large', true);
  // Worker streaming responses may preserve compressed bytes. Detect the actual
  // gzip signature rather than trusting a header left on already decoded data.
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await limitedBody(stream, MAX_FEED_BYTES, 'feed_too_large'));
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function refreshCatalog(db, env) {
  const now = Date.now();
  let state = await db.prepare(STATE_SQL).first();
  if (!state) {
    // Data initialization belongs in runtime CRUD, never in the schema migration.
    await db.prepare('INSERT INTO daegu_share_state (id) VALUES (1) ON CONFLICT(id) DO NOTHING').run();
    state = await db.prepare(STATE_SQL).first();
  }
  if (!state) throw new Error('schema_unavailable');
  if (state.feed_checked_at_ms != null && now - state.feed_checked_at_ms < REFRESH_MS) return state;
  // Persistent lease also bounds refresh traffic across Worker isolates.
  const lease = await db.prepare(`UPDATE daegu_share_state
    SET feed_checked_at_ms = ?, refresh_lease_until_ms = ?
    WHERE id = 1 AND (feed_checked_at_ms IS NULL OR feed_checked_at_ms <= ?)
      AND (refresh_lease_until_ms IS NULL OR refresh_lease_until_ms <= ?)
    RETURNING id`).bind(now, now + 15_000, now - REFRESH_MS, now).first();
  if (!lease) return db.prepare(STATE_SQL).first();
  let stage = 'fetch';
  try {
    let response, feed, lastError;
    for (const source of [FEED_URL, FEED_BACKUP]) {
      try {
        response = await (env.photoFetcher || fetch)(source, {
          method: 'GET', headers: { Accept: 'application/json', 'Accept-Encoding': 'identity' },
          redirect: 'manual', signal: AbortSignal.timeout(8_000),
        });
        feed = validateFeed(await limitedJSON(response));
        break;
      } catch (error) {
        lastError = error;
        console.warn('daegu-share-feed-source', new URL(source).hostname, String(error?.message || error).slice(0,180));
      }
    }
    if (!feed) throw lastError || new Error('catalog_unavailable');
    stage = 'registry';
    const statements = [db.prepare('UPDATE daegu_share_photos SET active = 0, is_latest = 0')];
    for (const photo of feed.photos) {
      statements.push(db.prepare(`INSERT INTO daegu_share_photos
        (id, owner, poster, updated_at, freshness_ms, caption, credit, source,
          active, is_latest, first_seen_at_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET owner = excluded.owner, poster = excluded.poster,
          updated_at = excluded.updated_at, freshness_ms = excluded.freshness_ms,
          caption = excluded.caption, credit = excluded.credit, source = excluded.source,
          active = 1, is_latest = excluded.is_latest`).bind(photo.id, photo.owner, photo.poster,
        photo.updatedAt, photo.freshnessMs, photo.caption, photo.credit, photo.source || '',
        feed.latest.has(photo.id) ? 1 : 0, now));
    }
    statements.push(db.prepare(`UPDATE daegu_share_state SET title = ?, description = ?,
      canonical_url = ?, feed_fetched_at_ms = ?, refresh_lease_until_ms = NULL,
      feed_error = NULL, feed_etag = ?, active_photo_count = ? WHERE id = 1`)
      .bind(feed.title, feed.description, CANONICAL, now, response.headers.get('ETag'), feed.photos.length));
    await db.batch(statements);
  } catch (error) {
    console.error('daegu-share-feed-refresh', stage, String(error?.message || error).slice(0,180));
    // Do not clear the last verified registry or touch previously assigned posters.
    await db.prepare(`UPDATE daegu_share_state SET refresh_lease_until_ms = NULL,
      feed_error = 'catalog_refresh_failed' WHERE id = 1`).run();
  }
  return db.prepare(STATE_SQL).first();
}

async function ensureCatalog(db, env) {
  if (inFlight.has(db)) return inFlight.get(db);
  const pending = refreshCatalog(db, env);
  inFlight.set(db, pending);
  try { return await pending; } finally { inFlight.delete(db); }
}

function photo(row) {
  return { id: row.photo_id ?? row.id, owner: row.owner, poster: row.poster,
    updatedAt: row.updated_at, caption: row.caption, credit: row.credit, source: row.source || null };
}

function allocation(row, request) {
  return {
    version: 1, token: row.token,
    shareURL: `${new URL(request.url).origin}${SHARE_PREFIX}${row.token ? `${row.token}/` : ''}`,
    title: row.title, description: row.description, canonicalURL: row.canonical_url,
    poster: row.poster, photo: photo(row), sequence: row.sequence,
    batchIndex: row.batch_index, batchNumber: row.batch_index + 1, batchSize: 10,
    count: row.total_count, countDefinition: COUNT_DEFINITION,
  };
}

async function create(request, env, headers) {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, headers);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) {
    return json({ error: 'json_required' }, 415, headers);
  }
  if (Number(request.headers.get('Content-Length')) > 1024) return json({ error: 'payload_too_large' }, 413, headers);
  let body;
  try {
    const raw = await limitedBody(request.body, 1024, 'payload_too_large');
    body = JSON.parse(raw);
  } catch (error) {
    return json({ error: error.message === 'payload_too_large' ? 'payload_too_large' : 'invalid_json' },
      error.message === 'payload_too_large' ? 413 : 400, headers);
  }
  if (!body || typeof body.token !== 'string' || !UUID.test(body.token)) {
    return json({ error: 'uuid_v4_required' }, 400, headers);
  }
  const token = body.token.toLowerCase();
  const row = await getOrAllocate(token, env);
  if (!row) return json({ error: 'catalog_unavailable', retryAfter: 60 }, 503, headers);
  return json(allocation(row, request), 200, headers);
}

async function getOrAllocate(token, env) {
  const existing = await env.DB.prepare(EVENT_SQL).bind(token).first();
  if (existing) return existing;
  const state = await ensureCatalog(env.DB, env);
  if (!state?.active_photo_count) return null;
  // SELECT after the INSERT sees AFTER-trigger assignments. RETURNING does not.
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO daegu_share_events
      (token, title, description, canonical_url, created_at_ms)
      SELECT ?, title, description, canonical_url, ? FROM daegu_share_state WHERE id = 1
      ON CONFLICT(token) DO UPDATE SET token = excluded.token`).bind(token, Date.now()),
    env.DB.prepare(EVENT_SQL).bind(token),
  ]);
  const row = results[1]?.results?.[0];
  if (!row?.poster || row.batch_index == null) throw new Error('allocation_unavailable');
  return row;
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, character =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function landing(row, request, preview = false) {
  const data = allocation(row, request);
  const e = escapeHTML;
  // The service value is the headline; the photograph's article title is never substituted.
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(data.title)}</title><meta name="description" content="${e(data.description)}">
<link rel="canonical" href="${e(data.shareURL)}">
<meta property="og:type" content="website"><meta property="og:locale" content="ko_KR">
<meta property="og:site_name" content="대구 통합돌봄네트워크 ON">
<meta property="og:title" content="${e(data.title)}"><meta property="og:description" content="${e(data.description)}">
<meta property="og:url" content="${e(data.shareURL)}"><meta property="og:image" content="${e(data.poster)}">
<meta property="og:image:secure_url" content="${e(data.poster)}"><meta property="og:image:type" content="image/jpeg">
<meta property="og:image:alt" content="${e(row.caption)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${e(data.title)}">
<meta name="twitter:description" content="${e(data.description)}"><meta name="twitter:image" content="${e(data.poster)}">
<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:40px auto;padding:24px;color:#123}img{width:100%;height:auto;border-radius:16px}a{display:inline-block;background:#0560da;color:white;padding:16px 24px;border-radius:12px;text-decoration:none}small{display:block;margin:16px 0;color:#567}</style>
</head><body><main><h1>${e(data.title)}</h1><p>${e(data.description)}</p>
<img src="${e(data.poster)}" alt="${e(row.caption)}"><small>${e(row.credit)}</small>
<a href="${e(data.canonicalURL)}">대구 통합돌봄 ON 열기</a></main>
<script>location.replace(${JSON.stringify(data.canonicalURL)});</script></body></html>`;
  return new Response(request.method === 'HEAD' ? null : html, { status: 200, headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': preview ? 'no-store' : 'public, max-age=86400, immutable',
    'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, follow',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'none'; img-src https://daegu-care.oconia.co.kr; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
  } });
}

async function status(request, env, headers) {
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, headers);
  const state = await ensureCatalog(env.DB, env);
  const rows = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) AS count FROM daegu_share_events'),
    env.DB.prepare('SELECT * FROM daegu_share_batches ORDER BY batch_index DESC LIMIT 1'),
    env.DB.prepare(`SELECT * FROM daegu_share_photos WHERE active = 1 AND is_latest = 1
      ORDER BY freshness_ms DESC, id ASC LIMIT 10`),
    env.DB.prepare('SELECT COUNT(*) AS registered FROM daegu_share_photos'),
  ]);
  const batch = rows[1]?.results?.[0];
  const count = rows[0]?.results?.[0]?.count ?? 0;
  return json({ version: 1, count, countDefinition: COUNT_DEFINITION, batchSize: 10,
    currentBatch: batch ? { index: batch.batch_index, number: batch.batch_index + 1,
      photo: photo(batch), nextSwitchAt: (batch.batch_index + 1) * 10 + 1 } : null,
    latest: (rows[2]?.results || []).map(photo),
    photos: { active: state.active_photo_count, registered: rows[3]?.results?.[0]?.registered ?? 0 },
    feed: { url: FEED_URL, state: !state.active_photo_count ? 'unavailable' : state.feed_error ? 'stale' : 'ready',
      lastCheckedAt: state.feed_checked_at_ms ? new Date(state.feed_checked_at_ms).toISOString() : null,
      lastSuccessfulAt: state.feed_fetched_at_ms ? new Date(state.feed_fetched_at_ms).toISOString() : null,
      error: state.feed_error, refreshIntervalSeconds: 60 },
  }, state.active_photo_count ? 200 : 503, headers);
}

/** Return null for every existing site's unrelated route. Requires migrated env.DB. */
async function routeDaeguShare(request, env) {
  const path = new URL(request.url).pathname;
  const api = path === CREATE_PATH || path === STATUS_PATH;
  if (!api && !path.startsWith(SHARE_PREFIX)) return null;
  const headers = cors(request);
  if (api && !headers) return json({ error: 'origin_not_allowed' }, 403);
  if (api && request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (!env?.DB) return json({ error: 'service_unavailable' }, 503, headers || undefined);
  try {
    if (path === CREATE_PATH) return await create(request, env, headers);
    if (path === STATUS_PATH) return await status(request, env, headers);
    if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'method_not_allowed' }, 405);
    if (path === SHARE_PREFIX) {
      const state = await ensureCatalog(env.DB, env);
      if (!state?.active_photo_count) return json({ error: 'catalog_unavailable', retryAfter: 60 }, 503);
      const row = await env.DB.prepare(PREVIEW_SQL).first();
      if (!row) return json({ error: 'catalog_unavailable', retryAfter: 60 }, 503);
      return landing(row, request, true);
    }
    const match = path.slice(SHARE_PREFIX.length).match(/^([^/]+)\/?$/);
    if (!match || !UUID.test(match[1])) return json({ error: 'not_found' }, 404);
    const row = await getOrAllocate(match[1].toLowerCase(), env);
    if (!row?.poster) return json({ error: 'catalog_unavailable', retryAfter: 60 }, 503);
    return landing(row, request);
  } catch {
    return json({ error: 'service_unavailable', retryAfter: 60 }, 503, headers || undefined);
  }
}

export async function handleDaeguShare(request, env) {
  const response = await routeDaeguShare(request, env);
  // HEAD has the same status/metadata as GET, including errors, and never a body.
  return response && request.method === 'HEAD' ? new Response(null, {
    status: response.status, statusText: response.statusText, headers: response.headers,
  }) : response;
}
