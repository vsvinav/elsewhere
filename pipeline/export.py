from __future__ import annotations
import json
import time
from dataclasses import asdict
from pathlib import Path

from .derive import derive_daily, derive_places, derive_trips
from .geo import tag_geo
from .models import Parsed


def _dump(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, separators=(",", ":"), ensure_ascii=False))


def export_all(parsed: Parsed, out_dir: Path, *, source_file: str, source_sha256: str,
               places_cache: dict[str, dict]) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    home = tag_geo(parsed)

    _dump(out_dir / "visits.json", [
        {"id": v.id, "start": v.start, "end": v.end, "tz": v.tz, "place_id": v.place_id,
         "lat": v.lat, "lng": v.lng, "type": v.semantic_type, "p": round(v.probability, 3),
         "lvl": v.hierarchy_level}
        for v in parsed.visits])

    _dump(out_dir / "activities.json", [
        {"id": a.id, "start": a.start, "end": a.end, "tz": a.tz, "s_lat": a.s_lat, "s_lng": a.s_lng,
         "e_lat": a.e_lat, "e_lng": a.e_lng, "m": round(a.distance_m), "mode": a.mode,
         "p": round(a.probability, 3)}
        for a in parsed.activities])

    _dump(out_dir / "paths.json", [
        {"start": p.start, "end": p.end, "pts": [[q.ts, q.lat, q.lng] for q in p.pts]}
        for p in parsed.paths])

    _dump(out_dir / "positions.json", [asdict(p) for p in parsed.positions])

    places = derive_places(parsed)
    for pid, cached in places_cache.items():
        if pid in places:
            places[pid]["name"] = cached.get("name")
            places[pid]["address"] = cached.get("address")
    _dump(out_dir / "places.json", places)

    _dump(out_dir / "daily.json", derive_daily(parsed, home))
    _dump(out_dir / "trips.json", derive_trips(parsed, home))

    _dump(out_dir / "profile.json", {
        "home": {"lat": home[0], "lng": home[1]},
        "frequent_places": parsed.profile.frequent_places,
        "frequent_trips": parsed.profile.frequent_trips,
        "persona": parsed.profile.persona,
    })

    all_ts = [v.start for v in parsed.visits] + [a.start for a in parsed.activities]
    all_end = [v.end for v in parsed.visits] + [a.end for a in parsed.activities]
    _dump(out_dir / "meta.json", {
        "source_file": source_file,
        "source_sha256": source_sha256,
        "built_at": int(time.time()),
        "range": [min(all_ts) if all_ts else 0, max(all_end) if all_end else 0],
        "import_report": asdict(parsed.report),
    })
