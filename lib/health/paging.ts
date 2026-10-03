/**
 * Every page of a Health Connect read, not just the first.
 *
 * Health Connect hands records back a page at a time (about a thousand), with
 * a pageToken for the next. A watch writing heart rate once a second fills a
 * page in well under half an hour, so reading one page cut a 48-minute
 * workout's graph off 28 minutes in — and the average and max with it.
 *
 * Pure apart from the reader it is given, so the loop is tested without a
 * phone.
 */
export type Page<T> = { records: T[]; pageToken?: string | null };

/** A runaway guard: no real read needs this many pages. */
const MAX_PAGES = 200;

export async function readAllPages<T>(readPage: (pageToken?: string) => Promise<Page<T>>): Promise<T[]> {
  const all: T[] = [];
  let token: string | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await readPage(token);
    all.push(...(page.records ?? []));
    // An empty or repeated token is the last page; a repeat would loop forever.
    if (!page.pageToken || page.pageToken === token) break;
    token = page.pageToken;
  }
  return all;
}
