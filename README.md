# AgentLog

Record, query, diff, and rollback AI coding agent sessions — locally, with SQLite.

AgentLog wraps AI coding agent sessions (Cursor, Claude Code, Codex, Windsurf, Copilot, Cline, Aider) and records every filesystem change and shell command into a local SQLite database. No server. No cloud. Everything runs locally.

## Install

```bash
npm install -g agentlog
```

Or use locally in a project:

```bash
npx agentlog
```

## Quick Start

```bash
# Initialize in your project
cd my-project
agentlog init

# Record a Cursor session (watches filesystem)
agentlog run cursor

# Record a Claude Code session (wraps the CLI)
agentlog run claude-code

# List all sessions
agentlog sessions

# View changes from a session
agentlog diff a3f8

# View full unified diffs
agentlog diff a3f8 --patch

# Rollback all changes from a session
agentlog rollback a3f8

# Ask AI questions about your sessions
agentlog query "which session modified the auth module?"
```

## Commands

### `agentlog init`

Initialize AgentLog in the current directory. Creates a `.agentlog/` folder with:
- `sessions.db` — SQLite database (WAL mode)
- `config.json` — ignore patterns and settings
- `.gitignore` — excludes database files

### `agentlog run <agent>`

Start recording a session. Supported agents:

| Agent | Mode |
|---|---|
| `cursor` | Filesystem watch (GUI) |
| `claude-code` | Wraps `claude` CLI |
| `codex` | Wraps `codex` CLI |
| `windsurf` | Filesystem watch (GUI) |
| `copilot` | Filesystem watch (GUI) |
| `cline` | Filesystem watch (VS Code) |
| `aider` | Wraps `aider` CLI |
| `custom` | Filesystem watch only |

Options:
- `-a, --args <args>` — arguments to pass to the agent CLI

### `agentlog sessions` (alias: `agentlog ls`)

List recorded sessions with status, duration, file count, and command count.

Options:
- `-l, --limit <n>` — number of sessions to show (default: 20)

### `agentlog diff <session-id>`

Show file changes for a session. Supports prefix matching (e.g., `agentlog diff a3f8`).

Options:
- `-p, --patch` — show full unified diff output

### `agentlog rollback <session-id>`

Rollback all file changes from a session to their pre-session state. Previews all actions before executing.

Options:
- `-y, --yes` — skip confirmation prompt

### `agentlog query "<question>"`

Ask a natural language question about your sessions using the built-in AI assistant. No setup or API keys required.

Only session metadata (file paths, event types, commands, timestamps) is sent — never file contents.

## Configuration

Edit `.agentlog/config.json` to customize:

```json
{
  "version": "1.0.0",
  "ignore": ["node_modules", ".git", "dist", ".next", "build", "__pycache__"],
  "maxSessionHistory": 100
}
```

## How It Works

1. `agentlog run` takes a snapshot of all project files
2. A filesystem watcher records every add, change, and delete event with before/after snapshots
3. For CLI agents (Claude Code, Codex, Aider), the agent process is spawned as a child process
4. All events are stored in a local SQLite database
5. `agentlog diff` computes unified diffs from stored snapshots
6. `agentlog rollback` restores files to their pre-session state using the first snapshot recorded for each file

## Requirements

- Node.js >= 18

## License

MIT
