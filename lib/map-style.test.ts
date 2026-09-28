import { describe, expect, it } from 'vitest';
import { MAP_ROUTE_BLUE, ROUTE_COLOURS, casingFor, mapStyleUrl, routeColour } from './map-style';

describe('route colours', () => {
  it('keeps a stored colour that is on the list, whatever its case', () => {
    expect(routeColour('#22c55e')).toBe('#22C55E');
  });

  it('falls back to blue for nothing or anything unknown', () => {
    expect(routeColour(null)).toBe(MAP_ROUTE_BLUE);
    expect(routeColour('#123456')).toBe(MAP_ROUTE_BLUE);
  });

  it('gives a white line a dark outline so it does not vanish', () => {
    expect(casingFor('#ffffff')).toBe('#111111');
    expect(casingFor(MAP_ROUTE_BLUE)).toBe('#FFFFFF');
  });

  it('offers blue first, with no duplicates', () => {
    expect(ROUTE_COLOURS[0].hex).toBe(MAP_ROUTE_BLUE);
    expect(new Set(ROUTE_COLOURS.map((c) => c.hex)).size).toBe(ROUTE_COLOURS.length);
  });

  it('maps a style id to a URL, dark by default', () => {
    expect(mapStyleUrl('light')).toContain('liberty');
    expect(mapStyleUrl('nope' as never)).toContain('dark');
  });
});
