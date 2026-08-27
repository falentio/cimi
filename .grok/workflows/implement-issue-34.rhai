let meta = #{
    name: "implement-issue-34",
    description: "Implement cimi first coherent release (issue #34): resource-level passes over explicit git-worktree domain branches, review-looped, test-gated, merged locally per pass",
    phases: [
        #{ title: "Kernel", detail: "base/kernel pass, tags kernel-ports-v1" },
        #{ title: "Wave 1", detail: "governance + lifecycle + collection-identity in parallel" },
        #{ title: "Wave 2", detail: "reporting chain" },
        #{ title: "Integrate", detail: "full narrow suite on merged main" },
        #{ title: "Report", detail: "write run report" },
    ],
};

const REPO = "/home/kevin/Repositories/cimi";
const WTROOT = "/home/kevin/Repositories/cimi-wt34";
const MAX_ITER = 3;
const MAX_ROUNDS = 90;

// ---------- output schemas ----------

fn mk_schemas() {
    #{
        impl: #{ "type":"object", "required":["worktreePath","branch","baseSha","headSha"],
            "properties": #{
                "worktreePath": #{ "type":"string" },
                "branch": #{ "type":"string" },
                "baseSha": #{ "type":"string" },
                "headSha": #{ "type":"string" },
                "installOk": #{ "type":"boolean" },
                "schemaGaps": #{ "type":"array", "items": #{ "type":"string" } },
                "notes": #{ "type":"string" }
            } },
        review: #{ "type":"object", "required":["findings"],
            "properties": #{ "findings": #{ "type":"array", "items": #{
                "type":"object", "required":["file","issue"],
                "properties": #{
                    "file": #{ "type":"string" },
                    "issue": #{ "type":"string" },
                    "severity": #{ "type":"string" }
                } } } } },
        fix: #{ "type":"object", "required":["headSha","remaining"],
            "properties": #{
                "headSha": #{ "type":"string" },
                "remaining": #{ "type":"array", "items": #{ "type":"string" } },
                "notes": #{ "type":"string" }
            } },
        gate: #{ "type":"object", "required":["passed","summary"],
            "properties": #{
                "passed": #{ "type":"boolean" },
                "summary": #{ "type":"string" }
            } },
        merge: #{ "type":"object", "required":["ok","mergedSha"],
            "properties": #{
                "ok": #{ "type":"boolean" },
                "mergedSha": #{ "type":"string" },
                "notes": #{ "type":"string" }
            } }
    }
}

let integ_schema = #{ "type":"object", "required":["passed","failures"],
    "properties": #{
        "passed": #{ "type":"boolean" },
        "failures": #{ "type":"array", "items": #{ "type":"string" } },
        "notes": #{ "type":"string" }
    } };

// ---------- shared prompt fragments ----------

fn policy() {
    let s = "";
    s += "STRICT POLICY FOR THIS AGENT:\n";
    s += "- GitHub: do NOT modify anything on GitHub. Never run any gh write command (issue create/edit/close/comment/label, PR create/merge/comment/review, release, repo settings). Never push to any remote. All work stays strictly local.\n";
    s += "- Stay inside the directory you are assigned. Never touch other directories belonging to other agents.\n";
    s += "- BRANCH DISCIPLINE: never create branches, commit, checkout, or otherwise move HEAD inside the MAIN repository at /home/kevin/Repositories/cimi. All branch work happens ONLY inside your assigned worktree directory.\n";
    s += "- Monorepo commands: run one package's tests with `pnpm -F @cimi/<pkg> test`; lint/format changed files with `vp check <paths>`; typecheck with `vp run --filter ./apps/api typecheck`. Run things narrowly, never a whole-repo sweep.\n";
    s += "- Testing style is TDD sociable: real database via packages/db testing helpers (createMigratedTestDb), fake in-memory port implementations, mock repositories only.\n";
    s
}

