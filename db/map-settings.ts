import { DEFAULT_SPORT, distanceUnitFor, sportById, type DistanceUnit, type SportId } from '@/lib/cardio';
import { routeColour, type MapStyleId } from '@/lib/map-style';
import { getAppSettings, getSetting, setSetting } from './settings-queries';

const KEYS = {
  style: 'map_style',
  autoPause: 'cardio_auto_pause',
  lastSport: 'cardio_last_sport',
  keepAwake: 'cardio_keep_awake',
  distanceUnit: 'distance_unit',
  dotColour: 'map_dot_colour',
  lineColour: 'map_line_colour',
} as const;

export type CardioSettings = {
  /** What the record screen opens with. The on-map button changes it for that session only. */
  mapStyle: MapStyleId;
  /** Leave standing still out of moving time. */
  autoPause: boolean;
  lastSport: SportId;
  /**
   * Hold the screen on while recording. Off by default: recording carries on
   * with the screen off, and a lit screen in a pocket is a flat battery.
   */
  keepAwake: boolean;
  /**
   * Its own setting: plenty of people weigh in pounds and run in kilometres.
   * Until it is chosen it follows the weight unit, which is what the app did
   * before the setting existed.
   */
  distanceUnit: DistanceUnit;
  /** The "you are here" dot. */
  dotColour: string;
  /** The line of where you've been. */
  lineColour: string;
};

export async function getCardioSettings(): Promise<CardioSettings> {
  const [style, autoPause, lastSport, keepAwake, unit, app, dot, line] = await Promise.all([
    getSetting(KEYS.style),
    getSetting(KEYS.autoPause),
    getSetting(KEYS.lastSport),
    getSetting(KEYS.keepAwake),
    getSetting(KEYS.distanceUnit),
    getAppSettings(),
    getSetting(KEYS.dotColour),
    getSetting(KEYS.lineColour),
  ]);
  return {
    mapStyle: style === 'light' ? 'light' : 'dark',
    autoPause: autoPause !== '0',
    lastSport: lastSport ? sportById(lastSport).id : DEFAULT_SPORT,
    keepAwake: keepAwake === '1',
    distanceUnit: unit === 'km' || unit === 'mi' ? unit : distanceUnitFor(app.units),
    dotColour: routeColour(dot),
    lineColour: routeColour(line),
  };
}

export const setMapStyle = (style: MapStyleId) => setSetting(KEYS.style, style);
export const setAutoPause = (on: boolean) => setSetting(KEYS.autoPause, on ? '1' : '0');
export const setLastSport = (id: SportId) => setSetting(KEYS.lastSport, id);
export const setCardioKeepAwake = (on: boolean) => setSetting(KEYS.keepAwake, on ? '1' : '0');
export const setDistanceUnit = (unit: DistanceUnit) => setSetting(KEYS.distanceUnit, unit);
export const setDotColour = (hex: string) => setSetting(KEYS.dotColour, routeColour(hex));
export const setLineColour = (hex: string) => setSetting(KEYS.lineColour, routeColour(hex));
