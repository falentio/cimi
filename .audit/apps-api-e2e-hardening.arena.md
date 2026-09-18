# E2E Hardening Design Decision

Candidate 1 is the base. It covers the full composed API with one file-backed fixture and separate lifecycle, governance, ingestion, and reporting suites.

Grafts from Candidate 2:

- keep analytics rebuild behind one typed fixture capability;
- keep recovery setup limited to impossible-through-API crash states;
- keep each vertical family in a separate test file;
- make checkpoint behavior semantic in tests instead of asserting executor internals where possible.

Rejected:

- a capability adapter for every procedure, because it duplicates the router surface and would make future resource coverage expensive;
- exposing raw database handles, because normal state must be created through the composed API;
- a fixture-only checkpoint workaround, because the defect is in production recovery control flow.

Verification target: focused E2E tests pass before advancing between lifecycle, governance, ingestion, and reporting units. The full API E2E suite and narrow API checks must pass at the end.