fn freezes() {
    let s = "";
    s += "- MIGRATION FREEZE: never modify packages/db/src/migrations/** and never run db:generate or db:push. The full schema already exists on main. If the schema lacks something you need, record it in the schemaGaps output field instead of changing migrations.\n";
    s += "- ROUTER FREEZE: never edit apps/api/src/index.ts. Empty per-resource router stubs are pre-registered there by the kernel pass. Wire handlers only under apps/api/src/resources/<resource>/.\n";
    s
}

// ---------- domain configurations ----------

fn mk_kernel_cfg() {
    #{ key:"K", branch:"base/kernel", tagBaseline:true, tagAfter:"kernel-ports-v1",
       passes:[ #{ res:"base-kernel", kind:"kernel", group:"" } ] }
}

fn mk_wave1_cfgs() {
    [
        #{ key:"A", branch:"feat/governance", tagBaseline:false, tagAfter:"",
           passes:[
               #{ res:"organization", group:"organization-site-governance", kind:"resource" },
               #{ res:"membership", group:"organization-site-governance", kind:"resource" },
               #{ res:"invitation", group:"organization-site-governance", kind:"resource" },
               #{ res:"site", group:"organization-site-governance", kind:"resource" }
           ] },
        #{ key:"B", branch:"feat/lifecycle", tagBaseline:false, tagAfter:"",
           passes:[
               #{ res:"installation", group:"system-data-lifecycle", kind:"resource" },
               #{ res:"health", group:"system-data-lifecycle", kind:"resource" },
               #{ res:"retention-policy", group:"system-data-lifecycle", kind:"resource" },
               #{ res:"backup-restore", group:"system-data-lifecycle", kind:"resource" }
           ] },
        #{ key:"C", branch:"feat/collection-identity", tagBaseline:false, tagAfter:"",
           passes:[
               #{ res:"collection-policy", group:"collection-analytics-identity", kind:"resource" },
               #{ res:"event-ingestion", group:"collection-analytics-identity", kind:"resource" },
               #{ res:"identity-profile", group:"collection-analytics-identity", kind:"resource" }
           ] }
    ]
}

fn mk_reporting_cfg() {
    #{ key:"D", branch:"feat/reporting", tagBaseline:false, tagAfter:"",
       passes:[
           #{ res:"reporting-kernel", group:"analytics-reporting", kind:"pipeline" },
           #{ res:"traffic-report", group:"analytics-reporting", kind:"resource" },
           #{ res:"event-report", group:"analytics-reporting", kind:"resource" },
           #{ res:"goal", group:"analytics-reporting", kind:"resource" },
           #{ res:"funnel", group:"analytics-reporting", kind:"resource" },
           #{ res:"cohort-retention", group:"analytics-reporting", kind:"resource" },
           #{ res:"public-dashboard", group:"analytics-reporting", kind:"resource" }
       ] }
}

fn fresh_state(cfg) {
    #{ cfg: cfg, passIdx: 0, phase: "spawn_impl", wt: "", baseSha: "", headSha: "",
       iter: 0, findings: [], residuals: [], rev_standards: [], rev_spec: [], rev_back: 0,
       gateFixed: false, gateSummary: "", failed: false, failReason: "", done: false,
       merged: [], gaps: [] }
}

// ---------- prompt builders ----------

fn spec_pointer(group, res, kind) {
    if kind == "kernel" {
        "Authoritative inputs: docs/specs/README.md (cross-cutting rules), docs/specs/DEPENDENCIES.md (cycles the ports must cut), packages/contract/src/contract.ts and src/contract/* (17 slices), docs/specs/system-data-lifecycle/retention-policy/SPECS.md and backup-restore/SPECS.md (lock scopes)."
    } else if kind == "pipeline" {
        "Authoritative inputs: docs/specs/analytics-reporting/traffic-report/SPECS.md (preflight admission, granularity bucket limits, freshness), docs/specs/README.md rules on query admission, retention horizon, pagination, filters, buckets, comparison. This pass builds the SHARED reporting admission + freshness pipeline that every later report pass reuses."
    } else {
        "Authoritative inputs: docs/specs/" + group + "/" + res + "/SPECS.md (normative, read it fully), docs/specs/README.md (cross-cutting contract rules), docs/specs/ACCEPTANCE.md (acceptance scenarios)."
    }
}

