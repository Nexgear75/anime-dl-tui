import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { ReactNode } from 'react';

export const ACCENT = 'magentaBright';
export const SECONDARY = 'cyan';

export function Header({ subtitle }: { subtitle?: string }) {
  return (
    <Box borderStyle="round" borderColor={ACCENT} paddingX={1} justifyContent="space-between">
      <Text>
        <Text color={ACCENT} bold>
          ▶ anime-dl
        </Text>
        <Text color={SECONDARY}> tui</Text>
      </Text>
      {subtitle ? <Text dimColor>{subtitle}</Text> : null}
    </Box>
  );
}

export type Hint = [key: string, label: string];

export function KeyHints({ hints }: { hints: Hint[] }) {
  return (
    <Box marginTop={1} flexWrap="wrap" columnGap={2}>
      {hints.map(([key, label]) => (
        <Text key={key + label}>
          <Text color={SECONDARY} bold>
            {key}
          </Text>
          <Text dimColor> {label}</Text>
        </Text>
      ))}
    </Box>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <Box marginTop={1}>
      <Text color={ACCENT}>
        <Spinner type="dots" />
      </Text>
      <Text> {label}</Text>
    </Box>
  );
}

export function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <Box marginTop={1}>
      <Text color="red">✖ {children}</Text>
    </Box>
  );
}

export function ProgressBar({
  ratio,
  width,
  color = ACCENT,
}: {
  ratio: number | null;
  width: number;
  color?: string;
}) {
  const size = Math.max(4, width);
  if (ratio === null) {
    return <Text dimColor>{'╌'.repeat(size)}</Text>;
  }
  const filled = Math.round(Math.min(1, Math.max(0, ratio)) * size);
  return (
    <Text>
      <Text color={color}>{'█'.repeat(filled)}</Text>
      <Text dimColor>{'░'.repeat(size - filled)}</Text>
    </Text>
  );
}

/** Returns the slice of a long list to display so the cursor stays visible. */
export function visibleWindow(total: number, cursor: number, height: number) {
  const size = Math.max(1, height);
  if (total <= size) return { start: 0, end: total };
  const start = Math.min(Math.max(0, cursor - Math.floor(size / 2)), total - size);
  return { start, end: start + size };
}
