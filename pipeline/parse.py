from __future__ import annotations
import json
import re
from datetime import datetime

from .models import (Activity, ImportReport, MemoryTrip, Parsed, Path, PathPoint,
                     Position, Profile, Visit)

_ESC = re.compile(rb"\x1b\[[0-9;?]*[A-Za-z]")
_LATLNG = re.compile(r"^\s*(-?\d+(?:\.\d+)?)°?\s*,\s*(-?\d+(?:\.\d+)?)°?\s*$")


def strip_escapes(raw: bytes) -> bytes:
    return _ESC.sub(b"", raw)


def parse_latlng(s: str) -> tuple[float, float]:
    m = _LATLNG.match(s)
    if not m:
        raise ValueError(f"bad latlng: {s!r}")
    lat, lng = float(m.group(1)), float(m.group(2))
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise ValueError(f"latlng out of range: {s!r}")
    return lat, lng


def parse_ts(s: str) -> tuple[int, int]:
    dt = datetime.fromisoformat(s)
    if dt.utcoffset() is None:
        raise ValueError(f"timestamp without offset: {s!r}")
    return int(dt.timestamp()), int(dt.utcoffset().total_seconds() // 60)


def _seg_tz(seg: dict, string_tz: int) -> int:
    """True local offset: the export's string offset is the exporting phone's zone,
    while startTimeTimezoneUtcOffsetMinutes carries the segment's local zone."""
    off = seg.get("startTimeTimezoneUtcOffsetMinutes")
    if isinstance(off, int) and not isinstance(off, bool):
        return off
    return string_tz


def _visit(seg: dict, idx: int) -> Visit:
    start, string_tz = parse_ts(seg["startTime"])
    end, _ = parse_ts(seg["endTime"])
    tz = _seg_tz(seg, string_tz)
    v = seg["visit"]
    tc = v["topCandidate"]
    lat, lng = parse_latlng(tc["placeLocation"]["latLng"])
    return Visit(id=idx, start=start, end=end, tz=tz, place_id=tc["placeId"],
                 lat=lat, lng=lng, semantic_type=tc.get("semanticType", "UNKNOWN"),
                 probability=float(v.get("probability", tc.get("probability", 0.0))))


def _activity(seg: dict, idx: int) -> Activity:
    start, string_tz = parse_ts(seg["startTime"])
    end, _ = parse_ts(seg["endTime"])
    tz = _seg_tz(seg, string_tz)
    a = seg["activity"]
    tc = a["topCandidate"]
    s_lat, s_lng = parse_latlng(a["start"]["latLng"])
    e_lat, e_lng = parse_latlng(a["end"]["latLng"])
    return Activity(id=idx, start=start, end=end, tz=tz, s_lat=s_lat, s_lng=s_lng,
                    e_lat=e_lat, e_lng=e_lng, distance_m=float(a.get("distanceMeters", 0.0)),
                    mode=tc.get("type", "UNKNOWN"),
                    probability=float(a.get("probability", tc.get("probability", 0.0))))


def _path(seg: dict) -> Path:
    start, _ = parse_ts(seg["startTime"])
    end, _ = parse_ts(seg["endTime"])
    pts = []
    for p in seg["timelinePath"]:
        lat, lng = parse_latlng(p["point"])
        ts, _ = parse_ts(p["time"])
        pts.append(PathPoint(ts=ts, lat=lat, lng=lng))
    return Path(start=start, end=end, pts=pts)


def _memory(seg: dict) -> MemoryTrip:
    start, _ = parse_ts(seg["startTime"])
    end, _ = parse_ts(seg["endTime"])
    trip = seg["timelineMemory"].get("trip", {})
    dests = [d["identifier"]["placeId"] for d in trip.get("destinations", [])
             if "identifier" in d and "placeId" in d["identifier"]]
    return MemoryTrip(start=start, end=end,
                      distance_from_origin_km=int(trip.get("distanceFromOriginKms", 0)),
                      destination_place_ids=dests)


def _position(p: dict) -> Position:
    lat, lng = parse_latlng(p["LatLng"])
    ts, _ = parse_ts(p["timestamp"])
    return Position(ts=ts, lat=lat, lng=lng, acc=float(p.get("accuracyMeters", 0.0)),
                    alt=p.get("altitudeMeters"), spd=p.get("speedMetersPerSecond"),
                    src=p.get("source", "UNKNOWN"))


def _profile(up: dict) -> Profile:
    fp = []
    for p in up.get("frequentPlaces", []):
        try:
            lat, lng = parse_latlng(p["placeLocation"])
            place_id = p["placeId"]
        except (KeyError, ValueError):
            continue
        fp.append({"place_id": place_id, "lat": lat, "lng": lng, "label": p.get("label")})
    return Profile(frequent_places=fp, frequent_trips=up.get("frequentTrips", []),
                   persona=up.get("persona", {}))


def parse_bytes(raw: bytes) -> Parsed:
    doc = json.loads(strip_escapes(raw))
    report = ImportReport()
    visits: list[Visit] = []
    activities: list[Activity] = []
    paths: list[Path] = []
    memories: list[MemoryTrip] = []

    for idx, seg in enumerate(doc.get("semanticSegments", [])):
        report.segments_total += 1
        try:
            if "visit" in seg:
                visits.append(_visit(seg, idx))
            elif "activity" in seg:
                activities.append(_activity(seg, idx))
            elif "timelinePath" in seg:
                paths.append(_path(seg))
            elif "timelineMemory" in seg:
                memories.append(_memory(seg))
            else:
                report.skip("unknown_segment")
                continue
            report.parsed += 1
        except ValueError as e:
            msg = str(e)
            if "latlng" in msg:
                report.skip("bad_latlng")
            elif "timestamp" in msg or "isoformat" in msg:
                report.skip("bad_timestamp")
            else:
                report.skip("bad_number")
        except (KeyError, TypeError):
            report.skip("missing_field")

    positions: list[Position] = []
    for r in doc.get("rawSignals", []):
        if "position" in r:
            try:
                positions.append(_position(r["position"]))
            except (KeyError, ValueError, TypeError):
                report.skip("bad_position")

    visits.sort(key=lambda x: x.start)
    activities.sort(key=lambda x: x.start)
    positions.sort(key=lambda x: x.ts)
    paths.sort(key=lambda p: p.start)

    return Parsed(visits=visits, activities=activities, paths=paths, positions=positions,
                  memory_trips=memories, profile=_profile(doc.get("userLocationProfile", {})),
                  report=report)
