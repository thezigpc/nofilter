import { promises as fs } from "fs";

/** Loads a JSON file for a persisted store, distinguishing "no file yet" (a
 * legitimate first-run default, fine to treat as empty) from "file exists
 * but is unreadable/corrupt/wrong-shaped" - the latter is logged loudly
 * rather than silently treated the same as "start empty," since silently
 * swallowing it risks a subsequent write permanently overwriting real data
 * with nothing. Returns undefined in both the missing-file and the
 * failed-to-load case; callers default to an empty in-memory value either
 * way, but only the loud path leaves a trace telling a human to go look at
 * the file before more writes happen. */
export async function loadJsonFile<T>(
  path: string,
  isValid: (parsed: unknown) => parsed is T
): Promise<T | undefined> {
  let raw: string;
  try {
    raw = await fs.readFile(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    console.error(`[jsonFileStore] Couldn't read ${path} - starting empty in memory. The file itself is untouched.`, err);
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw);
    if (isValid(parsed)) return parsed;
    console.error(`[jsonFileStore] ${path} didn't match the expected shape - starting empty in memory. The file itself is untouched.`);
    return undefined;
  } catch (err) {
    console.error(`[jsonFileStore] ${path} isn't valid JSON - starting empty in memory. The file itself is untouched.`, err);
    return undefined;
  }
}

/** Write-then-rename so a process killed mid-write (e.g. a service restart
 * landing in the middle of a save) can never leave a truncated/corrupt file
 * behind - rename is atomic on the same filesystem, so a reader always sees
 * either the complete old file or the complete new one, never a partial
 * write. Same directory as the target path, so the rename never crosses a
 * filesystem boundary. */
export async function saveJsonFileAtomic(path: string, data: unknown): Promise<void> {
  const tmpPath = `${path}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmpPath, path);
}
