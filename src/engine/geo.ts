// Map geometry: where a site sits on the LOLA south polar map, and the matching LROC QuickMap view.
import { R_MOON_M } from './index'

const DEG = Math.PI / 180

/** South polar stereographic metres, true scale at the pole, longitude 0 pointing up. Same grid as the LOLA polar maps. */
export function polarXY(lat: number, lonE: number): [number, number] {
  const r = 2 * R_MOON_M * Math.tan(((90 + lat) * DEG) / 2)
  return [r * Math.sin(lonE * DEG), r * Math.cos(lonE * DEG)]
}

/** Inverse of polarXY: [lat, lonE] with lonE in 0..360. */
export function polarLatLon(x: number, y: number): [number, number] {
  const lat = (2 * Math.atan(Math.hypot(x, y) / (2 * R_MOON_M))) / DEG - 90
  return [lat, (Math.atan2(x, y) / DEG + 360) % 360]
}

/**
 * LROC QuickMap centred on a point, halfM metres to each side.
 * QuickMap takes a box in projected metres: proj=27 is its south polar stereographic view (the polarXY grid),
 * proj=16 its equidistant cylindrical view. Checked against QuickMap's own cursor readout on 2026-11-14.
 */
export function quickmapUrl(lat: number, lonE: number, halfM = 20000): string {
  const polar = lat < -60
  const [x, y] = polar ? polarXY(lat, lonE) : [R_MOON_M * (lonE > 180 ? lonE - 360 : lonE) * DEG, R_MOON_M * lat * DEG]
  const box = [x - halfM, y - halfM, x + halfM, y + halfM].map(v => v.toFixed(0)).join(',')
  return `https://quickmap.lroc.im-ldi.com/?prjExtent=${encodeURIComponent(box)}&proj=${polar ? 27 : 16}`
}
