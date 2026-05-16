# Python Script Template

A well-structured Python script template for research and engineering tasks.

## Features

- **Configuration Management**: Environment variables with sensible defaults
- **Logging**: Structured logging with configurable levels
- **Data Loading**: JSON, CSV, and text file support
- **Data Processing**: Cleaning and validation helpers
- **Result Saving**: JSON and CSV output formats
- **CLI Arguments**: Argument parsing with argparse
- **Error Handling**: Proper exception handling and exit codes

## Usage

```bash
# Run with defaults
python main.py

# Specify input and output
python main.py --input ./data/input.json --output ./results

# Enable verbose logging
python main.py --verbose
```

## Customization

1. **Add new data loaders** in `DataLoader` class
2. **Add processing logic** in `DataProcessor` class
3. **Add output formats** in `ResultsSaver` class
4. **Add CLI arguments** in `parse_args()` function

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DEBUG` | `false` | Enable debug mode |
| `LOG_LEVEL` | `INFO` | Logging level (DEBUG, INFO, WARNING, ERROR) |
| `INPUT_DIR` | `./input` | Default input directory |
| `OUTPUT_DIR` | `./output` | Default output directory |

## Dependencies

This template requires Python 3.7+ with no additional dependencies for basic functionality.
Additional packages may be needed depending on your use case (pandas, numpy, etc.).

## Best Practices

- Keep functions small and single-purpose
- Use type hints for better code clarity
- Add docstrings to all public functions and classes
- Use logging instead of print statements
- Handle edge cases gracefully
- Write tests for critical functionality
