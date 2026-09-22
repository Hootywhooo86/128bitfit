const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Drops the ML Kit script models the app cannot use.
 *
 * @react-native-ml-kit/text-recognition depends on the Chinese, Japanese,
 * Korean and Devanagari recognisers unconditionally, and each one bundles its
 * own model into the APK. Nutrition panels this app reads are Latin script, so
 * the other four are download weight for a capability nothing calls.
 *
 * Done as a config plugin rather than by editing android/app/build.gradle,
 * because prebuild regenerates that directory and would discard the change.
 */
const EXCLUDED = [
  'text-recognition-chinese',
  'text-recognition-devanagari',
  'text-recognition-japanese',
  'text-recognition-korean',
];

const MARKER = '// 128BIT FIT: latin-only ML Kit';

function block() {
  const lines = EXCLUDED.map(
    (m) => `        exclude group: 'com.google.mlkit', module: '${m}'`
  ).join('\n');
  return `\n${MARKER}\nconfigurations.all {\n    resolutionStrategy {\n        // The Latin recogniser is the only one this app calls.\n${lines}\n    }\n}\n`;
}

module.exports = function withLatinOnlyMlKit(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error(
        'with-latin-only-mlkit expects a groovy build.gradle; got ' + cfg.modResults.language
      );
    }
    if (cfg.modResults.contents.includes(MARKER)) return cfg;
    cfg.modResults.contents += block();
    return cfg;
  });
};
