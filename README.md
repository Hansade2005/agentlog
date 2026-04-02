# AgentLog

Record, query, diff, and rollback AI coding agent sessions — locally, with SQLite.

AgentLog wraps any AI coding agent session and records every file change and shell command into a local SQLite database. Review what an agent did, compare sessions, export reports, and roll back any session to its original state in seconds.

Works with **Cursor**, **Claude Code**, **Codex**, **Windsurf**, **GitHub Copilot**, **Cline**, **Aider**, and any custom tool.

No cloud. No accounts. Everything stays on your machine.

---

## Install

```bash
npm install -g agentlog
```

Requires **Node.js 18+**. Verify:

```bash
agentlog --version
```

---

## Quick Start

```bash
cd my-project
agentlog init                          # initialize tracking
agentlog run cursor --tag feature      # start recording with tags
# ... use your agent, Ctrl+C to stop ...

agentlog sessions                      # list all sessions
agentlog diff a3f8                     # view what changed
agentlog diff a3f8 --patch             # full unified diffs
agentlog rollback a3f8                 # undo everything
agentlog tag a3f8 --note "auth fix"    # annotate sessions
agentlog stats                         # analytics dashboard
agentlog export a3f8 --format md       # export to markdown
agentlog query "what changed?"         # ask AI about sessions
```

---

## Platform Guides

### Cursor

```bash
agentlog run cursor
# Open the same project in Cursor — all agent changes are tracked
# Ctrl+C to stop
```

### Claude Code

```bash
agentlog run claude-code
# Spawns the `claude` CLI — session ends when Claude exits
agentlog run claude-code --args "--model opus"
```

### OpenAI Codex

```bash
agentlog run codex
```

### Aider

```bash
agentlog run aider --args "--model gpt-4"
```

### Windsurf / Copilot / Cline

```bash
agentlog run windsurf    # or copilot, cline
# Filesystem watch mode — open your IDE separately, Ctrl+C to stop
```

### Any Other Tool

```bash
agentlog run custom
```

---

## Commands

### `agentlog init`

Initialize AgentLog in the current directory. Run once per project.

### `agentlog run <agent>`

Start recording. Supports: `cursor`, `claude-code`, `codex`, `aider`, `windsurf`, `copilot`, `cline`, `custom`.

| Option | Description |
|---|---|
| `-a, --args <args>` | Arguments to pass to CLI agents |
| `-t, --tag <tags...>` | Tag the session (e.g. `--tag bugfix auth`) |
| `--force` | Start even if another session is active |

**Live activity**: File changes are logged to the terminal in real-time. Binary files are detected automatically and labeled (not snapshotted). Files over 5 MB are skipped.

### `agentlog sessions` (alias: `agentlog ls`)

List recorded sessions with status, duration, file counts, tags, and notes.

| Option | Description |
|---|---|
| `-l, --limit <n>` | Number of sessions (default: 20) |
| `-a, --agent <agent>` | Filter by agent type |
| `-t, --tag <tag>` | Filter by tag |

### `agentlog diff <session-id>`

Show file changes. Supports prefix matching (`agentlog diff a3f8`).

| Option | Description |
|---|---|
| `-p, --patch` | Full unified diff output |
| `-c, --compare <id>` | Compare with another session |

### `agentlog rollback <session-id>`

Restore files to pre-session state. Previews actions before executing.

| Option | Description |
|---|---|
| `-y, --yes` | Skip confirmation |

### `agentlog export <session-id>`

Export session data in multiple formats.

| Option | Description |
|---|---|
| `-f, --format <fmt>` | `json`, `md`, or `patch` (default: json) |
| `-o, --output <file>` | Write to file instead of stdout |

### `agentlog stats`

Analytics dashboard: session counts, event breakdowns, agent distribution, most-changed files, average duration.

### `agentlog tag <session-id>`

Annotate sessions with tags and notes.

| Option | Description |
|---|---|
| `--add <tags...>` | Add tags |
| `--remove <tags...>` | Remove tags |
| `--note <text>` | Set a note |

### `agentlog query "<question>"`

Ask AI about your sessions. No API keys required.

Only metadata (paths, types, timestamps) is sent — **never file contents**.

---

## Configuration

`.agentlog/config.json`:

```json
{
  "version": "1.1.0",
  "ignore": ["node_modules", ".git", "dist", ".next", "build", "__pycache__"],
  "maxSessionHistory": 100,
  "maxFileSize": 5242880,
  "excludeExtensions": [".pyc", ".class", ".o", ".exe", ".dll", ".so"]
}
```

| Key | Description |
|---|---|
| `ignore` | Directory names to exclude from watching |
| `maxSessionHistory` | Auto-prune old sessions beyond this count |
| `maxFileSize` | Skip snapshotting files larger than this (bytes) |
| `excludeExtensions` | File extensions to ignore |

---

## How It Works

1. **Snapshot** — indexes all project files at session start
2. **Watch** — records every add, change, delete with before/after content
3. **Detect** — binary files identified, large files skipped automatically
4. **Store** — SQLite with WAL mode, indexed queries, automatic migrations
5. **Diff** — unified diffs computed from stored snapshots
6. **Rollback** — first recorded snapshot per file = pre-session truth
7. **Prune** — old sessions auto-cleaned based on `maxSessionHistory`

---

## Uninstall

```bash
npm uninstall -g agentlog
rm -rf .agentlog/  # remove from a project
```

---

## License

MIT
