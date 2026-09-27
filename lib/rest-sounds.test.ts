import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { REST_SOUNDS, restChannelFor, soundSetting } from './rest-sounds';

describe('rest-timer sounds', () => {
  it('ships a file for every named sound, and app.json registers it', () => {
    const appJson = fs.readFileSync('app.json', 'utf8');
    for (const s of REST_SOUNDS) {
      if (!s.file) continue;
      expect(fs.existsSync(`assets/sounds/${s.file}`), s.file).toBe(true);
      expect(appJson, s.file).toContain(`./assets/sounds/${s.file}`);
    }
  });

  it('gives every sound/vibration combination its own channel', () => {
    const ids = REST_SOUNDS.flatMap((s) => [restChannelFor(s.id, true), restChannelFor(s.id, false)]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the existing channel for the phone default with vibration', () => {
    expect(restChannelFor('default', true)).toBe('rest_timer');
  });

  it('plays nothing when off', () => {
    expect(soundSetting('off')).toBeNull();
    expect(soundSetting('default')).toBe('default');
    expect(soundSetting('bell')).toBe('rest_bell.wav');
  });
});
