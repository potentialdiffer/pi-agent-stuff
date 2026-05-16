#!/usr/bin/env python3
"""
Script Template
==============
A well-structured Python script template for research and engineering tasks.
"""

import argparse
import logging
import os
import sys
from pathlib import Path
from typing import Optional, List, Dict, Any

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


class Config:
    """Configuration management using environment variables and defaults."""
    
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    INPUT_DIR: Path = Path(os.getenv("INPUT_DIR", "./input"))
    OUTPUT_DIR: Path = Path(os.getenv("OUTPUT_DIR", "./output"))
    
    @classmethod
    def setup_logging(cls) -> None:
        """Configure logging based on settings."""
        level = getattr(logging, cls.LOG_LEVEL.upper(), logging.INFO)
        logging.getLogger().setLevel(level)
        if cls.DEBUG:
            logger.info("Debug mode enabled")


class DataLoader:
    """Load and preprocess data from various sources."""
    
    @staticmethod
    def load_json(filepath: Path) -> Dict[str, Any]:
        """Load JSON data from file."""
        import json
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    
    @staticmethod
    def load_csv(filepath: Path) -> List[Dict[str, Any]]:
        """Load CSV data from file."""
        import csv
        with open(filepath, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            return list(reader)
    
    @staticmethod
    def load_text(filepath: Path) -> str:
        """Load text data from file."""
        return filepath.read_text(encoding='utf-8')


class DataProcessor:
    """Process and transform data."""
    
    @staticmethod
    def clean_data(data: Any) -> Any:
        """Clean and normalize data."""
        # Implement data cleaning logic
        return data
    
    @staticmethod
    def validate_data(data: Any, schema: Optional[Dict] = None) -> bool:
        """Validate data against a schema."""
        # Implement validation logic
        return True


class ResultsSaver:
    """Save results to various formats."""
    
    @staticmethod
    def save_json(data: Dict[str, Any], filepath: Path) -> None:
        """Save data as JSON."""
        import json
        filepath.parent.mkdir(parents=True, exist_ok=True)
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        logger.info(f"Saved JSON to {filepath}")
    
    @staticmethod
    def save_csv(data: List[Dict[str, Any]], filepath: Path) -> None:
        """Save data as CSV."""
        import csv
        filepath.parent.mkdir(parents=True, exist_ok=True)
        if not data:
            return
        fieldnames = data[0].keys()
        with open(filepath, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(data)
        logger.info(f"Saved CSV to {filepath}")


def parse_args() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="Script description")
    parser.add_argument(
        "--input", 
        type=Path, 
        default=Config.INPUT_DIR,
        help="Input directory or file"
    )
    parser.add_argument(
        "--output", 
        type=Path, 
        default=Config.OUTPUT_DIR,
        help="Output directory"
    )
    parser.add_argument(
        "--verbose", 
        action="store_true",
        help="Enable verbose logging"
    )
    return parser.parse_args()


def main() -> int:
    """Main entry point."""
    try:
        args = parse_args()
        
        if args.verbose:
            Config.LOG_LEVEL = "DEBUG"
        Config.setup_logging()
        
        logger.info("Starting script execution")
        
        # Example workflow
        input_path = args.input
        output_dir = args.output
        output_dir.mkdir(parents=True, exist_ok=True)
        
        if input_path.is_file():
            if input_path.suffix == '.json':
                data = DataLoader.load_json(input_path)
            elif input_path.suffix == '.csv':
                data = DataLoader.load_csv(input_path)
            else:
                data = DataLoader.load_text(input_path)
            
            # Process data
            cleaned_data = DataProcessor.clean_data(data)
            
            # Validate
            if DataProcessor.validate_data(cleaned_data):
                output_path = output_dir / f"output{input_path.suffix}"
                if input_path.suffix == '.json':
                    ResultsSaver.save_json(cleaned_data, output_path)
                elif input_path.suffix == '.csv':
                    ResultsSaver.save_csv(cleaned_data, output_path)
            
        logger.info("Script completed successfully")
        return 0
        
    except Exception as e:
        logger.error(f"Script failed: {e}", exc_info=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
