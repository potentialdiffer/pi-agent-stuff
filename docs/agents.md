# Subagent Agents

Custom subagent agent definitions shipped by this package. Loaded via
`package.json` → `pi.subagents.agents` → `./agents`. Package agents load above
pi-subagents builtins and below user/project agents, so a user or project agent
with the same name shadows them.

## Agents

| Agent | Model | Role |
|---|---|---|
| `opus-oracle` | `anthropic/claude-opus-5-5` (thinking: high) | Read-only consultant. Second opinions, decision critique, drift detection, root-cause questions. Fresh context. |
| `opus-reviewer` | `anthropic/claude-opus-5-5` (thinking: high) | Adversarial reviewer for diffs, plans, implementations. Read-only, evidence-first, P0/P1/P2 findings + merge verdict. Fresh context. |
| `gpt-sol-reviewer` | `openai/gpt-6.1-sol` (thinking: high) | Adversarial reviewer from an independent model family. Ensemble counterpart to `opus-reviewer`: same rubric, same output shape, uncorrelated findings. |
| `astra-oracle` | `openai/gpt-6-astra` (thinking: high) | Escalation-tier consultant. Hardest long-horizon problems and ambiguous deep debugging — only after cheaper models proved insufficient. |

## Tier map

| Tier | Model | Pi role | Cost (per 1M tok) |
|---|---|---|---|
| 1. Fast workhorse | GLM 5.3 (session default) | parent, `scout`, `worker` | cheap |
| 2. Standard well-scoped | GLM 5.3 @ high / GPT-6.1-Sol @ medium | routine review, focused implementation | low |
| 3. Deep bounded | `openai/gpt-6.1-sol:high` | hard analysis, deep oracle work | $2 / $10 |
| 3b. Escalation only | `openai/gpt-6-astra:high` | only when Sol provably insufficient | $10 / $50 |
| 4. Judge / intent / taste | `anthropic/claude-opus-5-5:high` | consultation, adversarial review, ambiguous scoping | top |

Routing rule: tiers 1–3 when the task is well-scoped; tier 4 (Opus) when
scoping or judging is the task itself.

## Usage

After `pi update --extensions`, the agents appear in `subagent({ action: "list" })`
and are invocable by name:

```
/run opus-oracle "challenge this plan: <goal, constraints, current approach>"
/run opus-reviewer "review the current diff"
```

Or in scripts:

```typescript
subagent({ agent: "opus-reviewer", task: "Review diff for P0/P1 issues.", context: "fresh" })
```

## Design rationale

- **Judge, not coder.** The parent session (cheap workhorse model) plans and
  implements; Opus 5.5 gets bounded, read-only judgment work. Top-reasoning
  models loop on vague open-ended implementation; bounded critique is where
  they earn their cost.
- **Fresh context.** Adversarial review must not inherit parent history —
  inherited context means inherited bias. Both agents default to
  `context: "fresh"`.
- **Read-only tools.** `read, grep, find, ls, bash` (bash for read-only
  verification only). Advisory agents never become second writers or
  decision-makers.
- **Independent model review.** Same-model self-review misses roughly a third
  of its own errors (self-preference bias, correlated blind spots). Routing
  review to a different frontier model breaks the echo chamber.
- **Per-role pinning, not global.** Model is pinned per agent in frontmatter.
  Do not set `subagents.defaultModel` — that would pin every child to Opus.

## Ensemble review recipe

Writer family must never review itself. Same-family reviewers correlate;
cross-family reviewers do not.

```
GLM worker implements
  -> opus-reviewer        (Claude family: P0/P1/P2 + verdict)
  -> gpt-sol-reviewer     (GPT family: same rubric, uncorrelated)
  -> parent synthesizes:  intersection of findings = must-fix;
                          union of P2 = optional; disagreement = adjudicate
  -> GLM fix-worker applies accepted fixes
repeat max 3 rounds
```

Ensemble discipline:
- Identical rubric and output shape for both reviewers — only the model varies
- Never two same-family models on one review (e.g. Sol + Astra together)
- Both flag the same P0 = certain blocker, fix now
- Disagreement = signal, not failure; parent adjudicates and looks itself

## Escalation ladder

GLM -> GPT Sol @ high -> (rare) Astra -> (rare) Opus oracle.
Each rung only when the previous provably failed. `astra-oracle` expects the
packet to say what was already tried and why it fell short.

## Council of three

For material decisions, one advisor per family with distinct stances (Opus:
taste/risk/intent; GPT Sol: deep technical tradeoffs; GLM: cost/practicality).
`council-*` profiles must live in user or project agent dirs, not in this
package; copy a profile template into `.pi/agents/` per project.

## Review policy propagation

`AGENTS.md` in this repo carries the review policy for work on the repo
itself. To apply the same evidence-based completion policy to any other
project:

```bash
node scripts/install-review-policy.cjs /path/to/project [--watchdog]
```

Idempotent (marker-tagged block), merges the GPT-6.1-Sol watchdog into that
project's `.pi/settings.json` when `--watchdog` is passed. For an all-projects
setup, copy the block from `templates/review-policy.md` into
`~/.pi/agent/AGENTS.md` (operator-applied, per the repo critical rule).

## Model changes

To point these agents at a different model later, edit the `model:` frontmatter
in `agents/*.md`, commit, push, and run `pi update --extensions`. Per-run
overrides still win: `/run opus-reviewer[model=anthropic/claude-sonnet-5] "..."`.
