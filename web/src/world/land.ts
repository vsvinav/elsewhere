import { feature } from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'

let land: Promise<GeoJSON.FeatureCollection> | null = null
/** World countries at 1:110m, Antarctica dropped (id 010): under a tilt or a tight fit its polygon smears across the sheet. */
export const loadLand = () => (land ??= import('world-atlas/countries-110m.json').then((m) => {
  const topo = (m.default ?? m) as unknown as Topology<{ countries: GeometryCollection }>
  const fc = feature(topo, topo.objects.countries) as GeoJSON.FeatureCollection
  return { ...fc, features: fc.features.filter((f) => f.id !== '010') }
}))
