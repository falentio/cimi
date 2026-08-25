# oRPC Custom Success Statuses

## Conclusion

One contract-first oRPC procedure can represent multiple success statuses. In the
repo's oRPC `1.15.0` source, the supported mechanism is **detailed output**:
declare an output union whose variants contain literal `status` values (for
example `201` and `200`), and return the matching `{ status, body }` object at
runtime. `route.successStatus` remains the fallback status for compact output or
for a detailed variant that omits `status`.

The exact upstream source is pinned as the git submodule
`docs/research/vendor/orpc` at commit `815467f9e68ad15c25158cc532e69953944cfd7b`
(`v1.15.0`).

Do not use an OpenAPI `spec` override alone to achieve this. It changes the
generated Operation Object, but the handler runtime reads the procedure route and
the returned detailed output, not the generated document.

## Version And Repo Conventions

- `pnpm-lock.yaml:24-40` pins the oRPC catalog to `1.15.0`; the installed
  `@orpc/openapi` package confirms `version: "1.15.0"` at
  `node_modules/.pnpm/@orpc+openapi@1.15.0_crossws@0.3.5_ws@8.21.3/node_modules/@orpc/openapi/package.json:1-10`.
- Contracts use the v1 `.route({...})` API through `packages/contract/src/orpc/index.ts:1-4`.
  The installed declaration is `.../@orpc/contract/dist/shared/contract.TuRtB1Ca.d.ts:57-179`:

  > `successStatus?: number` ... `outputStructure?: OutputStructure` ...
  > `spec?: OpenAPIV3_1.OperationObject | ((current: OpenAPIV3_1.OperationObject) => OpenAPIV3_1.OperationObject)`

- Existing conventions are fixed per-operation statuses: creation procedures use
  `201` (`packages/contract/src/contract/organization/command/create.ts:11-24`),
  ordinary reads/updates use `200`, and void archive/removal procedures use
  `204` with `v.void()` (`packages/contract/src/contract/goal/command/archive.ts:6-24`).
  `initializeInstallation` is the current detailed-output exception: it uses
  `outputStructure: 'detailed'` with literal `200` and `201` variants
  (`packages/contract/src/contract/installation/command/initialize.ts:14-39`).
  No current contract uses `responseBodyHint` or a `spec` override.
- The API composition root uses the Fetch `OpenAPIHandler`
  (`apps/api/src/index.ts:3,28-45`), so the installed Fetch adapter is the
  relevant server runtime.

Vendored source-level equivalents:

- `docs/research/vendor/orpc/packages/contract/src/route.ts:64-138` defines
  `successStatus`, `outputStructure`, and detailed output's optional `status`,
  `headers`, and `body` fields.
- `docs/research/vendor/orpc/apps/content/docs/openapi/input-output-structure.md:67-110`
  documents the multiple-status union and runtime return values.
- `docs/research/vendor/orpc/packages/openapi/src/adapters/standard/openapi-codec.ts:74-121`
  selects `output.status ?? successStatus` when encoding the HTTP response.
- `docs/research/vendor/orpc/packages/openapi/src/adapters/fetch/openapi-handler.ts:16-19`
  composes the Fetch handler with the standard OpenAPI codec.

## How To Model 200 Or 201

The v1.15.0 documentation gives this exact pattern:
[`input-output-structure.md`][orpc-multiple-status] uses
`outputStructure: 'detailed'` and a union of objects with
`status: z.literal(201)` and `status: z.literal(200)`. The v1 source describes
the same API in [`Route`][orpc-route]: detailed output has optional `status`,
`headers`, and `body`; omitted `status` falls back to `successStatus`.

The vendored generator implements that contract in
`docs/research/vendor/orpc/packages/openapi/src/openapi-generator.ts:462-545`:

- Compact output creates exactly one response at `route.successStatus`.
- Detailed output expands the output union.
- A literal `status` becomes that response key; a missing literal uses the route
  status.
- Each success status must be unique; duplicate variants cause an OpenAPI
  generator error.
- A literal status must be an integer and not an oRPC error status. The public
  route contract documents the allowed range as `200-399`; use 2xx for this use
  case.

