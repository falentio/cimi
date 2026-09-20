# API lifecycle solve design

Candidate 2 is the base. It reuses the existing shutdown coordinator for outer resource ownership and uses a private DuckDB close-progress controller for checkpoint and native-handle retries.

Grafts from Candidate 1:

- Clear each ownership slot only after its close succeeds.
- Add wiring tests for the server and E2E fixture, not only coordinator tests.
- Keep the patch limited to the confirmed shutdown and database-close findings.

Rejected:

- Duplicated outer failure collectors, because the repository already has the needed retryable phase coordinator.
- Runtime-prototype DuckDB fault injection, because it is less deterministic than an injected private operation seam.
- Direct DuckDB resource closure from the live rollback-failure path, because it would bypass the close controller's progress state.

The implementation must keep DuckDB rollback-failure handles available for the outer close owner and must not await a close controller from inside its own serialized queue callback.
