import { Box, Text, useInput, useWindowSize } from 'ink';
import Spinner from 'ink-spinner';
import { useEffect, useState } from 'react';
import { formatBytes, formatDuration, formatSpeed, tildify, truncate } from '../../core/format.js';
import { isActive, type DownloadQueue, type Job } from '../../core/queue.js';
import { ACCENT, KeyHints, ProgressBar, SECONDARY, visibleWindow } from '../components/common.js';

interface Props {
  queue: DownloadQueue;
  outputDir: string;
  onNew: () => void;
  onQuit: () => void;
}

/** Re-renders at most every `ms` while the queue emits updates. */
function useQueueTick(queue: DownloadQueue, ms = 200) {
  const [, setTick] = useState(0);
  useEffect(() => {
    let pending: NodeJS.Timeout | undefined;
    const onUpdate = () => {
      pending ??= setTimeout(() => {
        pending = undefined;
        setTick((t) => t + 1);
      }, ms);
    };
    queue.on('update', onUpdate);
    queue.on('idle', onUpdate);
    return () => {
      clearTimeout(pending);
      queue.off('update', onUpdate);
      queue.off('idle', onUpdate);
    };
  }, [queue, ms]);
}

function statusCell(job: Job) {
  switch (job.status) {
    case 'queued':
      return <Text dimColor>en attente</Text>;
    case 'resolving':
      return <Text color="yellow">recherche du lien… {job.attempt > 1 ? `(essai ${job.attempt})` : ''}</Text>;
    case 'retrying':
      return <Text color="yellow">nouvel essai dans quelques secondes…</Text>;
    case 'done':
      return <Text color="green">terminé</Text>;
    case 'skipped':
      return <Text color="green">déjà présent</Text>;
    case 'cancelled':
      return <Text color="gray">annulé</Text>;
    case 'failed':
      return <Text color="red">échec</Text>;
    case 'downloading': {
      const p = job.progress;
      if (p && p.ratio !== null && p.ratio >= 0.999) return <Text color={SECONDARY}>finalisation…</Text>;
      return (
        <Text>
          <Text color={SECONDARY}>{formatSpeed(p?.speed)}</Text>
          <Text dimColor> · {formatBytes(p?.downloadedBytes)}</Text>
          {p?.totalBytes ? <Text dimColor>/{formatBytes(p.totalBytes)}</Text> : null}
          <Text dimColor> · reste {formatDuration(p?.eta)}</Text>
        </Text>
      );
    }
  }
}

function icon(job: Job) {
  if (isActive(job.status)) {
    return (
      <Text color={ACCENT}>
        <Spinner type="dots" />
      </Text>
    );
  }
  const icons: Record<string, [string, string]> = {
    queued: ['·', 'gray'],
    done: ['✔', 'green'],
    skipped: ['✔', 'green'],
    failed: ['✖', 'red'],
    cancelled: ['■', 'gray'],
  };
  const [symbol, color] = icons[job.status] ?? ['?', 'gray'];
  return <Text color={color}>{symbol}</Text>;
}

