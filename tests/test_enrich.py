import json
from pipeline.enrich import enrich, select_top


def test_select_top_orders_by_visits_then_hours():
    places = {"a": {"n_visits": 5, "total_hours": 1}, "b": {"n_visits": 5, "total_hours": 9},
              "c": {"n_visits": 1, "total_hours": 100}}
    assert select_top(places, 2) == ["b", "a"]


def test_enrich_without_key_is_noop(tmp_path, monkeypatch, capsys):
    monkeypatch.delenv("GOOGLE_MAPS_API_KEY", raising=False)
    pj = tmp_path / "places.json"; pj.write_text(json.dumps({"a": {"n_visits": 1, "total_hours": 1}}))
    cache = tmp_path / "cache.json"
    assert enrich(pj, cache, top=10) == 0
    assert not cache.exists()
    assert "GOOGLE_MAPS_API_KEY" in capsys.readouterr().out


def test_enrich_skips_cached_and_writes_cache(tmp_path, monkeypatch):
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "k")
    calls = []
    def fake_fetch(place_id, key):
        calls.append(place_id)
        return {"name": f"Name {place_id}", "address": "Addr"}
    monkeypatch.setattr("pipeline.enrich.fetch_place", fake_fetch)
    pj = tmp_path / "places.json"
    pj.write_text(json.dumps({"a": {"n_visits": 3, "total_hours": 1}, "b": {"n_visits": 2, "total_hours": 1}}))
    cache = tmp_path / "cache.json"; cache.write_text(json.dumps({"a": {"name": "Old", "address": ""}}))
    assert enrich(pj, cache, top=10) == 0
    assert calls == ["b"]
    assert json.loads(cache.read_text())["b"]["name"] == "Name b"


def test_enrich_stops_on_transient_error_without_caching(tmp_path, monkeypatch):
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "k")
    monkeypatch.setattr("pipeline.enrich.fetch_place",
                        lambda pid, key: {"name": None, "address": None, "error": 429})
    pj = tmp_path / "places.json"
    pj.write_text(json.dumps({"a": {"n_visits": 3, "total_hours": 1}}))
    cache = tmp_path / "cache.json"
    assert enrich(pj, cache, top=10) == 1
    assert not cache.exists()
