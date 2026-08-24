# oRPC Input-Aware Authorization

Research completed 2026-08-24. No application source files were changed.

## Scope And Version

Cimi's lockfile resolves the oRPC packages to `1.15.0`
(`pnpm-lock.yaml:22-46,1252-1306`). The vendored upstream repository is a clean
`v1.15.0` snapshot at commit
`815467f9e68ad15c25158cc532e69953944cfd7b`
(`docs/research/vendor/orpc/package.json:1-5`).
The findings below therefore describe the v1 runtime first. The official site
currently advertises oRPC v2 as public beta; the version difference is recorded
at the end.

## Findings

### Cimi-specific authorization boundary

Cimi's metadata vocabulary has expanded from three coarse gates to seven values in
`packages/contract/src/orpc/meta.ts:3-17`, and the shared contract test publishes
the same list at `packages/contract/src/schema/shared-contract.test.ts:55-64`.
The important distinction is that these values do not all describe properties of
the authenticated actor:

| Metadata value | Decision needed | Typical input/resource key |
| --- | --- | --- |
| `public` | No authenticated actor; validate the public capability or identifier and its resource binding. | `publicDashboardIdentifier` or another bearer key |
| `authenticated` | A user exists; many procedures also require persisted membership in the organization or site named by the request. | `organizationId`, `siteId`, or invitation token |
| `admin` | Existing coarse label, but overloaded between organization/site management and installation administration. | `organizationId`, `siteId`, or installation scope |
| `owner` | The current user is the persisted owner of the requested organization. | `organizationId`, or a `siteId` that must first resolve to its organization |
| `site-admin` | The current user has site-management authority for the requested site or its organization. | `siteId`, or `organizationId` for site creation |
| `organization-admin` | The current user is an owner/administrator of the requested organization. | `organizationId` |
| `installation-admin` | The configured installation-admin flow authorizes an installation-wide operation. | Usually no resource identifier; sometimes an installation-scoped input |

The three scope-specific names are vocabulary only at present: current
procedures still use the overloaded `admin` metadata value for those behaviors.
The table describes the authorization decision those names would need to select,
not an existing implementation.

The contract and specs demonstrate why an actor-only check is insufficient:

- `getSite` accepts `siteId` and requires persisted membership, while
  `createSite` accepts `organizationId` and requires Site-management authority
  (`packages/contract/src/contract/site/query/get.ts:5-26`,
  `packages/contract/src/contract/site/command/create.ts:5-29`).
- Organization and membership commands similarly carry `organizationId`; the
  owner/admin decision is against the persisted membership, not only the
  Better Auth user (`packages/contract/src/contract/organization/schema.ts:15-16`,
  `packages/contract/src/contract/membership/schema.ts:24-27`).
- The specs explicitly require persisted membership re-resolution and stale
  session rejection (`docs/specs/organization-site-governance/membership/SPECS.md:103-119,127-145`),
  and distinguish organization/site administration from installation
  administration (`docs/specs/organization-site-governance/site/SPECS.md:163-169`,
  `docs/specs/system-data-lifecycle/installation/SPECS.md:69-107`).

There is not an authorization middleware wired into the API yet. The only
implemented procedure is health, and the OpenAPI handler currently receives an
empty context (`apps/api/src/index.ts:21-60`). The existing `packages/guard`
package only contains actor-level assertions for a Better Auth admin role or a
user ID comparison (`packages/guard/src/guard.ts:8-31`). It is therefore a
future composition point, not evidence that the expanded metadata is already
enforced.

### 1. Procedure middleware receives procedure input, not `Request`

