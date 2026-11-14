import json
from pipeline.export import export_all


def test_export_writes_all_files(parsed, tmp_path):
    export_all(parsed, tmp_path, source_file="mini_timeline.json", source_sha256="abc", places_cache={})
    names = sorted(p.name for p in tmp_path.iterdir())
    assert names == ["activities.json", "daily.json", "meta.json", "paths.json", "places.json",
                     "positions.json", "profile.json", "trips.json", "visits.json"]
    visits = json.loads((tmp_path / "visits.json").read_text())
    assert visits[0] == {"id": 0, "start": visits[0]["start"], "end": visits[0]["end"], "tz": -300,
                         "place_id": "HOME1", "lat": 42.3632761, "lng": -71.0643721,
                         "type": "INFERRED_HOME", "p": 0.9, "lvl": 0}
    acts = json.loads((tmp_path / "activities.json").read_text())
    assert set(acts[0]) == {"id", "start", "end", "tz", "s_lat", "s_lng", "e_lat", "e_lng", "m", "mode", "p"}
    paths = json.loads((tmp_path / "paths.json").read_text())
    assert paths[0]["pts"][0][1:] == [42.3736, -71.1097]
    meta = json.loads((tmp_path / "meta.json").read_text())
    assert meta["import_report"]["skipped_by_reason"] == {"bad_latlng": 1}
    assert meta["range"][0] < meta["range"][1]
    assert meta["source_sha256"] == "abc"
    profile = json.loads((tmp_path / "profile.json").read_text())
    assert set(profile["home"]) == {"lat", "lng"}


def test_export_merges_place_names(parsed, tmp_path):
    export_all(parsed, tmp_path, source_file="x", source_sha256="y",
               places_cache={"CAFE1": {"name": "Thinking Cup", "address": "Boston"}})
    places = json.loads((tmp_path / "places.json").read_text())
    assert places["CAFE1"]["name"] == "Thinking Cup"
    assert places["HOME1"]["name"] is None
