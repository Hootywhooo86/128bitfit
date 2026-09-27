import { desc, eq } from 'drizzle-orm';
import { deletePhoto, keepPhoto } from '@/lib/photo-files';
import { db } from './client';
import { newId } from './id';
import { progressPhotos, type PhotoPose, type ProgressPhoto } from './schema';

const FOLDER = 'progress-photos';

export async function listProgressPhotos(): Promise<ProgressPhoto[]> {
  return db.select().from(progressPhotos).orderBy(desc(progressPhotos.takenAt));
}

/** Copies the camera's file somewhere Android will not clear, then indexes it. */
export async function addProgressPhoto(pose: PhotoPose, sourceUri: string): Promise<ProgressPhoto> {
  const id = newId('pp');
  const uri = keepPhoto(FOLDER, id, sourceUri);
  const row = { id, pose, uri, takenAt: new Date() };
  try {
    await db.insert(progressPhotos).values(row);
  } catch (e) {
    deletePhoto(uri);
    throw e;
  }
  return row;
}

export async function removeProgressPhoto(photo: ProgressPhoto): Promise<void> {
  await db.delete(progressPhotos).where(eq(progressPhotos.id, photo.id));
  deletePhoto(photo.uri);
}
