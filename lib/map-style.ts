/**
 * The map's look, and the one colour on it that is not data.
 *
 * Tiles are OpenFreeMap's: OpenStreetMap data, free, no key and no account,
 * so there is nothing for the user to set up and nothing billed per view.
 */

export type MapStyleId = 'dark' | 'light';

export const MAP_STYLES: readonly { id: MapStyleId; label: string; url: string }[] = [
  { id: 'dark', label: 'Dark', url: 'https://tiles.openfreemap.org/styles/dark' },
  { id: 'light', label: 'Light', url: 'https://tiles.openfreemap.org/styles/liberty' },
];

export function mapStyleUrl(id: MapStyleId): string {
  return (MAP_STYLES.find((s) => s.id === id) ?? MAP_STYLES[0]).url;
}

/**
 * The "you are here" dot and the line of where you've been.
 *
 * Blue because the user asked for exactly that, and because it is what every
 * map app uses for your own position and track. It is fixed: not the accent
 * (which the user can set to anything, including red) and not a data colour
 * (the heat scale is yellow → orange → red and means training load).
 */
export const MAP_ROUTE_BLUE = '#2F80ED';

/** Drawn under the blue line so it reads on both the dark and the light map. */
export const MAP_ROUTE_CASING = '#FFFFFF';

export const MAP_ATTRIBUTION = '© OpenStreetMap contributors · OpenFreeMap';
