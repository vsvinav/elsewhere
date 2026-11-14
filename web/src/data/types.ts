export interface Visit {
  id: number; start: number; end: number; tz: number; place_id: string
  lat: number; lng: number; type: string; p: number; lvl: number
}
export interface Activity {
  id: number; start: number; end: number; tz: number
  s_lat: number; s_lng: number; e_lat: number; e_lng: number
  m: number; mode: string; p: number
}
export interface Path { start: number; end: number; pts: [number, number, number][] }
export interface Place {
  lat: number; lng: number; label: string | null; semantic_type: string
  city: string | null; country_code: string | null; n_visits: number
  total_hours: number; first_ts: number; last_ts: number
  name: string | null; address?: string | null
  types?: string[]; primary_type?: string | null; photo?: string | null
}
export interface Daily {
  date: string; km_by_mode: Record<string, number>; n_visits: number; n_places: number
  n_new_places: number; max_dist_from_home_km: number; hours_home: number
  hours_work: number; hours_other: number; hours_transit: number; cities: string[]
}
export interface Trip {
  start: number; end: number; nights: number; max_dist_from_home_km: number
  total_km_by_mode: Record<string, number>; anchor_cities: string[]
  memory: { distance_from_origin_km: number; destination_place_ids: string[] } | null
}
export interface Profile {
  home: { lat: number; lng: number }
  frequent_places: { place_id: string; lat: number; lng: number; label: string | null }[]
  frequent_trips: unknown[]; persona: unknown
}
export interface Meta {
  source_file: string; source_sha256: string; built_at: number
  range: [number, number]
  import_report: { segments_total: number; parsed: number; skipped_by_reason: Record<string, number> }
}
export interface Data {
  visits: Visit[]; activities: Activity[]
  /** Decimated GPS record for the printed strips. `paths` is the full record, loaded only for the map. */
  strokes: Path[]; paths: Path[]
  places: Record<string, Place>; daily: Daily[]; trips: Trip[]
  profile: Profile; meta: Meta
}
