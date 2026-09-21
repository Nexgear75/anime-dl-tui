import { Box, Text, useInput, useWindowSize } from 'ink';
import TextInput from 'ink-text-input';
import { useState } from 'react';
import { parseSelection, truncate } from '../../core/format.js';
import type { Series } from '../../core/voiranime.js';
import { ACCENT, ErrorLine, KeyHints, SECONDARY, visibleWindow } from '../components/common.js';

interface Props {
  series: Series;
  /** Ids of episodes already present in the output folder. */
  downloaded: Set<string>;
  initialSelection?: Set<string>;
  onConfirm: (selected: Set<string>) => void;
  onBack: () => void;
}

export function EpisodePicker({ series, downloaded, initialSelection, onConfirm, onBack }: Props) {
  const { episodes } = series;
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      initialSelection ??
      new Set(episodes.filter((episode) => !downloaded.has(episode.id)).map((episode) => episode.id)),
  );
  const [rangeMode, setRangeMode] = useState(false);
  const [range, setRange] = useState('');
  const [error, setError] = useState<string>();
  const { rows, columns } = useWindowSize();
  const height = Math.max(3, rows - 13);

  const move = (delta: number) =>
    setCursor((c) => Math.min(episodes.length - 1, Math.max(0, c + delta)));

  useInput(
    (input, key) => {
      setError(undefined);
      if (key.escape) return onBack();
      if (key.upArrow) return move(-1);
      if (key.downArrow) return move(1);
      if (key.pageUp) return move(-height);
      if (key.pageDown) return move(height);
      if (key.home) return setCursor(0);
      if (key.end) return setCursor(episodes.length - 1);
      if (input === ' ') {
        const id = episodes[cursor]?.id;
        if (!id) return;
        setSelected((previous) => {
          const next = new Set(previous);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
        return move(1);
      }
      if (input === 'a') {
        return setSelected((previous) =>
          previous.size === episodes.length ? new Set() : new Set(episodes.map((e) => e.id)),
        );
      }
      if (input === 'i') {
        return setSelected(
          (previous) => new Set(episodes.filter((e) => !previous.has(e.id)).map((e) => e.id)),
        );
      }
      if (input === 'n') {
        return setSelected(new Set(episodes.filter((e) => !downloaded.has(e.id)).map((e) => e.id)));
      }
      if (input === 's') {
        setRange('');
        return setRangeMode(true);
      }
      if (key.return) {
        if (selected.size === 0) return setError('Sélectionne au moins un épisode (Espace).');
        onConfirm(selected);
      }
    },
    { isActive: !rangeMode },
  );

  useInput(
    (_input, key) => {
      if (key.escape) setRangeMode(false);
    },
    { isActive: rangeMode },
  );

  const applyRange = (value: string) => {
    try {
      const next = parseSelection(value, episodes);
      if (next.size === 0) throw new Error(`Aucun épisode ne correspond à « ${value} »`);
      setSelected(next);
      setError(undefined);
    } catch (e) {
      setError((e as Error).message);
    }
    setRangeMode(false);
  };

  const { start, end } = visibleWindow(episodes.length, cursor, height);

  return (
    <Box flexDirection="column">
      <Text>
        <Text color={ACCENT} bold>
          {series.title}
        </Text>
        <Text dimColor>
          {' '}
          · {episodes.length} épisode{episodes.length > 1 ? 's' : ''}
          {downloaded.size ? ` · ${downloaded.size} déjà téléchargé${downloaded.size > 1 ? 's' : ''}` : ''}
        </Text>
      </Text>
      <Text>
        <Text color={SECONDARY}>{selected.size}</Text> sélectionné{selected.size > 1 ? 's' : ''}
      </Text>

      {episodes.length === 0 ? (
        <Box marginTop={1}>
          <Text color="yellow">Aucun épisode trouvé sur cette page.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {start > 0 ? <Text dimColor>  ↑ {start} de plus</Text> : null}
          {episodes.slice(start, end).map((episode, offset) => {
            const index = start + offset;
            const active = index === cursor;
            const checked = selected.has(episode.id);
            const done = downloaded.has(episode.id);
            const number = episode.number === null ? '  ★ ' : String(episode.number).padStart(4, ' ');
            return (
              <Box key={episode.id}>
                <Text color={active ? ACCENT : undefined}>{active ? '❯ ' : '  '}</Text>
                <Text color={checked ? 'green' : 'gray'}>{checked ? '◉' : '○'}</Text>
                <Text color={active ? ACCENT : undefined} bold={active}>
                  {' '}
                  {number}{' '}
                </Text>
                <Text color={active ? ACCENT : undefined} dimColor={!active && done}>
                  {truncate(episode.label, Math.max(20, columns - 30))}
                </Text>
                {done ? <Text color="green"> ✓ téléchargé</Text> : null}
              </Box>
            );
          })}
          {end < episodes.length ? <Text dimColor>  ↓ {episodes.length - end} de plus</Text> : null}
        </Box>
      )}

      {rangeMode ? (
        <Box marginTop={1} borderStyle="round" borderColor={SECONDARY} paddingX={1}>
          <Text color={SECONDARY}>Épisodes : </Text>
          <TextInput value={range} onChange={setRange} onSubmit={applyRange} placeholder="1-5, 8, 10-  (ou « all »)" />
        </Box>
      ) : null}
      {error ? <ErrorLine>{error}</ErrorLine> : null}

      <KeyHints
        hints={
          rangeMode
            ? [
                ['Entrée', 'appliquer'],
                ['Échap', 'annuler'],
              ]
            : [
                ['Espace', 'cocher'],
                ['a', 'tout/rien'],
                ['i', 'inverser'],
                ['n', 'non téléchargés'],
                ['s', 'plage (1-5,8)'],
                ['Entrée', 'continuer'],
                ['Échap', 'retour'],
              ]
        }
      />
    </Box>
  );
}
