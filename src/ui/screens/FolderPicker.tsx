import path from 'node:path';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useEffect, useRef, useState } from 'react';
import { completeFolder, folderExists, longestCommonPrefix, seriesFolder } from '../../core/folders.js';
import { expandHome, tildify } from '../../core/format.js';
import { ACCENT, ErrorLine, KeyHints, SECONDARY, visibleWindow } from '../components/common.js';

interface Props {
  initialDir: string;
  /** Sub-folder that will be created for the series, shown as a preview. */
  seriesName: string;
  onPick: (folder: string) => void;
  onCancel: () => void;
}

const MAX_SUGGESTIONS = 8;
const resolveTyped = (value: string) => path.resolve(expandHome(value));

export function FolderPicker({ initialDir, seriesName, onPick, onCancel }: Props) {
  const [value, setValue] = useState(() => tildify(initialDir) + path.sep);
  // Bumped when the value is replaced by a completion, to remount the input
  // with its cursor at the end of the new text.
  const [inputKey, setInputKey] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  /** Highlighted suggestion, -1 until the arrows are used. */
  const [selected, setSelected] = useState(-1);
  const [exists, setExists] = useState(true);
  const [error, setError] = useState<string>();
  const request = useRef(0);

  useEffect(() => {
    const id = ++request.current;
    void Promise.all([completeFolder(value), folderExists(resolveTyped(value))]).then(([found, present]) => {
      if (id !== request.current) return;
      setSuggestions(found);
      setSelected(-1);
      setExists(present);
    });
  }, [value]);

  const replace = (next: string) => {
    setValue(next);
    setInputKey((key) => key + 1);
    setError(undefined);
  };

  const complete = () => {
    if (suggestions.length === 0) return;
    // Like a shell: first extend to what all matches share, then take the highlighted one.
    const common = longestCommonPrefix(suggestions);
    if (selected === -1 && suggestions.length > 1 && common.length > value.length) return replace(common);
    replace(suggestions[Math.max(0, selected)]!);
  };

  useInput((_input, key) => {
    if (key.escape) return onCancel();
    if (key.tab) return complete();
    if (key.downArrow && suggestions.length) return setSelected((s) => (s + 1) % suggestions.length);
    if (key.upArrow && suggestions.length)
      return setSelected((s) => (s <= 0 ? suggestions.length - 1 : s - 1));
  });

  const submit = (typed: string) => {
    if (!typed.trim()) {
      setError('Le dossier ne peut pas être vide.');
      return;
    }
    onPick(resolveTyped(suggestions[selected] ?? typed));
  };

  const chosen = suggestions[selected] ?? value;
  const target = chosen.trim() ? seriesFolder(resolveTyped(chosen), seriesName) : undefined;
  const { start, end } = visibleWindow(suggestions.length, Math.max(0, selected), MAX_SUGGESTIONS);

  return (
    <Box flexDirection="column">
      <Text bold>Où enregistrer la série ?</Text>
      <Box marginTop={1}>
        <Box flexShrink={0}>
          <Text color={ACCENT}>Dossier : </Text>
        </Box>
        <TextInput
          key={inputKey}
          value={value}
          onChange={(next) => {
            setValue(next);
            setError(undefined);
          }}
          onSubmit={submit}
        />
      </Box>

      <Box flexDirection="column" marginLeft={10}>
        {suggestions.slice(start, end).map((suggestion, i) => {
          const active = start + i === selected;
          const name = path.basename(suggestion.replace(/[\\/]+$/, ''));
          return (
            <Text key={suggestion} color={active ? ACCENT : undefined} bold={active} wrap="truncate-end">
              {active ? '❯ ' : '  '}
              {name}
              {path.sep}
            </Text>
          );
        })}
        {suggestions.length > MAX_SUGGESTIONS ? (
          <Text dimColor>
            {'  '}
            {Math.max(0, selected) + 1}/{suggestions.length}
          </Text>
        ) : null}
      </Box>

      {target ? (
        <Box marginTop={1}>
          <Box flexShrink={0}>
            <Text dimColor>La série ira dans : </Text>
          </Box>
          <Box flexShrink={1}>
            <Text color={SECONDARY} wrap="truncate-middle">
              {tildify(target)}
            </Text>
          </Box>
          {!exists && selected === -1 ? (
            <Box flexShrink={0}>
              <Text color="yellow"> (nouveau dossier)</Text>
            </Box>
          ) : null}
        </Box>
      ) : null}
      {error ? <ErrorLine>{error}</ErrorLine> : null}

      <KeyHints
        hints={[
          ['Tab', 'compléter'],
          ['↑↓', 'suggestions'],
          ['Entrée', 'valider'],
          ['Échap', 'annuler'],
        ]}
      />
    </Box>
  );
}
