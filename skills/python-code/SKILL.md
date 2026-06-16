---
name: python-code
description: Generate production-ready Python code with automatic testing and validation. Always produces running code with tests.
---

# Python Code Generation Protocol

## 🎯 CORE PRINCIPLE
**Every Python code generation request MUST include: code + tests + validation + simulated execution.**

Never deliver code without first validating it works. If validation fails, fix and retry up to 3 times, then warn user.

---

## ⚡ MANDATORY WORKFLOW (Follow for EVERY request)

### Step 1: REQUIREMENTS CLARIFICATION (Ask BEFORE coding)
**ALWAYS ask clarifying questions when:**
- Requirements are ambiguous or incomplete
- Edge cases aren't specified
- Input/output constraints are unclear
- Multiple valid approaches exist

**Critical questions to ask:**
- "What should happen with invalid/None input? Raise exception or return default?"
- "What are the expected input types and constraints?"
- "Should this handle concurrent access?"
- "What's the expected performance for large inputs?"
- "Which Python version should I target?"
- "Are there existing code patterns in this project I should follow?"

**If user doesn't specify, make REASONABLE assumptions and STATE them clearly:**
```
Assumptions:
- Python 3.10+
- Input validation with TypeError for wrong types
- Returns None for invalid input (or specify alternative)
- Not thread-safe unless requested
```

---

### Step 2: IMPLEMENTATION

**ALWAYS follow Python best practices:**

#### Code Structure
- [ ] Use type hints for ALL functions (PEP 484)
- [ ] Use `pathlib.Path` for file operations (not `os.path`)
- [ ] Use `dataclasses` or `pydantic` for data structures
- [ ] Use context managers (`with` statements) for resources
- [ ] Use f-strings for string formatting
- [ ] Use `enum.Enum` for constant sets
- [ ] Use `@property` for computed attributes
- [ ] Use `__slots__` for memory optimization when appropriate
- [ ] Include `if __name__ == "__main__":` guard for scripts

#### Error Handling
- [ ] Raise specific exceptions (not generic `Exception`)
- [ ] Use custom exceptions for domain errors
- [ ] Include docstrings with `Raises` section
- [ ] Validate inputs at function start
- [ ] Use `try/except` for expected errors, not for control flow

#### Performance
- [ ] Use generators for large sequences (`yield`)
- [ ] Use set/dict comprehensions for O(1) lookups
- [ ] Avoid premature optimization
- [ ] Use `__slots__` for classes with many instances
- [ ] Use `functools.lru_cache` for expensive pure functions

#### Style
- [ ] Follow PEP 8
- [ ] Use 4-space indentation
- [ ] Use snake_case for variables/functions
- [ ] Use CamelCase for classes
- [ ] Use UPPER_CASE for constants
- [ ] Line length: 88-100 chars (use black default)
- [ ] Include docstrings (Google or NumPy style)

---

### Step 3: TESTING (MANDATORY - Never skip)

**ALWAYS generate pytest tests for ALL functions.**

#### Test Structure
```python
# test_<module>.py
import pytest
from module import function_under_test


class Test<FunctionName>:
    """Test suite for function_under_test."""
    
    def test_basic_case(self):
        """Test the primary use case."""
        # Arrange
        input = ...
        expected = ...
        
        # Act
        result = function_under_test(input)
        
        # Assert
        assert result == expected
    
    def test_edge_case_empty(self):
        """Test with empty input."""
        assert function_under_test([]) == ...
    
    def test_edge_case_none(self):
        """Test with None input."""
        assert function_under_test(None) == ...  # or raises
    
    def test_error_invalid_type(self):
        """Test type validation."""
        with pytest.raises(TypeError, match="Expected int"):
            function_under_test("invalid")
    
    def test_error_value_constraint(self):
        """Test value constraints."""
        with pytest.raises(ValueError, match="Must be positive"):
            function_under_test(-1)
```

#### Test Coverage Requirements
- [ ] Test happy path (normal inputs)
- [ ] Test edge cases (empty, None, min/max values)
- [ ] Test error cases (invalid types, constraint violations)
- [ ] Test boundary conditions (off-by-one, limits)
- [ ] Test property-based if applicable (use `hypothesis`)

#### Test Quality
- [ ] Use descriptive test names (not `test1`, `test2`)
- [ ] Use AAA pattern (Arrange, Act, Assert)
- [ ] One assertion per test when possible
- [ ] Tests should be independent (no shared state)
- [ ] Use fixtures for common test data
- [ ] Use parameterized tests for similar cases

