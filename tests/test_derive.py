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