export function Downloads({ queue, outputDir, onNew, onQuit }: Props) {
  useQueueTick(queue);
  const { rows, columns } = useWindowSize();
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [stopping, setStopping] = useState(false);

  const jobs = queue.jobs;
  const idle = queue.idle;
  const count = (...statuses: Job['status'][]) => jobs.filter((job) => statuses.includes(job.status)).length;
  const finished = count('done', 'skipped');
  const failed = count('failed');
  const cancelled = count('cancelled');
  const active = jobs.filter((job) => isActive(job.status));
  const speed = active.reduce((sum, job) => sum + (job.status === 'downloading' ? job.progress?.speed ?? 0 : 0), 0);
  const overall =
    jobs.reduce((sum, job) => {
      if (job.status === 'done' || job.status === 'skipped') return sum + 1;
      return sum + (job.status === 'downloading' ? job.progress?.ratio ?? 0 : 0);
    }, 0) / Math.max(1, jobs.length);

  useEffect(() => {
    if (stopping && idle) onQuit();
  }, [stopping, idle, onQuit]);

  useInput((input, key) => {
    if (stopping) return;
    if (confirmQuit) {
      if (input === 'o' || input === 'y') {
        setStopping(true);
        queue.cancelAll();
      } else {
        setConfirmQuit(false);
      }
      return;
    }
    if (input === 'q' || key.escape) {
      if (idle) return onQuit();
      return setConfirmQuit(true);
    }
    if (input === 'r' && (failed > 0 || cancelled > 0)) queue.retryFailed();
    if (idle && (key.return || input === 'n')) onNew();
  });

  // Keep running jobs in view: centre the window on the first active or queued job.
  const focus = Math.max(0, jobs.findIndex((job) => isActive(job.status) || job.status === 'queued'));
  const failedJobs = jobs.filter((job) => job.status === 'failed');
  const reserved = 14 + (idle ? Math.min(failedJobs.length, 5) : 0);
  const { start, end } = visibleWindow(jobs.length, focus, rows - reserved);
  // Row layout: icon, name, bar, percentage, status. Keep it on one line.
  const statusWidth = 44;
  const nameWidth = Math.min(22, Math.max(10, Math.floor(columns * 0.2)));
  const barWidth = Math.min(30, Math.max(6, columns - nameWidth - statusWidth - 16));

  return (
    <Box flexDirection="column">
      <Text bold>{idle ? 'Terminé' : 'Téléchargement en cours'}</Text>
      <Text dimColor wrap="truncate-middle">
        → {tildify(outputDir)}
      </Text>
      <Box marginTop={1}>
        <ProgressBar ratio={overall} width={Math.min(50, columns - 30)} />
        <Text bold> {Math.round(overall * 100)}%</Text>
        <Text dimColor>
          {'  '}
          {finished}/{jobs.length}
          {active.length ? ` · ${active.length} en cours` : ''}
          {speed ? ` · ${formatSpeed(speed)}` : ''}
        </Text>
        {failed ? <Text color="red"> · {failed} échec{failed > 1 ? 's' : ''}</Text> : null}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {start > 0 ? <Text dimColor>  ↑ {start} de plus</Text> : null}
        {jobs.slice(start, end).map((job) => (
          <Box key={job.episode.id + job.output}>
            {icon(job)}
            <Box width={nameWidth} marginLeft={1} marginRight={1}>
              <Text wrap="truncate-end">{job.episode.number === null ? job.episode.label : `Épisode ${job.episode.number}`}</Text>
            </Box>
            <ProgressBar
              ratio={
                job.status === 'done' || job.status === 'skipped'
                  ? 1
                  : job.status === 'downloading'
                    ? job.progress?.ratio ?? null
                    : null
              }
              width={barWidth}
              color={job.status === 'done' || job.status === 'skipped' ? 'green' : ACCENT}
            />
            <Box width={6} justifyContent="flex-end">
              <Text>
                {job.status === 'downloading' && job.progress?.ratio !== null && job.progress?.ratio !== undefined
                  ? `${Math.floor(job.progress.ratio * 100)}%`
                  : ''}
              </Text>
            </Box>
            <Box marginLeft={1} flexShrink={1}>
              <Text wrap="truncate-end">{statusCell(job)}</Text>
            </Box>
          </Box>
        ))}
        {end < jobs.length ? <Text dimColor>  ↓ {jobs.length - end} de plus</Text> : null}
      </Box>

      {failedJobs.length > 0 && idle ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color="red" bold>
            Échecs :
          </Text>
          {failedJobs.slice(0, 5).map((job) => (
            <Text key={job.episode.id} color="red">
              {truncate(`  • ${job.episode.label} — ${job.error ?? 'erreur inconnue'}`, columns - 2)}
            </Text>
          ))}
        </Box>
      ) : null}

      {confirmQuit ? (
        <Box marginTop={1} borderStyle="round" borderColor="yellow" paddingX={1}>
          <Text color="yellow">
            Arrêter les téléchargements en cours ? Ils reprendront là où ils en étaient au prochain lancement.
            (o/N)
          </Text>
        </Box>
      ) : null}
      {stopping ? <Text color="yellow">Arrêt en cours…</Text> : null}

      <KeyHints
        hints={
          idle
            ? [
                ...(failed || cancelled ? ([['r', 'réessayer les échecs']] as [string, string][]) : []),
                ['Entrée', 'nouvelle recherche'],
                ['q', 'quitter'],
              ]
            : [
                ...(failed ? ([['r', 'réessayer les échecs']] as [string, string][]) : []),
                ['q', 'arrêter et quitter'],
              ]
        }
      />
    </Box>
  );
}
