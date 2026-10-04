/**
 * Native modules that exist for one platform only.
 *
 * Apple Health (HealthKit) has no Android side, and react-native-nitro-modules
 * is here only for it, so neither is compiled into the APK. Health Connect is
 * Android-only already (its expo-module.config.json says so).
 */
module.exports = {
  dependencies: {
    '@kingstinct/react-native-healthkit': { platforms: { android: null } },
    '@react-native-healthkit/core': { platforms: { android: null } },
    'react-native-nitro-modules': { platforms: { android: null } },
  },
};
