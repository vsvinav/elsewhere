from pipeline.geo import haversine_km, home_centroid, tag_geo


def test_haversine_boston_to_sf():
    d = haversine_km(42.3601, -71.0589, 37.7749, -122.4194)
    assert 4330 < d < 4350


def test_home_centroid_uses_home_visits(parsed):
    home = home_centroid(parsed.visits)
    assert abs(home[0] - 42.3632761) < 1e-6
    assert abs(home[1] + 71.0643721) < 1e-6


def test_tag_geo_sets_city_country_and_distance(parsed):
    tag_geo(parsed)
    home_visit = parsed.visits[0]
    far_visit = next(v for v in parsed.visits if v.place_id == "MTV1")
    assert home_visit.country_code == "US"
    assert home_visit.city is not None
    assert home_visit.dist_from_home_km < 1
    assert far_visit.dist_from_home_km > 4000
    flight = next(a for a in parsed.activities if a.mode == "FLYING")
    assert flight.e_country_code == "US"
    assert flight.e_city is not None
