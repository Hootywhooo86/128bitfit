// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");
const globals = require("globals");

module.exports = defineConfig([
  expoConfig,
  {
    // Generated or native output, not source.
    ignores: ["dist/*", ".expo/*", "android/*", "ios/*", "generated/*"],
  },
  {
    // Build scripts run in Node, where Buffer and friends are globals.
    files: ["scripts/**/*.{js,mjs}"],
    languageOptions: { globals: globals.node },
  },
]);
