from __future__ import annotations
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

DETAILS_URL = "https://places.googleapis.com/v1/places/"
FIELDS = "displayName,formattedAddress,types,primaryType"
# HTTP statuses where continuing would only burn quota or repeat the same failure.
TRANSIENT_ERRORS = {403, 500, 503}
RATE_LIMIT = 429
MAX_RETRIES = 6

try:  # use the OS trust store when available (corporate proxies re-sign TLS)
    import truststore
    truststore.inject_into_ssl()
except ImportError:
    pass


def select_top(places: dict[str, dict], top: int) -> list[str]:
    return sorted(places, key=lambda k: (-places[k]["n_visits"], -places[k]["total_hours"]))[:top]


def fetch_place(place_id: str, key: str) -> dict:
    """Places API (New) details lookup."""
    req = urllib.request.Request(
        DETAILS_URL + urllib.parse.quote(place_id),
        headers={"X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            res = json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"name": None, "address": None, "error": e.code}
    return {
        "name": (res.get("displayName") or {}).get("text"),
        "address": res.get("formattedAddress"),
        "types": res.get("types", []),
        "primary_type": res.get("primaryType"),
    }


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
        for attempt in range(MAX_RETRIES):
            if res.get("error") != RATE_LIMIT:
                break
            time.sleep(2 ** attempt)
            res = fetch_place(pid, key)
        if res.get("error") in TRANSIENT_ERRORS or res.get("error") == RATE_LIMIT:
            print(f"stopping: {res['error']}")
            return 1
        cache[pid] = res
        cache_path.write_text(json.dumps(cache, indent=1, ensure_ascii=False))
    print("done; re-run `python -m pipeline build` to merge names.")
    return 0
