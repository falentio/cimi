# Astro Node Adapter SSR Lifecycle

Research completed 2026-08-24. No application source files were changed. The
findings below are based on Cimi's installed Astro packages, the generated
server entrypoint, official Astro documentation/source, and Node.js v24
documentation.

## Executive Conclusion

Cimi is configured for production SSR with `astro:build` output and the
`@astrojs/node` adapter in `standalone` mode (`apps/frontend/astro.config.mjs:6-10`).
The current installed versions are Astro `7.2.4` and `@astrojs/node` `11.1.4`
(`pnpm-lock.yaml:12-14,63-65`; `apps/frontend/node_modules/@astrojs/node/package.json:1-5,33-35`).

In this mode:

- The generated `dist/server/entry.mjs` creates the Astro application handler,
  creates and listens on the Node `http.Server` or `https.Server`, and
  automatically starts it when the entrypoint is run. The generated module
  exports `handler`, `options`, and `startServer`; it does not export a
  top-level `close()` (`apps/frontend/dist/server/entry.mjs:18353-18421`; [Node
  adapter server source](https://github.com/withastro/astro/blob/main/packages/integrations/node/src/server.ts)).
- `startServer()` returns a handle containing the underlying Node server,
  `closed()`, `done`, and `stop()`. The adapter's `stop()` uses the installed
  `server-destroy` dependency, which calls `server.close()` and destroys all
  currently tracked connection sockets (`apps/frontend/node_modules/@astrojs/node/dist/standalone.d.ts:6-23`; `apps/frontend/node_modules/@astrojs/node/dist/standalone.js:46-79`; `apps/frontend/node_modules/server-destroy/index.js:3-18`; [official standalone source](https://github.com/withastro/astro/blob/main/packages/integrations/node/src/standalone.ts)).
- Astro's adapter contract has server and preview entrypoints, but no general
  production application shutdown hook or adapter `close()` field
  (`apps/frontend/node_modules/astro/dist/types/public/integrations.d.ts:167-190`; [official adapter API](https://docs.astro.build/en/reference/adapter-reference/)).
- Cimi's application-owned `close()` is the correct place for Cimi resources:
  it checkpoints/closes DuckDB and then closes SQLite
  (`apps/frontend/src/server/app.ts:17-19,21-65`; `packages/db/src/duckdb/index.ts:52-75`; `packages/db/src/client.ts:23-29`).
  It is not the Astro server close operation.
- The current Cimi signal handler closes those application resources and then
  re-sends the signal (`apps/frontend/src/server/app.ts:67-101`). With direct
  standalone autostart, that does not give the HTTP server an explicit graceful
  drain phase. A launcher that needs graceful SSR shutdown must retain the
  adapter's `startServer()` handle, stop accepting requests, drain or force
  close connections, then close Cimi resources.

The recommended production ownership boundary is therefore:

```text
launcher owns the Node HTTP server handle
  -> stop accepting new connections
  -> drain in-flight requests within a deadline
  -> force-close remaining connections if the deadline expires
  -> close Cimi analytics, database, timers, workers, and clients
  -> allow the process to exit
```

## Status Vocabulary

- **Fact:** stated by official Astro/Node documentation, implemented in the
  installed first-party package, or observed in Cimi source/generated output.
- **Inference:** an operational conclusion from those facts.
- **Risk:** a behavior that can affect shutdown correctness or availability.
- **Unknown:** not defined by the reviewed sources.

## Cimi Version And Composition

### Configuration

The frontend uses `output: 'server'` and `node({ mode: 'standalone' })`
(`apps/frontend/astro.config.mjs:6-10`). The frontend package exposes `dev`,
`build`, and `preview` scripts (`apps/frontend/package.json:7-11`). The lockfile
resolves Astro to `7.2.4` and `@astrojs/node` to `11.1.4`, and the installed
adapter declares Astro `^7.2.1` as its peer (`pnpm-lock.yaml:12-14,63-65,498-501`; `apps/frontend/node_modules/@astrojs/node/package.json:33-35`).
Cimi requires Node `>=24.16.0 <25` (`package.json:14-20`).

### Vendored upstream source

The official Astro monorepo is vendored at
`docs/research/vendor/astro` and pinned to commit
`29af6da5c11aff673133f96df029f40345674f0e`. Its
`packages/integrations/node/package.json:1-40` reports `@astrojs/node` `11.1.4`,
matching Cimi's installed adapter. The relevant TypeScript sources are
`packages/integrations/node/src/{server,standalone,preview,middleware}.ts`.

### Request composition

Cimi's Astro middleware obtains a singleton application and forwards `/api`
requests to the Hono app's Fetch interface (`apps/frontend/src/middleware.ts:1-10`; `apps/frontend/src/server/app.ts:67-74`).
The Hono app mounts Better Auth and the oRPC/OpenAPI API; it does not create an
HTTP listener (`apps/api/src/index.ts:21-27,48-63`). Therefore the Hono app and
the Astro request handler are application/request composition, not ownership of
the external Node listening server.

The frontend composition root creates the control SQLite database, migrates it,
creates the DuckDB analytics database, constructs auth and the API app, and
returns an app-level `close()` method (`apps/frontend/src/server/app.ts:21-65`).
Better Auth is configured with a Drizzle adapter over the Cimi SQLite database
and exposes no separate close method in Cimi's `Auth` type
(`packages/auth/src/server.ts:14-29`). If future auth or API composition adds
timers, agents, workers, or background clients, those resources belong in this
same application-owned lifecycle rather than Astro request middleware.

## Generated Node Entrypoint

### Adapter entrypoint selection

The installed adapter's `getAdapter()` returns `serverEntrypoint:
"@astrojs/node/server.js"`, `previewEntrypoint:
"@astrojs/node/preview.js"`, and `entrypointResolution: "auto"`
(`apps/frontend/node_modules/@astrojs/node/dist/index.js:7-25`; [official adapter source](https://github.com/withastro/astro/blob/main/packages/integrations/node/src/index.ts)).
The current Astro adapter API describes auto entrypoint resolution as the
recommended approach and explicit exports as deprecated
(`apps/frontend/node_modules/astro/dist/types/public/integrations.d.ts:114-165`; [official integration API](https://docs.astro.build/en/reference/integrations-reference/)).

### Generated output

The official Node guide documents the default production server entrypoint as
`./dist/server/entry.mjs` ([Node adapter guide](https://docs.astro.build/en/guides/integrations-guide/node/),
"Middleware" and "Standalone" sections). The Cimi build was inspected at that
path after a temporary, untracked build-only externalization of the native
DuckDB package. The generated output contains the following behavior:

1. `standalone()` resolves `PORT`/`HOST`, creates the handler, creates the Node
   server, and calls `listen()` (`apps/frontend/dist/server/entry.mjs:18358-18366`).
2. `startServer()` returns the adapter runtime object, including `server` and
   `done` (`apps/frontend/dist/server/entry.mjs:18370-18373`).
3. The generated module creates `handler`, creates `startServer`, autostarts
   unless `ASTRO_NODE_AUTOSTART === 'disabled'`, and exports only
   `handler`, `options`, and `startServer` (`apps/frontend/dist/server/entry.mjs:18415-18421`).

The corresponding installed source is the same: `server.js` creates the Astro
app, selects the middleware or standalone handler, exports `handler`,
`options`, and `startServer`, and autostarts standalone mode unless disabled
(`apps/frontend/node_modules/@astrojs/node/dist/server.js:1-19`; [official server source](https://github.com/withastro/astro/blob/main/packages/integrations/node/src/server.ts)).

### Exported API by mode

| Mode                              | Entrypoint behavior                                                                                                                                    | Server ownership                                                                                  | Shutdown handle                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `middleware`                      | Exports a Node-compatible `handler(req, res, next, locals)`. Static file serving is not included.                                                      | The host framework creates and owns its HTTP server.                                              | The host framework's close API. The Astro handler has no close API.                                                  |
| `standalone`                      | Exports a handler and `startServer()`, and autostarts when run directly. It serves static files plus SSR routes.                                       | `@astrojs/node` creates and owns the Node HTTP/HTTPS server.                                      | `startServer()` returns `server.stop()`, `server.closed()`, and `done`; direct autostart discards that return value. |
| `astro preview` with Node adapter | The preview entrypoint imports the built module with autostart disabled, validates `handler`, creates a server, listens, and returns a preview server. | The Node adapter creates the server; Astro's preview command receives the `PreviewServer` handle. | The preview contract includes `stop()` and `closed()`.                                                               |

The middleware/standalone distinction and the `dist/server/entry.mjs` handler
export are documented by Astro ([Node adapter guide](https://docs.astro.build/en/guides/integrations-guide/node/),
"mode" and "Middleware" sections). The installed `UserOptions` type documents
the two modes and the middleware handler signature
(`apps/frontend/node_modules/@astrojs/node/dist/types.d.ts:2-9,39-45`).
The standalone handle and the actual server ownership are implemented in
`standalone.js` (`apps/frontend/node_modules/@astrojs/node/dist/standalone.js:14-30,46-79`).

## Server Ownership And Teardown API

### Production standalone

**Fact:** `createServer()` calls `http.createServer(listener)` unless the
`SERVER_CERT_PATH` and `SERVER_KEY_PATH` environment variables select
`https.createServer()` (`apps/frontend/node_modules/@astrojs/node/dist/standalone.js:46-58`).
It then decorates that server with `server-destroy`, registers a promise for the
`close` event, and exposes `stop()` (`:59-79`). The generated standalone entry
also closes the Astro logger when the Node server emits `close`
(`apps/frontend/node_modules/@astrojs/node/dist/standalone.js:24-30`).

**Fact:** There is no public top-level `entry.close()` in the generated module.
The only generated control point is `startServer()`, whose returned object
contains the decorated server handle (`apps/frontend/dist/server/entry.mjs:18401-18421`; `apps/frontend/node_modules/@astrojs/node/dist/server.d.ts:1-13`).

**Inference:** Running `node ./dist/server/entry.mjs` is convenient but gives a
custom process no reference to the adapter's server object. The process can
still receive signals, but application code cannot call the adapter's `stop()`
unless a custom launcher disables autostart and retains the `startServer()`
return value. `ASTRO_NODE_AUTOSTART` and `startServer()` are evidenced by the
current generated/source implementation, not by the basic standalone usage
section of the public guide; re-check them on adapter upgrades.

### Middleware mode

**Fact:** The official guide says middleware mode exports a handler compatible
with Node request/response objects and requires the surrounding framework to
serve static files. The example calls `app.listen(8080)` on the host framework
([Node adapter guide](https://docs.astro.build/en/guides/integrations-guide/node/),
"Middleware" section). The installed adapter's middleware wrapper only handles
request/error forwarding (`apps/frontend/node_modules/@astrojs/node/dist/middleware.js:1-29`).

**Conclusion:** In middleware mode, the host framework owns the HTTP server and
must close it. The Astro handler is not a server object and does not own a
listener to tear down.

### Preview mode

The adapter preview entrypoint disables standalone autostart, imports the built
server entrypoint, requires its `handler`, creates a server, listens, and returns
the adapter server object (`apps/frontend/node_modules/@astrojs/node/dist/preview.js:5-46`; [official preview source](https://github.com/withastro/astro/blob/main/packages/integrations/node/src/preview.ts)).
Astro's public `PreviewServer` type requires `closed()` and `stop()`
(`apps/frontend/node_modules/astro/dist/types/public/preview.d.ts:4-10`). Astro
preview resolves the adapter's preview entrypoint and receives that object
(`apps/frontend/node_modules/astro/dist/core/preview/index.js:45-75`).

This is different from production standalone autostart. It is a server handle
used by the preview command/programmatic preview API, not a production Astro
application lifecycle callback.

## Node HTTP Connection Semantics

The Node references below are the official v24 documentation, which matches
Cimi's Node major-version range. The exact latest v24 patch at research time was
v24.19.0; Cimi's engine begins at v24.16.0.

### Graceful close

`server.close()` stops accepting new connections and closes the server after
existing connections end. Current Node v24 documentation says idle connections
are closed before the close callback, while active requests can keep the close
pending ([Node HTTP `server.close()`](https://nodejs.org/docs/latest-v24.x/api/http.html#serverclosecallback);
[Node net `server.close()`](https://nodejs.org/docs/latest-v24.x/api/net.html#serverclosecallback)).
The `close` event is not emitted while connections remain open
([Node net `server` close event](https://nodejs.org/docs/latest-v24.x/api/net.html#event-close)).

This means a graceful sequence can wait for the adapter's `done` promise after
calling the underlying `server.close()`. Long-running SSR streaming responses,
uploads, stalled clients, or upgraded connections can delay completion. A
shutdown deadline is therefore required by the application/launcher, not by
Astro.

### Keep-alive

Node's `server.keepAliveTimeout` controls the inactivity delay after a response
finishes before a keep-alive socket is destroyed; the documented default is five
seconds ([Node HTTP `server.keepAliveTimeout`](https://nodejs.org/docs/latest-v24.x/api/http.html#serverkeepalivetimeout)).
Keep-alive can otherwise leave an idle socket around, but on current Node v24
`server.close()` closes idle connections as part of shutdown
([Node HTTP `server.close()`](https://nodejs.org/docs/latest-v24.x/api/http.html#serverclosecallback)).
Do not rely on the keep-alive timeout as the graceful-shutdown deadline: active
requests and non-idle sockets are governed by their own completion behavior.

For older Node versions, the `server.close()` idle-connection behavior differs;
the current Node documentation provides `server.closeIdleConnections()` for
explicit idle cleanup. Cimi's Node engine is v24, so this is a compatibility
caveat rather than the expected current path
([Node HTTP `server.closeIdleConnections()`](https://nodejs.org/docs/latest-v24.x/api/http.html#servercloseidleconnections)).

### Force close

Node v24 provides `server.closeAllConnections()`, which forcibly closes all
established HTTP connections and should be used after `server.close()` to avoid
new-connection races. It does not close upgraded connections such as WebSocket
or HTTP CONNECT sockets ([Node HTTP `server.closeAllConnections()`](https://nodejs.org/docs/latest-v24.x/api/http.html#servercloseallconnections)).
Those upgraded sockets need their own ownership and shutdown path if Cimi adds
them later.

The Node adapter's current `server.stop()` is more forceful than a pure graceful
`server.close()`: `server-destroy` calls `server.close()` and immediately calls
`destroy()` on every connection it tracked (`apps/frontend/node_modules/server-destroy/index.js:6-18`).
Therefore `stop()` is the correct final fallback or an acceptable hard-stop API,
but it should not be described as an in-flight-request drain.

## Astro Lifecycle Hooks And Middleware

### Integration hooks

Astro exposes `astro:server:setup`, `astro:server:start`, and
`astro:server:done` in the integration API. The official reference defines
`astro:server:done` as running just after the **dev server** is closed and
describes it as cleanup for work started by the dev server hooks
([Astro integration reference](https://docs.astro.build/en/reference/integrations-reference/#astroserverdone);
`apps/frontend/node_modules/astro/dist/types/public/integrations.d.ts:309-344`).

The installed Astro implementation runs `runHookServerDone()` from the Vite dev
container's `closeContainer()` after `viteServer.close()`
(`apps/frontend/node_modules/astro/dist/core/dev/container.js:91-102`; [official Astro source tree](https://github.com/withastro/astro/tree/main/packages/astro/src/core/dev)).
The hook is not invoked by the production standalone Node entrypoint. The
`astro:build:ssr` hook is a build-completion hook, not a runtime shutdown hook
([Astro integration reference](https://docs.astro.build/en/reference/integrations-reference/#astrobuiltssr)).

Astro's adapter type also has `AstroPrerenderer.teardown()`, but its type
comment says it runs after pages are prerendered, for build-time cleanup
(`apps/frontend/node_modules/astro/dist/types/public/integrations.d.ts:224-259`).
It is not a hook for a long-running production SSR process.

### Request middleware

Astro middleware is an `onRequest(context, next)` function that intercepts each
request and can return a response or continue the request chain
([Astro middleware guide](https://docs.astro.build/en/guides/middleware/);
[Astro middleware API](https://docs.astro.build/en/reference/modules/astro-middleware/)).
The official guide describes `context.locals` as request-specific and says it
lives and dies within one route request. There is no shutdown callback in the
middleware API.

Cimi's middleware follows this request-only model: it routes `/api` requests to
the app and calls `next()` for other paths (`apps/frontend/src/middleware.ts:4-10`).
It must not be used as the owner of process-wide DB, auth, timer, or server
teardown.

## Recommended Teardown Sequence For Cimi

This is a recommendation for a future production launcher/composition change;
it is not implemented by this research task.

### Production standalone

1. Start the generated module with `ASTRO_NODE_AUTOSTART=disabled` and retain
   the result of its exported `startServer()`. This is needed because direct
   autostart discards the server handle (`apps/frontend/dist/server/entry.mjs:18415-18421`).
2. Install one idempotent `SIGTERM`/`SIGINT` shutdown coordinator. Stop
   accepting new requests by calling the underlying Node server's graceful
   `close()` and retain/await the adapter `done` promise. Do not call the
   adapter's `stop()` first if the goal is graceful request completion.
3. Wait for in-flight requests and streamed responses up to a bounded deadline.
   This accounts for Node's active-connection semantics and avoids waiting
   forever on a client that never completes ([Node HTTP `server.close()`](https://nodejs.org/docs/latest-v24.x/api/http.html#serverclosecallback)).
4. If the deadline expires, use the adapter's `server.stop()` or the relevant
   Node force-close operations. Expect active requests to fail; record this as
   forced shutdown. Remember that upgraded connections are outside
   `closeAllConnections()` and need a separate owner if introduced
   ([Node HTTP `server.closeAllConnections()`](https://nodejs.org/docs/latest-v24.x/api/http.html#servercloseallconnections);
   `apps/frontend/node_modules/server-destroy/index.js:14-18`).
5. After the HTTP server is quiescent, call the Cimi application `close()`.
   Preserve the existing resource order: await `analytics.close()` first so
   DuckDB can checkpoint, then call `closeDb(db)` (`apps/frontend/src/server/app.ts:46-53`; `packages/db/src/duckdb/index.ts:66-75`).
6. Close every additional application-owned resource in the same coordinator:
   timers, background workers, outbound HTTP agents, queues, filesystem
   watchers, and any auth client that later gains an explicit close method. The
   current Better Auth construction uses the Cimi DB adapter and has no separate
   Cimi close operation (`packages/auth/src/server.ts:14-29`).
7. Remove shutdown listeners and let the process exit naturally, or set the
   intended exit code after cleanup. Do not re-send the original signal merely
   to exit after a graceful phase; Cimi's current `process.kill(process.pid,
signal)` path would terminate the process instead of proving that the HTTP
   server drained (`apps/frontend/src/server/app.ts:80-94`).

### Current direct standalone behavior

If Cimi continues to run `node ./dist/server/entry.mjs` directly, the adapter
autostarts the server and the app-level handler remains the only current signal
cleanup path. On the first signal, Cimi closes DuckDB/SQLite and then re-sends
the signal; no code in `apps/frontend/src/server/app.ts` has the generated
standalone `server` handle (`apps/frontend/src/server/app.ts:67-101`).

**Risk:** this ordering can terminate active SSR/API requests while application
resources are closing. The current test covers the app-level close method but
uses `app.fetch()` without a Node HTTP listener (`apps/frontend/src/server/testing/app.test.ts:13-16,44-46`). It does not verify listener ownership, keep-alive draining, signal handling, or forced shutdown.

### Dev and preview

- `astro dev`: allow Astro/Vite to own and close the dev server. Use
  `astro:server:done` only for dev-only resources created from
  `astro:server:setup`/`astro:server:start`, as documented by Astro. It is not a
  substitute for production resource ownership.
- `astro preview`: use the returned `PreviewServer.stop()`/`closed()` contract
  when controlling preview programmatically. The Node preview adapter returns
  that handle after it creates the server (`apps/frontend/node_modules/@astrojs/node/dist/preview.js:28-46`; `apps/frontend/node_modules/astro/dist/types/public/preview.d.ts:4-10`).
- In all modes, close app-owned Cimi resources from the Cimi app/launcher
  lifecycle, not from `onRequest` and not by assuming an Astro integration hook
  runs for production standalone.

## Open Questions And Risks

- **Launcher ownership:** Cimi has no checked-in production launcher that
  retains `startServer()`'s return value. The deployment command and process
  manager should be identified before implementing graceful shutdown.
- **Signal coordination:** Cimi currently installs signal handlers lazily when
  `getApiApp()` is first called and re-sends the received signal after app
  cleanup (`apps/frontend/src/server/app.ts:71-101`). The eventual launcher and
  app close path need one idempotent owner to avoid double close and signal
  races.
- **Request accounting:** There is no current in-flight request counter or
  readiness/draining state. A bounded server close is safer than closing DBs
  immediately, but a production policy should define the drain deadline and
  forced-request behavior.
- **Streaming and upgraded protocols:** Astro Node supports streaming by
  default in the generated app (`apps/frontend/dist/server/entry.mjs:18415-18418`).
  Long responses can delay graceful close. WebSocket/HTTP CONNECT support is not
  present in the reviewed Cimi composition, but Node's `closeAllConnections()`
  does not cover upgraded sockets if one is added later.
- **Native build verification:** The ordinary `pnpm --filter @cimi/frontend
build` attempt failed while the build tool tried to parse the installed
  DuckDB native binding as UTF-8. A temporary untracked build config that
  externalized the native package allowed inspection of the generated entrypoint;
  it was removed. This does not change the lifecycle evidence, which is also
  present in the installed adapter source and official guide.
- **Adapter upgrade drift:** `ASTRO_NODE_AUTOSTART`, generated exports, the
  `server-destroy` dependency, and the exact `startServer()` return shape are
  current `@astrojs/node@11.1.4` behavior. Re-check the generated entrypoint and
  adapter source after Astro or Node adapter upgrades.
- **Node version drift:** The Node connection semantics cited here are v24
  semantics. If Cimi broadens its engine below Node 19, explicitly account for
  the older idle-connection behavior and test `closeIdleConnections()` fallback.

## Source List

Sources were accessed on 2026-08-24. All external sources are first-party
Astro, Node.js, or the official Astro monorepo. Local paths identify the exact
installed/generated evidence used for version-specific claims.

| ID  | Source                                                                                                                                                                                                                                 | Evidence used                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | [Official `@astrojs/node` guide](https://docs.astro.build/en/guides/integrations-guide/node/)                                                                                                                                          | Node adapter modes, `dist/server/entry.mjs`, handler export, standalone autostart, static serving, sessions                                                          |
| S2  | [Official Node adapter standalone source](https://github.com/withastro/astro/blob/29af6da5c11aff673133f96df029f40345674f0e/packages/integrations/node/src/standalone.ts)                                                               | HTTP/HTTPS server creation, `startServer()` return shape, `stop()` implementation, `done` promise                                                                    |
| S3  | [Official Node adapter server source](https://github.com/withastro/astro/blob/29af6da5c11aff673133f96df029f40345674f0e/packages/integrations/node/src/server.ts)                                                                       | Generated handler/options/startServer exports and autostart gate                                                                                                     |
| S4  | [Official Node adapter preview source](https://github.com/withastro/astro/blob/29af6da5c11aff673133f96df029f40345674f0e/packages/integrations/node/src/preview.ts)                                                                     | Preview imports built handler with autostart disabled and returns a server handle                                                                                    |
| S5  | [Official Node adapter middleware source](https://github.com/withastro/astro/blob/29af6da5c11aff673133f96df029f40345674f0e/packages/integrations/node/src/middleware.ts)                                                               | Middleware wrapper is request/error handling, not listener ownership                                                                                                 |
| S6  | [Astro integration reference](https://docs.astro.build/en/reference/integrations-reference/)                                                                                                                                           | Integration hook names, `astro:server:done` dev-only scope, build hooks, adapter API                                                                                 |
| S7  | [Astro middleware guide](https://docs.astro.build/en/guides/middleware/)                                                                                                                                                               | `onRequest`, `next`, request-local lifecycle, `locals` scope                                                                                                         |
| S8  | [Installed Astro integration types](../../node_modules/.pnpm/astro@7.2.4_@emnapi+core@1.11.1_@emnapi+runtime@1.11.3_@types+node@24.13.3_jiti@2.7.0_typescript@6.0.3_yaml@2.9.0/node_modules/astro/dist/types/public/integrations.d.ts) | Astro `7.2.4` adapter fields, integration hooks, prerenderer teardown                                                                                                |
| S9  | [Node.js v24 HTTP API](https://nodejs.org/docs/latest-v24.x/api/http.html)                                                                                                                                                             | `server.close()`, keep-alive timeout, idle/all connection close behavior                                                                                             |
| S10 | [Node.js v24 Net API](https://nodejs.org/docs/latest-v24.x/api/net.html)                                                                                                                                                               | server close event and existing-connection semantics                                                                                                                 |
| S11 | Installed `@astrojs/node@11.1.4` metadata/source                                                                                                                                                                                       | `apps/frontend/node_modules/@astrojs/node/package.json:1-35`; `apps/frontend/node_modules/@astrojs/node/dist/{index,server,standalone,preview,middleware}.{js,d.ts}` |
| S12 | Cimi frontend composition root                                                                                                                                                                                                         | `apps/frontend/astro.config.mjs:6-10`; `apps/frontend/src/middleware.ts:1-10`; `apps/frontend/src/server/app.ts:17-101`                                              |
| S13 | Cimi app/database/auth sources                                                                                                                                                                                                         | `apps/api/src/index.ts:21-63`; `packages/db/src/client.ts:11-29`; `packages/db/src/duckdb/index.ts:28-89`; `packages/auth/src/server.ts:14-29`                       |
| S14 | Generated Cimi server entrypoint                                                                                                                                                                                                       | `apps/frontend/dist/server/entry.mjs:18353-18421`, produced from the configured Astro build after build-only native-package externalization                          |
| S15 | [Vendored official Astro source](https://github.com/withastro/astro/tree/29af6da5c11aff673133f96df029f40345674f0e)                                                                                                                     | `docs/research/vendor/astro/packages/integrations/node/src/{server,standalone,preview,middleware}.ts`; pinned to the adapter version used by Cimi                    |
