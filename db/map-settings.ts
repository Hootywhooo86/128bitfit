import { DEFAULT_SPORT, sportById, type SportId } from '@/lib/cardio';
import type { MapStyleId } from '@/lib/map-style';
import { getSetting, setSetting } from './settings-queries';

const KEYS = {
  style: 'map_style',
  autoPause: 'cardio_auto_pause',
  lastSport: 'cardio_last_sport',
  keepAwake: 'cardio_keep_awake',
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
};

export async function getCardioSettings(): Promise<CardioSettings> {
  const [style, autoPause, lastSport, keepAwake] = await Promise.all([
    getSetting(KEYS.style),
    getSetting(KEYS.autoPause),
    getSetting(KEYS.lastSport),
    getSetting(KEYS.keepAwake),
  ]);
  return {
    mapStyle: style === 'light' ? 'light' : 'dark',
    autoPause: autoPause !== '0',
    lastSport: lastSport ? sportById(lastSport).id : DEFAULT_SPORT,
    keepAwake: keepAwake === '1',
  };
}

export const setMapStyle = (style: MapStyleId) => setSetting(KEYS.style, style);
export const setAutoPause = (on: boolean) => setSetting(KEYS.autoPause, on ? '1' : '0');
export const setLastSport = (id: SportId) => setSetting(KEYS.lastSport, id);
export const setCardioKeepAwake = (on: boolean) => setSetting(KEYS.keepAwake, on ? '1' : '0');
