const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withDangerousMod, withStringsXml } = require('expo/config-plugins');

/**
 * Long-press the app icon → "Gym pass", straight to the pass at the desk.
 *
 * An Android static shortcut: res/xml/shortcuts.xml plus a pointer to it on
 * the main activity. It opens the app's own deep link (bitfit://train/gympass),
 * which Expo Router already routes. Done as a config plugin because prebuild
 * regenerates android/ and would discard a hand edit.
 */
const LABEL_KEY = 'shortcut_gym_pass';

function shortcutsXml(pkg, scheme) {
  return `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
  <shortcut
    android:shortcutId="gym_pass"
    android:enabled="true"
    android:icon="@mipmap/ic_launcher"
    android:shortcutShortLabel="@string/${LABEL_KEY}"
    android:shortcutLongLabel="@string/${LABEL_KEY}">
    <intent
      android:action="android.intent.action.VIEW"
      android:data="${scheme}://train/gympass"
      android:targetPackage="${pkg}"
      android:targetClass="${pkg}.MainActivity" />
  </shortcut>
</shortcuts>
`;
}

module.exports = function withGymPassShortcut(config) {
  const pkg = config.android?.package;
  const scheme = Array.isArray(config.scheme) ? config.scheme[0] : config.scheme;
  if (!pkg || !scheme) throw new Error('with-gym-pass-shortcut needs android.package and scheme in app.json');

  config = withStringsXml(config, (cfg) => {
    cfg.modResults = AndroidConfig.Strings.setStringItem(
      [{ $: { name: LABEL_KEY, translatable: 'false' }, _: 'Gym pass' }],
      cfg.modResults
    );
    return cfg;
  });

  config = withAndroidManifest(config, (cfg) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    activity['meta-data'] = (activity['meta-data'] ?? []).filter(
      (m) => m.$['android:name'] !== 'android.app.shortcuts'
    );
    activity['meta-data'].push({
      $: { 'android:name': 'android.app.shortcuts', 'android:resource': '@xml/shortcuts' },
    });
    return cfg;
  });

  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'shortcuts.xml'), shortcutsXml(pkg, scheme));
      return cfg;
    },
  ]);
};
