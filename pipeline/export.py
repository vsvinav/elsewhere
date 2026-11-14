from __future__ import annotations
import json
import time
from dataclasses import asdict
from pathlib import Path

from .derive import derive_daily, derive_places, derive_trips
from .geo import guess_home, tag_geo
from .models import Home, Parsed


STROKE_POINTS = 8000


def _dump(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, separators=(",", ":"), ensure_ascii=False))


def export_all(parsed: Parsed, out_dir: Path, *, source_file: str, source_sha256: str,
               places_cache: dict[str, dict], homes: list[Home] | None = None,
               work: tuple[float, float] | None = None) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    homes = sorted(homes or [guess_home(parsed.visits)], key=lambda h: h.from_ts)
    for h, nxt in zip(homes, homes[1:]):
        h.to_ts = nxt.from_ts
    tag_geo(parsed, homes)

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

    # Decimated copy for the printed strips; the full record is loaded only by the map.
    total = sum(len(p.pts) for p in parsed.paths)
    k = max(1, -(-total // STROKE_POINTS))
    _dump(out_dir / "strokes.json", [
        {"start": p.start, "end": p.end,
         "pts": [[q.ts, round(q.lat, 4), round(q.lng, 4)] for i, q in enumerate(p.pts) if i % k == 0 or i == len(p.pts) - 1]}
        for p in parsed.paths if len(p.pts) > 1])

    places = derive_places(parsed, homes, work)
    for pid, cached in places_cache.items():
        if pid in places:
            places[pid]["name"] = cached.get("name")
            places[pid]["address"] = cached.get("address")
            places[pid]["types"] = cached.get("types", [])
            places[pid]["primary_type"] = cached.get("primary_type")
    _dump(out_dir / "places.json", places)

    _dump(out_dir / "daily.json", derive_daily(parsed, homes, work))
    _dump(out_dir / "trips.json", derive_trips(parsed, homes))

    last = homes[-1]
    _dump(out_dir / "profile.json", {
        "home": {"lat": last.lat, "lng": last.lng},
        "homes": [{"lat": h.lat, "lng": h.lng, "city": h.city, "cc": h.cc, "from": h.from_ts, "to": h.to_ts} for h in homes],
        "work": {"lat": work[0], "lng": work[1], "place_id": ""} if work else None,
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
