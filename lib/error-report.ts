/**
 * The text behind "Share error details" on the crash screen.
 *
 * Built here, kept pure, so it can be tested and so it never includes
 * anything but the error itself and which build it came from. There is no
 * crash-reporting service: this text only leaves the phone if the user
 * shares it.
 */
export type ErrorReportInput = {
  error: unknown;
  /** Which screen it happened on, e.g. "/train/active". */
  where: string | null;
  /** The release tag baked into the build, or null for a dev build. */
  build: string | null;
  platform: string;
  at: Date;
};

const MAX_STACK_LINES = 30;

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name || 'Unknown error';
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

export function errorReport(input: ErrorReportInput): string {
  const { error } = input;
  const stack =
    error instanceof Error && error.stack
      ? error.stack.split('\n').slice(0, MAX_STACK_LINES).join('\n')
      : null;
  return [
    '128BIT FIT error report',
    `Build: ${input.build ?? 'development build'} (${input.platform})`,
    `When: ${input.at.toISOString()}`,
    `Screen: ${input.where ?? 'unknown'}`,
    `Error: ${error instanceof Error ? `${error.name}: ` : ''}${errorMessage(error)}`,
    ...(stack ? ['', stack] : []),
  ].join('\n');
}
