---
name: writing-specs
description: Write a SPECS.md for a contract resource. Use when the user wants a SPECS.md for a resource under docs/specs, mentions "write the spec", "add SPECS.md", or asks to document a contract resource. Also use when adding a new resource or procedure — offer to update the SPECS.md.
---

# Writing SPECS.md

A SPECS.md lives at `docs/specs/{domain}/{resource}/SPECS.md`. It **complements** the typed contract declaration under `packages/contract/src/contract/{resource}` — schemas, routes, and procedure metadata — by carrying what code cannot express: business rules, behavioral guarantees, edge case resolution, and the implementation reasoning frontend and backend both need. Never duplicate what the code already states; always add what the code leaves unsaid.

## When to write

- When a new resource is created (alongside schema.ts, procedures, index.ts)
- When a procedure is added to an existing resource
- When business rules or behavior change in a way the code doesn't capture
- When the user asks

## Process

### 1. Read the resource

Read these files for the target resource:

- `packages/contract/src/contract/{resource}/schema.ts` — base schema, field constraints, derivations
- `packages/contract/src/contract/{resource}/query/*.ts` — all query procedures
- `packages/contract/src/contract/{resource}/command/*.ts` — all command procedures
- `packages/contract/src/contract/{resource}/index.ts` — list of assembled procedures
- `packages/contract/src/contract.ts` — confirms the resource is registered
- `packages/contract/src/schema.ts` — confirms schemas are re-exported

Also read the shared schema sources the resource uses (`packages/contract/src/schema/index.ts`) and the typed builder (`packages/contract/src/orpc/meta.ts`, `packages/contract/src/orpc/index.ts`).

### 2. Produce SPECS.md

Below is the template. Every section present unless genuinely N/A (a resource with no side effects skips §9; a resource with no queries skips §5). Mark each section with its primary audience: `**Audience:** Both`, `**Audience:** BE`, or `**Audience:** FE`.

Rules that bind every section:

- **Complement, don't duplicate.** If a fact lives in the `.ts` code (field type, required/optional marker, exact valibot derivation chain), reference it by schema name — don't restate it unless adding behavioral context.
- **Behavior is the key differentiator.** Sections §4–§9 exist to document what the schema alone cannot say: filtering semantics, idempotency, side effects, state transitions, events emitted, authorization ownership checks.
- **Every procedure in the resource must appear** in §4 (the quick index), and then as a subsection of §5 or §6.

