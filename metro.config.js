const fs = require('fs');
const path = require('path');
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

// `repdb-generated` is the RepDB exercise bundle when scripts/build-repdb.mjs
// has built it (the APK workflow does) and an empty stub otherwise. The real
// bundle is gitignored — RepDB's licence forbids republishing its data and
// this repository is public — so a plain checkout must still bundle.
const repdbBuilt = path.join(__dirname, 'generated/repdb/index.ts');
const repdbStub = path.join(__dirname, 'lib/repdb-stub.ts');
const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'repdb-generated') {
    return { type: 'sourceFile', filePath: fs.existsSync(repdbBuilt) ? repdbBuilt : repdbStub };
  }
  return upstreamResolve
    ? upstreamResolve(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
