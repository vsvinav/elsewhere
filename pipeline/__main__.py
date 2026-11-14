from __future__ import annotations
import argparse
import hashlib
import json
import sys
from pathlib import Path

from .export import export_all
from .parse import parse_bytes

DEFAULT_OUT = Path("web/public/data")
CACHE = Path("places_cache.json")
MIN_PARSE_RATIO = 0.9


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
               source_sha256=hashlib.sha256(raw).hexdigest(), places_cache=cache)
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
    b.set_defaults(fn=cmd_build)
    e = sub.add_parser("enrich", help="fetch Google Places names for top places")
    e.add_argument("--top", type=int, default=200)
    e.add_argument("--data", default=str(DEFAULT_OUT))
    e.set_defaults(fn=cmd_enrich)
    args = p.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
