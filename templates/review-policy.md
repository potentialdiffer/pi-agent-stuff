# Review Policy Template

Evidence-based completion policy for agent work, matching community best
practice (deterministic checks before LLM review, risk-based ensemble
triggers, one-pass default with blocking-finding escalation, agreement is not
verification). Applied per project by appending the block below to the
project's `AGENTS.md`.

## Install

Per project, from a checkout of this repo:

```bash
node scripts/install-review-policy.cjs /path/to/project          # policy only
node scripts/install-review-policy.cjs /path/to/project --watchdog # + watchdog
```

Idempotent: skips append when the marker `<!-- pi-agent-stuff:review-policy v1 -->`
is already present. `--watchdog` merges into `.pi/settings.json`:

```json
{
  "subagents": {
    "watchdog": {
      "enabled": true,
      "model": "openai/gpt-6.1-sol",
      "cadence": { "everyNTools": 10 },
      "children": { "enabled": true }
    }
  }
}
```

Rationale: watchdog = cheap continuous guardrail at every turn boundary
(Sol pricing); subagent reviewers = deliberate deep passes at task completion;
ensemble = uncorrelated cross-family review on high-risk diffs.

## Global (all projects)

Copy the Policy block below into `~/.pi/agent/AGENTS.md`. Per the repo critical
rule, the home directory is edited by the operator, not by the agent. Watchdog
settings for all projects go in `~/.pi/agent/settings.json` (same snippet,
operator-applied).

## Policy block

Appended verbatim by the installer:

```markdown
<!-- pi-agent-stuff:review-policy v1 -->
## Review Policy

Before declaring any task done with changed source files:

1. Run deterministic checks first (tests, typecheck, lint). LLM review only
   after green.
2. One fresh-context `opus-reviewer` pass on the diff. Second pass only on a
   structured P0/P1 finding. Max 3 rounds; stop when clean.
3. Diff touches auth, payments, data migration, public API, or CI/pipeline
   config: ensemble — `opus-reviewer` AND `gpt-sol-reviewer`, fix the
   intersection of findings before finishing.
4. Done means checks green and no P0/P1 findings — never "reviewers agree".
5. `astra-oracle` only on explicit operator request or after Opus/Sol
   provably failed.
<!-- /pi-agent-stuff:review-policy -->
```

Prerequisite: this pi package installed
(`pi install git:github.com/potentialdiffer/pi-agent-stuff`) so the named agents
resolve. If the package is absent, substitute any local reviewer agents.

## Evidence

- Anthropic, "Building effective agents": avoid evaluator-optimizer loops when
  first-pass quality suffices or criteria are unclear; cheap models for
  triage, premium for risky patches.
- Meta RADAR (arxiv 2605.30208): calibrated risk thresholds and multi-stage
  review eligibility beat raw diff-size cutoffs.
- arXiv 2604.22750: token spend does not reliably improve accuracy; cost is a
  first-class regression metric.
- Community practice (Kodus, PairCoder, GitHub Copilot review): sensitive
  paths get deep review regardless of size; size only changes strategy.
