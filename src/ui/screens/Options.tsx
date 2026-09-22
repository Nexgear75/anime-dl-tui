import { Box, Text, useInput } from 'ink';
import path from 'node:path';
import { useState, type ReactNode } from 'react';
import { seriesFolder } from '../../core/folders.js';
import { sanitizeFilename, tildify } from '../../core/format.js';
import { PLAYERS } from '../../core/players/index.js';
import { ACCENT, KeyHints, SECONDARY } from '../components/common.js';
import { FolderPicker } from './FolderPicker.js';

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
  const [pickFrom, setPickFrom] = useState<string>();
  const seriesName = sanitizeFilename(seriesTitle);

  const openPicker = () => {
    // Start from the parent folder when the output follows "<parent>/<series>".
    setPickFrom(path.basename(plan.outputDir) === seriesName ? path.dirname(plan.outputDir) : plan.outputDir);
  };

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
        if (field === 'folder') return openPicker();
        onStart(plan);
      }
    },
    { isActive: pickFrom === undefined },
  );

  if (pickFrom !== undefined) {
    return (
      <FolderPicker
        initialDir={pickFrom}
        seriesName={seriesName}
        onPick={(picked) => {
          setPlan({ ...plan, outputDir: seriesFolder(picked, seriesName) });
          setPickFrom(undefined);
          setField('start');
        }}
        onCancel={() => setPickFrom(undefined)}
      />
    );
  }

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
          <Box flexShrink={1}>
            <Text color={SECONDARY} wrap="truncate-middle">
              {tildify(plan.outputDir)}
            </Text>
          </Box>,
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

      <KeyHints
        hints={[
          ['↑↓', 'champ'],
          ['←→', 'modifier'],
          ['Entrée', field === 'folder' ? 'changer le dossier' : 'lancer'],
          ['Échap', 'retour'],
        ]}
      />
    </Box>
  );
}
