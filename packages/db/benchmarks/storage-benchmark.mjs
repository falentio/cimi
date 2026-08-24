#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import Database from 'better-sqlite3'
import { DuckDBInstance, timestampValue } from '@duckdb/node-api'

const argv = process.argv.slice(2)
const config = {
  // Synthetic benchmark scale; this is not a product capacity target.
  rows: numberOption('--rows', 20_000),
  repeats: numberOption('--repeats', 3),
  queryRepeats: numberOption('--query-repeats', 5),
  threads: numberOption('--threads', 1),
  memoryLimit: stringOption('--memory-limit', '512MB'),
  maxTempDirectorySize: stringOption('--max-temp-directory-size', '1GB'),
  engines: stringOption(
    '--engines',
    'sqlite-direct,duckdb-direct,sqlite-outbox-duckdb,sqlite-sync-duckdb',
  ).split(','),
  // Product acceptance flushes at 500 candidates; override for diagnostics.
  batchSizes: stringOption('--batch-sizes', '500')
    .split(',')
    .map((value) => positiveInteger('--batch-sizes', Number(value))),
  mixedRows: numberOption('--mixed-rows', Math.min(1000, numberOption('--rows', 20_000))),
  mixedBatchSize: numberOption('--mixed-batch-size', 500),
  readers: numberOption('--readers', 2),
  mixedQueries: numberOption('--mixed-queries', 20),
  dbDir: resolve(stringOption('--db-dir', './storage-benchmark-data')),
  output: resolve(stringOption('--output', './storage-benchmark-results.json')),
}

const events = Array.from({ length: config.rows }, (_, index) => createEvent(index))
const mixedEvents = Array.from({ length: config.mixedRows }, (_, index) =>
  createEvent(config.rows + index),
)

await main()

async function main() {
  mkdirSync(config.dbDir, { recursive: true })
  const result = {
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    config,
    environment: collectEnvironment(),
    runs: [],
  }

  for (const engine of config.engines) {
    for (const batchSize of config.batchSizes) {
      for (let repeat = 1; repeat <= config.repeats; repeat += 1) {
        result.runs.push(await runCandidate(engine, batchSize, repeat))
      }
    }
  }

  writeFileSync(config.output, `${JSON.stringify(result, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify({ output: config.output, runs: result.runs.length })}\n`)
}

async function runCandidate(engine, batchSize, repeat) {
  const runDir = join(config.dbDir, `${engine}-batch-${batchSize}-repeat-${repeat}`)
  rmSync(runDir, { recursive: true, force: true })
  mkdirSync(runDir, { recursive: true })

  const store = await openCandidate(engine, runDir)
  let storeClosed = false
  try {
    const acceptance = await runAcceptance(store, batchSize)
    const materialization = store.materialize ? await measureMaterialization(store) : null
    const materializationReplay = store.materialize ? await runMaterializationReplay(store) : null
    const deduplication = await runDeduplication(store)
    const queries = await runQueries(store)
    const mixedLoad = await runMixedLoad(store)
    const backups = await runBackups(store, runDir)
    const retention = await runRetention(store)
    const versions = await store.versions()
    await store.close()
    storeClosed = true

    const recoveryStarted = performance.now()
    if (store.rebuild) rmSync(join(runDir, 'analytics.duckdb'), { force: true })
    const recoveredStore = await openCandidate(engine, runDir, false)
    if (recoveredStore.rebuild) await recoveredStore.rebuild()
    const recoveredRows = Number(
      (await recoveredStore.query('SELECT count(*) AS count FROM events'))[0].count,
    )
    await recoveredStore.close()
    if (recoveredRows !== retention.remainingRows) {
      throw new Error(
        `${engine} recovery row count ${recoveredRows} did not match retained row count ${retention.remainingRows}`,
      )
    }

    return {
      engine,
      batchSize,
      repeat,
      versions,
      acceptance,
      materialization,
      materializationReplay,
      deduplication,
      queries,
      mixedLoad,
      backups,
      retention,
      recovery: {
        durationMs: performance.now() - recoveryStarted,
        rowsAfterReopen: recoveredRows,
      },
      files: fileSizes(runDir),
    }
  } catch (error) {
    if (!storeClosed) await store.close()
    throw error
  }
}

