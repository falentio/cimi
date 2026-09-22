# Issue #47 design synthesis

Candidate B is the base design. The implementation uses a public-dashboard-specific aggregate planner rather than a generic planner for hypothetical future consumers.

The public resource keeps bearer resolution, admin configuration, rate limits, cache policy, and wire projection. The planner owns reporting admission, the independent dimension budget, aggregate execution, and suppression. The authenticated traffic and event report adapters remain separate.

The implementation carries two ideas from Candidate A. It models a legacy hash-only configuration as unavailable for public access, and it keeps the public aggregate port distinct from `ReportingQueryPort`.

The query result keeps distinct Visitor counts inside the adapter result only. The current public output has no total field, so total suppression remains an internal gate until the contract explicitly exposes a total.

The cross-judge selected this shape because it closes the lifecycle read race and gives suppression a narrow typed seam. It rejected generic aggregate policy machinery as speculative and required a second dimension-row guard when preflight and execution use separate analytics reads.