---

### Step 4: VALIDATION (Simulate BEFORE final answer)

**Mentally execute this validation checklist:**

#### ✅ Syntax Validation
- [ ] Python syntax is valid (no SyntaxError)
- [ ] All brackets/parentheses/braces balanced
- [ ] All strings properly quoted
- [ ] No indentation errors
- [ ] No tabs (use spaces only)

#### ✅ Import Validation
- [ ] All imports exist in standard library or requirements
- [ ] No circular imports
- [ ] Import paths are correct
- [ ] Relative imports use proper dots
- [ ] `__future__` imports at top if needed

#### ✅ Static Analysis (Mental mypy)
- [ ] Type hints are consistent
- [ ] No undefined variables
- [ ] No missing return statements
- [ ] No incompatible types in operations
- [ ] All function parameters used

#### ✅ Runtime Validation (Mental execution)
- [ ] No NameError (undefined variables)
- [ ] No AttributeError (missing attributes)
- [ ] No TypeError (wrong types)
- [ ] No IndexError (out of bounds)
- [ ] No KeyError (missing keys)
- [ ] No ValueError (invalid values)

#### ✅ Test Validation (Mental pytest)
- [ ] All tests would pass with the generated code
- [ ] Test assertions match expected behavior
- [ ] Test cases cover the requirements

**If ANY validation fails:**
1. Analyze the specific error
2. Fix the issue in code or tests
3. Re-validate from the top
4. Repeat up to 3 times
5. If still failing: **WARN user** but deliver code with error explanation

---

### Step 5: SIMULATED EXECUTION

**For each function, mentally simulate:**

```python
# Example: factorial function

def factorial(n: int) -> int:
    if n < 0:
        raise ValueError("n must be non-negative")
    if n <= 1:
        return 1
    return n * factorial(n - 1)

# Mental simulation:
# factorial(0) -> 1 ✓
# factorial(1) -> 1 ✓  
# factorial(5) -> 5 * 4 * 3 * 2 * 1 = 120 ✓
# factorial(-1) -> ValueError ✓
# factorial(3.5) -> TypeError (from type hint) ✓
```

**If simulation reveals issues:**
- Fix the code
- Re-simulate
- Document the edge case in tests

---

### Step 6: DELIVERY FORMAT

**ALWAYS use this exact format:**

```markdown
## 📝 Requirements Clarified

- Input: [describe accepted inputs]
- Output: [describe return value]
- Edge cases: [list handled edge cases]
- Assumptions: [list any assumptions made]

---

## 💻 Implementation

```python
[generated code here]
```

---

## 🧪 Tests

```python
[generated tests here]
```

---

## ✅ Validation Results

| Check | Status | Notes |
|-------|--------|-------|
| Syntax | ✅ Pass | Valid Python 3.10+ |
| Imports | ✅ Pass | All imports resolvable |
| Type Hints | ✅ Pass | Consistent and complete |
| Runtime | ✅ Pass | No obvious runtime errors |
| Tests | ✅ Pass | All test cases would pass |

**⚠️  Warnings:**
- [List any non-blocking issues, e.g., "No input validation for X"]
- [Or "Consider adding Y for production use"]

---

## 📌 Usage Example

```python
from module import function

# Example usage
result = function(input)
print(result)
```

---

## 🎯 Next Steps

- [ ] Run `pytest` to verify tests pass
- [ ] Consider adding: [suggestions]
- [ ] Performance optimization: [if applicable]
```

**If validation failed after retries:**
```markdown
## ❌ Validation Failed

**Error:** [specific error message]

**Attempted fixes:**
1. [first fix attempt]
2. [second fix attempt]
3. [third fix attempt]

**Code delivered with known issue.** Please review and fix.

[code here]
```

---

## 🚨 CRITICAL: NEVER DO THESE

- ❌ Deliver code without tests
- ❌ Deliver code without validation
- ❌ Ignore type hints
- ❌ Use `eval()` or `exec()`
- ❌ Hardcode secrets or credentials
- ❌ Ignore error cases
- ❌ Use mutable default arguments
- ❌ Modify lists/dicts while iterating
- ❌ Use `==` for `None` (use `is None`)
- ❌ Use `is` for value comparison (use `==`)
- ❌ Bare `except:` clauses
- ❌ Print statements in libraries (use logging)

---

## 📚 PYTHON-SPECIFIC PATTERNS