async function openCandidate(engine, runDir, initialize = true) {
  if (engine === 'sqlite-direct') {
    const db = openSqlite(join(runDir, 'control.sqlite'))
    if (initialize) {
      createSqliteSchema(db)
    }
    return sqliteStore(db, join(runDir, 'control.sqlite'))
  }

  if (engine === 'duckdb-direct') {
    const duck = await openDuck(join(runDir, 'analytics.duckdb'), join(runDir, 'tmp'))
    if (initialize) await createDuckSchema(duck.connection)
    return duckStore(duck, join(runDir, 'analytics.duckdb'))
  }

  if (engine === 'sqlite-outbox-duckdb') {
    const sqlitePath = join(runDir, 'control.sqlite')
    const db = openSqlite(sqlitePath)
    if (initialize) {
      db.exec(`
        CREATE TABLE dedup (
          site_id TEXT NOT NULL,
          event_id TEXT NOT NULL,
          payload_hash TEXT NOT NULL,
          receipt_time TEXT NOT NULL,
          PRIMARY KEY (site_id, event_id)
        );
        CREATE TABLE accepted_events (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT,
          event_id TEXT NOT NULL,
          site_id TEXT NOT NULL,
          occurred_at TEXT NOT NULL,
          kind TEXT NOT NULL,
          page_path TEXT NOT NULL,
          visitor_id TEXT NOT NULL,
          identified_user_id TEXT,
          properties_json TEXT NOT NULL,
          received_at TEXT NOT NULL,
          UNIQUE (site_id, event_id)
        );
        CREATE TABLE outbox (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT,
          event_id TEXT NOT NULL,
          site_id TEXT NOT NULL,
          occurred_at TEXT NOT NULL,
          kind TEXT NOT NULL,
          page_path TEXT NOT NULL,
          visitor_id TEXT NOT NULL,
          identified_user_id TEXT,
          properties_json TEXT NOT NULL,
          UNIQUE (site_id, event_id)
        );
        CREATE INDEX accepted_events_sequence ON accepted_events(sequence);
        CREATE INDEX outbox_sequence ON outbox(sequence);
      `)
    }
    const analyticsPath = join(runDir, 'analytics.duckdb')
    const needsAnalyticsSchema = initialize || !exists(analyticsPath)
    const duck = await openDuck(analyticsPath, join(runDir, 'tmp'))
    if (needsAnalyticsSchema) {
      await createDuckSchema(duck.connection)
    }
    return outboxStore(db, sqlitePath, duck, analyticsPath)
  }

  if (engine === 'sqlite-sync-duckdb') {
    const sqlitePath = join(runDir, 'control.sqlite')
    const db = openSqlite(sqlitePath)
    if (initialize) createSqliteSchema(db)
    const analyticsPath = join(runDir, 'analytics.duckdb')
    const needsAnalyticsSchema = initialize || !exists(analyticsPath)
    const duck = await openDuck(analyticsPath, join(runDir, 'tmp'))
    if (needsAnalyticsSchema) {
      await createDuckSchema(duck.connection)
    }
    return synchronousStore(db, sqlitePath, duck, analyticsPath)
  }

  throw new Error(`Unknown engine: ${engine}`)
}

function openSqlite(path) {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = FULL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  db.pragma('wal_autocheckpoint = 1000')
  return db
}

function createSqliteSchema(db) {
  db.exec(`
    CREATE TABLE events (
      event_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      kind TEXT NOT NULL,
      page_path TEXT NOT NULL,
      visitor_id TEXT NOT NULL,
      identified_user_id TEXT,
      properties_json TEXT NOT NULL,
      PRIMARY KEY (site_id, event_id)
    );
    CREATE INDEX events_site_time ON events(site_id, occurred_at);
    CREATE INDEX events_site_kind_time ON events(site_id, kind, occurred_at);
  `)
}

async function openDuck(path, tempDirectory) {
  mkdirSync(tempDirectory, { recursive: true })
  const instance = await DuckDBInstance.create(path, {
    threads: String(config.threads),
    memory_limit: config.memoryLimit,
    temp_directory: tempDirectory,
    max_temp_directory_size: config.maxTempDirectorySize,
  })
  const connection = await instance.connect()
  return { instance, connection }
}

