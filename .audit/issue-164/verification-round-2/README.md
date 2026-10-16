# Round-2 verification evidence

Both files were produced by a second actor, not by the branch author.

- `report.md` is the independent functional verification run at head `8c332b64`, before the
  round-2 fixes. It is the finding that opened this round: criterion 2 failed, and F1 and F2
  are the two defects it named. Raw payloads that mirror \`/tmp/verify-164/out/\` sit in
  `./out/`.
- `code-review.md` is the code review at the same head: 5 Standards majors, 1 Spec major,
  and the minor findings.

The fixes, their red tests and their SHAs are in the commits after `8c332b64` on this branch.
