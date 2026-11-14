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
