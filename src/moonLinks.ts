export function lrocQuickMapUrl(site: { lat: number; lonE: number }): string {
  const lon = ((site.lonE + 180) % 360 + 360) % 360 - 180
  const extent = [
    lon - 0.25,
    Math.max(-90, site.lat - 0.25),
    lon + 0.25,
    Math.min(90, site.lat + 0.25),
  ].map(value => value.toFixed(3)).join(',')
  return `https://quickmap.lroc.asu.edu/layers?extent=${extent}&proj=10&secondaryProj=0`
}
