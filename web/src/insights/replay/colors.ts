export type RGBA = [number, number, number, number]

export const MODE_COLORS: Record<string, RGBA> = {
  WALKING: [94, 234, 212, 255],
  RUNNING: [94, 234, 212, 255],
  CYCLING: [163, 230, 53, 255],
  IN_PASSENGER_VEHICLE: [251, 191, 36, 255],
  MOTORCYCLING: [251, 191, 36, 255],
  IN_BUS: [251, 146, 60, 255],
  IN_SUBWAY: [192, 132, 252, 255],
  IN_TRAIN: [192, 132, 252, 255],
  IN_TRAM: [192, 132, 252, 255],
  IN_FERRY: [56, 189, 248, 255],
  FLYING: [244, 114, 182, 255],
}
export const PATH_COLOR: RGBA = [125, 211, 252, 255]
export const VISIT_COLOR: RGBA = [255, 255, 255, 255]

export function modeColor(mode: string): RGBA {
  return MODE_COLORS[mode] ?? [203, 213, 225, 255]
}
