"""Build a fictional 18-month record for the demo.

Nobody real: Ada lives in Lisbon, works near the river, and takes four trips (Porto by train,
Madrid, Marrakech and Berlin by air). Place IDs are invented, so nothing here resolves to a
real Google place. Writes the same files the pipeline does.

    python3 scripts/make_sample.py [--out web/public/data]
"""
from __future__ import annotations
import argparse
import hashlib
import json
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline.export import export_all  # noqa: E402
from pipeline.models import Home  # noqa: E402
from pipeline.parse import parse_bytes  # noqa: E402

START = datetime(2025, 1, 1, tzinfo=timezone.utc)
MONTHS = 18
TZ_LISBON = 0
FLIGHT_KM = {"sample-mad": 505, "sample-rak": 590, "sample-ber": 2310}

# place id → (name, lat, lng, semantic type)
PLACES = {
    "sample-home": ("Rua da Bica, 14", 38.7097, -9.1458, "INFERRED_HOME"),
    "sample-work": ("Cais do Sodré studio", 38.7062, -9.1448, "INFERRED_WORK"),
    "sample-cafe": ("Copenhagen Coffee Lab", 38.7110, -9.1470, "UNKNOWN"),
    "sample-gym": ("Ginásio da Estrela", 38.7140, -9.1600, "UNKNOWN"),
    "sample-market": ("Mercado de Campo de Ourique", 38.7172, -9.1660, "UNKNOWN"),
    "sample-park": ("Jardim da Estrela", 38.7147, -9.1600, "UNKNOWN"),
    "sample-friend": ("Casa da Inês", 38.7222, -9.1393, "UNKNOWN"),
    "sample-beach": ("Praia de Carcavelos", 38.6790, -9.3350, "UNKNOWN"),
    "sample-sintra": ("Palácio da Pena", 38.7876, -9.3904, "UNKNOWN"),
    "sample-lis": ("Lisbon Airport", 38.7756, -9.1354, "UNKNOWN"),
    "sample-lisbon-station": ("Santa Apolónia station", 38.7139, -9.1223, "UNKNOWN"),
    "sample-porto-station": ("Campanhã station", 41.1494, -8.5856, "UNKNOWN"),
    "sample-porto-hotel": ("Hotel Ribeira", 41.1430, -8.6110, "UNKNOWN"),
    "sample-porto-livraria": ("Livraria Lello", 41.1469, -8.6149, "UNKNOWN"),
    "sample-mad": ("Madrid Barajas", 40.4983, -3.5676, "UNKNOWN"),
    "sample-mad-hotel": ("Hostal Lavapiés", 40.4090, -3.7010, "UNKNOWN"),
    "sample-mad-prado": ("Museo del Prado", 40.4138, -3.6921, "UNKNOWN"),
    "sample-rak": ("Marrakech Menara", 31.6069, -8.0363, "UNKNOWN"),
    "sample-rak-riad": ("Riad Dar Anika", 31.6295, -7.9811, "UNKNOWN"),
    "sample-rak-souk": ("Jemaa el-Fnaa", 31.6258, -7.9891, "UNKNOWN"),
    "sample-ber": ("Berlin Brandenburg", 52.3667, 13.5033, "UNKNOWN"),
    "sample-ber-flat": ("Hackescher Markt flat", 52.5255, 13.4120, "UNKNOWN"),
    "sample-ber-museum": ("Museumsinsel", 52.5240, 13.4085, "UNKNOWN"),
}
SIGHT = {"sample-porto-hotel": "sample-porto-livraria", "sample-mad-hotel": "sample-mad-prado",
         "sample-rak-riad": "sample-rak-souk", "sample-ber-flat": "sample-ber-museum"}

# day offset → (nights, hotel, destination airport or None for the Porto train, local tz minutes)
TRIPS = {
    45: (2, "sample-porto-hotel", None, 0),
    110: (4, "sample-mad-hotel", "sample-mad", 60),
    300: (5, "sample-rak-riad", "sample-rak", 60),
    470: (3, "sample-ber-flat", "sample-ber", 60),
}


def iso(dt: datetime, tz_min: int) -> str:
    return dt.astimezone(timezone(timedelta(minutes=tz_min))).isoformat()


def latlng(pid: str) -> str:
    _, lat, lng, _ = PLACES[pid]
    return f"{lat}°, {lng}°"


