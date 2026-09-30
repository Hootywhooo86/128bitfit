/**
 * A full backup — every table plus the photos — as one file the user saves
 * off the phone, and the restore that reads it back.
 *
 * Why one file, and why it goes through the share sheet: the app's own folder
 * is wiped when the app is uninstalled, which is exactly when a backup is
 * needed. So the file is handed to Drive, Files or email straight away.
 */
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { applyRestore, type RestoreResult } from '@/db/restore';
import { collectExport } from '@/lib/export/collect';
import { buildEnvelope } from '@/lib/export/json';
import { PHOTO_FOLDERS, planRestore, type RestorePlan } from './restore-plan';

export type BackupFile = { uri: string; name: string; size: number | null; photos: number };

function stamp(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
}

/** Every photo the app keeps, as base64, keyed by folder/name. */
async function collectPhotos(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const folder of PHOTO_FOLDERS) {
    const dir = new Directory(Paths.document, folder);
    if (!dir.exists) continue;
    for (const entry of dir.list()) {
      if (!(entry instanceof File)) continue;
      out[`${folder}/${entry.name}`] = await entry.base64();
    }
  }
  return out;
}

export async function runBackup(now: Date = new Date()): Promise<BackupFile> {
  const envelope = buildEnvelope(await collectExport(), now);
  const files = await collectPhotos();
  const dir = new Directory(Paths.document, 'exports');
  dir.create({ intermediates: true, idempotent: true });
  const name = `128bitfit-backup-${stamp(now)}.json`;
  const file = new File(dir, name);
  file.create({ overwrite: true });
  file.write(JSON.stringify({ ...envelope, files, documentDir: Paths.document.uri }));
  return { uri: file.uri, name, size: file.size, photos: Object.keys(files).length };
}

/** Asks for a file and reads it. Null if the user backed out. */
export async function pickBackup(): Promise<{ name: string; plan: RestorePlan } | null> {
  const res = await DocumentPicker.getDocumentAsync({
    // Files apps label .json inconsistently; the content is checked instead.
    type: ['application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const asset = res.assets[0];
  const text = new File(asset.uri).textSync();
  return { name: asset.name ?? 'backup', plan: planRestore(text, Paths.document.uri) };
}

/** A photo is written only if nothing is there already — restore adds, never replaces. */
async function writePhoto(path: string, base64: string): Promise<boolean> {
  const [folder, name] = path.split('/');
  const dir = new Directory(Paths.document, folder);
  if (!dir.exists) dir.create({ intermediates: true });
  const file = new File(dir, name);
  if (file.exists) return false;
  file.create();
  file.write(base64, { encoding: 'base64' });
  return true;
}

export function restoreBackup(plan: RestorePlan): Promise<RestoreResult> {
  return applyRestore(plan, writePhoto);
}

/** "212 sets, 48 food logs, …" — the biggest things first. */
export function describePlan(plan: RestorePlan): string {
  const parts: [number, string][] = [
    [plan.workoutSessions.length, 'workouts'],
    [plan.sets.length, 'sets'],
    [plan.foodLogs.length, 'food logs'],
    [plan.weightEntries.length, 'weigh-ins'],
    [plan.cardioSessions.length, 'cardio sessions'],
    [plan.routines.length, 'routines'],
    [plan.customFoods.length, 'of your foods'],
    [plan.customExercises.length, 'of your exercises'],
    [plan.files.length, 'photos'],
  ];
  const shown = parts.filter(([n]) => n > 0).map(([n, what]) => `${n} ${what}`);
  return shown.length ? shown.join(', ') : 'nothing — the file is empty';
}
