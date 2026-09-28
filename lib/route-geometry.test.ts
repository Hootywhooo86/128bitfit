import { describe, expect, it } from 'vitest';
import type { Fix } from './cardio';
import { projectToBox, routeBounds, routeGeoJson } from './route-geometry';

const fix = (lat: number, lon: number, segment = 0, i = 0): Fix => ({
  t: i,
  lat,
  lon,
  alt: null,
  accuracy: 5,
  segment,
});

describe('route GeoJSON', () => {
  it('makes one line per pause-separated stretch, lon before lat', () => {
    const geo = routeGeoJson([fix(51, -114), fix(51.001, -114), fix(51.01, -114, 1), fix(51.011, -114, 1)]);
    expect(geo.features).toHaveLength(2);
    expect(geo.features[0].geometry.coordinates[0]).toEqual([-114, 51]);
  });

  it('draws nothing for a stretch of a single fix', () => {
    expect(routeGeoJson([fix(51, -114)]).features).toEqual([]);
  });
});

describe('fitting a route on screen', () => {
  it('bounds west, south, east, north', () => {
    expect(routeBounds([{ lat: 51, lon: -114 }, { lat: 51.2, lon: -113.9 }])).toEqual([-114, 51, -113.9, 51.2]);
    expect(routeBounds([])).toBeNull();
  });

  it('keeps a square block square at a northern latitude', () => {
    // 0.01° of longitude at 60°N is half the ground distance of 0.01° latitude.
    const pts = [
      { lat: 60, lon: 10 },
      { lat: 60.005, lon: 10.01 },
    ];
    const { project } = projectToBox(pts, 200, 200, 0);
    const a = project(pts[0]);
    const b = project(pts[1]);
    expect(Math.abs(b.x - a.x)).toBeCloseTo(Math.abs(b.y - a.y), 0);
    // North is up.
    expect(b.y).toBeLessThan(a.y);
  });

  it('stays inside the box with its padding', () => {
    const pts = [
      { lat: 51, lon: -114 },
      { lat: 51.03, lon: -114.1 },
      { lat: 51.01, lon: -113.95 },
    ];
    const { project } = projectToBox(pts, 300, 150, 10);
    for (const p of pts.map(project)) {
      expect(p.x).toBeGreaterThanOrEqual(9.99);
      expect(p.x).toBeLessThanOrEqual(290.01);
      expect(p.y).toBeGreaterThanOrEqual(9.99);
      expect(p.y).toBeLessThanOrEqual(140.01);
    }
  });

  it('centres a single point instead of dividing by zero', () => {
    const p = projectToBox([{ lat: 51, lon: -114 }], 100, 80).project({ lat: 51, lon: -114 });
    expect(p.x).toBeCloseTo(50, 6);
    expect(p.y).toBeCloseTo(40, 6);
    expect(projectToBox([], 100, 80).project({ lat: 0, lon: 0 })).toEqual({ x: 50, y: 40 });
  });
});