fn task_brief(res, kind) {
    if kind == "kernel" {
        "Scope of the base/kernel pass: (1) audit all 17 contract slices in packages/contract for strictness: unknown input keys fail, kebab-case /{resource}/{operation} route metadata, GET for reads POST for commands, centralized error catalog with code/status/message; fix deviations. (2) Add to packages/utils strict validators: SId (opaque string 1-128 chars), SName, SHostname, SIanaTimezone, SWeekStart, reusing existing id generator utilities. (3) Define six port interfaces WITH in-memory fake implementations usable by later waves' tests: SiteScopePort {exists,isActive,getOrganizationId}, RetentionResolver {effective(siteId) -> eventMonths/profileMonths/replayMonths, default 12/12/null}, LifecycleLock {acquire,release,isLocked} covering backup/restore/upgrade/retention/site_deletion/site_recovery/purge/cleanup, CollectionPolicyResolver {effective(siteId)}, AcceptanceJournalPort {drain()}, AnalyticsReadinessPort {getHealth() -> {controlStore,analyticsStore}}. Place them following existing package conventions (packages/guard or packages/utils). (4) Extend packages/guard with coarse role assertions public/authenticated/admin/owner plus a site-scope guard interface backed by persisted membership lookup. (5) Register EMPTY oRPC router stubs for all 17 first-party resources in apps/api/src/index.ts so later passes never need to touch that file again (you are the only pass allowed to edit it). (6) Verify the existing drizzle migrations already cover all needed tables (read-only); report any gap in schemaGaps, do not generate migrations. (7) Sociable tests for validators, fakes, and guard assertions."
    } else if kind == "pipeline" {
        "Scope of the reporting-kernel pass: build the shared admission + freshness pipeline as reusable internal modules under apps/api/src/resources/reporting-kernel/ (or a shared lib spot consistent with repo conventions): inclusive Site-local fromDate/toDate resolved via site reportingTimezone (default UTC) and weekStartsOn (default Monday) into half-open intervals; granularity bucket limits (minutes:limit 1:1800, 60:720, 1440:366, 10080:104, 43200:36, 525600:10); Effective Retention coverage check for current AND adjacent equal-length comparison windows; Fact-Work estimation from projection checkpoint statistics with stale-stats / ProjectionGap / over-budget rejection as QUERY_LIMIT_EXCEEDED 422 BEFORE cache; SERVICE_UNAVAILABLE 503 when analytics store not ready; freshness envelope current|stale with projected acceptance sequence and occurrence coverage; DuckDB projection cursor + quarantine gap handling; allowlisted scoped filters (AND across filters, OR within one field), allowlisted sort + stable ID tie-breaker, zero-based live pagination helpers (nextOffset/hasMore/totalCount), bucket zero-fill with complete:false for the partial current bucket. Sociable tests for timezone/DST resolution, bucket bounds, and preflight rejection order."
    } else {
        "Scope: implement the " + res + " resource end to end: contract-faithful oRPC handlers wired under apps/api/src/resources/" + res + "/ using the pre-scaffolded router stub, persistence via existing drizzle schema tables, authorization per the spec, lifecycle and error semantics exactly as the SPECS.md declares (error codes with their HTTP mappings), and sociable tests written test-first covering the spec's acceptance scenarios."
    }
}

