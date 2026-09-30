const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Signs release builds with the app's own key instead of the React Native
 * template's debug keystore.
 *
 * The debug keystore ships with every React Native project and anyone can
 * download it. Android trusts an update only if it is signed with the same key
 * as the installed app, so while releases used that key, anyone could build a
 * fake "update" that installs over 128BIT FIT and reads its data.
 *
 * The key itself never enters this public repository: the APK workflow
 * decodes it from GitHub's encrypted secrets into a temporary file and passes
 * its location and passwords through environment variables. Without them, a
 * release build falls back to the debug key, as before — the workflow refuses
 * to publish one (see .github/workflows/apk.yml), so a missing secret fails
 * loudly instead of shipping an APK that will not install over the last one.
 *
 * A config plugin rather than an edit to android/app/build.gradle, because
 * prebuild regenerates that file and would discard the change.
 */
const MARKER = '// 128BIT FIT: release signing';

const RELEASE_CONFIG = `
        ${MARKER}
        release {
            if (System.getenv('BITFIT_KEYSTORE')) {
                storeFile file(System.getenv('BITFIT_KEYSTORE'))
                storePassword System.getenv('BITFIT_KEYSTORE_PASSWORD')
                keyAlias System.getenv('BITFIT_KEY_ALIAS')
                keyPassword System.getenv('BITFIT_KEYSTORE_PASSWORD')
            }
        }`;

function addReleaseSigning(gradle) {
  if (gradle.includes(MARKER)) return gradle;

  // 1. A release signing config next to the debug one.
  const opened = gradle.replace(/signingConfigs\s*\{/, (m) => `${m}${RELEASE_CONFIG}`);
  if (opened === gradle) throw new Error('with-release-signing: no signingConfigs block in app/build.gradle');

  // 2. The release build type uses it when the key is present.
  const releaseType = /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;
  const out = opened.replace(
    releaseType,
    `$1signingConfig System.getenv('BITFIT_KEYSTORE') ? signingConfigs.release : signingConfigs.debug`
  );
  if (out === opened) throw new Error('with-release-signing: release build type not found in app/build.gradle');
  return out;
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = addReleaseSigning(cfg.modResults.contents);
    return cfg;
  });
};

module.exports.addReleaseSigning = addReleaseSigning;
