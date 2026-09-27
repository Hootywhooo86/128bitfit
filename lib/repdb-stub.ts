/**
 * The RepDB bundle when it has not been built: no exercises, no images.
 *
 * `import { REPDB } from 'repdb-generated'` resolves to generated/repdb/ when
 * scripts/build-repdb.mjs has run (the APK workflow runs it) and to this file
 * otherwise — see metro.config.js, tsconfig.json and vitest.config.ts. RepDB's
 * licence forbids republishing its data, and this repository is public, so the
 * real bundle is never committed.
 */

export type RepdbExercise = {
  id: string;
  name: string;
  force: string | null;
  level: string | null;
  mechanic: string | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string | null;
  /** Keys into `images`, prefixed "repdb/". */
  images: string[];
};

export type RepdbBundle = {
  /** The RepDB commit the bundle was built from, or null when there is none. */
  commit: string | null;
  checksum: string;
  exercises: RepdbExercise[];
  /** Image key → Metro asset id. */
  images: Record<string, number>;
};

export const REPDB: RepdbBundle = { commit: null, checksum: 'none', exercises: [], images: {} };
