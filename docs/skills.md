# Skills Documentation

This document describes all SKILLs included in this monorepo.

## Available SKILLs

### literature-review
**Location:** `skills/literature-review/SKILL.md`

Analyzes and synthesizes research papers for academic work.

**Use Cases:**
- Analyzing a new research paper
- Extracting key insights from academic work
- Identifying research gaps and contributions
- Planning follow-up research

**What It Does:**
1. **Extraction**: Title, authors, abstract, keywords, research area
2. **Structural Breakdown**: Problem, methodology, results, contributions, limitations
3. **Critical Analysis**: Strengths, weaknesses, assumptions, reproducibility
4. **Contextualization**: Related work comparison, significance, future work
5. **Practical Application**: Implementation guidance, citation help, experiment suggestions

**Example Invocation:**
```
Use the literature-review skill to analyze this paper abstract: [paste abstract]
```

---

### data-analysis
**Location:** `skills/data-analysis/SKILL.md`

Guides statistical analysis, data exploration, and visualization.

**Use Cases:**
- Exploring a new dataset
- Performing statistical tests
- Creating visualizations
- Building predictive models

**Workflow:**
1. **Data Understanding**: Source, structure, variables, biases
2. **Cleaning**: Missing values, outliers, transformations
3. **Exploratory Analysis**: Statistics, distributions, correlations
4. **Statistical Analysis**: Appropriate tests based on data type and distribution
5. **Modeling**: Regression, classification, clustering
6. **Visualization**: Code snippets for matplotlib, seaborn, ggplot2, etc.

**Supported Tests:**
- 2 groups: t-test, Mann-Whitney U
- >2 groups: ANOVA, Kruskal-Wallis
- Paired: paired t-test, Wilcoxon signed-rank
- Correlation: Pearson, Spearman

**Example Invocation:**
```
Use the data-analysis skill to help me analyze this CSV dataset.
```

---

### latex-assistant
**Location:** `skills/latex-assistant/SKILL.md`

Provides academic writing and LaTeX document support.

**Use Cases:**
- Starting a new academic paper
- Formatting equations and tables
- Managing citations and bibliography
- Troubleshooting LaTeX errors
- Preparing for journal submission

**Features:**

**Templates:**
- IEEE, ACM, NeurIPS, ICML, CVPR conference templates
- Elsevier, Springer, Nature journal templates

**Equations:**
- Inline vs display math
- align, gather, multline, cases environments
- Greek letters, operators, relations, arrows

**Tables:**
- Basic tabular environment
- booktabs package (recommended)
- Multi-column and multi-row

**Figures:**
- Basic figure environment
- Subfigures
- Multiple images

**Citations:**
- BibTeX management guidance
- Citation commands (\cite, \parencite, \textcite)
- Multiple citations and ranges

**Algorithms:**
- algorithm and algorithmic packages
- Pseudocode formatting

**Journal Submission:**
- Checklist before submission
- Formatting tips

**Example Invocation:**
```
Use the latex-assistant skill to help me create a NeurIPS paper template.
```

---

### git-info
**Location:** `skills/git-info/SKILL.md`

Analyzes Git repositories, commit history, and branch status.

**Use Cases:**
- Understanding repository state
- Finding who changed a file
- Analyzing commit history
- Resolving merge conflicts
- Identifying bug-introducing commits

**Features:**

**Repository State:**
- Current branch
- Staged/unstaged/untracked changes
- Last commit information
- Remote status

**Commit History:**
- Graph visualization
- Author distribution
- Commit frequency
- Key changes extraction

**File Analysis:**
- git log for file history
- git blame for line-by-line attribution

**Branch Management:**
- Feature branch creation
- Merging strategies
- Rebasing
- Conflict resolution

**Advanced:**
- Git bisect for bug hunting
- Interactive rebase
- Stashing changes
- Cherry picking
- Submodules

**Troubleshooting:**
- Committed to wrong branch
- Undo a push
- Branch out of sync

**Example Invocation:**
```
Use the git-info skill to show me the commit history of this repository.
```