fn p_impl_first(repo, wtroot, domkey, branch, res, kind, group) {
    let wt = wtroot + "/" + domkey;
    let s = "";
    s += "You are the implementer for one pass of the cimi first-release plan (issue #34).\n";
    s += "First set up YOUR private git worktree (a linked worktree of the main repo, sharing its refs):\n";
    s += "1. If it does not exist yet, create it: `git -C " + repo + " worktree add \"" + wt + "\" -b " + branch + " main`. If it already exists with prior commits on " + branch + ", resume from its current state instead of redoing work.\n";
    s += "2. `cd \"" + wt + "\"` and confirm `git branch --show-current` says " + branch + ". ALL further work happens here, never in " + repo + " itself.\n";
    s += "3. Run `git rev-parse HEAD` and report it as baseSha.\n";
    s += "4. Run `pnpm install --frozen-lockfile --prefer-offline` (native modules build; report installOk).\n";
    s += "5. " + spec_pointer(group, res, kind) + "\n";
    s += "6. " + task_brief(res, kind) + "\n";
    s += "7. Follow TDD: write failing sociable tests first, then implement until green.\n";
    s += "8. Commit your work in the WORKTREE: `git commit` with message `feat(" + res + "): implement resource per SPECS`.\n";
    s += "9. Run `git rev-parse HEAD` and report it as headSha. Report worktreePath as \"" + wt + "\" and branch as \"" + branch + "\".\n";
    s += freezes() + "\n";
    s += policy();
    s
}

fn p_impl_next(wt, branch, res, kind, group) {
    let s = "";
    s += "You are the implementer for one pass of the cimi first-release plan (issue #34).\n";
    s += "Work INSIDE the existing git worktree directory: " + wt + " (branch " + branch + ", dependencies already installed). Do not create a new worktree.\n";
    s += "Steps:\n";
    s += "1. `cd \"" + wt + "\"` and confirm `git branch --show-current` says " + branch + ".\n";
    s += "2. Run `git rev-parse HEAD` and report it as baseSha.\n";
    s += "3. " + spec_pointer(group, res, kind) + "\n";
    s += "4. " + task_brief(res, kind) + "\n";
    s += "5. Follow TDD: failing sociable tests first, then implement until green.\n";
    s += "6. Commit in the WORKTREE: `feat(" + res + "): implement resource per SPECS`.\n";
    s += "7. Run `git rev-parse HEAD` and report it as headSha. Report worktreePath as \"" + wt + "\" and branch as \"" + branch + "\".\n";
    s += freezes() + "\n";
    s += policy();
    s
}

fn p_review(axis, wt, baseSha, headSha, res, kind, group) {
    let s = "";
    s += "You are an adversarial code reviewer (axis: " + axis + ") for one pass of the cimi first-release plan.\n";
    s += "Read the review rubric at /home/kevin/Repositories/cimi/.agents/skills/skills/code-review/SKILL.md first and follow its method for your axis.\n";
    if axis == "standards" {
        s += "Your axis is STANDARDS: does the change follow this repo's documented coding standards and conventions (root AGENTS.md, package conventions, DRY via packages/utils, test style)?\n";
    } else {
        s += "Your axis is SPEC: does the change faithfully implement what the specification demands?\n";
    }
    s += "Inspect ONLY this pass's commits: run `git -C \"" + wt + "\" diff " + baseSha + ".." + headSha + "` and read surrounding files in \"" + wt + "\" as needed.\n";
    s += spec_pointer(group, res, kind) + "\n";
    s += "Every finding must cite a file and concrete evidence you actually read. An empty findings list is valid ONLY after you have read the diff. Severity: minor|major|critical.\n";
    s += "EFFORT CAP: finish within roughly 15 minutes and 40 tool calls. Read the full diff FIRST, then open only the files central to candidate findings. Sample, do not exhaustively read every touched file — depth over breadth. Return your findings JSON as soon as your evidence covers the diff.\n";
    s += "You are READ-ONLY: modify nothing, run no write commands.\n";
    s += policy();
    s
}

