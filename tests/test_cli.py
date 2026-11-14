import json
import subprocess
import sys
from pathlib import Path

FIX = Path(__file__).parent / "fixtures" / "mini_timeline.json"


def test_cli_build(tmp_path):
    r = subprocess.run([sys.executable, "-m", "pipeline", "build", str(FIX), "--out", str(tmp_path)],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    assert "segments: 23 parsed: 22" in r.stdout
    assert (tmp_path / "meta.json").exists()


def test_cli_build_fails_below_threshold(tmp_path):
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps({"semanticSegments": [
        {"startTime": "2025-01-01T00:00:00.000-05:00", "endTime": "2025-01-01T01:00:00.000-05:00",
         "visit": {"topCandidate": {"placeId": "X", "placeLocation": {"latLng": "garbage"}}}}
    ] * 10}))
    r = subprocess.run([sys.executable, "-m", "pipeline", "build", str(bad), "--out", str(tmp_path / "out")],
                       capture_output=True, text=True)
    assert r.returncode == 1
    assert "below 90%" in r.stderr
