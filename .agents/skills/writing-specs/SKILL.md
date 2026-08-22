---
name: writing-specs
description: Write a SPECS.md for a contract resource. Use when the user wants a SPECS.md for a resource at packages/contract, mentions "write the spec", "add SPECS.md", or asks to document a contract resource. Also use when adding a new resource or procedure — offer to update the SPECS.md.
---

# Writing SPECS.md

A SPECS.md lives at `contract/{resource}/SPECS.md`. It **complements** the typed contract code — schemas, routes, JSDoc — by carrying what code cannot express: business rules, behavioral guarantees, edge case resolution, and the implementation reasoning frontend and backend both need. Never duplicate what the code already states; always add what the code leaves unsaid.

## When to write

- When a new resource is created (alongside schema.ts, procedures, index.ts)
- When a procedure is added to an existing resource
- When business rules or behavior change in a way the code doesn't capture
- When the user asks

## Process

### 1. Read the resource

Read these files for the target resource:

- `contract/{resource}/schema.ts` — base schema, field constraints, derivations
- `contract/{resource}/query/*.ts` — all query procedures
- `contract/{resource}/command/*.ts` — all command procedures
- `contract/{resource}/index.ts` — list of assembled procedures
- `contract.ts` — confirms the resource is registered
- `schema.ts` — confirms schemas are re-exported

Also read the shared schema sources the resource uses (`schema/index.ts`) and the typed builder (`orpc/meta.ts`, `orpc/index.ts`).

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

| Field | Schema   | Constraints           | Description       |
| ----- | -------- | --------------------- | ----------------- |
| `id`  | `nanoid` | 21 chars, A-Za-z0-9_- | Unique identifier |

{Use the shared primitive name (e.g. `string256`, `nanoid`, `coercedDate`) — not the valibot pipeline.}

### Shared Primitives Used

| Primitive     | Input                                       | Output |
| ------------- | ------------------------------------------- | ------ |
| `coercedDate` | Date / number (unix ms) / string (ISO 8601) | Date   |

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

Backend implementations must publish every listed event. The JS identifier (defined in `contract/{resource}/events.ts` via `createEvent<T>`) is the canonical reference — use it for `emitter.emit()` and `emitter.on()`.

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

{Event JS identifiers follow the naming convention `E{Resource}{Action}` and are defined in `contract/{resource}/events.ts` using `createEvent<T>` from `@lomba/utils`. The identifier is the canonical reference for backend code — use it for `emitter.emit()` and `emitter.on()`.}

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
4. **Events documented per procedure:** Every command has an **Events Emitted** table. Queries have one too (usually "None" — but the section is present). §8 consolidates every event across the resource.
5. **Audience markers:** Every section header has one.
6. **Error codes match JSDoc:** Every `@errors` code appears in the procedure's error table and in §10.
