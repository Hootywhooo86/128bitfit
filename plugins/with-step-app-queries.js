const { withAndroidManifest } = require('expo/config-plugins');
const STEP_APPS = require('../lib/health/step-apps.json');

/**
 * Lets the app open the watch app that writes your steps ("Sync Google
 * Health" on the Steps screen).
 *
 * Since Android 11 an app can only look up another app it names in a
 * <queries> block; without it the launch lookup says "not installed" even
 * when it is. This is visibility of those few packages only — not a
 * permission, and nothing is prompted.
 *
 * The list is lib/health/step-apps.json, the same one the app reads.
 */
module.exports = function withStepAppQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const queries = (manifest.queries ??= [{}]);
    const block = queries[0];
    const packages = (block.package ??= []);
    for (const app of STEP_APPS) {
      if (!packages.some((p) => p.$?.['android:name'] === app.package)) {
        packages.push({ $: { 'android:name': app.package } });
      }
    }
    return cfg;
  });
};