class Rec:
    def __init__(self) -> None:
        self.segs: list[dict] = []

    def visit(self, pid: str, a: datetime, b: datetime, tz: int = TZ_LISBON) -> None:
        typ = PLACES[pid][3]
        self.segs.append({
            "startTime": iso(a, tz), "endTime": iso(b, tz), "startTimeTimezoneUtcOffsetMinutes": tz,
            "visit": {"hierarchyLevel": 0, "probability": 0.9,
                      "topCandidate": {"placeId": pid, "semanticType": typ, "probability": 0.9,
                                       "placeLocation": {"latLng": latlng(pid)}}},
        })

    def leg(self, src: str, dst: str, a: datetime, b: datetime, mode: str, km: float, tz: int = TZ_LISBON) -> None:
        self.segs.append({
            "startTime": iso(a, tz), "endTime": iso(b, tz), "startTimeTimezoneUtcOffsetMinutes": tz,
            "activity": {"start": {"latLng": latlng(src)}, "end": {"latLng": latlng(dst)},
                         "distanceMeters": km * 1000, "probability": 0.9,
                         "topCandidate": {"type": mode, "probability": 0.9}},
        })
        # Google records the raw track as a sibling timelinePath; Replay and the Map draw from it.
        # Flights get a straight line, ground legs a gentle bow so trails read as roads, not rulers.
        _, lat0, lng0, _ = PLACES[src]
        _, lat1, lng1, _ = PLACES[dst]
        n = 24
        bow = 0.0 if mode == "FLYING" else 0.08
        pts = []
        for i in range(n + 1):
            f = i / n
            off = bow * (lat1 - lat0 + lng1 - lng0) * f * (1 - f)
            pts.append({"point": f"{lat0 + (lat1 - lat0) * f + off:.5f}°, {lng0 + (lng1 - lng0) * f - off:.5f}°",
                        "time": iso(a + (b - a) * f, tz)})
        self.segs.append({"startTime": iso(a, tz), "endTime": iso(b, tz), "startTimeTimezoneUtcOffsetMinutes": tz,
                          "timelinePath": pts})

    def hop(self, src: str, dst: str, a: datetime, minutes: int, mode: str, km: float, tz: int = TZ_LISBON) -> datetime:
        """A leg from `a` lasting `minutes`; returns the arrival time."""
        b = a + timedelta(minutes=minutes)
        self.leg(src, dst, a, b, mode, km, tz)
        return b


def day_at_home(r: Rec, day: datetime, rnd: random.Random, at_home_since: datetime) -> datetime:
    """One Lisbon day; returns when Ada is back home for the night."""
    if day.weekday() < 5:
        leave = day.replace(hour=8, minute=rnd.randint(10, 55))
        r.visit("sample-home", at_home_since, leave)
        t = r.hop("sample-home", "sample-work", leave, rnd.randint(18, 32), rnd.choice(["WALKING", "WALKING", "IN_TRAM"]), 1.1)
        off = day.replace(hour=17, minute=rnd.randint(30, 59))
        r.visit("sample-work", t, off)
        stop = rnd.choice([None, None, "sample-gym", "sample-cafe", "sample-market"])
        if not stop:
            return r.hop("sample-work", "sample-home", off, rnd.randint(18, 32), rnd.choice(["WALKING", "IN_TRAM"]), 1.1)
        t = r.hop("sample-work", stop, off, rnd.randint(10, 25), "WALKING", 1.4)
        dep = t + timedelta(minutes=rnd.randint(40, 90))
        r.visit(stop, t, dep)
        return r.hop(stop, "sample-home", dep, rnd.randint(10, 25), "WALKING", 1.2)
    out = rnd.choice([None, "sample-park", "sample-friend", "sample-beach", "sample-market", "sample-sintra"])
    if not out:
        return at_home_since
    leave = day.replace(hour=rnd.randint(10, 13), minute=rnd.randint(0, 59))
    r.visit("sample-home", at_home_since, leave)
    far = out in ("sample-beach", "sample-sintra")
    km = 22 if out == "sample-beach" else 30 if out == "sample-sintra" else 1.8
    mode, mins = ("IN_TRAIN", 45) if far else ("WALKING", 20)
    t = r.hop("sample-home", out, leave, mins, mode, km)
    dep = t + timedelta(hours=rnd.randint(2, 5))
    r.visit(out, t, dep)
    return r.hop(out, "sample-home", dep, mins, mode, km)


