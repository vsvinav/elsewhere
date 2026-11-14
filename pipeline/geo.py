from __future__ import annotations
import math
from collections import defaultdict

from .models import Home, Parsed, Visit

ROLE_RADIUS_KM = 0.3


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def home_at(homes: list[Home], ts: int) -> Home:
    """The home current at `ts`: the last one whose start is at or before it."""
    cur = homes[0]
    for h in homes:
        if h.from_ts <= ts:
            cur = h
    return cur


def role_of(v: Visit, homes: list[Home], work: tuple[float, float] | None) -> str | None:
    """'home' within ROLE_RADIUS_KM of the dated home, 'work' within it of work, else None."""
    h = home_at(homes, v.start)
    if haversine_km(h.lat, h.lng, v.lat, v.lng) <= ROLE_RADIUS_KM:
        return "home"
    if work and haversine_km(work[0], work[1], v.lat, v.lng) <= ROLE_RADIUS_KM:
        return "work"
    return None


def fold_roles(visits: list[Visit], homes: list[Home], work: tuple[float, float] | None) -> None:
    """Google splits one address across several place ids. Every visit at a home (or work) is
    re-pointed at the busiest id of that cluster, so the record has one Home per home."""
    cluster: dict[int, str] = {}
    for i, v in enumerate(visits):
        role = role_of(v, homes, work)
        if role == "home":
            cluster[i] = f"home:{homes.index(home_at(homes, v.start))}"
        elif role == "work":
            cluster[i] = "work"
    count: dict[tuple[str, str], int] = defaultdict(int)
    for i, key in cluster.items():
        count[(key, visits[i].place_id)] += 1
    best: dict[str, str] = {}
    for (key, pid), n in sorted(count.items(), key=lambda kv: (-kv[1], kv[0][1])):
        best.setdefault(key, pid)
    for i, key in cluster.items():
        visits[i].place_id = best[key]


def guess_home(visits: list[Visit]) -> Home:
    """Fallback when no --home is given: the place with the most total stay time."""
    by_place: dict[str, int] = {}
    for v in visits:
        by_place[v.place_id] = by_place.get(v.place_id, 0) + max(v.end - v.start, 1)
    if not by_place:
        return Home(0.0, 0.0)
    pid = max(by_place, key=by_place.get)
    v = next(v for v in visits if v.place_id == pid)
    return Home(v.lat, v.lng)


def _reverse(coords: list[tuple[float, float]]) -> list[dict]:
    import reverse_geocoder as rg
    if not coords:
        return []
    return rg.search(coords, mode=1)  # mode=1: single process, deterministic


def tag_geo(parsed: Parsed, homes: list[Home]) -> None:
    """Mutates visits/activities in place with city/country/distance from the dated home."""
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
        h = home_at(homes, v.start)
        v.dist_from_home_km = haversine_km(h.lat, h.lng, v.lat, v.lng)
    for a in parsed.activities:
        s, e = hits[i], hits[i + 1]; i += 2
        a.s_city, a.e_city, a.e_country_code = s["name"], e["name"], e["cc"]
    for h in homes:
        hit = _reverse([(h.lat, h.lng)])[0]
        h.city, h.cc = h.city or hit["name"], h.cc or hit["cc"]
