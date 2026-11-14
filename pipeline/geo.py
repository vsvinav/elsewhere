from __future__ import annotations
import math

from .models import Parsed, Visit

HOME_TYPES = {"INFERRED_HOME", "HOME"}


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def home_centroid(visits: list[Visit]) -> tuple[float, float]:
    """Duration-weighted centroid of home-typed visits; falls back to all visits."""
    pool = [v for v in visits if v.semantic_type in HOME_TYPES] or visits
    if not pool:
        return (0.0, 0.0)
    w = sum(max(v.end - v.start, 1) for v in pool)
    lat = sum(v.lat * max(v.end - v.start, 1) for v in pool) / w
    lng = sum(v.lng * max(v.end - v.start, 1) for v in pool) / w
    return (lat, lng)


def _reverse(coords: list[tuple[float, float]]) -> list[dict]:
    import reverse_geocoder as rg
    if not coords:
        return []
    return rg.search(coords, mode=1)  # mode=1: single process, deterministic


def tag_geo(parsed: Parsed) -> tuple[float, float]:
    """Mutates visits/activities in place with city/country/distance. Returns home."""
    home = home_centroid(parsed.visits)
    coords: list[tuple[float, float]] = []
    for v in parsed.visits:
        coords.append((v.lat, v.lng))
    for a in parsed.activities:
        coords.append((a.s_lat, a.s_lng))
        coords.append((a.e_lat, a.e_lng))
    hits = _reverse(coords)

    i = 0
    for v in parsed.visits:
        h = hits[i]; i += 1
        v.city, v.country_code = h["name"], h["cc"]
        v.dist_from_home_km = haversine_km(home[0], home[1], v.lat, v.lng)
    for a in parsed.activities:
        s, e = hits[i], hits[i + 1]; i += 2
        a.s_city, a.e_city, a.e_country_code = s["name"], e["name"], e["cc"]
    return home
