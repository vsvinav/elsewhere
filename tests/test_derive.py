from pipeline.geo import tag_geo
from pipeline.derive import derive_places
from pipeline.models import Home

BOS = [Home(42.3632761, -71.0643721)]
WORK = (42.3736, -71.1097)


def test_derive_places_aggregates(parsed):
    tag_geo(parsed, BOS)
    places = derive_places(parsed, BOS, WORK)
    home = places["HOME1"]
    assert home["n_visits"] == 4
    assert abs(home["total_hours"] - (8 + 14.333 + 11 + 7.483)) < 0.1
    assert home["label"] == "HOME"
    assert home["role"] == "home"
    assert places["WORK1"]["role"] == "work"
    assert places["MTV1"]["role"] is None
    assert home["country_code"] == "US"
    assert places["MTV1"]["n_visits"] == 2
    assert places["LUNCH1"]["n_visits"] == 1
    assert "BAD1" not in places
    assert home["first_ts"] < home["last_ts"]


from pipeline.derive import derive_daily


def test_derive_daily_rows(parsed):
    tag_geo(parsed, BOS)
    daily = derive_daily(parsed, BOS, WORK)
    by_date = {d["date"]: d for d in daily}
    assert sorted(by_date) == ["2025-03-03", "2025-03-04", "2025-03-05", "2025-03-06", "2025-03-07", "2025-03-08", "2025-03-09"]

    d3 = by_date["2025-03-03"]
    assert d3["km_by_mode"] == {"IN_SUBWAY": 10.4}
    assert d3["n_visits"] == 4              # includes nested LUNCH1
    assert d3["n_places"] == 3
    assert d3["n_new_places"] == 3          # HOME1, WORK1, LUNCH1 first seen
    assert abs(d3["hours_home"] - (8 + 6.333)) < 0.05   # 00:00-08:00 + 17:40-24:00
    assert abs(d3["hours_work"] - 8.5) < 0.01
    assert d3["hours_other"] == 0           # nested LUNCH1 hour not double-counted
    assert abs(d3["hours_transit"] - (0.5 + 0.667)) < 0.01
    assert d3["max_dist_from_home_km"] < 10

    d4 = by_date["2025-03-04"]
    assert d4["n_new_places"] == 1          # CAFE1
    assert abs(d4["hours_other"] - 1.5) < 0.01

    d5 = by_date["2025-03-05"]
    assert d5["km_by_mode"]["FLYING"] == 4340.0
    assert d5["max_dist_from_home_km"] > 4000
    assert len(d5["cities"]) >= 1


from pipeline.derive import derive_trips


def test_derive_trips_detects_sf_trip(parsed):
    tag_geo(parsed, BOS)
    trips = derive_trips(parsed, BOS)
    assert len(trips) == 2
    t = trips[0]
    flight_out = next(a for a in parsed.activities if a.mode == "FLYING")
    assert t["start"] == flight_out.start          # anchored to outbound flight
    home_return = [v for v in parsed.visits if v.place_id == "HOME1"][-1]
    assert t["end"] == home_return.start
    assert t["nights"] == 2
    assert t["max_dist_from_home_km"] > 4000
    assert t["total_km_by_mode"]["FLYING"] == 8680.0
    assert t["total_km_by_mode"]["CYCLING"] == 4.0
    assert len(t["anchor_cities"]) >= 1
    assert t["memory"] == {"distance_from_origin_km": 4340, "destination_place_ids": ["MTV1"]}

    india = next(v for v in parsed.visits if v.place_id == "INDIA1")
    t2 = trips[1]
    assert t2["start"] == india.start
    assert t2["end"] == india.end
    assert t2["nights"] == 1
    assert t2["memory"] is None


def _mk_parsed(visits, activities=()):
    from pipeline.models import Parsed, Profile, ImportReport
    return Parsed(visits=list(visits), activities=list(activities), paths=[],
                  memory_trips=[], profile=Profile([], [], {}), report=ImportReport())


def test_derive_trips_anchor_cities_distinct():
    from pipeline.models import Visit
    H = 3600

    def mk(i, start, city, far):
        return Visit(id=i, start=start, end=start + H, tz=0, place_id=f"P{i}",
                     lat=5.0 if far else 0.0, lng=0.0, semantic_type="UNKNOWN", probability=0.9,
                     city=city)

    visits = [mk(1, 0, "A", True), mk(2, 2 * H, "B", True), mk(3, 4 * H, "A", True),
              mk(4, 30 * H, "Home", False)]
    trips = derive_trips(_mk_parsed(visits), [Home(0.0, 0.0)])
    assert len(trips) == 1
    assert trips[0]["anchor_cities"] == ["A", "B"]


def test_derive_daily_splits_transit_across_midnight():
    from pipeline.models import Activity
    tz = -300
    # 2025-03-03 23:00 local (UTC-5) -> 2025-03-04 01:00 local
    start = 1741060800  # 2025-03-04T04:00:00Z
    a = Activity(id=1, start=start, end=start + 7200, tz=tz, s_lat=0.0, s_lng=0.0,
                 e_lat=0.0, e_lng=0.0, distance_m=1000.0, mode="WALKING", probability=0.9)
    daily = derive_daily(_mk_parsed([], [a]), [Home(0.0, 0.0)])
    by_date = {d["date"]: d for d in daily}
    assert abs(by_date["2025-03-03"]["hours_transit"] - 1.0) < 1e-6
    assert abs(by_date["2025-03-04"]["hours_transit"] - 1.0) < 1e-6
    assert by_date["2025-03-03"]["km_by_mode"] == {"WALKING": 1.0}
    assert "km_by_mode" not in by_date["2025-03-04"] or by_date["2025-03-04"]["km_by_mode"] == {}