fn p_fix(wt, branch, findings_json, res) {
    let s = "";
    s += "You are the fixer for one review iteration of the " + res + " pass.\n";
    s += "Work inside the existing git worktree: " + wt + " (branch " + branch + ").\n";
    s += "Code-review findings to address (JSON):\n" + findings_json + "\n";
    s += "Address each finding: edit code/tests, re-run the narrow tests you touched, commit with message `fix(" + res + "): address review findings`.\n";
    s += "If a finding is wrong or out of scope for this pass, do not change code for it; list it in `remaining` instead.\n";
    s += "Run `git rev-parse HEAD` after your final commit and report it as headSha.\n";
    s += freezes() + "\n";
    s += policy();
    s
}

fn p_gate(wt, baseSha, headSha, res) {
    let s = "";
    s += "You are the test gate for the " + res + " pass. Verify the change compiles, lints, and its tests pass. Fail closed.\n";
    s += "Work inside the existing git worktree: " + wt + ".\n";
    s += "Steps:\n";
    s += "1. `cd \"" + wt + "\"`; list changed files: `git diff --name-only " + baseSha + ".." + headSha + "`.\n";
    s += "2. Map changed files to their workspace packages (@cimi/contract, @cimi/db, @cimi/utils, @cimi/guard, @cimi/auth, @cimi/api, @cimi/frontend, ...). For up to 4 affected packages run `pnpm -F <pkg> test`.\n";
    s += "3. Run `vp check` on the changed source files (up to 40).\n";
    s += "4. Run `vp run --filter ./apps/api typecheck`.\n";
    s += "Report passed=true ONLY if every command you ran exited green. Put short tails of failures into summary.\n";
    s += policy();
    s
}

fn p_gate_fix(wt, branch, summary, res) {
    let s = "";
    s += "The test gate FAILED for the " + res + " pass. Gate summary:\n" + summary + "\n";
    s += "Work inside the existing git worktree: " + wt + " (branch " + branch + "). Diagnose and repair the failures (code or tests), re-run the failing commands until green, then commit `fix(" + res + "): repair test gate failures`.\n";
    s += freezes() + "\n";
    s += policy();
    s
}

fn p_merge(repo, branch, res, tagBaseline, tagAfter) {
    let s = "";
    s += "You are the merger for the " + res + " pass. Operate in the MAIN repository: " + repo + ".\n";
    s += "The worktree is a linked git worktree of this repo, so its branch already exists here with shared refs.\n";
    s += "Steps, in order:\n";
    if tagBaseline {
        s += "1. Safety tag: `git rev-parse -q --verify refs/tags/pre-issue34-baseline >/dev/null || git tag pre-issue34-baseline` (tags current main BEFORE any merge of this run).\n";
    } else {
        s += "1. Nothing; the baseline tag already exists.\n";
    }
    s += "2. Make sure you are on main: `git -C " + repo + " checkout main` (never force this if a worktree holds main; report ok=false if checkout fails).\n";
    s += "3. `git -C " + repo + " merge --no-ff --no-edit " + branch + "`. If the merge conflicts: run `git merge --abort`, report ok=false with notes explaining the conflict; do NOT hand-resolve.\n";
    if tagAfter != "" {
        s += "4. On success: `git tag " + tagAfter + "` (skip silently if it already exists).\n";
    } else {
        s += "4. Nothing.\n";
    }
    s += "5. On success report mergedSha = `git rev-parse HEAD` and ok=true.\n";
    s += "Never push anywhere. Never touch GitHub.\n";
    s += policy();
    s
}

// ---------- wave engine: per-domain state machine advanced in lockstep rounds ----------
// All external values arrive as parameters: Rhai functions cannot see top-level variables.

