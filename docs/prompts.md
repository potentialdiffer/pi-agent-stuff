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

---

## Creating Custom Prompts

Prompts in this monorepo follow a simple YAML frontmatter format:

```markdown
---
name: "prompt-name"
description: "Brief description of what this prompt does"
content: |
  The actual prompt text goes here.
  It can span multiple lines.
  Use | for literal multi-line content.
---
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
