export interface AnalyticsMigration {
  version: number
  name: string
  sql: string
}

export const ANALYTICS_REQUIRED_TABLES = [
  'visitors',
  'analytics_sessions',
  'events',
  'event_properties',
  'projection_checkpoints',
  'projection_gaps',
] as const

export const ANALYTICS_PROJECTION_VERSION = 'v1'

export const ANALYTICS_MIGRATIONS: AnalyticsMigration[] = [
  {
    version: 1,
    name: 'analytics-core',
    sql: `
      CREATE TABLE IF NOT EXISTS visitors (
        site_id VARCHAR NOT NULL,
        visitor_id VARCHAR NOT NULL,
        identity_kind VARCHAR NOT NULL,
        first_seen_at TIMESTAMP NOT NULL,
        last_seen_at TIMESTAMP NOT NULL,
        profile_id VARCHAR,
        PRIMARY KEY (site_id, visitor_id)
      );

      CREATE TABLE IF NOT EXISTS analytics_sessions (
        site_id VARCHAR NOT NULL,
        session_id VARCHAR NOT NULL,
        visitor_id VARCHAR,
        identified_user_id VARCHAR,
        started_at TIMESTAMP NOT NULL,
        ended_at TIMESTAMP,
        entry_page VARCHAR,
        referrer VARCHAR,
        utm_source VARCHAR,
        utm_medium VARCHAR,
        utm_campaign VARCHAR,
        device VARCHAR,
        browser VARCHAR,
        operating_system VARCHAR,
        country VARCHAR,
        region VARCHAR,
        city VARCHAR,
        PRIMARY KEY (site_id, session_id)
      );

      CREATE TABLE IF NOT EXISTS events (
        event_pk BIGINT NOT NULL,
        site_id VARCHAR NOT NULL,
        event_id VARCHAR NOT NULL,
        event_kind VARCHAR NOT NULL,
        occurrence_time TIMESTAMP NOT NULL,
        receipt_time TIMESTAMP NOT NULL,
        late BOOLEAN NOT NULL DEFAULT false,
        visitor_id VARCHAR,
        identified_user_id VARCHAR,
        analytics_session_id VARCHAR,
        page_path VARCHAR,
        referrer VARCHAR,
        name VARCHAR,
        destination VARCHAR,
        value DOUBLE,
        unit VARCHAR,
        code VARCHAR,
        message VARCHAR,
        properties_json JSON,
        policy_revision_id VARCHAR NOT NULL,
        replay_sequence BIGINT NOT NULL UNIQUE,
        payload_fingerprint VARCHAR NOT NULL,
        projected_at TIMESTAMP,
        PRIMARY KEY (site_id, event_id)
      );

      CREATE TABLE IF NOT EXISTS event_properties (
        site_id VARCHAR NOT NULL,
        event_id VARCHAR NOT NULL,
        property_key VARCHAR NOT NULL,
        value_type VARCHAR NOT NULL,
        string_value VARCHAR,
        number_value DOUBLE,
        boolean_value BOOLEAN,
        PRIMARY KEY (site_id, event_id, property_key)
      );

      CREATE TABLE IF NOT EXISTS projection_checkpoints (
        site_id VARCHAR PRIMARY KEY,
        projected_replay_sequence BIGINT NOT NULL DEFAULT 0,
        occurrence_covered_from TIMESTAMP,
        occurrence_covered_through TIMESTAMP,
        effective_retention_from TIMESTAMP,
        statistics_refreshed_at TIMESTAMP,
        readiness VARCHAR NOT NULL DEFAULT 'ready',
        projection_version VARCHAR NOT NULL,
        updated_at TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projection_gaps (
        id VARCHAR PRIMARY KEY,
        site_id VARCHAR NOT NULL,
        occurrence_from TIMESTAMP,
        occurrence_to TIMESTAMP,
        unbounded BOOLEAN NOT NULL DEFAULT false,
        status VARCHAR NOT NULL DEFAULT 'open',
        observed_at TIMESTAMP NOT NULL,
        resolved_at TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS visitors_site_last_seen_idx
        ON visitors (site_id, last_seen_at);
      CREATE INDEX IF NOT EXISTS sessions_site_started_idx
        ON analytics_sessions (site_id, started_at, session_id);
      CREATE INDEX IF NOT EXISTS events_site_occurrence_idx
        ON events (site_id, occurrence_time, event_id);
      CREATE INDEX IF NOT EXISTS events_site_kind_occurrence_idx
        ON events (site_id, event_kind, occurrence_time);
      CREATE INDEX IF NOT EXISTS events_site_session_idx
        ON events (site_id, analytics_session_id, occurrence_time);
      CREATE INDEX IF NOT EXISTS event_properties_key_idx
        ON event_properties (site_id, property_key);
      CREATE INDEX IF NOT EXISTS projection_gaps_site_status_idx
        ON projection_gaps (site_id, status, occurrence_from);
    `,
  },
]
