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
 * Blue by default, the colour every map app uses for your own position and
 * track. The user can pick others in Settings → Map. These live on the map
 * only: they are not the accent, and not the training-load heat scale, which
 * stays fixed wherever it appears.
 */
export const MAP_ROUTE_BLUE = '#2F80ED';

export const ROUTE_COLOURS: readonly { name: string; hex: string }[] = [
  { name: 'Blue', hex: MAP_ROUTE_BLUE },
  { name: 'Cyan', hex: '#22D3EE' },
  { name: 'Green', hex: '#22C55E' },
  { name: 'Lime', hex: '#A3E635' },
  { name: 'Yellow', hex: '#FACC15' },
  { name: 'Orange', hex: '#FB923C' },
  { name: 'Red', hex: '#EF4444' },
  { name: 'Pink', hex: '#EC4899' },
  { name: 'Purple', hex: '#A855F7' },
  { name: 'White', hex: '#FFFFFF' },
];

/** A stored colour if it is one of ours, else blue. */
export function routeColour(raw: string | null | undefined): string {
  return ROUTE_COLOURS.find((c) => c.hex.toLowerCase() === raw?.toLowerCase())?.hex ?? MAP_ROUTE_BLUE;
}

/** Drawn under the line and round the dot so they read on both the dark and the light map. */
export const MAP_ROUTE_CASING = '#FFFFFF';

/** White on a white casing would vanish: a white line gets a dark one. */
export function casingFor(hex: string): string {
  return hex.toUpperCase() === '#FFFFFF' ? '#111111' : MAP_ROUTE_CASING;
}

export const MAP_ATTRIBUTION = '© OpenStreetMap contributors · OpenFreeMap';
