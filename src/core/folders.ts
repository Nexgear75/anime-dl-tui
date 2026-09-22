import { statSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { expandHome } from './format.js';

export async function listFolders(folder: string, showHidden = false): Promise<string[]> {
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

export async function folderExists(folder: string): Promise<boolean> {
  try {
    return (await stat(folder)).isDirectory();
  } catch {
    return false;
  }
}

const isSeparator = (char: string | undefined, platform: NodeJS.Platform) =>
  char === '/' || (platform === 'win32' && char === '\\');

/**
 * Splits what the user typed into the folder to list and the partial name to
 * complete: "~/Dow" → { typedDir: "~/", partial: "Dow" }.
 */
export function splitForCompletion(input: string, platform: NodeJS.Platform = process.platform) {
  let typed = input;
  if (typed === '~') typed = `~${platform === 'win32' ? '\\' : '/'}`;
  if (platform === 'win32' && /^[a-z]:$/i.test(typed)) typed += '\\';
  let cut = -1;
  for (let i = typed.length - 1; i >= 0; i--) {
    if (isSeparator(typed[i], platform)) {
      cut = i;
      break;
    }
  }
  return { typedDir: typed.slice(0, cut + 1), partial: typed.slice(cut + 1) };
}

export function longestCommonPrefix(values: string[]): string {
  if (values.length === 0) return '';
  let prefix = values[0]!;
  for (const value of values.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < value.length && prefix[i]!.toLowerCase() === value[i]!.toLowerCase()) i++;
    prefix = prefix.slice(0, i);
  }
  return prefix;
}

/**
 * Folder suggestions for a path being typed. Each suggestion is the full text
 * to put in the field (keeping "~" as typed), ending with a separator so the
 * next Tab lists its sub-folders.
 */
export async function completeFolder(
  input: string,
  cwd = process.cwd(),
  platform: NodeJS.Platform = process.platform,
): Promise<string[]> {
  const { typedDir, partial } = splitForCompletion(input, platform);
  const folder = path.resolve(cwd, expandHome(typedDir || '.'));
  let names: string[];
  try {
    names = await listFolders(folder, partial.startsWith('.'));
  } catch {
    return [];
  }
  const lower = partial.toLowerCase();
  const separator = platform === 'win32' ? '\\' : '/';
  return names
    .filter((name) => name.toLowerCase().startsWith(lower))
    .sort((a, b) => Number(!a.startsWith(partial)) - Number(!b.startsWith(partial)))
    .map((name) => `${typedDir}${name}${separator}`);
}

/**
 * The chosen folder is a parent folder; the series gets its own sub-folder in
 * it, unless the chosen folder already is that sub-folder.
 */
export function seriesFolder(picked: string, seriesName: string): string {
  return path.basename(picked) === seriesName ? picked : path.join(picked, seriesName);
}
