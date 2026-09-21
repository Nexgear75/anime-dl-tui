import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useState } from 'react';
import { ACCENT, ErrorLine, KeyHints, Loading } from '../components/common.js';

interface Props {
  initialQuery?: string;
  loading: boolean;
  error?: string;
  onSubmit: (query: string) => void;
  onQuit: () => void;
}

export function Home({ initialQuery = '', loading, error, onSubmit, onQuit }: Props) {
  const [query, setQuery] = useState(initialQuery);

  useInput(
    (_input, key) => {
      if (key.escape) onQuit();
    },
    { isActive: !loading },
  );

  return (
    <Box flexDirection="column">
      <Text>Recherche un anime par son nom, ou colle l’URL d’une page voir-anime.</Text>
      <Box marginTop={1} borderStyle="round" borderColor={loading ? 'gray' : ACCENT} paddingX={1}>
        <Text color={ACCENT}>🔍 </Text>
        <TextInput
          value={query}
          onChange={setQuery}
          focus={!loading}
          placeholder="ex : mushoku tensei, one piece, https://voir-anime.to/anime/…"
          onSubmit={(value) => {
            if (value.trim()) onSubmit(value.trim());
          }}
        />
      </Box>
      {loading ? <Loading label="Chargement…" /> : null}
      {error && !loading ? <ErrorLine>{error}</ErrorLine> : null}
      <KeyHints
        hints={[
          ['Entrée', 'rechercher'],
          ['Échap', 'quitter'],
        ]}
      />
    </Box>
  );
}
