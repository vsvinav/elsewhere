from pipeline.geo import guess_home, haversine_km, home_at, role_of, tag_geo
from pipeline.models import Home, Visit

BOS = Home(42.3632761, -71.0643721)


def test_haversine_boston_to_sf():
    d = haversine_km(42.3601, -71.0589, 37.7749, -122.4194)
    assert 4330 < d < 4350


def test_guess_home_picks_longest_stay(parsed):
    home = guess_home(parsed.visits)
    assert abs(home.lat - 42.3632761) < 1e-6
    assert abs(home.lng + 71.0643721) < 1e-6


def test_tag_geo_sets_city_country_and_distance(parsed):
    tag_geo(parsed, [BOS])
    assert BOS.cc == "US"
    home_visit = parsed.visits[0]
    far_visit = next(v for v in parsed.visits if v.place_id == "MTV1")
    assert home_visit.country_code == "US"
    assert home_visit.city is not None
    assert home_visit.dist_from_home_km < 1
    assert far_visit.dist_from_home_km > 4000
    flight = next(a for a in parsed.activities if a.mode == "FLYING")
    assert flight.e_country_code == "US"
    assert flight.e_city is not None


def test_home_at_follows_moves():
    homes = [Home(0, 0, from_ts=0), Home(1, 1, from_ts=100)]
    assert home_at(homes, 50) is homes[0]
    assert home_at(homes, 100) is homes[1]
    assert home_at(homes, 500) is homes[1]


def test_role_of_uses_dated_home_and_work():
    homes = [Home(42.3632761, -71.0643721, from_ts=0), Home(37.7749, -122.4194, from_ts=1000)]
    work = (42.3736, -71.1097)

    def mk(ts, lat, lng):
        return Visit(id=1, start=ts, end=ts + 3600, tz=0, place_id="x", lat=lat, lng=lng,
                     semantic_type="UNKNOWN", probability=0.9)

    assert role_of(mk(10, 42.3632761, -71.0643721), homes, work) == "home"
    assert role_of(mk(2000, 42.3632761, -71.0643721), homes, work) is None   # moved away
    assert role_of(mk(2000, 37.7749, -122.4194), homes, work) == "home"
    assert role_of(mk(10, 42.3736, -71.1097), homes, work) == "work"
    assert role_of(mk(10, 42.3736, -71.1097), homes, None) is None


def test_fold_roles_points_every_home_label_at_the_busiest_one():
    from pipeline.geo import fold_roles
    homes = [Home(42.3632761, -71.0643721, from_ts=0), Home(37.7749, -122.4194, from_ts=1000)]

    def mk(i, ts, pid, lat, lng):
        return Visit(id=i, start=ts, end=ts + 3600, tz=0, place_id=pid, lat=lat, lng=lng,
                     semantic_type="UNKNOWN", probability=0.9)

    visits = [
        mk(1, 10, "a", 42.3632761, -71.0643721), mk(2, 20, "b", 42.3633, -71.0644), mk(3, 30, "b", 42.3633, -71.0644),
        mk(4, 40, "far", 42.40, -71.10),
        mk(5, 2000, "c", 37.7749, -122.4194), mk(6, 2100, "a", 42.3632761, -71.0643721),
    ]
    fold_roles(visits, homes, None)
    # Boston labels a and b are one home, named after the busier b; the far place is untouched.
    assert [v.place_id for v in visits] == ["b", "b", "b", "far", "c", "a"]


def test_home_at_honours_an_explicit_end_date():
    # Left Boston in March, Sunnyvale only started in August: the gap counts toward the next home.
    homes = [Home(42.36, -71.06, from_ts=0, to_ts=100), Home(37.37, -122.0, from_ts=200)]
    assert home_at(homes, 50) is homes[0]
    assert home_at(homes, 150) is homes[1]
    assert home_at(homes, 250) is homes[1]
    # An end date on the last home: still that home afterwards, there is nowhere else to go.
    assert home_at([Home(42.36, -71.06, from_ts=0, to_ts=100)], 500).lat == 42.36
