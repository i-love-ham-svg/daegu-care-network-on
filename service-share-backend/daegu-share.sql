-- Apply once as a normal D1 migration. Runtime code never executes DDL.
-- Every new object belongs exclusively to the daegu_share_ namespace.
CREATE TABLE IF NOT EXISTS daegu_share_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  title TEXT NOT NULL DEFAULT '대구 통합돌봄네트워크 ON',
  description TEXT NOT NULL DEFAULT '병원동행부터 방문요양, 의료와 생활돌봄까지. 대구의 돌봄 기관과 활동을 한곳에서 만나세요.',
  canonical_url TEXT NOT NULL DEFAULT 'https://daegu-care.oconia.co.kr/',
  feed_checked_at_ms INTEGER,
  feed_fetched_at_ms INTEGER,
  refresh_lease_until_ms INTEGER,
  feed_error TEXT,
  feed_etag TEXT,
  active_photo_count INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS daegu_share_photos (
  id TEXT PRIMARY KEY CHECK (length(id) = 64),
  owner TEXT NOT NULL,
  poster TEXT NOT NULL,
  updated_at TEXT,
  freshness_ms INTEGER NOT NULL DEFAULT 0,
  caption TEXT NOT NULL,
  credit TEXT NOT NULL,
  source TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  is_latest INTEGER NOT NULL DEFAULT 0 CHECK (is_latest IN (0, 1)),
  last_used_batch INTEGER,
  first_seen_at_ms INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS daegu_share_photos_candidates
  ON daegu_share_photos (active, is_latest, last_used_batch, freshness_ms);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS daegu_share_batches (
  batch_index INTEGER PRIMARY KEY CHECK (batch_index >= 0),
  photo_id TEXT NOT NULL REFERENCES daegu_share_photos(id),
  owner TEXT NOT NULL,
  poster TEXT NOT NULL,
  updated_at TEXT,
  caption TEXT NOT NULL,
  credit TEXT NOT NULL,
  source TEXT,
  created_at_ms INTEGER NOT NULL
);
--> statement-breakpoint

-- No AUTOINCREMENT: an idempotent UPSERT must not consume a sequence number.
-- This table is append-only through the public API; no deletion API exists.
CREATE TABLE IF NOT EXISTS daegu_share_events (
  sequence INTEGER PRIMARY KEY CHECK (sequence > 0),
  token TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  batch_index INTEGER REFERENCES daegu_share_batches(batch_index),
  photo_id TEXT REFERENCES daegu_share_photos(id),
  owner TEXT,
  poster TEXT,
  updated_at TEXT,
  caption TEXT,
  credit TEXT,
  source TEXT
);
--> statement-breakpoint

-- The INSERT, sequence allocation, batch choice, LRU update, and event snapshot
-- are one SQLite statement transaction. A separate worker-side choice can race.
CREATE TRIGGER IF NOT EXISTS daegu_share_events_assign
AFTER INSERT ON daegu_share_events
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM daegu_share_photos WHERE active = 1
  ) THEN RAISE(ABORT, 'daegu_share_catalog_unavailable') END;

  INSERT OR IGNORE INTO daegu_share_batches (
    batch_index, photo_id, owner, poster, updated_at, caption, credit, source,
    created_at_ms
  )
  SELECT (NEW.sequence - 1) / 10, p.id, p.owner, p.poster, p.updated_at,
    p.caption, p.credit, p.source, NEW.created_at_ms
  FROM daegu_share_photos AS p
  WHERE p.active = 1
    AND NOT EXISTS (
      SELECT 1 FROM daegu_share_batches
      WHERE batch_index = (NEW.sequence - 1) / 10
    )
    AND (
      (SELECT COUNT(*) FROM daegu_share_photos WHERE active = 1) <= 1
      OR p.id <> COALESCE((
        SELECT photo_id FROM daegu_share_batches
        WHERE batch_index = ((NEW.sequence - 1) / 10) - 1
      ), '')
    )
  ORDER BY
    CASE WHEN p.is_latest = 1 AND p.last_used_batch IS NULL THEN 0 ELSE 1 END,
    CASE WHEN p.is_latest = 1 AND p.last_used_batch IS NULL
      THEN p.freshness_ms END DESC,
    COALESCE(p.last_used_batch, -1) ASC,
    p.freshness_ms DESC,
    p.id ASC
  LIMIT 1;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM daegu_share_batches
    WHERE batch_index = (NEW.sequence - 1) / 10
  ) THEN RAISE(ABORT, 'daegu_share_batch_unavailable') END;

  UPDATE daegu_share_photos
  SET last_used_batch = (NEW.sequence - 1) / 10
  WHERE id = (
    SELECT photo_id FROM daegu_share_batches
    WHERE batch_index = (NEW.sequence - 1) / 10
  ) AND (last_used_batch IS NULL OR last_used_batch < (NEW.sequence - 1) / 10);

  UPDATE daegu_share_events
  SET batch_index = (NEW.sequence - 1) / 10,
    photo_id = (SELECT photo_id FROM daegu_share_batches WHERE batch_index = (NEW.sequence - 1) / 10),
    owner = (SELECT owner FROM daegu_share_batches WHERE batch_index = (NEW.sequence - 1) / 10),
    poster = (SELECT poster FROM daegu_share_batches WHERE batch_index = (NEW.sequence - 1) / 10),
    updated_at = (SELECT updated_at FROM daegu_share_batches WHERE batch_index = (NEW.sequence - 1) / 10),
    caption = (SELECT caption FROM daegu_share_batches WHERE batch_index = (NEW.sequence - 1) / 10),
    credit = (SELECT credit FROM daegu_share_batches WHERE batch_index = (NEW.sequence - 1) / 10),
    source = (SELECT source FROM daegu_share_batches WHERE batch_index = (NEW.sequence - 1) / 10)
  WHERE sequence = NEW.sequence;
END;
