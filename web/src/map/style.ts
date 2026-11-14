/** Basemap in the tray's palette: land is the desk, roads are faint rules, no points of interest. */
const dark: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#15171d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7b7e8a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0b0c10' }, { weight: 2 }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#2a2d36' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#181a21' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#171b1c' }, { visibility: 'on' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#22252d' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#4a4d57' }] },
  { featureType: 'road.arterial', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2e323c' }] },
  { featureType: 'road.highway', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.local', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a0b0f' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3a3e4a' }] },
]

const light: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#f7f6f2' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7b776d' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f7f6f2' }, { weight: 2 }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#c9c5bb' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#ecebe3' }, { visibility: 'on' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e0dcd2' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#e9e6dd' }] },
  { featureType: 'road.highway', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.local', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#d9e2f0' }] },
]

export const MAP_STYLES = { dark, light }
