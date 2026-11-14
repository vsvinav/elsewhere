import pytest
from pipeline.parse import parse_latlng, parse_ts, strip_escapes, parse_bytes


def test_parse_latlng():
    assert parse_latlng("42.3515669°, -71.0556316°") == (42.3515669, -71.0556316)


def test_parse_latlng_rejects_garbage():
    with pytest.raises(ValueError):
        parse_latlng("not-a-coordinate")


def test_parse_ts_returns_utc_epoch_and_offset():
    ts, tz = parse_ts("2024-05-12T15:38:15.000-07:00")
    assert ts == 1715553495
    assert tz == -420


def test_strip_escapes_removes_terminal_sequences():
    raw = b'{"a": \x1b[O1, "b": \x1b[I2}'
    assert strip_escapes(raw) == b'{"a": 1, "b": 2}'


def test_parse_bytes_counts(parsed):
    assert len(parsed.visits) == 11
    assert len(parsed.activities) == 8
    assert len(parsed.paths) == 1 and len(parsed.paths[0].pts) == 3
    assert len(parsed.memory_trips) == 1
    assert len(parsed.positions) == 2
    assert parsed.report.segments_total == 22
    assert parsed.report.parsed == 21
    assert parsed.report.skipped_by_reason == {"bad_latlng": 1}


def test_parse_bytes_visit_fields(parsed):
    v = parsed.visits[0]
    assert v.place_id == "HOME1"
    assert v.semantic_type == "INFERRED_HOME"
    assert (v.lat, v.lng) == (42.3632761, -71.0643721)
    assert v.tz == -300
    assert v.end - v.start == 8 * 3600


def test_tz_prefers_segment_offset_field_over_string_offset(parsed):
    v = next(v for v in parsed.visits if v.place_id == "INDIA1")
    assert v.tz == 330
    assert v.start == parse_ts("2025-03-08T10:00:00.000-07:00")[0]


def test_tz_falls_back_to_string_offset_without_field(parsed):
    v = parsed.visits[1]  # WORK visit segment has no offset field
    assert v.tz == -300


def test_parse_bytes_activity_missing_probability_defaults(parsed):
    a = parsed.activities[1]  # second activity has no top-level probability
    assert a.probability == 0.7  # falls back to topCandidate.probability
    assert a.mode == "IN_SUBWAY"


def test_parse_bytes_position_optional_fields(parsed):
    p = parsed.positions[1]
    assert p.alt is None and p.spd is None and p.src == "GPS"


def test_parse_bytes_profile(parsed):
    assert parsed.profile.frequent_places[0]["label"] == "HOME"
    assert parsed.profile.frequent_places[0]["lat"] == 42.3632761


def test_parse_bytes_identical_with_corruption(mini_bytes):
    corrupted = mini_bytes.replace(b'"distanceMeters"', b'\x1b[O"distanceMeters"', 1)
    assert parse_bytes(corrupted) == parse_bytes(mini_bytes)
