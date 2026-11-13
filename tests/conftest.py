from pathlib import Path
import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def mini_bytes() -> bytes:
    return (FIXTURES / "mini_timeline.json").read_bytes()


@pytest.fixture
def parsed(mini_bytes):
    from pipeline.parse import parse_bytes
    return parse_bytes(mini_bytes)
