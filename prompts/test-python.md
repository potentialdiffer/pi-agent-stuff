---
description: Generate pytest tests for Python code with comprehensive coverage
argument-hint: "[function_name]"
---

# Python Test Generation Template

Generate comprehensive pytest tests for the following Python code. Follow these requirements:

## Test Structure
1. Create a separate `test_<module>.py` file
2. Use descriptive test class and method names
3. Follow AAA pattern (Arrange, Act, Assert)

## Test Cases to Include
- [ ] **Happy path**: Normal, expected inputs
- [ ] **Edge cases**: Empty, None, min/max values, boundary conditions
- [ ] **Error cases**: Invalid types, constraint violations, missing required args
- [ ] **Property tests**: If applicable, use hypothesis for property-based testing

## Test Quality Requirements
- Each test should have ONE assertion when possible
- Tests should be independent (no shared mutable state)
- Use fixtures for common test data
- Use parameterized tests for similar test cases
- Include docstrings for test classes and methods

## Example Test Format

```python
import pytest
from module import function_under_test


class TestFunctionUnderTest:
    """Test suite for function_under_test."""
    
    @pytest.fixture
    def sample_input(self):
        """Sample input for testing."""
        return {"key": "value"}
    
    def test_happy_path(self, sample_input):
        """Test primary use case with valid input."""
        # Arrange (already done via fixture)
        
        # Act
        result = function_under_test(sample_input)
        
        # Assert
        assert result == expected_output
    
    def test_empty_input(self):
        """Test with empty input."""
        assert function_under_test({}) == expected_empty_result
    
    def test_none_input(self):
        """Test with None input."""
        assert function_under_test(None) is None
    
    def test_invalid_type(self):
        """Test type validation."""
        with pytest.raises(TypeError, match="Expected dict"):
            function_under_test("invalid")
    
    def test_constraint_violation(self):
        """Test value constraints."""
        with pytest.raises(ValueError, match="Must be positive"):
            function_under_test(-1)
    
    @pytest.mark.parametrize("input,expected", [
        (0, 0),
        (1, 1),
        (10, 55),
    ])
    def test_parameterized(self, input, expected):
        """Test multiple input/output pairs."""
        assert function_under_test(input) == expected
```

## Common Test Patterns

### Testing Exceptions
```python
def test_raises_custom_error():
    with pytest.raises(CustomError, match="specific message"):
        function_under_test(invalid_input)
```

### Testing File Operations
```python
import tempfile
from pathlib import Path

def test_file_operations():
    with tempfile.TemporaryDirectory() as tmpdir:
        test_file = Path(tmpdir) / "test.txt"
        test_file.write_text("content")
        
        result = function_under_test(test_file)
        assert result == expected
```

### Testing Context Managers
```python
def test_context_manager():
    with function_under_test() as resource:
        assert resource.is_open()
    assert resource.is_closed()
```

### Mocking External Dependencies
```python
from unittest.mock import patch, MagicMock

def test_api_call():
    mock_response = MagicMock()
    mock_response.json.return_value = {"data": "value"}
    
    with patch("module.requests.get", return_value=mock_response) as mock_get:
        result = function_under_test()
        assert result == {"data": "value"}
        mock_get.assert_called_once_with(expected_url)
```

## Pytest Configuration

Include this in your `pytest.ini` or `pyproject.toml`:

```ini
[pytest]
addopts = -v --tb=short
testpaths = tests
python_files = test_*.py
python_functions = test_*
```

## Running Tests

```bash
# Run all tests
pytest

# Run with verbose output
pytest -v

# Run specific test file
pytest tests/test_module.py

# Run specific test
pytest tests/test_module.py::TestClass::test_method

# Run with coverage
pytest --cov=module --cov-report=term-missing
```
