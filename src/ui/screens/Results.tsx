import { Box, Text, useInput, useWindowSize } from 'ink';
import { useState } from 'react';
import type { SearchResult } from '../../core/voiranime.js';
import { truncate } from '../../core/format.js';
import { ACCENT, ErrorLine, KeyHints, Loading, SECONDARY, visibleWindow } from '../components/common.js';

interface Props {
  query: string;
  results: SearchResult[];
  loading: boolean;
  error?: string;
  onSelect: (result: SearchResult) => void;
  onBack: () => void;
}

export function Results({ query, results, loading, error, onSelect, onBack }: Props) {
  const [cursor, setCursor] = useState(0);
  const { rows, columns } = useWindowSize();

  useInput(
    (_input, key) => {
      if (key.escape) return onBack();
      if (results.length === 0) return;
      if (key.upArrow) setCursor((c) => (c - 1 + results.length) % results.length);
      if (key.downArrow) setCursor((c) => (c + 1) % results.length);
      if (key.return) onSelect(results[cursor]!);
    },
    { isActive: !loading },
  );

  const { start, end } = visibleWindow(results.length, cursor, rows - 12);

  return (
    <Box flexDirection="column">
      <Text>
        Résultats pour <Text color={ACCENT}>« {query} »</Text>{' '}
        <Text dimColor>({results.length})</Text>
      </Text>

      {results.length === 0 ? (
        <Box marginTop={1}>
          <Text color="yellow">Aucun résultat. Essaie un autre nom (Échap pour revenir).</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {start > 0 ? <Text dimColor>  ↑ {start} de plus</Text> : null}
          {results.slice(start, end).map((result, offset) => {
            const index = start + offset;
            const active = index === cursor;
            const meta = [result.type, result.year, result.status].filter(Boolean).join(' · ');
            return (
              <Box key={result.url}>
                <Text color={active ? ACCENT : undefined} bold={active}>
                  {active ? '❯ ' : '  '}
                </Text>
                <Text color={result.language === 'VF' ? 'green' : SECONDARY}>
                  {result.language === 'VF' ? '[VF]     ' : '[VOSTFR] '}
                </Text>
                <Text color={active ? ACCENT : undefined} bold={active}>
                  {truncate(result.title, Math.max(20, columns - 40))}
                </Text>
                {meta ? <Text dimColor> {meta}</Text> : null}
              </Box>
            );
          })}
          {end < results.length ? <Text dimColor>  ↓ {results.length - end} de plus</Text> : null}
        </Box>
      )}

      {loading ? <Loading label="Chargement de la série…" /> : null}
      {error && !loading ? <ErrorLine>{error}</ErrorLine> : null}

      <KeyHints
        hints={[
          ['↑↓', 'naviguer'],
          ['Entrée', 'ouvrir'],
          ['Échap', 'retour'],
        ]}
      />
    </Box>
  );
}