fn run_wave(domains, sch, max_rounds, max_iter, repo, wtroot) {
    let round = 0;
    while round < max_rounds {
        let jobs = [];
        let jinfo = [];
        for d in domains {
            if !d.failed && !d.done {
                let pass = d.cfg.passes[d.passIdx];
                let resn = pass.res;
                if d.phase == "spawn_impl" {
                    jobs.push(#{ prompt: p_impl_first(repo, wtroot, d.cfg.key, d.cfg.branch, resn, pass.kind, pass.group),
                                 label: d.cfg.key + ":impl:" + resn,
                                 capability_mode: "all",
                                 output_schema: sch.impl });
                    jinfo.push(#{ key: d.cfg.key, action: "impl", res: resn });
                } else if d.phase == "impl" {
                    jobs.push(#{ prompt: p_impl_next(d.wt, d.cfg.branch, resn, pass.kind, pass.group),
                                 label: d.cfg.key + ":impl:" + resn,
                                 capability_mode: "all",
                                 output_schema: sch.impl });
                    jinfo.push(#{ key: d.cfg.key, action: "impl", res: resn });
                } else if d.phase == "review" {
                    for ax in ["standards", "spec"] {
                        jobs.push(#{ prompt: p_review(ax, d.wt, d.baseSha, d.headSha, resn, pass.kind, pass.group),
                                     label: d.cfg.key + ":review-" + ax + ":" + resn,
                                     capability_mode: "read-only",
                                     output_schema: sch.review });
                        jinfo.push(#{ key: d.cfg.key, action: "review", axis: ax, res: resn });
                    }
                } else if d.phase == "fix" {
                    jobs.push(#{ prompt: p_fix(d.wt, d.cfg.branch, json_encode(d.findings), resn),
                                 label: d.cfg.key + ":fix:" + resn,
                                 capability_mode: "all",
                                 output_schema: sch.fix });
                    jinfo.push(#{ key: d.cfg.key, action: "fix", res: resn });
                } else if d.phase == "gate" {
                    jobs.push(#{ prompt: p_gate(d.wt, d.baseSha, d.headSha, resn),
                                 label: d.cfg.key + ":gate:" + resn,
                                 capability_mode: "execute",
                                 output_schema: sch.gate });
                    jinfo.push(#{ key: d.cfg.key, action: "gate", res: resn });
                } else if d.phase == "gate_fix" {
                    jobs.push(#{ prompt: p_gate_fix(d.wt, d.cfg.branch, d.gateSummary, resn),
                                 label: d.cfg.key + ":gate-fix:" + resn,
                                 capability_mode: "all",
                                 output_schema: sch.fix });
                    jinfo.push(#{ key: d.cfg.key, action: "gate_fix", res: resn });
                } else if d.phase == "merge" {
                    jobs.push(#{ prompt: p_merge(repo, d.cfg.branch, resn, d.cfg.tagBaseline, d.cfg.tagAfter),
                                 label: d.cfg.key + ":merge:" + resn,
                                 capability_mode: "execute",
                                 output_schema: sch.merge });
                    jinfo.push(#{ key: d.cfg.key, action: "merge", res: resn });
                }
            }
        }
        if jobs.len() == 0 { break; }
        log("round " + round.to_string() + ": " + jobs.len().to_string() + " agent(s)");
        let results = parallel(jobs);
        let ri = 0;
        for info in jinfo {
            let r = results[ri];
            ri += 1;
            let di = 0;
            let found = false;
            for k in 0..domains.len() {
                if domains[k].cfg.key == info.key { di = k; found = true; }
            }
            if !found { continue; }
            let d = domains[di];
            let ok = r != () && r.success && r.output != ();
            if info.action == "impl" {
                if ok && r.output.worktreePath != () && r.output.headSha != () {
                    d.wt = r.output.worktreePath;
                    d.baseSha = r.output.baseSha;
                    d.headSha = r.output.headSha;
                    if r.output.schemaGaps != () {
                        for g in r.output.schemaGaps { d.gaps.push(g); }
                    }
                    d.phase = "review";
                    d.iter = 1;
                    d.findings = [];
                    d.rev_standards = [];
                    d.rev_spec = [];
                    d.rev_back = 0;
                } else {
                    d.failed = true;
                    d.failReason = "implementer agent failed or returned malformed output";
                }
            } else if info.action == "review" {
                let f = [];
                if ok && r.output.findings != () { f = r.output.findings; }
                if info.axis == "standards" { d.rev_standards = f; } else { d.rev_spec = f; }
                d.rev_back += 1;
                if d.rev_back >= 2 {
                    let allf = [];
                    for x in d.rev_standards { allf.push(x); }
                    for x in d.rev_spec { allf.push(x); }
                    d.findings = allf;
                    if allf.len() == 0 {
                        d.phase = "gate";
                    } else if d.iter < max_iter {
                        d.phase = "fix";
                    } else {
                        for x in allf { d.residuals.push(x.file + ": " + x.issue); }
                        d.phase = "gate";
                    }
                }
            } else if info.action == "fix" {
                if ok && r.output.headSha != () { d.headSha = r.output.headSha; }
                d.iter += 1;
                d.rev_standards = [];
                d.rev_spec = [];
                d.rev_back = 0;
                d.phase = "review";
            } else if info.action == "gate" {
                if ok && r.output.passed == true {
                    d.phase = "merge";
                } else if !d.gateFixed {
                    d.gateFixed = true;
                    if ok && r.output.summary != () { d.gateSummary = r.output.summary; } else { d.gateSummary = "gate failed without summary"; }
                    d.phase = "gate_fix";
                } else {
                    d.failed = true;
                    d.failReason = "test gate still red after one bounded fix attempt";
                }
            } else if info.action == "gate_fix" {
                d.phase = "gate";
            } else if info.action == "merge" {
                if ok && r.output.ok == true && r.output.mergedSha != () && r.output.mergedSha != "" {
                    d.merged.push(info.res);
                    d.passIdx += 1;
                    d.gateFixed = false;
                    d.iter = 0;
                    d.findings = [];
                    if d.passIdx >= d.cfg.passes.len() {
                        d.done = true;
                    } else {
                        d.phase = "impl";
                        d.baseSha = d.headSha;
                    }
                } else {
                    d.failed = true;
                    if ok && r.output.notes != () { d.failReason = "merge failed: " + r.output.notes; } else { d.failReason = "merge failed"; }
                }
            }
            domains[di] = d;
        }
        round += 1;
    }
    domains
}

