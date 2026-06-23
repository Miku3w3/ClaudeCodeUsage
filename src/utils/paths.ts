/**
 * Path utilities for Claude Code data directories.
 * Resolves ~/.claude/ and project-specific paths on Windows.
 */
import * as os from 'os';
import * as path from 'path';

/** Root Claude data directory: %USERPROFILE%/.claude */
export function claudeDir(): string {
  return path.join(os.homedir(), '.claude');
}

/** Directory where session PID files live */
export function sessionsDir(): string {
  return path.join(claudeDir(), 'sessions');
}

/** Directory where IDE lock files live */
export function ideDir(): string {
  return path.join(claudeDir(), 'ide');
}

/** Directory where project transcript subdirectories live */
export function projectsDir(): string {
  return path.join(claudeDir(), 'projects');
}

/** Directory where the token-tracker SQLite DB lives */
export function tokenTrackerDir(): string {
  return path.join(claudeDir(), 'token-tracker');
}

/** Directory for our extension's output files (Claude-readable JSON) */
export function tokenMonitorDir(): string {
  return path.join(claudeDir(), 'token-monitor');
}

/**
 * Encode a Windows filesystem path to the format used in ~/.claude/projects/ subdirectory names.
 * "d:\Jobs" -> "d--Jobs"
 * "d:\Projects" -> "d--Projects"
 * "d:\Jobs\C" -> "d--Jobs-C"
 */
export function encodeProjectPath(cwd: string): string {
  return cwd
    .replace(/:\\/g, '--')    // Drive letter colon+backslash -> double dash
    .replace(/:\//g, '--')    // Drive letter colon+forward slash -> double dash
    .replace(/\\/g, '-')      // Remaining backslashes -> single dash
    .replace(/\//g, '-');     // Remaining forward slashes -> single dash
    // NOTE: Do NOT collapse consecutive dashes — the double dash from
    // the drive letter (e.g. d--Jobs) must be preserved.
}

/**
 * Given a working directory and session ID, return the path to the JSONL transcript file.
 */
export function transcriptPath(cwd: string, sessionId: string): string {
  const encoded = encodeProjectPath(cwd);
  return path.join(projectsDir(), encoded, `${sessionId}.jsonl`);
}

/**
 * Given a session ID, return the path to a session PID file (we may not know the PID).
 * Returns the sessions directory — caller must list files and find by sessionId.
 */
export function sessionFilePath(pid: number): string {
  return path.join(sessionsDir(), `${pid}.json`);
}

/**
 * Path to the current-session.json file that Claude can read.
 */
export function claudeReadablePath(): string {
  return path.join(tokenMonitorDir(), 'current-session.json');
}