def trip(r: Rec, day: datetime, nights: int, hotel: str, dst: str | None, tz: int, at_home_since: datetime) -> datetime:
    leave = day.replace(hour=6, minute=40)
    r.visit("sample-home", at_home_since, leave)
    if dst:
        km = FLIGHT_KM[dst]
        t = r.hop("sample-home", "sample-lis", leave, 30, "IN_PASSENGER_VEHICLE", 9)
        r.visit("sample-lis", t, t + timedelta(minutes=90))
        t = r.hop("sample-lis", dst, t + timedelta(minutes=90), km // 11 + 25, "FLYING", km)
        r.visit(dst, t, t + timedelta(minutes=40), tz)
        t = r.hop(dst, hotel, t + timedelta(minutes=40), 45, "IN_PASSENGER_VEHICLE", 14, tz)
    else:
        t = r.hop("sample-home", "sample-lisbon-station", leave, 20, "IN_TRAM", 3)
        r.visit("sample-lisbon-station", t, t + timedelta(minutes=30))
        t = r.hop("sample-lisbon-station", "sample-porto-station", t + timedelta(minutes=30), 180, "IN_TRAIN", 300)
        r.visit("sample-porto-station", t, t + timedelta(minutes=20))
        t = r.hop("sample-porto-station", hotel, t + timedelta(minutes=20), 20, "WALKING", 2.4)
    sight = SIGHT[hotel]
    for n in range(nights):
        d = day + timedelta(days=n + 1)
        out = d.replace(hour=10, minute=30)
        r.visit(hotel, t, out, tz)
        t = r.hop(hotel, sight, out, 25, "WALKING", 1.6, tz)
        back = d.replace(hour=16, minute=0)
        r.visit(sight, t, back, tz)
        t = r.hop(sight, hotel, back, 25, "WALKING", 1.6, tz)
    out = (day + timedelta(days=nights + 1)).replace(hour=9, minute=0)
    r.visit(hotel, t, out, tz)
    if dst:
        km = FLIGHT_KM[dst]
        t = r.hop(hotel, dst, out, 45, "IN_PASSENGER_VEHICLE", 14, tz)
        r.visit(dst, t, t + timedelta(minutes=90), tz)
        t = r.hop(dst, "sample-lis", t + timedelta(minutes=90), km // 11 + 25, "FLYING", km)
        r.visit("sample-lis", t, t + timedelta(minutes=30))
        return r.hop("sample-lis", "sample-home", t + timedelta(minutes=30), 30, "IN_PASSENGER_VEHICLE", 9)
    t = r.hop(hotel, "sample-porto-station", out, 20, "WALKING", 2.4)
    r.visit("sample-porto-station", t, t + timedelta(minutes=30))
    t = r.hop("sample-porto-station", "sample-lisbon-station", t + timedelta(minutes=30), 180, "IN_TRAIN", 300)
    return r.hop("sample-lisbon-station", "sample-home", t, 20, "IN_TRAM", 3)


def build() -> dict:
    rnd = random.Random(7)
    r = Rec()
    end = START + timedelta(days=int(MONTHS * 30.4))
    day, home_since = START, START
    while day < end:
        off = (day - START).days
        if off in TRIPS:
            nights, hotel, dst, tz = TRIPS[off]
            home_since = trip(r, day, nights, hotel, dst, tz, home_since)
            day += timedelta(days=nights + 2)
            continue
        home_since = day_at_home(r, day, rnd, home_since)
        day += timedelta(days=1)
    r.visit("sample-home", home_since, end)
    return {"semanticSegments": r.segs}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="web/public/data")
    args = ap.parse_args()
    raw = json.dumps(build()).encode()
    parsed = parse_bytes(raw)
    print(f"segments: {parsed.report.segments_total} parsed: {parsed.report.parsed} skipped: {parsed.report.skipped_by_reason}")
    cache = {pid: {"name": name, "address": None, "types": [], "primary_type": None} for pid, (name, _, _, _) in PLACES.items()}
    home, work = PLACES["sample-home"], PLACES["sample-work"]
    export_all(parsed, Path(args.out), source_file="sample.json", source_sha256=hashlib.sha256(raw).hexdigest(),
               places_cache=cache, homes=[Home(lat=home[1], lng=home[2])], work=(work[1], work[2]))
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
