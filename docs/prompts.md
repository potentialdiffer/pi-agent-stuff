# Prompts Documentation

This document describes all prompts included in this monorepo.

## Available Prompts

### review.md
**Location:** `prompts/review.md`

Code review prompt template for critical analysis of code.

**Use Case:**
Request a thorough, pedantic review of your code.

**What It Checks:**
1. **Performance bottlenecks**: Inefficient algorithms, unnecessary computations, memory issues
2. **Security vulnerabilities**: Injection, XSS, hardcoded secrets, improper validation
3. **Readability and maintainability**: Code structure, naming, comments, documentation

**Style:**
- Pedantic and thorough
- Suggests specific improvements
- Prioritizes issues by severity

**Example Invocation:**
```
Use the review prompt to analyze this code for issues.
```

### test-python.md
**Location:** `prompts/test-python.md`

Generate comprehensive pytest tests for Python code with full coverage.

**Use Case:**
Generate a separate `test_<module>.py` file with descriptive test classes and methods following the AAA pattern (Arrange, Act, Assert).

**What It Covers:**
1. **Happy path**: Normal, expected inputs
2. **Edge cases**: Empty, None, min/max, boundary conditions
3. **Error cases**: Invalid types, constraint violations, missing required args
4. **Property tests**: hypothesis-based where applicable

**Style:**
- One assertion per test when possible
- Independent tests (no shared mutable state)
- Fixtures for common test data
- Parameterized tests for similar cases
- Docstrings for test classes

**Arguments:**
`[function_name]` — optional, name of the function to generate tests for

**Example Invocation:**
```
/test-python calculate_total
```

---

## Creating Custom Prompts

Prompts in this monorepo follow the pi prompt-template spec. Frontmatter supports only `description` and an optional `argument-hint`; the prompt body is the Markdown content of the file (not a `content:` field). The filename becomes the command name (`review.md` → `/review`).

```markdown
---
description: Brief description of what this prompt does
argument-hint: "<required-arg> [optional-arg]"
---
The actual prompt text goes here.
It can span multiple lines.
Use $1, $2 for positional args and $@ for all args.
```

**Best Practices:**
1. **Be specific**: Clearly state what the prompt should accomplish
2. **Provide structure**: Use sections and bullet points for clarity
3. **Set expectations**: Specify output format and level of detail
4. **Include examples**: Show expected input/output when helpful
5. **Keep it focused**: One prompt per specific use case

**Prompt Categories to Consider Adding:**
- Code generation (specific languages/frameworks)
- Documentation writing
- Test case generation
- Debugging assistance
- Architecture design
- API design
- Data modeling
- Deployment planning
