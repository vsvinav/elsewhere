from __future__ import annotations
import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from .export import export_all
from .models import Home
from .parse import parse_bytes

DEFAULT_OUT = Path("web/public/data")
CACHE = Path("places_cache.json")
MIN_PARSE_RATIO = 0.9


def parse_home(spec: str) -> Home:
    """lat,lng[,YYYY-MM[,YYYY-MM]] — the month this became home (omit for the first home) and,
    optionally, the month you left it."""
    parts = spec.split(",")
    if len(parts) not in (2, 3, 4):
        raise argparse.ArgumentTypeError("expected lat,lng[,YYYY-MM[,YYYY-MM]]")
    month = lambda m: int(datetime.strptime(m, "%Y-%m").replace(tzinfo=timezone.utc).timestamp())
    from_ts = month(parts[2]) if len(parts) >= 3 and parts[2] else 0
    to_ts = month(parts[3]) if len(parts) == 4 else None
    return Home(float(parts[0]), float(parts[1]), from_ts=from_ts, to_ts=to_ts)


def parse_latlng(spec: str) -> tuple[float, float]:
    lat, lng = spec.split(",")
    return float(lat), float(lng)


def cmd_build(args: argparse.Namespace) -> int:
    raw = Path(args.file).read_bytes()
    parsed = parse_bytes(raw)
    rep = parsed.report
    print(f"segments: {rep.segments_total} parsed: {rep.parsed} skipped: {rep.skipped_by_reason}")
    if rep.segments_total and rep.parsed / rep.segments_total < MIN_PARSE_RATIO:
        print(f"error: parsed segments below 90% ({rep.parsed}/{rep.segments_total})", file=sys.stderr)
        return 1
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    export_all(parsed, Path(args.out), source_file=Path(args.file).name,
               source_sha256=hashlib.sha256(raw).hexdigest(), places_cache=cache,
               homes=args.home or None, work=args.work)
    print(f"wrote {args.out}")
    return 0


def cmd_enrich(args: argparse.Namespace) -> int:
    from .enrich import enrich
    return enrich(Path(args.data) / "places.json", CACHE, top=args.top)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="pipeline")
    sub = p.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build", help="parse export and write data files")
    b.add_argument("file")
    b.add_argument("--out", default=str(DEFAULT_OUT))
    b.add_argument("--home", action="append", type=parse_home, metavar="LAT,LNG[,YYYY-MM[,YYYY-MM]]",
                   help="a home, the month it started and optionally the month it ended; repeat for moves (default: longest-stayed place)")
    b.add_argument("--work", type=parse_latlng, metavar="LAT,LNG", help="work place, optional")
    b.set_defaults(fn=cmd_build)
    e = sub.add_parser("enrich", help="fetch Google Places names for top places")
    e.add_argument("--top", type=int, default=200)
    e.add_argument("--data", default=str(DEFAULT_OUT))
    e.set_defaults(fn=cmd_enrich)
    args = p.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
