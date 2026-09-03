---
status: accepted
---

# User-Agent Bot Matcher

## Context

Bot detection runs on the event collection path. The matcher must preserve the
ordered pattern contract in `packages/utils/src/user-agent-bots/patterns.ts`:
the first matching pattern determines `category` and `matchedPattern`.

The current inventory has 243 patterns: 214 can be represented as literal
matching with optional prefix, suffix, or word-boundary constraints, while 29
require regular-expression features such as lookarounds, character classes, or
quantifiers.

## Decision

Use dense Aho-Corasick as the primary matcher through `classifyUA`.

- Build a trie for literal-safe patterns once at module load.
- Build failure links and merge failure-state outputs during breadth-first
  construction.
- Flatten ASCII transitions into a `Uint16Array`, so runtime matching performs
  one table lookup per input character.
- Validate literal match boundaries after an output is found.
- Select the lowest original pattern index to preserve first-match-wins order.
- Use the combined complex regex and ordered complex regex fallback for the 29
  patterns that cannot be represented as literals.
- Use a guarded early-AI literal fast path before the full automaton scan.
- Keep the bounded 10,000-entry LRU cache.

The exhaustive compatibility test remains at
`packages/utils/src/user-agent-bots/testing/classify-user-agent-compatibility.test.ts`.
It probes every literal-safe pattern, has an explicit probe for every complex
pattern, and compares results with an independent regex oracle.

## Evaluation

The comparison used Vitest benchmarks with one second per case, unique inputs
for cold-cache measurements, and repeated inputs for cache-hit measurements.
The cold inputs were browser-negative, early bot, middle bot, late bot, and a
long browser-negative user agent. Values below are speed relative to the regex
baseline; values above `1.00x` are faster. The results are machine-specific
and are directional rather than a product performance guarantee.

| Matcher                          | Browser | Early bot | Middle bot | Late bot | Long negative | Cache hit |
| -------------------------------- | ------: | --------: | ---------: | -------: | ------------: | --------: |
| Regex baseline                   |   1.00x |     1.00x |      1.00x |    1.00x |         1.00x |     1.00x |
| Valibot check                    |   0.36x |     0.64x |      0.94x |    0.76x |         1.22x |     0.61x |
| Valibot wrapper plus regex       |   0.98x |     0.89x |      0.88x |    0.92x |         1.00x |     0.48x |
| Direct literal/regex hybrid      |   0.50x |     0.79x |      1.28x |    1.11x |         1.23x |     0.89x |
| Map-transition Aho-Corasick      |   1.18x |     0.51x |      1.23x |    3.62x |         1.22x |     0.97x |
| Dense Aho-Corasick               |   2.01x |     0.74x |      1.66x |    5.64x |         2.07x |     0.97x |
| Dense trie without failure links |   1.83x |     0.68x |      1.33x |    4.14x |         2.02x |     0.96x |

## Findings

- Dense Aho-Corasick was the best general cold-cache candidate.
- Aho-Corasick is not universally faster. Regex is faster when an early
  pattern matches, and cache hits are effectively tied.
- A dense transition table was materially faster than `Map` transitions.
- A plain dense trie won on browser negatives but lost to dense Aho-Corasick
  on the broader workload.
- Valibot changes schema validation, not the underlying regex engine. It added
  overhead and was not a useful matching optimization.
- RE2 was not suitable because the pattern set uses lookarounds, which RE2
  intentionally does not support. A native wrapper would also add deployment
  and call-boundary complexity.
- V8's experimental non-backtracking regexp mode does not support the full
  current pattern set and is not a portable application dependency.

## Considered Options

- Keep the ordered regex scan: rejected because it pays the per-pattern cost on
  late matches and long browser negatives.
- Use a direct literal/regex hybrid, map-transition Aho-Corasick, or a dense
  trie: evaluated, but each was slower than dense Aho-Corasick on the broader
  workload.
- Use RE2, V8's experimental linear engine, or a native wrapper: rejected
  because the current pattern syntax and deployment boundary are incompatible
  with a complete drop-in replacement.

## Consequences

- Literal-safe matching is faster for the workloads where the regex baseline
  scans many patterns, while early matches and cache hits remain approximately
  regex-speed workloads.
- Complex patterns continue to use JavaScript regular expressions, so the
  matcher does not claim to eliminate regex execution.
- Module initialization builds a dense ASCII transition table and consumes
  additional memory for the precomputed transitions.
- The primary API keeps the existing classification shape and pattern-order
  semantics, guarded by exhaustive compatibility tests.

## Compatibility Rules

Future changes must preserve these invariants:

- Pattern order in `patterns.ts` is semantic.
- Literal extraction may only handle syntax that has been explicitly modeled.
- Complex patterns must remain on the regex path.
- Categories and the exact source pattern must come from the winning rule.
- The compatibility test must pass for every pattern before changing the
  primary matcher.

## Future Improvements

- Re-run the exhaustive compatibility test whenever patterns are added or
  changed.
- Add a new explicit complex-pattern probe when a new complex rule is added;
  the probe-key equality assertion intentionally makes omissions fail.
- Benchmark against a production user-agent corpus before changing the
  matcher or claiming a performance improvement.
- Measure startup memory and automaton build time if the pattern inventory grows
  substantially.
- Revisit the ASCII table and 65,535-state `Uint16Array` limit if patterns
  acquire non-ASCII literal values or the automaton approaches that limit.
