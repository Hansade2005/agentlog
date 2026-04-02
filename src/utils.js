import crypto from 'node:crypto';
import fs from 'node:fs';

/**
 * Generate a 12-character hex session ID (6 bytes = 281 trillion combinations).
 */
export function generateSessionId() {
  return crypto.randomBytes(6).toString('hex');
}

/**
 * Format a duration in ms to a human-readable string.
 */
export function formatDuration(ms) {
  if (ms == null || ms < 0) return 'ongoing';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}m ${secs}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return `${hours}h ${mins}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/**
 * Format a Unix ms timestamp to a short date-time string.
 */
export function formatTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Format a Unix ms timestamp to a relative string like "2h ago".
 */
export function formatRelative(ts) {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return formatTime(ts);
}

/**
 * Strip cwd prefix from a file path.
 */
export function shortPath(filePath, cwd) {
  if (!filePath) return '';
  if (filePath.startsWith(cwd)) {
    const rel = filePath.slice(cwd.length);
    return rel.startsWith('/') ? rel.slice(1) : rel;
  }
  return filePath;
}

/**
 * Truncate a string with ellipsis.
 */
export function truncate(str, len = 60) {
  if (!str) return '';
  if (str.length <= len) return str;
  return str.slice(0, len - 1) + '…';
}

/**
 * Map agent key to human-readable label.
 */
const AGENT_LABELS = {
  cursor: 'Cursor',
  'claude-code': 'Claude Code',
  codex: 'Codex',
  windsurf: 'Windsurf',
  copilot: 'Copilot',
  cline: 'Cline',
  aider: 'Aider',
  custom: 'Custom',
};

export function agentLabel(agent) {
  return AGENT_LABELS[agent] || agent;
}

export const VALID_AGENTS = Object.keys(AGENT_LABELS);

/**
 * Map agent key to CLI command (null = GUI/extension, fs-watch only).
 */
export const AGENT_COMMANDS = {
  cursor: null,
  'claude-code': 'claude',
  codex: 'codex',
  windsurf: null,
  copilot: null,
  cline: null,
  aider: 'aider',
  custom: null,
};

/**
 * Max file size to snapshot (5 MB). Larger files are skipped.
 */
export const MAX_SNAPSHOT_SIZE = 5 * 1024 * 1024;

/**
 * Detect if a file is likely binary by reading its first 8KB.
 */
export function isBinaryFile(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(8192);
    const bytesRead = fs.readSync(fd, buf, 0, 8192, 0);
    fs.closeSync(fd);
    if (bytesRead === 0) return false;
    // Check for null bytes (strong binary indicator)
    for (let i = 0; i < bytesRead; i++) {
      if (buf[i] === 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Get file size in bytes. Returns -1 on error.
 */
export function getFileSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return -1;
  }
}

/**
 * Format file size in human-readable units.
 */
export function formatSize(bytes) {
  if (bytes < 0) return '?';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

/**
 * Strip ANSI escape codes from a string.
 */
export function stripAnsi(str) {
  return str.replace(
    // eslint-disable-next-line no-control-regex
    /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g,
    ''
  );
}

/**
 * Pad a string (accounting for ANSI codes) to a given width.
 */
export function pad(str, width) {
  const visible = stripAnsi(str);
  const padding = Math.max(0, width - visible.length);
  return str + ' '.repeat(padding);
}

/**
 * Format a number with commas: 1234567 → "1,234,567"
 */
export function formatNumber(n) {
  return n.toLocaleString('en-US');
}
