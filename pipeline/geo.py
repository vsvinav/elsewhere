from __future__ import annotations
import math

from .models import Parsed, Visit

HOME_TYPES = {"INFERRED_HOME", "HOME"}
HOME_CLUSTER_KM = 50.0


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def home_centroid(visits: list[Visit]) -> tuple[float, float]:
    """Duration-weighted centroid of home-typed visits (fallback: all visits).

    Anchors on the place_id with the most total duration and only averages pool
    visits within HOME_CLUSTER_KM of it, so a secondary home cluster elsewhere
    does not drag the centroid between the two.
    """
    pool = [v for v in visits if v.semantic_type in HOME_TYPES] or visits
    if not pool:
        return (0.0, 0.0)

    def dur(v: Visit) -> int:
        return max(v.end - v.start, 1)

    by_place: dict[str, int] = {}
    for v in pool:
        by_place[v.place_id] = by_place.get(v.place_id, 0) + dur(v)
    anchor_id = max(by_place, key=by_place.get)
    anchor = next(v for v in pool if v.place_id == anchor_id)
    cluster = [v for v in pool
               if haversine_km(anchor.lat, anchor.lng, v.lat, v.lng) <= HOME_CLUSTER_KM]

    w = sum(dur(v) for v in cluster)
    lat = sum(v.lat * dur(v) for v in cluster) / w
    lng = sum(v.lng * dur(v) for v in cluster) / w
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
