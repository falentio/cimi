---
resource: hello
status: implemented
version: 1.0.0
updated: 2026-08-25
---

# Hello Resource

This is an illustrative resource specification. It demonstrates the shape of a
small Cimi contract but is not part of the first-release product surface.

## 1. Overview & Lifecycle

**Audience:** Both

The `hello` resource represents short greeting records. A greeting has a
recipient name and message, can be read publicly, and can be created or removed
by its authenticated owner. The resource also includes a stateless `world`
query that computes a greeting without reading or writing storage.

Greeting records are immutable after creation. Their lifecycle is a hard-delete
transition:

```text
present -> removed
```

There is no update procedure, soft-delete state, or first-release idempotency
guarantee for removal.

## 2. Base Schema

**Audience:** Both

### Server-Generated Fields

| Field       | Description                                                  |
| ----------- | ------------------------------------------------------------ |
| `id`        | Opaque Cimi identifier assigned on create. Immutable.        |
| `ownerId`   | Authenticated User identifier assigned on create. Immutable. |
| `createdAt` | Server creation timestamp. Immutable.                        |

### Field Reference

| Field       | Schema          | Constraints                 | Description                 |
| ----------- | --------------- | --------------------------- | --------------------------- |
| `id`        | `SId`           | 1-128 characters, opaque    | Unique greeting identifier. |
| `ownerId`   | `SId`           | 1-128 characters, opaque    | User that may remove it.    |
| `name`      | `SName`         | 1-256 characters, non-empty | Greeting recipient.         |
| `message`   | `SHelloMessage` | 1-256 characters, non-empty | Greeting text.              |
| `createdAt` | `SDateTime`     | Valid ISO 8601 date-time    | Creation time.              |

`SHelloMessage` is a resource-local bounded string schema. It is not a shared
cross-resource primitive.

### Shared Primitives Used

| Primitive   | Input                                       | Output |
| ----------- | ------------------------------------------- | ------ |
| `SId`       | Non-empty string                            | string |
| `SName`     | Non-empty string up to 256 characters       | string |
| `SDateTime` | ISO 8601 string with `Z` or explicit offset | string |

## 3. Endpoint Quick Index

**Audience:** FE

These routes are illustrative RPC paths served by the API for this example
resource. They are not part of the first-release product surface.

| #   | Procedure | Method | Path            | Auth            | CQRS    |
| --- | --------- | ------ | --------------- | --------------- | ------- |
| Q1  | `list`    | GET    | `/hello/list`   | `public`        | query   |
| Q2  | `get`     | GET    | `/hello/get`    | `public`        | query   |
| Q3  | `world`   | GET    | `/hello/world`  | `public`        | query   |
| C1  | `create`  | POST   | `/hello/create` | `authenticated` | command |
| C2  | `remove`  | POST   | `/hello/remove` | `authenticated` | command |

## 4. Queries

**Audience:** Both

### Q1: `GET /hello/list` - `list`

**Audience:** FE (shape), BE (behavior)

**Purpose:** List greeting records visible to the caller.

**Input:** `SHelloListInput` combines `SOffsetPaginationInput` with an optional
`name` filter.

| Field    | Type   | Required | Default | Constraints                         |
| -------- | ------ | -------- | ------- | ----------------------------------- |
| `offset` | number | no       | 0       | Integer greater than or equal to 0  |
| `limit`  | number | no       | 20      | Integer from 1 through 100          |
| `name`   | string | no       | -       | Case-insensitive substring, max 256 |

**Output:** `SHelloListOutput` contains `items` and `SOffsetPage` metadata.

| Field        | Type           | Description                   |
| ------------ | -------------- | ----------------------------- |
| `items[]`    | `SHelloBase[]` | Greeting records in the page. |
| `nextOffset` | number or null | Offset for the next page.     |
| `hasMore`    | boolean        | Whether another page exists.  |
| `totalCount` | number         | Count matching the filter.    |

**Behavior:**

- Results are sorted by `createdAt` descending, then `id` descending as a stable tie-breaker.
- `offset` is a zero-based live offset. Pages may shift when another greeting is created or removed.
- `name` matches a case-insensitive substring of the stored name.
- An empty result is successful and returns `items: []`, `hasMore: false`, and `nextOffset: null`.
- The query is public and does not disclose ownership-based filtering.