The upstream generator test at
`docs/research/vendor/orpc/packages/openapi/src/openapi-generator.test.ts:654-697`
verifies that a detailed union produces separate `200` and `201` OpenAPI
responses. Runtime coverage at
`docs/research/vendor/orpc/packages/openapi/src/adapters/standard/openapi-codec.test.ts:205-247`
verifies that detailed output uses the returned status and falls back when it is
omitted.

Therefore, the reliable contract shape is a detailed union with explicit `200`
and `201` variants, and the handler returns `status: 201` only on first
creation. Returning no status on the reuse branch uses the route's fallback
`successStatus: 200`.

## `spec` Overrides

The official [OpenAPI specification docs][orpc-spec] show `route.spec` replacing
the generated operation object, or a callback extending it. The vendored
generator confirms this at
`docs/research/vendor/orpc/packages/openapi/src/openapi-generator.ts:145-164`:

- An object-valued `route.spec` is used as-is and skips automatic request,
  success, and error response generation.
- A function-valued `route.spec` runs after automatic generation.

This is useful for descriptions, headers, or manually authored response objects,
and OpenAPI itself permits multiple response entries: the [Responses Object][oas-responses]
describes the possible responses for an operation, with one response definition
per HTTP status code. However, a `spec` override is documentation only. It does
not make a compact handler emit `201`; pair the document with detailed output if
the status varies at runtime.

## Body Hints And Output Mapping

In the installed `1.15.0` contract declaration, there is no
`responseBodyHint` field. The server codec uses the route's
`inputStructure`, `outputStructure`, and `successStatus`; its source-level
runtime encoder is
`docs/research/vendor/orpc/packages/openapi/src/adapters/standard/openapi-codec.ts:74-121`.

`responseBodyHint` belongs to newer oRPC OpenAPI metadata. The current v2 docs
describe it as a hint for **OpenAPILink response-body parsing**, alongside
`requestBodyHint`; it does not select the HTTP status or add response variants
([body hints][orpc-body-hints]). The newer source declaration shows
`responseBodyHint?: StandardBodyHint | undefined`
([`meta.ts`][orpc-meta-current]). Do not add that field to this repo's v1
contract route without an intentional oRPC upgrade.

## 204 No Content

The existing repo convention is correct at runtime: `successStatus: 204` plus
`v.void()` returns no body. A local smoke check through the installed
`OpenAPIHandler` produced status `204`, no `content-type`, and an empty body.
The installed codec serializes compact output as `{ status: successStatus,
body: serialize(output) }` (`.../openapi.DPiCV5hl.mjs:48-63`), and the Fetch bridge
passes that status/body to `new Response` (`.../@orpc/standard-server-fetch@1.15.0/.../dist/index.mjs:280-284`);
`serialize(undefined)` becomes an absent body.

For generated OpenAPI, the installed compact `v.void()` path emits
`204: { description: "OK", content: {} }` (verified with the local
`OpenAPIGenerator`). A detailed status-only output emits `204` without a
`content` member. OpenAPI's [Response Object][oas-response] makes `content`
optional; for strict no-body documentation, omitting `content` is the clearest
form. The runtime behavior is bodyless in either case.

## Runtime Metadata Boundary

The generated OpenAPI JSON is not consulted by the runtime adapters. The server
codec reads `procedure["~orpc"].route.successStatus` and `outputStructure` directly,
and returns the detailed output's `status` when present. The Fetch handler is
constructed from that codec, so the resulting status reaches the Fetch response.

**Recommended contract decision:** keep fixed `201` on dedicated create
procedures, as the repo currently does. If one procedure must be create-or-reuse,
use detailed output with a `200`/`201` union; use `spec` only to supplement or
replace documentation, not as the runtime status mechanism.

[orpc-multiple-status]: https://github.com/middleapi/orpc/blob/1.x/apps/content/docs/openapi/input-output-structure.md
[orpc-route]: https://github.com/middleapi/orpc/blob/1.x/packages/contract/src/route.ts
[orpc-spec]: https://github.com/middleapi/orpc/blob/1.x/apps/content/docs/openapi/openapi-specification.md
[orpc-body-hints]: https://v2.orpc.dev/docs/openapi/input-and-output-mapping
[orpc-meta-current]: https://github.com/middleapi/orpc/blob/dd4fc06d/packages/openapi/src/meta.ts
[oas-responses]: https://spec.openapis.org/oas/v3.1.1.html#responses-object
[oas-response]: https://spec.openapis.org/oas/v3.1.1.html#response-object
