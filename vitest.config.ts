import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Unit tests for the pure logic — no React Native, no device, no database.
 *
 * Only modules that avoid platform imports are testable this way, which is
 * part of why the calorie floor, CSV/JSON export and health date helpers are
 * kept free of them.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**', 'android/**', 'ios/**'],
    environment: 'node',
  },
});