fn summarize_state(d) {
    let s = "domain " + d.cfg.key + " (" + d.cfg.branch + "): ";
    if d.done {
        s += "DONE, merged passes: ";
        for m in d.merged { s += m + " "; }
    } else if d.failed {
        s += "FAILED at pass '" + d.cfg.passes[d.passIdx].res + "' — " + d.failReason + "; earlier merges: ";
        for m in d.merged { s += m + " "; }
        s += "; worktree kept at " + d.wt;
    } else {
        s += "INCOMPLETE (round cap) at phase " + d.phase;
    }
    if d.residuals.len() > 0 {
        s += "; residual review findings (" + d.residuals.len().to_string() + ")";
    }
    if d.gaps.len() > 0 {
        s += "; schema gaps reported (" + d.gaps.len().to_string() + ")";
    }
    s
}

fn cleanup_wave(domains, repo) {
    let wts = "";
    let branches = "";
    for d in domains {
        if d.done && d.wt != "" {
            wts += "\"" + d.wt + "\" ";
            branches += "\"" + d.cfg.branch + "\" ";
        }
    }
    if wts == "" { return "nothing to clean"; }
    let p = "In the main repo " + repo + ", clean up finished wave artifacts.\n";
    p += "1. Remove the finished linked worktrees: `git worktree remove --force <path>` for each of: " + wts + "\n";
    p += "2. Delete their fully-merged branches: `git branch -d` for each of: " + branches + " (use -d; if -d refuses, the branch is not fully merged — leave it and note that).\n";
    p += "3. Confirm with `git worktree list` and `git branch --list` and report what you removed.\n";
    p += policy();
    let r = agent(p, #{ label: "cleanup", capability_mode: "execute" });
    if r != () && r.success { return "cleanup done"; }
    return "cleanup agent failed — leftover worktrees: " + wts;
}

// ---------- run ----------

// Optional args.skipKernel=true resumes a run whose kernel pass already merged (tag kernel-ports-v1 present).
// args may arrive as a map or a raw JSON string depending on the caller; handle both.
let skip_kernel = false;
if args != () {
    if type_of(args) == "string" {
        skip_kernel = args.contains("skipKernel");
    } else {
        skip_kernel = args.skipKernel == true;
    }
}
let sch = mk_schemas();
let kernel_states = [];

if !skip_kernel {
    phase("Kernel");
    log("kernel pass: contracts + ports + validators + router stubs");
    kernel_states = run_wave([fresh_state(mk_kernel_cfg())], sch, MAX_ROUNDS, MAX_ITER, REPO, WTROOT);
    let kernel_note = cleanup_wave(kernel_states, REPO);
    log("kernel: " + kernel_note);
} else {
    log("skipping kernel pass per args.skipKernel (kernel-ports-v1 already merged)");
}

phase("Wave 1");
log("wave 1: governance + lifecycle + collection-identity, 3 domains in parallel");
let w1_states = [];
for cfg in mk_wave1_cfgs() { w1_states.push(fresh_state(cfg)); }
w1_states = run_wave(w1_states, sch, MAX_ROUNDS, MAX_ITER, REPO, WTROOT);
let w1_note = cleanup_wave(w1_states, REPO);
log("wave 1 cleanup: " + w1_note);

phase("Wave 2");
log("wave 2: reporting chain (7 passes)");
let w2_states = run_wave([fresh_state(mk_reporting_cfg())], sch, MAX_ROUNDS, MAX_ITER, REPO, WTROOT);
let w2_note = cleanup_wave(w2_states, REPO);
log("wave 2 cleanup: " + w2_note);

phase("Integrate");
let ip = "";
ip += "Full integration verification on the merged main repo at " + REPO + ".\n";
ip += "1. Discover workspace packages (apps/*, packages/*) from pnpm-workspace.yaml and each package.json name.\n";
ip += "2. For every package that has a test script, run `pnpm -F <name> test` sequentially. Collect failures.\n";
ip += "3. Run `vp run --filter ./apps/api typecheck` and `vp run --filter ./apps/frontend typecheck`.\n";
ip += "4. Report passed=true only if everything is green; list each failure as `package: failing command`.\n";
ip += policy();
let integ = agent(ip, #{ label: "integrate:main", capability_mode: "execute", output_schema: integ_schema });
let integ_passed = integ != () && integ.success && integ.output != () && integ.output.passed == true;

phase("Report");
let md = "# implement-issue-34 run report\n\n";
if kernel_states.len() > 0 {
    md += "## Kernel\n" + summarize_state(kernel_states[0]) + "\n\n";
} else {
    md += "## Kernel\n(skipped via args.skipKernel — already merged as kernel-ports-v1)\n\n";
}
md += "## Wave 1\n";
for d in w1_states { md += "- " + summarize_state(d) + "\n"; }
md += "\n## Wave 2\n- " + summarize_state(w2_states[0]) + "\n";
md += "\n## Integration on main\n";
if integ_passed { md += "PASSED\n"; } else {
    md += "FAILED or inconclusive\n";
    if integ != () && integ.success && integ.output != () && integ.output.failures != () {
        for f in integ.output.failures { md += "- " + f + "\n"; }
    }
}
md += "\nResidual review findings were recorded per pass and are NOT failures by design; they are listed in each domain summary above.\n";
md += "Failed domains keep their worktrees on disk for inspection; rerun the workflow to retry them (merges and tags are idempotent-guarded).\n";
let scratch = write_scratch_file("implement-issue-34-report.md", md);
log("budget spent: " + budget().spent.to_string() + " of " + budget().total.to_string());
complete(#{ path: scratch, integrationPassed: integ_passed, report: md });