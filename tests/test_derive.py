from pipeline.geo import tag_geo
from pipeline.derive import derive_places


def test_derive_places_aggregates(parsed):
    tag_geo(parsed)
    places = derive_places(parsed)
    home = places["HOME1"]
    assert home["n_visits"] == 4
    assert abs(home["total_hours"] - (8 + 14.333 + 11 + 7.483)) < 0.1
    assert home["label"] == "HOME"
    assert home["semantic_type"] == "INFERRED_HOME"
    assert home["country_code"] == "US"
    assert places["MTV1"]["n_visits"] == 2
    assert "BAD1" not in places
    assert home["first_ts"] < home["last_ts"]


from pipeline.derive import derive_daily


def test_derive_daily_rows(parsed):
    home = tag_geo(parsed)
    daily = derive_daily(parsed, home)
    by_date = {d["date"]: d for d in daily}
    assert sorted(by_date) == ["2025-03-03", "2025-03-04", "2025-03-05", "2025-03-06", "2025-03-07", "2025-03-08", "2025-03-09"]

    d3 = by_date["2025-03-03"]
    assert d3["km_by_mode"] == {"IN_SUBWAY": 10.4}
    assert d3["n_visits"] == 3
    assert d3["n_places"] == 2
    assert d3["n_new_places"] == 2          # HOME1 and WORK1 first seen
    assert abs(d3["hours_home"] - (8 + 6.333)) < 0.05   # 00:00-08:00 + 17:40-24:00
    assert abs(d3["hours_work"] - 8.5) < 0.01
    assert d3["hours_other"] == 0
    assert abs(d3["hours_transit"] - (0.5 + 0.667)) < 0.01
    assert d3["max_dist_from_home_km"] < 10

    d4 = by_date["2025-03-04"]
    assert d4["n_new_places"] == 1          # CAFE1
    assert abs(d4["hours_other"] - 1.5) < 0.01

    d5 = by_date["2025-03-05"]
    assert d5["km_by_mode"]["FLYING"] == 4340.0
    assert d5["max_dist_from_home_km"] > 4000
    assert len(d5["cities"]) >= 1
