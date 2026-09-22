import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { Box, Text, useInput, useWindowSize } from 'ink';
import TextInput from 'ink-text-input';
import { useEffect, useState } from 'react';
import { childFolder, DRIVES, listFolders, parentFolder } from '../../core/folders.js';
import { expandHome, tildify } from '../../core/format.js';
import { ACCENT, ErrorLine, KeyHints, SECONDARY, visibleWindow } from '../components/common.js';

interface Props {
  initialDir: string;
  /** Sub-folder that will be created for the series, shown as a preview. */
  seriesName: string;
  onPick: (folder: string) => void;
  onCancel: () => void;
}

type Row = { kind: 'use' } | { kind: 'parent' } | { kind: 'folder'; name: string };
type Mode = 'browse' | 'new' | 'path';

export function FolderPicker({ initialDir, seriesName, onPick, onCancel }: Props) {
  const { rows: terminalRows } = useWindowSize();
  const height = Math.max(3, terminalRows - 14);
  const [folder, setFolder] = useState(initialDir);
  const [folders, setFolders] = useState<string[]>([]);
  const [cursor, setCursor] = useState(0);
  const [showHidden, setShowHidden] = useState(false);
  const [mode, setMode] = useState<Mode>('browse');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    listFolders(folder, showHidden)
      .then((names) => {
        if (cancelled) return;
        setFolders(names);
        setError(undefined);
      })
      .catch((err: NodeJS.ErrnoException) => {
        if (cancelled) return;
        setFolders([]);
        setError(err.code === 'EACCES' || err.code === 'EPERM' ? 'Accès refusé à ce dossier.' : err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [folder, showHidden]);

  const parent = parentFolder(folder);
  const rows: Row[] = [
    ...(folder === DRIVES ? [] : [{ kind: 'use' } as const]),
    ...(parent !== null ? [{ kind: 'parent' } as const] : []),
    ...folders.map((name) => ({ kind: 'folder', name }) as const),
  ];

  const open = (next: string, previous?: string) => {
    setFolder(next);
    setCursor(0);
    // When going up, keep the cursor on the folder we came from.
    if (previous !== undefined) {
      void listFolders(next, showHidden)
        .then((names) => {
          const index = names.indexOf(previous);
          const offset = (next === DRIVES ? 0 : 1) + (parentFolder(next) !== null ? 1 : 0);
          if (index !== -1) setCursor(index + offset);
        })
        .catch(() => undefined);
    }
  };

  const goUp = () => {
    if (parent === null) return;
    const name = folder === DRIVES ? undefined : parent === DRIVES ? folder : path.basename(folder);
    open(parent, name);
  };

  const activate = (row: Row | undefined) => {
    if (!row) return;
    if (row.kind === 'use') return onPick(folder);
    if (row.kind === 'parent') return goUp();
    open(childFolder(folder, row.name));
  };

  useInput(
    (input, key) => {
      if (key.escape) return onCancel();
      const move = (delta: number) => setCursor((c) => Math.min(rows.length - 1, Math.max(0, c + delta)));
      if (key.upArrow) return move(-1);
      if (key.downArrow) return move(1);
      if (key.pageUp) return move(-height);
      if (key.pageDown) return move(height);
      if (key.home) return setCursor(0);
      if (key.end) return setCursor(rows.length - 1);
      if (key.leftArrow || key.backspace || key.delete) return goUp();
      if (key.return) return activate(rows[cursor]);
      if (key.rightArrow) {
        const row = rows[cursor];
        if (row?.kind === 'folder') activate(row);
        return;
      }
      if (input === ' ' && folder !== DRIVES) return onPick(folder);
      if (input === '~') return open(homedir());
      if (input === '.') return setShowHidden((value) => !value);
      if (input === 'n' && folder !== DRIVES) {
        setDraft('');
        return setMode('new');
      }
      if (input === '/' || input === 'e') {
        setDraft(folder === DRIVES ? '' : tildify(folder));
        return setMode('path');
      }
    },
    { isActive: mode === 'browse' },
  );

  useInput(
    (_input, key) => {
      if (key.escape) {
        setError(undefined);
        setMode('browse');
      }
    },
    { isActive: mode !== 'browse' },
  );

  const submitNew = async (value: string) => {
    const name = value.trim();
    if (!name || /[<>:"/\\|?*]/.test(name)) {
      setError('Nom de dossier invalide.');
      return;
    }
    try {
      const created = path.join(folder, name);
      await mkdir(created, { recursive: true });
      setMode('browse');
      open(created);
    } catch (err) {
      setError(`Impossible de créer le dossier : ${(err as Error).message}`);
    }
  };

  const submitPath = async (value: string) => {
    const target = path.resolve(expandHome(value));
    try {
      await mkdir(target, { recursive: true });
      setMode('browse');
      open(target);
    } catch (err) {
      setError(`Dossier inutilisable : ${(err as Error).message}`);
    }
  };

  const { start, end } = visibleWindow(rows.length, cursor, height);
  const label = (row: Row) => {
    if (row.kind === 'use') return <Text color="green">✔ Choisir ce dossier</Text>;
    if (row.kind === 'parent') return <Text dimColor>↑ .. (dossier parent)</Text>;
    return <Text>{folder === DRIVES ? row.name : `${row.name}${path.sep}`}</Text>;
  };

  return (
    <Box flexDirection="column">
      <Text>
        <Text bold>Choisis le dossier de téléchargement</Text>
      </Text>
      <Box>
        <Box flexShrink={0}>
          <Text dimColor>Dossier actuel : </Text>
        </Box>
        <Box flexShrink={1}>
          <Text color={SECONDARY} wrap="truncate-middle">
            {folder === DRIVES ? 'Ce PC (lecteurs)' : tildify(folder)}
          </Text>
        </Box>
      </Box>
      {folder !== DRIVES ? (
        <Box>
          <Box flexShrink={0}>
            <Text dimColor>La série ira dans : </Text>
          </Box>
          <Box flexShrink={1}>
            <Text dimColor wrap="truncate-middle">
              {tildify(path.basename(folder) === seriesName ? folder : path.join(folder, seriesName))}
            </Text>
          </Box>
        </Box>
      ) : null}

      <Box flexDirection="column" marginTop={1}>
        {rows.slice(start, end).map((row, i) => {
          const index = start + i;
          const active = index === cursor;
          return (
            <Box key={row.kind === 'folder' ? `f:${row.name}` : row.kind}>
              <Text color={active ? ACCENT : undefined}>{active ? '❯ ' : '  '}</Text>
              <Box flexShrink={1}>
                <Text bold={active} wrap="truncate-end">
                  {label(row)}
                </Text>
              </Box>
            </Box>
          );
        })}
        {folders.length === 0 && folder !== DRIVES && !error ? <Text dimColor>  (aucun sous-dossier)</Text> : null}
        {rows.length > height ? (
          <Text dimColor>
            {'  '}
            {cursor + 1}/{rows.length}
          </Text>
        ) : null}
      </Box>

      {mode === 'new' ? (
        <Box marginTop={1}>
          <Text color={ACCENT}>Nouveau dossier : </Text>
          <TextInput value={draft} onChange={setDraft} onSubmit={(value) => void submitNew(value)} />
        </Box>
      ) : null}
      {mode === 'path' ? (
        <Box marginTop={1}>
          <Text color={ACCENT}>Aller à : </Text>
          <TextInput value={draft} onChange={setDraft} onSubmit={(value) => void submitPath(value)} />
        </Box>
      ) : null}
      {error ? <ErrorLine>{error}</ErrorLine> : null}

      <KeyHints
        hints={
          mode === 'browse'
            ? [
                ['↑↓', 'naviguer'],
                ['→/Entrée', 'ouvrir'],
                ['←', 'parent'],
                ['Espace', 'choisir ce dossier'],
                ['n', 'nouveau dossier'],
                ['/', 'taper un chemin'],
                ['~', 'dossier perso'],
                ['.', showHidden ? 'masquer cachés' : 'voir cachés'],
                ['Échap', 'annuler'],
              ]
            : [
                ['Entrée', 'valider'],
                ['Échap', 'annuler'],
              ]
        }
      />
    </Box>
  );
}
