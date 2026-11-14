from __future__ import annotations
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from .geo import HOME_TYPES, haversine_km
from .models import Parsed

WORK_TYPES = {"INFERRED_WORK", "WORK"}
TRIP_RADIUS_KM = 50.0


def derive_places(parsed: Parsed) -> dict[str, dict]:
    labels = {p["place_id"]: p.get("label") for p in parsed.profile.frequent_places}
    out: dict[str, dict] = {}
    for v in parsed.visits:
        p = out.get(v.place_id)
        if p is None:
            p = out[v.place_id] = {
                "lat": v.lat, "lng": v.lng, "label": labels.get(v.place_id),
                "semantic_type": v.semantic_type, "city": v.city,
                "country_code": v.country_code, "n_visits": 0, "total_hours": 0.0,
                "first_ts": v.start, "last_ts": v.end, "name": None,
            }
        p["n_visits"] += 1
        p["total_hours"] += (v.end - v.start) / 3600
        p["first_ts"] = min(p["first_ts"], v.start)
        p["last_ts"] = max(p["last_ts"], v.end)
        if v.semantic_type != "UNKNOWN":
            p["semantic_type"] = v.semantic_type
    return out


def _local_date(ts: int, tz_min: int) -> str:
    return datetime.fromtimestamp(ts + tz_min * 60, tz=timezone.utc).strftime("%Y-%m-%d")


def _split_by_local_day(start: int, end: int, tz_min: int):
    """Yield (date_str, seconds) for each local calendar day an interval touches."""
    cur = start
    while cur < end:
        local = datetime.fromtimestamp(cur + tz_min * 60, tz=timezone.utc)
        next_midnight_local = (local + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        boundary = int(next_midnight_local.timestamp()) - tz_min * 60
        chunk_end = min(end, boundary)
        yield local.strftime("%Y-%m-%d"), chunk_end - cur
        cur = chunk_end


def derive_daily(parsed: Parsed, home: tuple[float, float]) -> list[dict]:
    days: dict[str, dict] = {}

    def day(d: str) -> dict:
        return days.setdefault(d, {
            "date": d, "km_by_mode": defaultdict(float), "n_visits": 0,
            "_places": set(), "n_new_places": 0, "max_dist_from_home_km": 0.0,
            "hours_home": 0.0, "hours_work": 0.0, "hours_other": 0.0,
            "hours_transit": 0.0, "_cities": set(),
        })

    seen: set[str] = set()
    for v in parsed.visits:  # already sorted by start
        row = day(_local_date(v.start, v.tz))
        row["n_visits"] += 1
        if v.place_id not in seen:
            seen.add(v.place_id)
            row["n_new_places"] += 1
        if v.semantic_type in HOME_TYPES:
            bucket = "hours_home"
        elif v.semantic_type in WORK_TYPES:
            bucket = "hours_work"
        else:
            bucket = "hours_other"
        dist = v.dist_from_home_km if v.dist_from_home_km is not None else \
            haversine_km(home[0], home[1], v.lat, v.lng)
        # Nested visits (hierarchy_level > 0) lie inside a parent stay whose time is
        # already bucketed; adding theirs too would push a day past 24 h.
        count_hours = v.hierarchy_level == 0
        for d, secs in _split_by_local_day(v.start, v.end, v.tz):
            r = day(d)
            if count_hours:
                r[bucket] += secs / 3600
            r["_places"].add(v.place_id)
            if v.city:
                r["_cities"].add(v.city)
            r["max_dist_from_home_km"] = max(r["max_dist_from_home_km"], dist)

    for a in parsed.activities:
        row = day(_local_date(a.start, a.tz))
        row["km_by_mode"][a.mode] += a.distance_m / 1000
        row["hours_transit"] += (a.end - a.start) / 3600
        dist = haversine_km(home[0], home[1], a.e_lat, a.e_lng)
        row["max_dist_from_home_km"] = max(row["max_dist_from_home_km"], dist)
        if a.e_city:
            row["_cities"].add(a.e_city)

    out = []
    for d in sorted(days):
        r = days[d]
        r["km_by_mode"] = {k: round(v, 3) for k, v in r["km_by_mode"].items()}
        r["n_places"] = len(r.pop("_places"))
        r["cities"] = sorted(r.pop("_cities"))
        r["max_dist_from_home_km"] = round(r["max_dist_from_home_km"], 2)
        for k in ("hours_home", "hours_work", "hours_other", "hours_transit"):
            r[k] = round(r[k], 3)
        out.append(r)
    return out


def _nights(start: int, end: int, tz_min: int) -> int:
    d0 = datetime.fromtimestamp(start + tz_min * 60, tz=timezone.utc).date()
    d1 = datetime.fromtimestamp(end + tz_min * 60, tz=timezone.utc).date()
    return (d1 - d0).days


def derive_trips(parsed: Parsed, home: tuple[float, float]) -> list[dict]:
    flights = [a for a in parsed.activities if a.mode == "FLYING"]
    trips: list[dict] = []
    cur: dict | None = None

    for v in parsed.visits:
        dist = v.dist_from_home_km if v.dist_from_home_km is not None else \
            haversine_km(home[0], home[1], v.lat, v.lng)
        away = dist > TRIP_RADIUS_KM
        if cur is None and away:
            start = v.start
            for f in flights:
                if 0 <= v.start - f.end <= 6 * 3600:
                    start = min(start, f.start)
            cur = {"start": start, "tz": v.tz, "_cities": [], "max_dist_from_home_km": 0.0}
        if cur is not None:
            if away:
                if v.city and (not cur["_cities"] or cur["_cities"][-1] != v.city):
                    cur["_cities"].append(v.city)
                cur["max_dist_from_home_km"] = max(cur["max_dist_from_home_km"], dist)
            else:
                cur["end"] = v.start
                if _nights(cur["start"], cur["end"], cur["tz"]) >= 1:
                    trips.append(cur)
                cur = None
    if cur is not None:  # export ends while away
        cur["end"] = parsed.visits[-1].end
        if _nights(cur["start"], cur["end"], cur["tz"]) >= 1:
            trips.append(cur)

    for t in trips:
        km: dict[str, float] = defaultdict(float)
        for a in parsed.activities:
            if a.start >= t["start"] and a.end <= t["end"]:
                km[a.mode] += a.distance_m / 1000
        t["total_km_by_mode"] = {k: round(v, 3) for k, v in km.items()}
        t["nights"] = _nights(t["start"], t["end"], t.pop("tz"))
        t["anchor_cities"] = t.pop("_cities")
        t["max_dist_from_home_km"] = round(t["max_dist_from_home_km"], 2)
        t["memory"] = None
        for m in parsed.memory_trips:
            if m.start < t["end"] and m.end > t["start"]:
                t["memory"] = {"distance_from_origin_km": m.distance_from_origin_km,
                               "destination_place_ids": m.destination_place_ids}
                break
    return trips
