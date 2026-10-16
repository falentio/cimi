# Round-3 evidence: the round-2 review, the round-2 verification, and this round's measurements

`review.md` and `report.md` were produced by a second and a third actor, not by the
branch author, and they are the inputs the round-3 fixes answer.

- `review.md` is the code review at `9f7d2cbf` (= `/tmp/review-168-round2.md`): 31 commits,
  with F1 partial, F2 fixed, S1-S4 fixed, S5 partial, P1 fixed in substance, R1 a new major,
  and R2-R6 minor.
- `report.md` is the independent functional verification at the same head
  (= `/tmp/verify-164-round2/report.md`): criteria 1, 3, 4, 5, F2, the e2e at both volumes and
  item 8 pass; criterion 2’s readiness half passes (0 false in 252 samples, 108 of them
  started inside the append window) and its mid-seed-200 half still fails, from the
  installation cleanup gate rather than from `ready()`.
- `out/` mirrors `/tmp/verify-164-round2/out/`, the payloads behind `report.md`. It also
  carries this round’s normal-site measurement of the installation-gate window (the
  appendix-c section on the mid-seed 503): `normal-site-window.json` is the payload with
  the 2,084-sample per-sample array elided, and `normal-site-window-derived.json` is the
  sampled window timeline its numbers come from. The harness that regenerates the full
  payload is the untracked `./.audit/verify-164-round3/normal-site-window.test.ts`.

The round-3 fixes, their red tests and their SHAs are the commits after `9f7d2cbf` on this
branch.
