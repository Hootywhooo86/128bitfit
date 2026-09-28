/**
 * Turning a recorded track into something drawable: GeoJSON for the map, and
 * screen points for the offline grid when the map tiles cannot load.
 *
 * Pure and platform-free so it is tested like the rest of lib/.
 */
import type { Fix } from './cardio';

type LatLon = { lat: number; lon: number };

/** One line per manual-pause segment, so no line is drawn across a pause. */
export function routeGeoJson(fixes: readonly Fix[]): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const bySegment = new Map<number, [number, number][]>();
  for (const f of fixes) {
    const line = bySegment.get(f.segment) ?? [];
    line.push([f.lon, f.lat]);
    bySegment.set(f.segment, line);
  }
  return {
    type: 'FeatureCollection',
    features: [...bySegment.values()]
      .filter((coords) => coords.length >= 2)
      .map((coordinates) => ({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates },
      })),
  };
}

export function pointGeoJson(p: LatLon, props: Record<string, unknown> = {}): GeoJSON.Feature<GeoJSON.Point> {
  return { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } };
}

/** [west, south, east, north], or null with nothing to bound. */
export function routeBounds(points: readonly LatLon[]): [number, number, number, number] | null {
  if (points.length === 0) return null;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const p of points) {
    w = Math.min(w, p.lon);
    e = Math.max(e, p.lon);
    s = Math.min(s, p.lat);
    n = Math.max(n, p.lat);
  }
  return [w, s, e, n];
}

/**
 * Fit a track into a box of `width` × `height`, keeping its shape.
 *
 * Longitude is scaled by cos(latitude) so a square block stays square — the
 * difference between a route that looks right and one squashed sideways.
 * With nothing to scale (one point, or none) everything lands in the middle.
 */
export function projectToBox(
  points: readonly LatLon[],
  width: number,
  height: number,
  pad = 16,
  focus?: LatLon | null
): { project: (p: LatLon) => { x: number; y: number } } {
  const all = focus ? [...points, focus] : [...points];
  const b = routeBounds(all);
  if (!b) return { project: () => ({ x: width / 2, y: height / 2 }) };
  const [w, s, e, n] = b;
  const midLat = ((s + n) / 2) * (Math.PI / 180);
  const kx = Math.cos(midLat);
  const spanX = (e - w) * kx;
  const spanY = n - s;
  const innerW = Math.max(1, width - pad * 2);
  const innerH = Math.max(1, height - pad * 2);
  // A single point, or a line due north: fall back to a sensible zoom
  // (~200 m across) rather than dividing by zero.
  const span = Math.max(spanX / innerW, spanY / innerH, 0.002 / Math.max(innerW, innerH));
  const offX = (width - spanX / span) / 2;
  const offY = (height - spanY / span) / 2;
  return {
    project: (p) => ({
      x: offX + ((p.lon - w) * kx) / span,
      y: offY + (n - p.lat) / span,
    }),
  };
}