```markdown
---
resource: { resource-name }
status: draft | implementing | implemented
version: 1.0.0
updated: { YYYY-MM-DD }
---

# {Resource} Resource

## 1. Overview & Lifecycle

**Audience:** Both

{2-3 paragraphs: what this resource represents in the domain, its role, consumers.}

{State machine diagram if the resource has a lifecycle: states → transitions → which command triggers each.}

{if stateless: note that the resource has no lifecycle.}

## 2. Base Schema

**Audience:** Both

### Server-Generated Fields

{List fields the server assigns and the client never sends: id, timestamps, etc.}

### Field Reference

| Field | Schema | Constraints                       | Description       |
| ----- | ------ | --------------------------------- | ----------------- |
| `id`  | `SId`  | 1-128 character opaque identifier | Unique identifier |

{Use the exported shared schema name (e.g. `SId`, `SName`, `SDate`, `SDateTime`) — not the valibot pipeline. Cimi-generated IDs use the in-house generator; its prefix and encoding are not API invariants. Field specs stay SId 1-128 opaque and never assert a prefix; see docs/specs/README.md for the generation registry.}

### Shared Primitives Used

| Primitive   | Input                                          | Output |
| ----------- | ---------------------------------------------- | ------ |
| `SDateTime` | ISO 8601 string with `Z` or an explicit offset | string |

{List only the shared primitives this resource actually uses.}

## 3. Endpoint Quick Index

**Audience:** FE

| #   | Procedure | Method | Path      | Auth        | CQRS    |
| --- | --------- | ------ | --------- | ----------- | ------- |
| Q1  | `{name}`  | GET    | `/{path}` | `public`    | query   |
| C1  | `{name}`  | POST   | `/{path}` | `protected` | command |

## 4. Queries

{One subsection per query. Prepend `Q{n}: ` to the heading to match §3.}

### Q1: `GET /{path}` — `{procedure}`

**Audience:** FE (shape), BE (behavior)

**Purpose:** {why this query exists.}

**Input:** `{SchemaName}` = derived from `{BaseName}` via {pick/omit/partial/extend}

| Field | Type | Required | Constraints |
| ----- | ---- | -------- | ----------- |

**Output:** `{SchemaName}` = {what it wraps}

| Field | Type | Description |
| ----- | ---- | ----------- |

**Behavior:** {pagination model, filtering rules, caching eligibility, read replica usage, sort defaults, empty-result semantics.}

**Events Emitted**

{None — queries are read-only. If a query does emit an event (e.g. audit), document it here.}

**Errors**

| Code          | HTTP | Trigger              |
| ------------- | ---- | -------------------- |
| `BAD_REQUEST` | 400  | {concrete condition} |

## 5. Commands

{One subsection per command. Prepend `C{n}: ` to match §3.}

### C1: `{METHOD} /{path}` — `{procedure}`

**Audience:** BE (implementation), FE (error handling + idempotency)

**Purpose:** {why this command exists.}

**Input:** `{SchemaName}` = derived from `{BaseName}` via {pick/omit/partial/extend}

| Field | Type | Required | Constraints |
| ----- | ---- | -------- | ----------- |

**Output:** `{SchemaName}` = {derivation}

**Behavior:** {server-generated fields, idempotency guarantees, authorization ownership checks, state transitions triggered, response code (200 vs 201).}

**Events Emitted**

| Event                          | Channel       | Payload         | Delivery                            | JS Identifier         |
| ------------------------------ | ------------- | --------------- | ----------------------------------- | --------------------- |
| `{resource}.{past-tense-verb}` | `event-store` | `{schema name}` | {sync \| outbox \| fire-and-forget} | `E{Resource}{Action}` |

Document only accepted domain events here. Internal acceptance-journal records, projector work, and lifecycle operations are not domain events. If the MVP emits no domain event, write `None in MVP`.

**Errors**

| Code | HTTP | Trigger |
| ---- | ---- | ------- |

## 6. Business Rules

**Audience:** BE

| Rule                            | Enforcement Point                                   | Affected Procedures |
| ------------------------------- | --------------------------------------------------- | ------------------- |
| {BR-01: describe the invariant} | {schema validation / handler logic / DB constraint} | C1, C2              |

## 7. Authorization Matrix

**Audience:** Both

| Auth Level  | Meaning                                | Procedures |
| ----------- | -------------------------------------- | ---------- |
| `public`    | No auth required                       | Q1, Q2     |
| `protected` | Valid JWT; ownership checks in handler | C1, C2     |

## 8. Event Catalog

**Audience:** BE

{Summary table of every event this resource publishes, consolidated from per-procedure event tables in §4 and §5. Backend implementations use this as the single index of what to emit and what to listen for.}

| Event               | Channel       | Published By | Payload         | Delivery                            | JS Identifier         |
| ------------------- | ------------- | ------------ | --------------- | ----------------------------------- | --------------------- |
| `{resource}.{verb}` | `event-store` | {procedure}  | `{schema name}` | {sync \| outbox \| fire-and-forget} | `E{Resource}{Action}` |

{If a later accepted contract introduces a domain event, reference its actual contract location and delivery boundary; do not invent an event identifier or utility package.}

## 9. Edge Cases

**Audience:** Both

- **{Case name}** — {the scenario}. → **Resolution:** {how it's handled}.

## 10. Error Code Catalog

**Audience:** Both

| Code     | HTTP     | Message                  | Trigger             |
| -------- | -------- | ------------------------ | ------------------- |
| `{CODE}` | {status} | {human-readable summary} | {precise condition} |

{Include both standard oRPC codes and domain-specific codes with (HTTP) suffix.}

## 11. Related Resources & Dependencies

**Audience:** Both

### Depends On

| Resource     | Integration Point                              |
| ------------ | ---------------------------------------------- |
| `{resource}` | {why: FK, ownership check, event subscription} |

### Used By

| Resource     | Integration Point               |
| ------------ | ------------------------------- |
| `{resource}` | {why: references this resource} |
```

### 3. Review the SPECS.md

Check these before declaring done:

1. **Coverage:** Every procedure in `index.ts` appears in §3, and has a subsection in §4 or §5.
2. **No code duplication:** The SPECS.md references schema names; it does not restate valibot pipelines.
3. **Behavior sections carry weight:** Each query/command subsection's behavior block says something the schema doesn't — filtering semantics, idempotency, authorization beyond `meta.auth`, ordering, caching.
4. **Events documented:** Every command states whether it emits a domain event. Read-only resources may state `No domain event channel is required by the MVP contract` in §8; add a per-query event note only when a query has an explicit audit side effect. Internal acceptance-journal records and lifecycle operation state are not domain events.
5. **Audience markers:** Every section header has one.
6. **Error codes match JSDoc:** Every `@errors` code appears in the procedure's error table and in §10.
