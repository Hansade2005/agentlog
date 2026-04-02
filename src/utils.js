import crypto from 'node:crypto';

/**
 * Generate an 8-character hex session ID.
 */
export function generateSessionId() {
  return crypto.randomBytes(4).toString('hex');
}

/**
 * Format a duration in ms to a human-readable string.
 */
export function formatDuration(ms) {
  if (ms == null) return 'ongoing';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}m ${secs}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
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

/**
 * Valid agent keys.
 */
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
 * Default ignore patterns for chokidar.
 */
export const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.agentlog/**',
  '**/dist/**',
  '**/.next/**',
  '**/build/**',
  '**/__pycache__/**',
  '**/*.pyc',
  '**/.DS_Store',
  '**/Thumbs.db',
  '**/*.db',
  '**/*.db-shm',
  '**/*.db-wal',
];
