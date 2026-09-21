# Apps API E2E Hardening

Harden `apps/api` end-to-end coverage across every currently implemented API resource and lifecycle boundary.

The finished work must:

- map implemented procedures to meaningful scenario families;
- cover successful flows, unauthenticated and unauthorized access, malformed or invalid input, not-found and conflict behavior, persistence boundaries, and relevant concurrency or recovery behavior;
- reuse the existing real SQLite and DuckDB E2E fixture instead of replacing integration paths with mocks;
- add only the smallest durable fixture or assertion helpers needed to make missing scenarios executable and diagnosable;
- keep production behavior unchanged unless an E2E failure proves a defect that must be fixed for the tests to pass;
- verify each vertical unit with focused API tests before moving to the next unit;
- finish with the narrow API E2E suite, typecheck, lint, format, and a direct diff review.

This is a local execution goal. No commit, push, merge, or external side effect is authorized by this file.
