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

## Model changes

To point these agents at a different model later, edit the `model:` frontmatter
in `agents/*.md`, commit, push, and run `pi update --extensions`. Per-run
overrides still win: `/run opus-reviewer[model=anthropic/claude-sonnet-5] "..."`.
