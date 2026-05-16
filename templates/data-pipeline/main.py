#!/usr/bin/env python3
"""
Data Pipeline Template
====================
A modular data processing pipeline for ETL and analysis workflows.
"""

import logging
from pathlib import Path
from typing import Optional, List, Dict, Any, Iterator, Callable
from dataclasses import dataclass, field
from abc import ABC, abstractmethod
import time
import json

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@dataclass
class PipelineConfig:
    """Configuration for the data pipeline."""
    input_path: Path
    output_path: Path
    chunk_size: int = 1000
    temp_dir: Path = field(default_factory=lambda: Path("./temp"))
    
    def __post_init__(self) -> None:
        self.temp_dir.mkdir(parents=True, exist_ok=True)


@dataclass
class PipelineStats:
    """Statistics for pipeline execution."""
    total_items: int = 0
    processed_items: int = 0
    failed_items: int = 0
    start_time: float = field(default_factory=time.time)
    end_time: Optional[float] = None
    
    @property
    def duration(self) -> float:
        if self.end_time is None:
            return 0.0
        return self.end_time - self.start_time
    
    @property
    def success_rate(self) -> float:
        if self.total_items == 0:
            return 0.0
        return self.processed_items / self.total_items
    
    @property
    def throughput(self) -> float:
        if self.duration == 0:
            return 0.0
        return self.processed_items / self.duration


class PipelineStep(ABC):
    """Abstract base class for pipeline steps."""
    
    @property
    @abstractmethod
    def name(self) -> str:
        """Name of this pipeline step."""
        pass
    
    @abstractmethod
    def process(self, item: Any, config: PipelineConfig) -> Optional[Any]:
        """Process a single item. Return None to filter out."""
        pass
    
    @abstractmethod
    def initialize(self, config: PipelineConfig) -> None:
        """Initialize the step (called once before processing)."""
        pass
    
    @abstractmethod
    def finalize(self, config: PipelineConfig) -> None:
        """Finalize the step (called once after processing)."""
        pass


class DataPipeline:
    """Orchestrates multiple pipeline steps."""
    
    def __init__(self, config: PipelineConfig) -> None:
        self.config = config
        self.steps: List[PipelineStep] = []
        self.stats = PipelineStats()
    
    def add_step(self, step: PipelineStep) -> "DataPipeline":
        """Add a processing step to the pipeline."""
        self.steps.append(step)
        return self
    
    def run(self, items: Iterator[Any]) -> Iterator[Any]:
        """Run the pipeline on a stream of items."""
        logger.info(f"Starting pipeline with {len(self.steps)} steps")
        
        # Initialize all steps
        for step in self.steps:
            logger.debug(f"Initializing step: {step.name}")
            step.initialize(self.config)
        
        try:
            for item in items:
                self.stats.total_items += 1
                current = item
                
                for step in self.steps:
                    try:
                        current = step.process(current, self.config)
                        if current is None:
                            break  # Item filtered out
                    except Exception as e:
                        logger.error(f"Step '{step.name}' failed on item: {e}")
                        self.stats.failed_items += 1
                        current = None
                        break
                
                if current is not None:
                    self.stats.processed_items += 1
                    yield current
        
        finally:
            # Finalize all steps
            for step in reversed(self.steps):
                logger.debug(f"Finalizing step: {step.name}")
                step.finalize(self.config)
            
            self.stats.end_time = time.time()
            logger.info(
                f"Pipeline complete. "
                f"Processed: {self.stats.processed_items}, "
                f"Failed: {self.stats.failed_items}, "
                f"Duration: {self.stats.duration:.2f}s, "
                f"Throughput: {self.stats.throughput:.2f} items/s"
            )


# Example Pipeline Steps

class FilterStep(PipelineStep):
    """Filter items based on a predicate."""
    
    def __init__(self, predicate: Callable[[Any], bool], name: str = "filter") -> None:
        self.predicate = predicate
        self._name = name
    
    @property
    def name(self) -> str:
        return self._name
    
    def process(self, item: Any, config: PipelineConfig) -> Optional[Any]:
        if self.predicate(item):
            return item
        return None
    
    def initialize(self, config: PipelineConfig) -> None:
        pass
    
    def finalize(self, config: PipelineConfig) -> None:
        pass


class TransformStep(PipelineStep):
    """Transform items using a function."""
    
    def __init__(self, func: Callable[[Any], Any], name: str = "transform") -> None:
        self.func = func
        self._name = name
    
    @property
    def name(self) -> str:
        return self._name
    
    def process(self, item: Any, config: PipelineConfig) -> Optional[Any]:
        return self.func(item)
    
    def initialize(self, config: PipelineConfig) -> None:
        pass
    
    def finalize(self, config: PipelineConfig) -> None:
        pass


class AggregateStep(PipelineStep):
    """Aggregate items (stateful step)."""
    
    def __init__(self, name: str = "aggregate") -> None:
        self._name = name
        self.aggregated: List[Any] = []
    
    @property
    def name(self) -> str:
        return self._name
    
    def process(self, item: Any, config: PipelineConfig) -> Optional[Any]:
        self.aggregated.append(item)
        return item
    
    def initialize(self, config: PipelineConfig) -> None:
        self.aggregated = []
    
    def finalize(self, config: PipelineConfig) -> None:
        # Save aggregated data
        output_path = config.temp_dir / f"{self.name}_aggregated.json"
        with open(output_path, 'w') as f:
            json.dump(self.aggregated, f, indent=2)
        logger.info(f"Aggregated {len(self.aggregated)} items to {output_path}")


class LoadJSONLines:
    """Load items from a JSON Lines file."""
    
    @staticmethod
    def load(filepath: Path) -> Iterator[Dict[str, Any]]:
        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    yield json.loads(line)


class SaveJSONLines:
    """Save items to a JSON Lines file."""
    
    @staticmethod
    def save(items: Iterator[Any], filepath: Path) -> None:
        filepath.parent.mkdir(parents=True, exist_ok=True)
        with open(filepath, 'w', encoding='utf-8') as f:
            for item in items:
                f.write(json.dumps(item, ensure_ascii=False) + '\n')


# Example Usage

if __name__ == "__main__":
    import sys
    
    # Configuration
    config = PipelineConfig(
        input_path=Path("input.jsonl"),
        output_path=Path("output.jsonl"),
        chunk_size=1000
    )
    
    # Create pipeline
    pipeline = DataPipeline(config)
    
    # Add steps
    pipeline.add_step(FilterStep(
        predicate=lambda x: x.get("valid", True),
        name="filter_invalid"
    ))
    pipeline.add_step(TransformStep(
        func=lambda x: {**x, "processed": True},
        name="add_processed_flag"
    ))
    pipeline.add_step(AggregateStep(name="collect_all"))
    
    # Load input
    items = LoadJSONLines.load(config.input_path)
    
    # Run pipeline
    results = pipeline.run(items)
    
    # Save output
    SaveJSONLines.save(results, config.output_path)
    
    logger.info(f"Pipeline saved results to {config.output_path}")