### Data Classes
```python
from dataclasses import dataclass, field
from typing import List

@dataclass(frozen=True, slots=True)
class User:
    name: str
    email: str
    age: int = 0
    tags: List[str] = field(default_factory=list)
```

### Context Managers
```python
from contextlib import contextmanager
from typing import Generator

@contextmanager
def managed_resource() -> Generator[Resource, None, None]:
    resource = acquire()
    try:
        yield resource
    finally:
        release(resource)
```

### Type Hints
```python
from typing import Optional, Union, List, Dict, Tuple, Any
from pathlib import Path

# Good
def process_file(path: Path, encoding: str = "utf-8") -> List[str]:
    ...

# Bad (avoid)
def process_file(path, encoding="utf-8"):
    ...
```

### Error Handling
```python
# Good
class InvalidInputError(ValueError):
    """Raised when input is invalid."""
    pass

def calculate(x: int, y: int) -> int:
    if x < 0 or y < 0:
        raise InvalidInputError("x and y must be non-negative")
    return x + y

# Bad (avoid)
def calculate(x, y):
    try:
        return x + y
    except:
        return None
```

### File Operations
```python
# Good
from pathlib import Path

def read_config(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)

# Bad (avoid)
import os
def read_config(path):
    f = open(path)
    data = json.load(f)
    f.close()
    return data
```

---

## 🔍 COMMON PITFALLS TO AVOID

### 1. Mutable Default Arguments
```python
# ❌ WRONG - List is shared across all calls
def append_to(item, target=[]):
    target.append(item)
    return target

# ✅ CORRECT
def append_to(item, target=None):
    if target is None:
        target = []
    target.append(item)
    return target
```

### 2. Late Binding Closures
```python
# ❌ WRONG - All functions print 3
funcs = [lambda: i for i in range(3)]

# ✅ CORRECT
funcs = [lambda i=i: i for i in range(3)]
```

### 3. Modifying While Iterating
```python
# ❌ WRONG - Skips elements
data = [1, 2, 3, 4]
for item in data:
    if item % 2 == 0:
        data.remove(item)

# ✅ CORRECT
data = [item for item in data if item % 2 != 0]
```

### 4. Class vs Instance Variables
```python
# ❌ WRONG - Shared across all instances
class Counter:
    count = []
    def __init__(self):
        self.count.append(1)

# ✅ CORRECT
class Counter:
    def __init__(self):
        self.count = []
        self.count.append(1)
```

### 5. String Concatenation in Loops
```python
# ❌ WRONG - O(n²) performance
result = ""
for s in strings:
    result += s

# ✅ CORRECT - O(n)
result = "".join(strings)
```

---

## 🎓 TESTING BEST PRACTICES

### Pytest Fixtures
```python
import pytest

@pytest.fixture
def sample_data():
    """Provide sample data for tests."""
    return {"a": 1, "b": 2, "c": 3}

def test_sum_values(sample_data):
    assert sum(sample_data.values()) == 6
```

### Parameterized Tests
```python
import pytest

@pytest.mark.parametrize("input,expected", [
    (0, 1),
    (1, 1),
    (5, 120),
])
def test_factorial(input, expected):
    assert factorial(input) == expected
```

### Mocking
```python
from unittest.mock import patch, MagicMock

def test_api_call():
    with patch("module.api_client") as mock_client:
        mock_client.get.return_value = {"status": "ok"}
        result = call_api()
        assert result == {"status": "ok"}
        mock_client.get.assert_called_once()
```

### Property-Based Testing (Hypothesis)
```python
from hypothesis import given
from hypothesis.strategies import integers

@given(integers(min_value=0, max_value=100))
def test_factorial_always_positive(n):
    result = factorial(n)
    assert result > 0
```

---

## 📊 QUALITY CHECKLIST (Before Final Answer)

- [ ] Requirements fully understood and clarified
- [ ] All edge cases identified and handled
- [ ] Type hints added to all functions
- [ ] Error handling implemented
- [ ] Tests written for all functions
- [ ] Tests cover happy path, edge cases, errors
- [ ] Syntax validated (mental check)
- [ ] Imports validated (mental check)
- [ ] Runtime validated (mental simulation)
- [ ] Follows PEP 8 style
- [ ] No anti-patterns used
- [ ] Docstrings added
- [ ] Delivery format followed

**If ALL checks pass → Deliver code**
**If ANY check fails → Fix and re-validate (max 3 attempts) → Warn user**