In v1, the middleware call signature is `(options, input, output)`. `options`
contains `context`, `path`, `procedure`, `signal`, `lastEventId`, `next`, and
typed `errors`; the procedure input is the second argument
(`packages/server/src/middleware.ts:26-39,46-61`). The official middleware docs
explicitly describe this second argument as enabling permission checks and show
mapping an object input to an authorization key
([Middleware Input](https://orpc.dev/docs/middleware#middleware-input)).

The HTTP body is decoded before the procedure client runs. The Fetch adapter
turns `Request` into a lazy, cached standard request body
(`packages/standard-server-fetch/src/request.ts:7-21`); the OpenAPI codec then
decodes it into procedure input. For compact OpenAPI input, body data is merged
with route params (`packages/openapi/src/adapters/standard/openapi-codec.ts:33-53`).
For detailed input, middleware sees the shaped object with `params`, `query`,
`headers`, and `body` fields
(`docs/research/vendor/orpc/packages/openapi/src/adapters/standard/openapi-codec.ts:55-71`).

Therefore, a procedure middleware should inspect its typed `input` argument. It
does not receive the raw `Request`, raw bytes, or a separate `request.body` in
its options. A raw request is available to a standard-handler interceptor via
`StandardHandlerInterceptorOptions.request`
(`packages/server/src/adapters/standard/handler.ts:23-34`), which is a
transport-level hook rather than procedure authorization middleware.

### 2. Validated input depends on middleware placement

The v1 executor inserts input validation at `inputValidationIndex`, then passes
the resulting `currentInput` to the middleware and to `next`
(`packages/server/src/procedure-client.ts:226-258`). The handler receives that
same current value (`:263-275`). The default initial validation index is `0`
(`packages/server/src/config.ts:7-15`). Calling `.input(schema)` records the
validation position after the middlewares already registered
(`packages/server/src/builder.ts:239-250`).

This gives the following rule:

- `os.use(middleware).input(schema)`: the middleware runs before input validation
  and must treat its input as unvalidated.
- `os.input(schema).use(middleware)`: the middleware runs after input validation
  and receives the schema's output.

The official v1 lifecycle documentation states the same behavior: middleware
registered before `.input` runs before validation; middleware registered after it
runs after validation ([Server-Side Clients: Middlewares Order](https://orpc.dev/docs/client/server-side#middlewares-order)).
If every middleware should run after input validation, the documented
`$config({ initialInputValidationIndex: Number.NEGATIVE_INFINITY, ... })` setting
forces validation to the front of the pipeline (`apps/content/docs/client/server-side.md:126-139`).

This ordering is the main authorization safety boundary. An input-aware guard
should be placed after the relevant input schema unless it intentionally handles
unvalidated transport data.

#### Contract-first placement detail

`implement(contract)` carries the contract's input schema, metadata, and route
definition into the server builder (`docs/research/vendor/orpc/packages/server/src/implementer.ts:99-118`).
For a procedure-local middleware appended to that implementation, the default
contract input-validation index remains at the front, so
`implement(contract).someProcedure.use(resourceGuard)` can receive validated
input. The builder's `.use` appends the middleware without moving that existing
index (`docs/research/vendor/orpc/packages/server/src/procedure-decorated.ts:139-147`).

Router-level middleware is different: inherited middleware is prepended and the
validation index is shifted to preserve that order
(`docs/research/vendor/orpc/packages/server/src/router-utils.ts:142-153`). A router-wide middleware
that needs validated input must therefore use the documented configuration that
puts input validation at the front, or the guard should remain procedure-local
after the contract input boundary
(`docs/research/vendor/orpc/apps/content/docs/client/server-side.md:126-139`).
This distinction matters if Cimi later adds one global metadata dispatcher plus
resource-specific guards.

### 3. Mapping lets a reusable guard inspect only its authorization key

The v1 API supports both direct input matching and mapping:

```ts
const canUpdate = os.middleware(async ({ context, next }, siteId: string) => {
  if (!(await canUserAccessSite(context.user.id, siteId))) {
    throw new ORPCError('FORBIDDEN')
  }

  return next()
})

const update = os
  .input(SUpdateInput)
  .use(canUpdate, input => input.siteId)
  .handler(/* ... */)
```

The procedure overload accepts a mapping function from the validated procedure
input to the middleware's input type (`packages/server/src/procedure-decorated.ts:86-147`).
At runtime, `.use(middleware, mapInput)` decorates the middleware with
`.mapInput`; the decorator calls the map before invoking the original middleware
(`packages/server/src/middleware-decorated.ts:81-99`). The docs call the method
`.mapInput` and also support `middleware.concat(...)`
(`apps/content/docs/middleware.md:117-172`).

For a guard that needs multiple fields, omit the mapping and type the middleware
input as the full schema output. For a guard that needs one resource identifier,
mapping avoids coupling the reusable guard to every procedure's full input shape.
The mapping must be attached after `.input(...)` when the guard requires the
validated or transformed value.

### 4. Context carries authentication and authorization dependencies

oRPC distinguishes initial context, supplied by the caller, from execution
context, injected by middleware. The official context docs recommend initial
context for environment-specific dependencies and middleware for runtime values
such as authenticated users ([Context](https://orpc.dev/docs/context)).

`next({ context: ... })` merges additional context with the current context at
runtime (`packages/server/src/procedure-client.ts:247-258` and
`packages/server/src/context.ts:11-15`). The type-level `$context`/middleware
machinery makes a middleware's required context explicit
(`packages/server/src/middleware-decorated.ts:7-20`). A practical authorization
composition is therefore:

1. An authentication middleware derives `user` or `session` and injects it.
2. A static policy middleware may inspect `procedure['~orpc'].meta.auth` to
   select public/authenticated/admin behavior.
3. A resource middleware, after `.input(...)`, uses `context.user` plus the
   validated input's resource key to query the authorization store.
4. The handler runs only after the resource check calls `next()`.

### 5. Route metadata, procedure metadata, and router path are available

The middleware options expose both `path` and `procedure`
(`packages/server/src/middleware.ts:26-39`). `path` is the matched router path:
the standard handler obtains it from the matcher and passes it into the procedure
client (`packages/server/src/adapters/standard/handler.ts:100-142`). It is useful
for logging or a generic policy table, but it is not the resource identifier.

The procedure object contains its `~orpc` definition. The definition includes
`meta`, `route`, optional `inputSchema`, and optional `outputSchema`
(`packages/contract/src/procedure.ts:7-18`), and the server procedure adds the
middleware list, validation indexes, and handler
(`packages/server/src/procedure.ts:35-47`). Thus middleware can read, for
example, `procedure['~orpc'].meta.auth` or
`procedure['~orpc'].route.method/path`.

Metadata is static procedure configuration: `.meta(...)` spread-merges metadata
(`packages/server/src/procedure-decorated.ts:54-67`; official
[Metadata](https://orpc.dev/docs/metadata)). It is appropriate for selecting a
coarse authorization class, but it cannot determine whether the current user may
access the particular `siteId`, `organizationId`, or other target supplied by
the request. That decision belongs in an input-aware guard using context and the
authorization data store.

### 6. Procedure composition preserves middleware order

Builders are immutable: `.use(...)` creates a new procedure definition and
appends the middleware (`packages/server/src/procedure-decorated.ts:139-147`).
Reusable bases can consequently be composed with `.use` and then extended with
more middleware, input schemas, metadata, and a handler; the official procedure
docs describe this as the reusability pattern
([Procedure: Reusability](https://orpc.dev/docs/procedure#reusability)).

Router-level composition prepends inherited middleware to procedure middleware
and adjusts the validation indexes to preserve the input-validation boundary
(`packages/server/src/router-utils.ts:142-153`). In contract-first code,
`implement(contract)` creates an implementation builder carrying the contract's
schemas and metadata (`packages/server/src/implementer.ts:99-118`). This means a
global auth middleware can be shared, while a procedure-specific input-aware
guard can still be appended at the procedure's `.input(...).use(...)` seam.

## Authorization Recommendation

Use static metadata as a **coarse selector**, not as the complete authorization
decision. A practical two-layer design is:

1. Authentication middleware resolves the session/user and injects it into
   context. It does not inspect the procedure body.
2. A static policy middleware can read
   `procedure['~orpc'].meta.auth` and reject missing authentication or dispatch
   broad categories.
3. A procedure-specific resource guard, attached after the contract input
   boundary, reads the validated input and checks persisted membership/ownership
   using context dependencies.
4. The handler performs domain invariants and mutation transaction checks that
   are not merely authorization, such as owner protection or lifecycle state.

The resulting flow is:

```text
request body + initial auth context
  -> adapter decode / OpenAPI body mapping
  -> procedure input validation
  -> static auth policy
  -> input-aware resource guard
       context.user + validated input.siteId/organizationId
  -> handler
```

For Cimi's v1.15 runtime, the preferred seam is an implementation procedure
with an input-aware middleware, using the second `.use` argument when a reusable
guard needs only one key:

```text
implementedProcedure.use(canManageSite, input => input.siteId)
```

If a guard needs multiple fields or a discriminated union, pass the full
validated input instead. For example, collection-policy authorization must branch
on `scope` and then use `policy.siteId` for the Site variant
(`packages/contract/src/contract/collection-policy/schema.ts:43-74`). Do not make
the resource decision solely from `procedure['~orpc'].meta.auth`, `path`, or the
HTTP route: those values are static or route-level and do not identify the
requested resource's ownership or membership.

### Alternatives and trade-offs

| Approach | Benefits | Risks / limits |
| --- | --- | --- |
| Static metadata plus input-aware middleware | Keeps the contract vocabulary discoverable while putting resource checks at a typed, validated seam; reusable guards can map only their key. | Requires deliberate middleware placement and a policy dispatcher that does not pretend every value is actor-only. |
| Rich metadata containing a resource kind/key selector | A generic dispatcher can choose `organizationId`, `siteId`, or installation policy from contract metadata. | Adds string/configuration coupling and central branching; unusual procedures still need explicit guards. Metadata selects a check but cannot replace the persisted lookup. |
| Handler-level authorization helpers | Makes each domain rule explicit and is straightforward for complex transactions and error semantics. | Repetition and inconsistent enforcement become likely; authorization is easier to forget when adding a procedure. |
| Request/interceptor-level body inspection | Useful for transport authentication, logging, or adapter-wide concerns. | It sees the raw transport request, duplicates decoding/validation, and is the wrong layer for resource authorization. Procedure middleware already receives decoded input. |

The recommended direction is the first approach, with the second used only for
stable, repeated policy shapes. Keep domain-specific invariants in handlers or
domain services even when a middleware performs the early access check.

## Version Note: v1 Versus Current v2 Beta

The official site currently links to an oRPC v2 public beta. The v2 official
middleware and procedure docs use `.adaptInput(...)` instead of v1's `.mapInput`
and `.use(middleware, mapInput)`, and the v2 middleware callback uses `done` for
early output rather than v1's third `output` callback. The v2 implementation also
tracks ordered input schemas rather than v1's single `inputValidationIndex`:

- [oRPC v2 Middleware](https://v2.orpc.dev/docs/middleware)
- [oRPC v2 Procedure](https://v2.orpc.dev/docs/procedure)
- [v2 `middleware.ts`](https://raw.githubusercontent.com/middleapi/orpc/main/packages/server/src/middleware.ts)
- [v2 `procedure-client.ts`](https://raw.githubusercontent.com/middleapi/orpc/main/packages/server/src/procedure-client.ts)

These names should not be mixed into Cimi until its oRPC major version changes.

## Source Register

Primary official documentation and source:

- [v1 Middleware](https://orpc.dev/docs/middleware)
- [v1 Procedure](https://orpc.dev/docs/procedure)
- [v1 Context](https://orpc.dev/docs/context)
- [v1 Metadata](https://orpc.dev/docs/metadata)
- [v1 Server-Side Client Lifecycle](https://orpc.dev/docs/client/server-side)
- [v1 `middleware.ts`](https://github.com/middleapi/orpc/blob/1.x/packages/server/src/middleware.ts)
- [v1 `procedure-decorated.ts`](https://github.com/middleapi/orpc/blob/1.x/packages/server/src/procedure-decorated.ts)
- [v1 `procedure-client.ts`](https://github.com/middleapi/orpc/blob/1.x/packages/server/src/procedure-client.ts)
- [v1 `openapi-codec.ts`](https://github.com/middleapi/orpc/blob/1.x/packages/openapi/src/adapters/standard/openapi-codec.ts)

Vendored primary source snapshot:

- `docs/research/vendor/orpc` at commit `815467f9e68ad15c25158cc532e69953944cfd7b` (`v1.15.0`)
- `docs/research/vendor/orpc/apps/content/docs/middleware.md:100-172`
- `docs/research/vendor/orpc/apps/content/docs/context.md:8-12,60-63,111-148`
- `docs/research/vendor/orpc/apps/content/docs/metadata.md:17-49`
- `docs/research/vendor/orpc/packages/server/src/middleware.ts:26-67`
- `docs/research/vendor/orpc/packages/server/src/procedure-client.ts:167-196,226-276`
- `docs/research/vendor/orpc/packages/server/src/procedure-decorated.ts:86-147`
- `docs/research/vendor/orpc/packages/server/src/middleware-decorated.ts:81-122`
- `docs/research/vendor/orpc/packages/server/src/adapters/standard/handler.ts:100-142`
- `docs/research/vendor/orpc/packages/openapi/src/adapters/standard/openapi-codec.ts:33-71`
