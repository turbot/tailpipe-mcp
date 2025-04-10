/**
 * Constructs a Tailpipe CLI command with consistent flags and options
 * @param command The base command (e.g., 'source list', 'source show foo')
 * @param options Additional options to include
 * @returns The complete command string
 */
export function buildTailpipeCommand(command: string, options: { output?: string } = {}): string {
  const parts = ['tailpipe'];

  // Add the command
  parts.push(command);

  // Add output format if specified
  if (options.output) {
    parts.push(`--output ${options.output}`);
  }

  return parts.join(' ');
}

/**
 * Gets the environment variables for Tailpipe CLI execution
 * @returns Environment variables object
 */
export function getTailpipeEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    // Disable automatic update checking if needed
    TAILPIPE_UPDATE_CHECK: 'false',
  };
} 