**Errors:**

| Code          | HTTP | Trigger                                |
| ------------- | ---- | -------------------------------------- |
| `BAD_REQUEST` | 400  | Pagination or filter input is invalid. |

### Q2: `GET /hello/get` - `get`

**Audience:** FE (shape), BE (behavior)

**Purpose:** Fetch one greeting by its identifier.

**Input:** `SHelloGetInput` selects `id` from `SHelloBase`.

| Field | Type   | Required | Constraints         |
| ----- | ------ | -------- | ------------------- |
| `id`  | string | yes      | Valid opaque `SId`. |

**Output:** `SHelloGetOutput` is the complete `SHelloBase` record.

**Behavior:**

- Lookup uses the greeting identifier only.
- The query is read-only and safe to cache according to the transport cache policy.
- A removed or unknown identifier returns `NOT_FOUND`.

**Errors:**

| Code          | HTTP | Trigger                         |
| ------------- | ---- | ------------------------------- |
| `BAD_REQUEST` | 400  | `id` is not a valid `SId`.      |
| `NOT_FOUND`   | 404  | No greeting has the given `id`. |

### Q3: `GET /hello/world` - `world`

**Audience:** FE (shape), BE (behavior)

**Purpose:** Compute a greeting for a supplied name without using storage.

**Input:** `SHelloWorldInput` selects `name` from `SHelloBase`.

| Field  | Type   | Required | Constraints                    |
| ------ | ------ | -------- | ------------------------------ |
| `name` | string | yes      | Non-empty, max 256 characters. |

**Output:** `SHelloWorldOutput` contains one `message` field using
`SHelloMessage`.

| Field     | Type            | Description                    |
| --------- | --------------- | ------------------------------ |
| `message` | `SHelloMessage` | Deterministic greeting result. |

**Behavior:**

- The result is exactly `Hello, {name}!` after preserving the supplied name.
- The procedure performs no database access and has no persistence side effect.
- The query is deterministic for the same valid input and may be cached.

**Errors:**

| Code          | HTTP | Trigger                               |
| ------------- | ---- | ------------------------------------- |
| `BAD_REQUEST` | 400  | `name` is empty or exceeds 256 chars. |

## 5. Commands

**Audience:** Both

### C1: `POST /hello/create` - `create`

**Audience:** FE (error handling), BE (implementation)

**Purpose:** Persist a new immutable greeting owned by the authenticated User.

**Input:** `SHelloCreateInput` omits `id`, `ownerId`, and `createdAt` from
`SHelloBase`.

| Field     | Type   | Required | Constraints                    |
| --------- | ------ | -------- | ------------------------------ |
| `name`    | string | yes      | Non-empty, max 256 characters. |
| `message` | string | yes      | Non-empty, max 256 characters. |

**Output:** `SHelloCreateOutput` is the complete created `SHelloBase` record.

**Behavior:**

- The server generates `id`, records the authenticated principal as `ownerId`, and sets `createdAt`.
- Identical requests are not deduplicated; each successful request creates a distinct greeting.
- The greeting is immutable because the resource has no update procedure.
- A successful create returns HTTP `201`.

**Events Emitted:** None in MVP. Creation is not a domain event channel.

**Errors:**

| Code           | HTTP | Trigger                           |
| -------------- | ---- | --------------------------------- |
| `BAD_REQUEST`  | 400  | Name or message validation fails. |
| `UNAUTHORIZED` | 401  | Caller is not authenticated.      |

### C2: `POST /hello/remove` - `remove`

**Audience:** FE (error handling), BE (implementation and authorization)

**Purpose:** Permanently remove a greeting owned by the authenticated User.

**Input:** `SHelloRemoveInput` selects `id` from `SHelloBase`.

| Field | Type   | Required | Constraints         |
| ----- | ------ | -------- | ------------------- |
| `id`  | string | yes      | Valid opaque `SId`. |

**Output:** `SHelloRemoveOutput` contains the removed `id`.

| Field | Type   | Description                  |
| ----- | ------ | ---------------------------- |
| `id`  | string | Identifier that was removed. |

**Behavior:**

