import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useState, type ReactNode } from 'react';
import { expandHome, tildify } from '../../core/format.js';
import { PLAYERS } from '../../core/players/index.js';
import { ACCENT, ErrorLine, KeyHints, SECONDARY } from '../components/common.js';

export interface DownloadPlan {
  outputDir: string;
  concurrency: number;
  preferredPlayer: string;
}

interface Props {
  seriesTitle: string;
  count: number;
  initial: DownloadPlan;
  warning?: string;
  onStart: (plan: DownloadPlan) => void;
  onBack: () => void;
}

const FIELDS = ['folder', 'concurrency', 'player', 'start'] as const;
type Field = (typeof FIELDS)[number];

export function Options({ seriesTitle, count, initial, warning, onStart, onBack }: Props) {
  const [plan, setPlan] = useState(initial);
  const [field, setField] = useState<Field>('start');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string>();

  const cyclePlayer = (delta: number) => {
    const index = PLAYERS.findIndex((player) => player.id === plan.preferredPlayer);
    const next = PLAYERS[(index + delta + PLAYERS.length) % PLAYERS.length]!;
    setPlan({ ...plan, preferredPlayer: next.id });
  };

  useInput(
    (_input, key) => {
      if (key.escape) return onBack();
      const index = FIELDS.indexOf(field);
      if (key.upArrow) return setField(FIELDS[(index - 1 + FIELDS.length) % FIELDS.length]!);
      if (key.downArrow || key.tab) return setField(FIELDS[(index + 1) % FIELDS.length]!);
      const delta = key.leftArrow ? -1 : key.rightArrow ? 1 : 0;
      if (delta && field === 'concurrency') {
        return setPlan({ ...plan, concurrency: Math.min(8, Math.max(1, plan.concurrency + delta)) });
      }
      if (delta && field === 'player') return cyclePlayer(delta);
      if (key.return) {
        if (field === 'folder') {
          setDraft(tildify(plan.outputDir));
          return setEditing(true);
        }
        onStart(plan);
      }
    },
    { isActive: !editing },
  );

  useInput(
    (_input, key) => {
      if (key.escape) setEditing(false);
    },
    { isActive: editing },
  );

  const submitFolder = (value: string) => {
    const folder = expandHome(value);
    if (!folder) {
      setError('Le dossier ne peut pas être vide.');
      return;
    }
    setError(undefined);
    setPlan({ ...plan, outputDir: folder });
    setEditing(false);
  };

  const row = (name: Field, label: string, value: ReactNode, adjustable = false) => {
    const active = field === name;
    return (
      <Box>
        <Text color={active ? ACCENT : undefined}>{active ? '❯ ' : '  '}</Text>
        <Box width={22}>
          <Text bold={active}>{label}</Text>
        </Box>
        {adjustable && active ? <Text color={SECONDARY}>◀ </Text> : null}
        {value}
        {adjustable && active ? <Text color={SECONDARY}> ▶</Text> : null}
      </Box>
    );
  };

  const player = PLAYERS.find((p) => p.id === plan.preferredPlayer)?.name ?? plan.preferredPlayer;

  return (
    <Box flexDirection="column">
      <Text>
        <Text color={ACCENT} bold>
          {seriesTitle}
        </Text>
        <Text dimColor>
          {' '}
          · {count} épisode{count > 1 ? 's' : ''} à télécharger
        </Text>
      </Text>

      <Box flexDirection="column" marginTop={1}>
        {row(
          'folder',
          'Dossier',
          editing ? (
            <TextInput value={draft} onChange={setDraft} onSubmit={submitFolder} />
          ) : (
            <Box flexShrink={1}>
              <Text color={SECONDARY} wrap="truncate-middle">
                {tildify(plan.outputDir)}
              </Text>
            </Box>
          ),
        )}
        {row('concurrency', 'Téléchargements //', <Text color={SECONDARY}>{plan.concurrency}</Text>, true)}
        {row('player', 'Lecteur préféré', <Text color={SECONDARY}>{player}</Text>, true)}
        <Box marginTop={1}>
          <Text color={field === 'start' ? ACCENT : undefined}>{field === 'start' ? '❯ ' : '  '}</Text>
          <Text
            backgroundColor={field === 'start' ? ACCENT : undefined}
            color={field === 'start' ? 'black' : ACCENT}
            bold
          >
            {' '}
            ▶ Lancer le téléchargement{' '}
          </Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          Si le lecteur préféré ne répond pas, les autres lecteurs de l’épisode sont essayés automatiquement.
        </Text>
      </Box>
      {warning ? (
        <Box>
          <Text color="yellow">⚠ {warning}</Text>
        </Box>
      ) : null}
      {error ? <ErrorLine>{error}</ErrorLine> : null}

      <KeyHints
        hints={
          editing
            ? [
                ['Entrée', 'valider'],
                ['Échap', 'annuler'],
              ]
            : [
                ['↑↓', 'champ'],
                ['←→', 'modifier'],
                ['Entrée', field === 'folder' ? 'éditer le dossier' : 'lancer'],
                ['Échap', 'retour'],
              ]
        }
      />
    </Box>
  );
}