async function createDuckSchema(connection) {
  await connection.run(`
    CREATE TABLE events (
      event_id VARCHAR NOT NULL,
      site_id VARCHAR NOT NULL,
      occurred_at TIMESTAMP NOT NULL,
      kind VARCHAR NOT NULL,
      page_path VARCHAR NOT NULL,
      visitor_id VARCHAR NOT NULL,
      identified_user_id VARCHAR,
      properties_json VARCHAR NOT NULL,
      PRIMARY KEY (site_id, event_id)
    )
  `)
}

function sqliteStore(db, path, table = 'events') {
  const insert = db.prepare(`INSERT INTO ${table} VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
  const insertBatch = db.transaction((batch) => {
    for (const event of batch) insert.run(...eventValues(event))
  })
  return {
    name: 'sqlite',
    db,
    table,
    path,
    sqlitePath: path,
    backupTable: table,
    accept(batch) {
      insertBatch(batch)
    },
    query(sql) {
      return db.prepare(sql).all()
    },
    createReader() {
      return createSqliteReader(path)
    },
    execute(sql) {
      return db.exec(sql)
    },
    async versions() {
      return { sqlite: db.prepare('SELECT sqlite_version() AS version').get().version }
    },
    async close() {
      db.close()
    },
  }
}

function duckStore(duck, path) {
  return {
    name: 'duckdb',
    connection: duck.connection,
    instance: duck.instance,
    table: 'events',
    path,
    analyticsPath: path,
    async accept(batch) {
      await insertDuckBatch(duck.connection, batch)
    },
    async query(sql) {
      const reader = await duck.connection.runAndReadAll(sql)
      await reader.readAll()
      return reader.getRowObjects()
    },
    async createReader() {
      return createDuckReader(duck.instance)
    },
    async execute(sql) {
      await duck.connection.run(sql)
    },
    async versions() {
      const reader = await duck.connection.runAndReadAll('SELECT version() AS version')
      await reader.readAll()
      return { duckdb: String(reader.getRowObjects()[0].version) }
    },
    async close() {
      await closeDuck(duck)
    },
  }
}

function outboxStore(db, sqlitePath, duck, duckPath) {
  const accept = db.transaction((batch) => {
    const dedup = db.prepare('INSERT INTO dedup VALUES (?, ?, ?, ?)')
    const accepted = db.prepare(
      'INSERT INTO accepted_events (event_id, site_id, occurred_at, kind, page_path, visitor_id, identified_user_id, properties_json, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    const outbox = db.prepare(
      'INSERT INTO outbox (event_id, site_id, occurred_at, kind, page_path, visitor_id, identified_user_id, properties_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    for (const event of batch) {
      dedup.run(event.siteId, event.eventId, hashEvent(event), event.receivedAt)
      accepted.run(...eventValues(event), event.receivedAt)
      outbox.run(...eventValues(event))
    }
  })
  return {
    name: 'sqlite-outbox-duckdb',
    db,
    connection: duck.connection,
    instance: duck.instance,
    table: 'events',
    path: duckPath,
    auxiliaryPath: sqlitePath,
    sqlitePath,
    analyticsPath: duckPath,
    backupTable: 'accepted_events',
    accept,
    async materialize() {
      const pending = db
        .prepare(
          'SELECT event_id, site_id, occurred_at, kind, page_path, visitor_id, identified_user_id, properties_json FROM outbox ORDER BY sequence',
        )
        .all()
      const existingReader = await duck.connection.runAndReadAll(
        'SELECT site_id, event_id FROM events',
      )
      await existingReader.readAll()
      const existing = new Set(
        existingReader.getRowObjects().map((event) => `${event.site_id}:${event.event_id}`),
      )
      const toAppend = pending.filter(
        (event) => !existing.has(`${event.site_id}:${event.event_id}`),
      )
      if (toAppend.length > 0) {
        await appendDuckRows(duck.connection, toAppend, (event) => [
          event.event_id,
          event.site_id,
          event.occurred_at,
          event.kind,
          event.page_path,
          event.visitor_id,
          event.identified_user_id,
          event.properties_json,
        ])
      }
      const deletePending = db.prepare('DELETE FROM outbox WHERE site_id = ? AND event_id = ?')
      db.transaction(() => {
        for (const event of pending) deletePending.run(event.site_id, event.event_id)
      })()
      return { pendingRows: pending.length, appendedRows: toAppend.length }
    },
    async rebuild() {
      const accepted = db
        .prepare(
          'SELECT event_id, site_id, occurred_at, kind, page_path, visitor_id, identified_user_id, properties_json FROM accepted_events ORDER BY sequence',
        )
        .all()
      await duck.connection.run('DELETE FROM events')
      await appendDuckRows(duck.connection, accepted, (event) => [
        event.event_id,
        event.site_id,
        event.occurred_at,
        event.kind,
        event.page_path,
        event.visitor_id,
        event.identified_user_id,
        event.properties_json,
      ])
      return { rows: accepted.length }
    },
    async query(sql) {
      const reader = await duck.connection.runAndReadAll(sql)
      await reader.readAll()
      return reader.getRowObjects()
    },
    async createReader() {
      return createDuckReader(duck.instance)
    },
    async execute(sql) {
      await duck.connection.run(sql)
    },
    async versions() {
      const duckVersion = await duck.connection.runAndReadAll('SELECT version() AS version')
      await duckVersion.readAll()
      return {
        sqlite: db.prepare('SELECT sqlite_version() AS version').get().version,
        duckdb: String(duckVersion.getRowObjects()[0].version),
      }
    },
    async close() {
      try {
        await closeDuck(duck)
      } finally {
        db.close()
      }
    },
  }
}

function synchronousStore(db, sqlitePath, duck, duckPath) {
  const insert = db.prepare('INSERT INTO events VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  const insertBatch = db.transaction((batch) => {
    for (const event of batch) insert.run(...eventValues(event))
  })
  return {
    name: 'sqlite-sync-duckdb',
    db,
    connection: duck.connection,
    instance: duck.instance,
    table: 'events',
    path: duckPath,
    sqlitePath,
    analyticsPath: duckPath,
    backupTable: 'events',
    async accept(batch) {
      insertBatch(batch)
      try {
        await insertDuckBatch(duck.connection, batch)
      } catch (error) {
        const remove = db.prepare('DELETE FROM events WHERE site_id = ? AND event_id = ?')
        db.transaction(() => {
          for (const event of batch) remove.run(event.siteId, event.eventId)
        })()
        throw error
      }
    },
    async query(sql) {
      const reader = await duck.connection.runAndReadAll(sql)
      await reader.readAll()
      return reader.getRowObjects()
    },
    async createReader() {
      return createDuckReader(duck.instance)
    },
    async rebuild() {
      const rows = db
        .prepare(
          'SELECT event_id, site_id, occurred_at, kind, page_path, visitor_id, identified_user_id, properties_json FROM events ORDER BY rowid',
        )
        .all()
      await duck.connection.run('DELETE FROM events')
      await appendDuckRows(duck.connection, rows, (event) => [
        event.event_id,
        event.site_id,
        event.occurred_at,
        event.kind,
        event.page_path,
        event.visitor_id,
        event.identified_user_id,
        event.properties_json,
      ])
      return { rows: rows.length }
    },
    async execute(sql) {
      await duck.connection.run(sql)
    },
    async versions() {
      const duckVersion = await duck.connection.runAndReadAll('SELECT version() AS version')
      await duckVersion.readAll()
      return {
        sqlite: db.prepare('SELECT sqlite_version() AS version').get().version,
        duckdb: String(duckVersion.getRowObjects()[0].version),
      }
    },
    async close() {
      try {
        await closeDuck(duck)
      } finally {
        db.close()
      }
    },
  }
}

async function insertDuckBatch(connection, batch) {
  await appendDuckRows(connection, batch, eventValues)
}

async function closeDuck(duck) {
  try {
    await duck.connection.run('CHECKPOINT')
  } finally {
    try {
      duck.connection.closeSync()
    } catch {}
    try {
      duck.instance.closeSync()
    } catch {}
  }
}

function createSqliteReader(path) {
  const db = new Database(path, { readonly: true, fileMustExist: true })
  return {
    query(sql) {
      return db.prepare(sql).all()
    },
    async close() {
      db.close()
    },
  }
}

async function createDuckReader(instance) {
  const connection = await instance.connect()
  return {
    async query(sql) {
      const reader = await connection.runAndReadAll(sql)
      await reader.readAll()
      return reader.getRowObjects()
    },
    async close() {
      connection.closeSync()
    },
  }
}

async function appendDuckRows(connection, rows, valuesForRow) {
  const appender = await connection.createAppender('events')
  try {
    for (const row of rows) {
      appendDuckValues(appender, valuesForRow(row))
    }
    appender.flushSync()
  } finally {
    appender.closeSync()
  }
}

function appendDuckValues(appender, values) {
  for (const [index, value] of values.entries()) {
    if (value === null) {
      appender.appendNull()
    } else if (index === 2) {
      appender.appendTimestamp(timestampValue(BigInt(Date.parse(`${value}Z`)) * 1000n))
    } else {
      appender.appendVarchar(String(value))
    }
  }
  appender.endRow()
}

async function runAcceptance(store, batchSize) {
  const samples = []
  for (let start = 0; start < events.length; start += batchSize) {
    const batch = events.slice(start, start + batchSize)
    const started = performance.now()
    await store.accept(batch)
    samples.push(performance.now() - started)
  }
  return {
    batches: samples.length,
    rows: events.length,
    batchLatencyMs: summarize(samples),
    rowsPerSecond: events.length / (samples.reduce((sum, value) => sum + value, 0) / 1000),
  }
}

async function measureMaterialization(store) {
  const started = performance.now()
  const result = await store.materialize()
  return { ...result, durationMs: performance.now() - started }
}

async function runMaterializationReplay(store) {
  if (store.name !== 'sqlite-outbox-duckdb') return null

  const event = events[0]
  if (!event) throw new Error('Materialization replay requires at least one event.')
  store.db
    .prepare(
      'INSERT INTO outbox (event_id, site_id, occurred_at, kind, page_path, visitor_id, identified_user_id, properties_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(...eventValues(event))

  const result = await store.materialize()
  if (result.pendingRows !== 1 || result.appendedRows !== 0) {
    throw new Error(`Outbox replay was not idempotent: ${JSON.stringify(result)}`)
  }
  return result
}

async function runDeduplication(store) {
  const samples = events.slice(0, Math.min(1000, events.length))
  const latencies = []
  for (const event of samples) {
    const started = performance.now()
    if (store.name === 'sqlite-outbox-duckdb') {
      store.db
        .prepare('SELECT payload_hash FROM dedup WHERE site_id = ? AND event_id = ?')
        .get(event.siteId, event.eventId)
    } else if (store.name === 'sqlite') {
      store.db
        .prepare(`SELECT event_id FROM ${store.table} WHERE site_id = ? AND event_id = ?`)
        .get(event.siteId, event.eventId)
    } else {
      await store.query(
        `SELECT event_id FROM events WHERE site_id = '${sqlString(event.siteId)}' AND event_id = '${sqlString(event.eventId)}'`,
      )
    }
    latencies.push(performance.now() - started)
  }

  const firstEvent = samples[0]
  if (!firstEvent) throw new Error('Deduplication requires at least one event.')
  const changedEvent = { ...firstEvent, pagePath: `${firstEvent.pagePath}/changed` }
  let changedPayloadRejected = false
  try {
    await store.accept([changedEvent])
  } catch {
    changedPayloadRejected = true
  }
  if (!changedPayloadRejected) {
    throw new Error(`${store.name} accepted a changed payload for an existing Event ID`)
  }

  return {
    lookups: samples.length,
    latencyMs: summarize(latencies),
    changedPayloadRejected,
  }
}

async function runQueries(store) {
  const queries = store.name === 'sqlite' ? sqliteQueries() : duckQueries()
  const results = {}
  for (const query of queries) {
    await store.query(query.sql)
    const samples = []
    let checksum
    for (let index = 0; index < config.queryRepeats; index += 1) {
      const started = performance.now()
      const rows = await store.query(query.sql)
      samples.push(performance.now() - started)
      checksum = checksumRows(rows)
    }
    results[query.name] = { latencyMs: summarize(samples), checksum }
  }
  return results
}

async function runMixedLoad(store) {
  const batches = []
  for (let start = 0; start < mixedEvents.length; start += config.mixedBatchSize) {
    batches.push(mixedEvents.slice(start, start + config.mixedBatchSize))
  }

  const writerSamples = []
  const readerSamples = []
  const errors = []
  let writerDone = false
  let writtenRows = 0
  let projectedRows = 0

  const writer = (async () => {
    try {
      for (const batch of batches) {
        const started = performance.now()
        await store.accept(batch)
        writerSamples.push(performance.now() - started)
        writtenRows += batch.length
        await nextTick()
      }
    } catch (error) {
      errors.push(errorRecord('writer', error))
    } finally {
      writerDone = true
    }
  })()

  const projector = store.materialize
    ? (async () => {
        while (true) {
          try {
            const started = performance.now()
            const result = await store.materialize()
            projectedRows += result.pendingRows
            if (writerDone && result.pendingRows === 0) break
            await nextTick()
            if (performance.now() - started > 0) continue
          } catch (error) {
            errors.push(errorRecord('projector', error))
            break
          }
        }
      })()
    : Promise.resolve()

  const readers = Array.from({ length: config.readers }, (_, reader) =>
    (async () => {
      const queryStore = store.createReader ? await store.createReader() : store
      try {
        for (let query = 0; query < config.mixedQueries; query += 1) {
          try {
            const started = performance.now()
            const rows = await queryStore.query(mixedReaderQuery(store))
            readerSamples.push({
              reader,
              durationMs: performance.now() - started,
              checksum: checksumRows(rows),
            })
          } catch (error) {
            errors.push(errorRecord(`reader-${reader}`, error))
          }
          await nextTick()
        }
      } finally {
        if (queryStore !== store) await queryStore.close()
      }
    })(),
  )

  await Promise.all([writer, projector, ...readers])
  const finalRows = Number((await store.query('SELECT count(*) AS count FROM events'))[0].count)
  const readerLatencies = readerSamples.map(({ durationMs }) => durationMs)
  const readerChecksums = [...new Set(readerSamples.map(({ checksum }) => checksum))]
  if (errors.length > 0) {
    throw new Error(`Mixed-load errors: ${JSON.stringify(errors)}`)
  }
  if (finalRows !== events.length + mixedEvents.length) {
    throw new Error(
      `Mixed-load row count ${finalRows} did not match expected ${events.length + mixedEvents.length}`,
    )
  }

  return {
    writer: {
      batches: batches.length,
      rows: writtenRows,
      latencyMs: summarize(writerSamples),
    },
    readers: {
      count: config.readers,
      queries: readerSamples.length,
      latencyMs: summarize(readerLatencies),
      checksums: readerChecksums,
    },
    projector: store.materialize ? { rows: projectedRows } : null,
    errors,
    rowsAfterDrain: finalRows,
  }
}

function mixedReaderQuery(store) {
  if (store.name === 'sqlite') {
    return "SELECT kind, count(*) AS events FROM events WHERE site_id = 'site_0' GROUP BY kind ORDER BY kind"
  }
  return "SELECT kind, count(*) AS events FROM events WHERE site_id = 'site_0' GROUP BY kind ORDER BY kind"
}

async function runBackups(store, runDir) {
  const backupDir = join(runDir, 'backups')
  mkdirSync(backupDir, { recursive: true })
  const backups = []

  if (store.sqlitePath) {
    const destination = join(backupDir, 'control.sqlite.backup')
    const started = performance.now()
    const result = await store.db.backup(destination)
    const backup = new Database(destination, { readonly: true })
    const rows = backup.prepare(`SELECT count(*) AS count FROM ${store.backupTable}`).get().count
    backup.close()
    backups.push({
      kind: 'sqlite-online-backup',
      path: destination,
      durationMs: performance.now() - started,
      bytes: statSync(destination).size,
      totalPages: result.totalPages,
      remainingPages: result.remainingPages,
      rowsAfterRestore: Number(rows),
    })
  }

  if (store.analyticsPath) {
    const destination = join(backupDir, 'analytics.duckdb.copy')
    const started = performance.now()
    await store.execute('CHECKPOINT')
    copyFileSync(store.analyticsPath, destination)
    const restoreTempDirectory = join(backupDir, 'tmp')
    const instance = await openDuck(destination, restoreTempDirectory)
    const reader = await instance.connection.runAndReadAll('SELECT count(*) AS count FROM events')
    await reader.readAll()
    const rows = reader.getRowObjects()[0].count
    await closeDuck(instance)
    backups.push({
      kind: 'duckdb-checkpoint-copy',
      path: destination,
      durationMs: performance.now() - started,
      bytes: statSync(destination).size,
      rowsAfterRestore: Number(rows),
    })
  }

  return backups
}

function sqliteQueries() {
  return [
    {
      name: 'timeseries',
      sql: "SELECT substr(occurred_at, 1, 13) AS bucket, count(*) AS events, count(DISTINCT visitor_id) AS visitors FROM events WHERE site_id = 'site_0' GROUP BY bucket ORDER BY bucket",
    },
    {
      name: 'unique-by-kind',
      sql: "SELECT kind, count(*) AS events, count(DISTINCT visitor_id) AS visitors, count(DISTINCT identified_user_id) AS identified FROM events WHERE site_id = 'site_0' GROUP BY kind ORDER BY kind",
    },
    {
      name: 'filtered-breakdown',
      sql: "SELECT page_path, count(*) AS events FROM events WHERE site_id = 'site_0' AND kind = 'custom_event' AND page_path LIKE '/product/%' GROUP BY page_path ORDER BY events DESC, page_path LIMIT 20",
    },
    {
      name: 'offset-page',
      sql: "SELECT event_id, occurred_at, kind, page_path FROM events WHERE site_id = 'site_0' ORDER BY occurred_at, event_id LIMIT 100 OFFSET 1000",
    },
  ]
}

function duckQueries() {
  return [
    {
      name: 'timeseries',
      sql: "SELECT strftime(occurred_at, '%Y-%m-%d %H') AS bucket, count(*) AS events, count(DISTINCT visitor_id) AS visitors FROM events WHERE site_id = 'site_0' GROUP BY bucket ORDER BY bucket",
    },
    {
      name: 'unique-by-kind',
      sql: "SELECT kind, count(*) AS events, count(DISTINCT visitor_id) AS visitors, count(DISTINCT identified_user_id) AS identified FROM events WHERE site_id = 'site_0' GROUP BY kind ORDER BY kind",
    },
    {
      name: 'filtered-breakdown',
      sql: "SELECT page_path, count(*) AS events FROM events WHERE site_id = 'site_0' AND kind = 'custom_event' AND page_path LIKE '/product/%' GROUP BY page_path ORDER BY events DESC, page_path LIMIT 20",
    },
    {
      name: 'offset-page',
      sql: "SELECT event_id, occurred_at, kind, page_path FROM events WHERE site_id = 'site_0' ORDER BY occurred_at, event_id LIMIT 100 OFFSET 1000",
    },
  ]
}

async function runRetention(store) {
  const cutoff = '2025-01-03 00:00:00'
  const started = performance.now()
  if (store.name === 'sqlite-outbox-duckdb') {
    await store.execute(`DELETE FROM events WHERE occurred_at < '${cutoff}'`)
    store.db.exec(`
      DELETE FROM outbox WHERE occurred_at < '${cutoff}';
      DELETE FROM accepted_events WHERE occurred_at < '${cutoff}';
      DELETE FROM dedup WHERE NOT EXISTS (
        SELECT 1 FROM accepted_events
        WHERE accepted_events.site_id = dedup.site_id
          AND accepted_events.event_id = dedup.event_id
      );
    `)
  } else {
    await store.execute(`DELETE FROM events WHERE occurred_at < '${cutoff}'`)
  }
  if (store.name === 'sqlite-sync-duckdb') {
    store.db.exec(`DELETE FROM events WHERE occurred_at < '${cutoff}'`)
  }
  const deleteMs = performance.now() - started
  const maintenanceStarted = performance.now()
  if (store.name === 'sqlite' || store.name === 'sqlite-sync-duckdb') {
    store.db.pragma('wal_checkpoint(TRUNCATE)')
    store.db.exec('VACUUM')
  }
  if (store.name !== 'sqlite') {
    await store.execute('CHECKPOINT')
  }
  return {
    deleteMs,
    maintenanceMs: performance.now() - maintenanceStarted,
    remainingRows: Number((await store.query('SELECT count(*) AS count FROM events'))[0].count),
  }
}

function createEvent(index) {
  const hourIndex = index % 240
  const hour = String(hourIndex % 24).padStart(2, '0')
  const day = String(1 + Math.floor(hourIndex / 24)).padStart(2, '0')
  const site = `site_${index % 8}`
  const kind = index % 5 === 0 ? 'custom_event' : 'page_view'
  return {
    eventId: `event_${String(index).padStart(10, '0')}`,
    siteId: site,
    occurredAt: `2025-01-${day} ${hour}:00:00`,
    kind,
    pagePath: kind === 'custom_event' ? `/product/${index % 20}` : `/page/${index % 100}`,
    visitorId: `visitor_${index % 5000}`,
    identifiedUserId: index % 3 === 0 ? `user_${index % 1000}` : null,
    propertiesJson: JSON.stringify({ plan: index % 4, converted: index % 7 === 0 }),
    receivedAt: `2025-01-${day} ${hour}:00:01`,
  }
}

function eventValues(event) {
  return [
    event.eventId,
    event.siteId,
    event.occurredAt,
    event.kind,
    event.pagePath,
    event.visitorId,
    event.identifiedUserId,
    event.propertiesJson,
  ]
}

function summarize(values) {
  const sorted = [...values].sort((left, right) => left - right)
  return {
    count: values.length,
    min: sorted[0] ?? 0,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted.at(-1) ?? 0,
    mean: values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length,
  }
}

function errorRecord(source, error) {
  return {
    source,
    name: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message : String(error),
    code: error?.code ?? null,
  }
}

function nextTick() {
  return new Promise((resolve) => setImmediate(resolve))
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]
}

function checksumRows(rows) {
  const normalized = rows.map((row) =>
    Object.fromEntries(
      Object.entries(row)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => [key, value === null ? null : String(value)]),
    ),
  )
  const text = JSON.stringify(normalized)
  let hash = 2_166_136_261
  for (const character of text) hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619)
  return (hash >>> 0).toString(16)
}

function hashEvent(event) {
  return checksumRows([event])
}

function fileSizes(directory) {
  const sizes = {}
  for (const path of [join(directory, 'control.sqlite'), join(directory, 'analytics.duckdb')]) {
    if (exists(path)) sizes[path] = statSync(path).size
  }
  for (const suffix of ['-wal', '-shm']) {
    const path = join(directory, `control.sqlite${suffix}`)
    if (exists(path)) sizes[path] = statSync(path).size
  }
  const tempDirectory = join(directory, 'tmp')
  if (exists(tempDirectory)) sizes[tempDirectory] = directoryBytes(tempDirectory)
  return sizes
}

function directoryBytes(directory) {
  if (!exists(directory)) return 0
  return readdirSafe(directory).reduce((sum, name) => {
    const path = join(directory, name)
    return sum + (statSync(path).isDirectory() ? directoryBytes(path) : statSync(path).size)
  }, 0)
}

function collectEnvironment() {
  return {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    kernel: safeCommand('uname', ['-a']),
    visibleCpus: os.availableParallelism(),
    visibleMemoryBytes: os.totalmem(),
    cgroupCpuMax: readOptional('/sys/fs/cgroup/cpu.max'),
    cgroupMemoryMax: readOptional('/sys/fs/cgroup/memory.max'),
    cgroupMemoryCurrent: readOptional('/sys/fs/cgroup/memory.current'),
  }
}

function readOptional(path) {
  try {
    return readFileSync(path, 'utf8').trim()
  } catch {
    return null
  }
}

function safeCommand(command, args) {
  try {
    return execFileSync(command, args, { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

function fileExists(path) {
  try {
    statSync(path)
    return true
  } catch {
    return false
  }
}

function exists(path) {
  return fileExists(path)
}

function readdirSafe(path) {
  try {
    return readdirSync(path)
  } catch {
    return []
  }
}

function sqlString(value) {
  return String(value).replaceAll("'", "''")
}

function numberOption(name, fallback) {
  const index = argv.indexOf(name)
  const value = index === -1 ? undefined : argv[index + 1]
  return value === undefined ? fallback : positiveInteger(name, Number(value))
}

function positiveInteger(name, value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  return value
}

function stringOption(name, fallback) {
  const index = argv.indexOf(name)
  return index === -1 ? fallback : (argv[index + 1] ?? fallback)
}