- The handler verifies that the greeting exists and that its `ownerId` matches the authenticated principal.
- Missing greetings and greetings owned by another User both return indistinguishable `NOT_FOUND`.
- Removal is a hard delete and is not idempotent. A repeat after successful removal returns `NOT_FOUND`.
- A successful removal returns HTTP `200` with the removed `id`.

**Events Emitted:** None in MVP. Removal is not a domain event channel.

**Errors:**

| Code           | HTTP | Trigger                                       |
| -------------- | ---- | --------------------------------------------- |
| `BAD_REQUEST`  | 400  | `id` is not a valid `SId`.                    |
| `UNAUTHORIZED` | 401  | Caller is not authenticated.                  |
| `NOT_FOUND`    | 404  | Greeting is missing or owned by another User. |

## 6. Business Rules

**Audience:** BE

| Rule                                                                   | Enforcement Point                              | Affected Procedures |
| ---------------------------------------------------------------------- | ---------------------------------------------- | ------------------- |
| Greeting names and messages are non-empty and bounded.                 | Contract validation.                           | Q3, C1              |
| Greeting records are immutable after creation.                         | No update procedure; persistence boundary.     | C1, Q1, Q2          |
| Only the owner may remove a greeting.                                  | Handler authorization check against `ownerId`. | C2                  |
| Removal never discloses whether a greeting is missing or inaccessible. | Handler lookup and authorization ordering.     | C2                  |
| Ordinary commands have no implicit idempotency guarantee.              | Command behavior and error contract.           | C1, C2              |
| `world` never reads or writes greeting storage.                        | Stateless handler implementation.              | Q3                  |

## 7. Authorization Matrix

**Audience:** Both

| Auth Level      | Meaning                                    | Procedures |
| --------------- | ------------------------------------------ | ---------- |
| `public`        | No authentication required.                | Q1, Q2, Q3 |
| `authenticated` | Valid authenticated Cimi User is required. | C1, C2     |

The `authenticated` route posture only admits an authenticated principal. The
owner comparison for `remove` remains a resource-specific handler rule.

## 8. Event Catalog

**Audience:** BE

No domain event channel is required by the MVP contract. Internal persistence
operations, audit records, and future implementation messages must not be
described as `hello` domain events without a later accepted contract decision.

## 9. Edge Cases

**Audience:** Both

- **Empty name or message** - Reject at contract validation with `BAD_REQUEST`; max-length validation alone is insufficient.
- **List with no matches** - Return a successful empty page rather than `NOT_FOUND`.
- **Offset beyond the current result set** - Return an empty page with `hasMore: false` and `nextOffset: null`.
- **Repeated identical create** - Create separate records with separate identifiers; no implicit deduplication applies.
- **Get after removal** - Return `NOT_FOUND` and do not reveal whether the identifier previously existed.
- **Remove another User's greeting** - Return the same `NOT_FOUND` outcome as a missing greeting.
- **World query with punctuation or whitespace in a valid name** - Preserve the supplied name; only the documented non-empty and length constraints apply.
- **Concurrent remove requests** - At most one request succeeds; later requests observe `NOT_FOUND`.

## 10. Error Code Catalog

**Audience:** Both

| Code           | HTTP | Trigger                                                 |
| -------------- | ---- | ------------------------------------------------------- |
| `BAD_REQUEST`  | 400  | Input fails schema or pagination validation.            |
| `UNAUTHORIZED` | 401  | A command is called without a valid authenticated User. |
| `NOT_FOUND`    | 404  | Greeting is missing or inaccessible to the caller.      |

## 11. Related Resources & Dependencies

**Audience:** Both

This illustrative resource has no dependency on a Cimi product resource and is
excluded from the first-release dependency graph.

### Depends On

| Resource | Integration Point |
| -------- | ----------------- |
| -        | -                 |

### Used By

| Resource | Integration Point |
| -------- | ----------------- |
| -        | -                 |

## 12. Out of Scope

**Audience:** Both

- Frontend product integration or promotion into the first-release product surface.
- Inclusion in Cimi's first-release capability, dependency, or cross-resource acceptance documents.
- Greeting updates, soft deletion, restoration, bulk operations, and arbitrary message templating.
- Domain events, notifications, email delivery, localization, and external integrations.
- Cross-Organization or cross-Site ownership semantics.
