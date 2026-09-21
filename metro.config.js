const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push('sql');

// expo-sqlite's web worker imports wa-sqlite.wasm, and Metro does not treat
// .wasm as an asset by default — without this the web bundle cannot resolve it
// and the app 500s before rendering.
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

module.exports = config;
