import { existsSync, statSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

/** Pseudo-folder listing the drives on Windows (the parent of `C:\`). */
export const DRIVES = '';

export async function listFolders(folder: string, showHidden = false): Promise<string[]> {
  if (folder === DRIVES) return listDrives();
  const entries = await readdir(folder, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() || (entry.isSymbolicLink() && isDirectory(path.join(folder, entry.name))))
    .map((entry) => entry.name)
    .filter((name) => showHidden || !name.startsWith('.'))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
}

function isDirectory(target: string): boolean {
  try {
    return statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function listDrives(): string[] {
  const drives: string[] = [];
  for (let code = 65; code <= 90; code++) {
    const drive = `${String.fromCharCode(code)}:\\`;
    if (existsSync(drive)) drives.push(drive);
  }
  return drives;
}

/** Parent folder, the drive list above a Windows drive root, or null at the top. */
export function parentFolder(folder: string, platform = process.platform): string | null {
  if (folder === DRIVES) return null;
  const parent = (platform === 'win32' ? path.win32 : path.posix).dirname(folder);
  if (parent !== folder) return parent;
  return platform === 'win32' ? DRIVES : null;
}

export function childFolder(folder: string, name: string): string {
  return folder === DRIVES ? name : path.join(folder, name);
}

/** Closest existing folder at or above `folder` (the output folder often does not exist yet). */
export async function nearestExisting(folder: string): Promise<string> {
  let current = path.resolve(folder);
  for (;;) {
    try {
      if ((await stat(current)).isDirectory()) return current;
    } catch {
      // Keep climbing.
    }
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
}

/**
 * The picker selects a parent folder; the series gets its own sub-folder in it,
 * unless the chosen folder already is that sub-folder.
 */
export function seriesFolder(picked: string, seriesName: string): string {
  return path.basename(picked) === seriesName ? picked : path.join(picked, seriesName);
}
