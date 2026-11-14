from __future__ import annotations
import json
import os
import urllib.parse
import urllib.request
from pathlib import Path

DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"
TRANSIENT_ERRORS = {"OVER_QUERY_LIMIT", "UNKNOWN_ERROR", "REQUEST_DENIED"}


def select_top(places: dict[str, dict], top: int) -> list[str]:
    return sorted(places, key=lambda k: (-places[k]["n_visits"], -places[k]["total_hours"]))[:top]


def fetch_place(place_id: str, key: str) -> dict:
    q = urllib.parse.urlencode({"place_id": place_id, "fields": "name,formatted_address,types", "key": key})
    with urllib.request.urlopen(f"{DETAILS_URL}?{q}", timeout=15) as r:
        body = json.loads(r.read())
    if body.get("status") != "OK":
        return {"name": None, "address": None, "error": body.get("status")}
    res = body["result"]
    return {"name": res.get("name"), "address": res.get("formatted_address"), "types": res.get("types", [])}


def enrich(places_json: Path, cache_path: Path, *, top: int) -> int:
    key = os.environ.get("GOOGLE_MAPS_API_KEY")
    if not key:
        print("GOOGLE_MAPS_API_KEY not set; skipping enrichment.")
        return 0
    places = json.loads(places_json.read_text())
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    todo = [pid for pid in select_top(places, top) if pid not in cache]
    print(f"enriching {len(todo)} places ({len(cache)} cached)")
    for pid in todo:
        res = fetch_place(pid, key)
        if res.get("error") in TRANSIENT_ERRORS:
            print(f"stopping: {res['error']}")
            return 1
        cache[pid] = res
        cache_path.write_text(json.dumps(cache, indent=1, ensure_ascii=False))
    print("done; re-run `python -m pipeline build` to merge names.")
    return 0
