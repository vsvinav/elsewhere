# Timeline Insights

Turn a Google Maps Timeline export into an interactive map of your life.

## Pipeline

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
python -m pipeline build timeline.json          # → web/public/data/*.json
GOOGLE_MAPS_API_KEY=... python -m pipeline enrich --top 2000  # place names via Places API (New)
python -m pipeline build timeline.json          # re-run to merge names
pytest -q
```

Design: `docs/superpowers/specs/2026-11-13-timeline-insights-design.md`.
