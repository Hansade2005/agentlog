# AgentLog

Record, query, diff, and rollback AI coding agent sessions — locally, with SQLite.

AgentLog wraps any AI coding agent session and records every file change and shell command into a local SQLite database. Review what an agent did, compare before/after states, and roll back any session to its original state in seconds.

Works with **Cursor**, **Claude Code**, **Codex**, **Windsurf**, **GitHub Copilot**, **Cline**, **Aider**, and any custom tool.

No cloud. No accounts. Everything stays on your machine.

---

## Install

```bash
npm install -g agentlog
```

Requires **Node.js 18+**. Verify the install:

```bash
agentlog --version
```

---

## Quick Start

```bash
cd my-project
agentlog init                  # initialize tracking
agentlog run cursor            # start recording
# ... use your agent ...
# Ctrl+C to stop

agentlog sessions              # list all sessions
agentlog diff a3f8             # view what changed
agentlog diff a3f8 --patch     # full unified diff
agentlog rollback a3f8         # undo everything
agentlog query "what changed?" # ask AI about your sessions
```

---

## Platform Guides

### Cursor

Cursor is a GUI editor — AgentLog watches your project filesystem while you work.

```bash
cd my-project
agentlog init
agentlog run cursor
```

Open the same project in Cursor. Every file Cursor's agent creates, modifies, or deletes is recorded. Press **Ctrl+C** in the terminal when you're done.

### Claude Code

Claude Code has a CLI (`claude`) — AgentLog wraps it as a child process so both the filesystem changes and the spawned command are recorded.

```bash
cd my-project
agentlog init
agentlog run claude-code
```

This spawns `claude` directly. The session ends when Claude Code exits.

Pass extra arguments:

```bash
agentlog run claude-code --args "--model opus"
```

### OpenAI Codex

```bash
agentlog run codex
```

Spawns the `codex` CLI. All changes are tracked automatically.

### Aider

```bash
agentlog run aider
```

Spawns `aider`. Pass arguments with `--args`:

```bash
agentlog run aider --args "--model gpt-4"
```

### Windsurf

```bash
agentlog run windsurf
```

Filesystem watch mode. Open Windsurf separately and work normally. Press **Ctrl+C** to stop.

### GitHub Copilot (in VS Code)

```bash
agentlog run copilot
```

Filesystem watch mode. Open VS Code and use Copilot as usual. Press **Ctrl+C** to stop.

### Cline (VS Code Extension)

```bash
agentlog run cline
```

Filesystem watch mode. Open VS Code with Cline installed. Press **Ctrl+C** to stop.

### Any Other Tool

```bash
agentlog run custom
```

Generic filesystem watcher. Works with any tool that modifies files in your project.

---

## Commands

### `agentlog init`

Initialize AgentLog in the current directory. Creates a `.agentlog/` folder containing the SQLite database, config, and a gitignore.

Run this once per project.

### `agentlog run <agent>`

Start recording a session.

| Agent | How it works |
|---|---|
| `cursor` | Watches filesystem (open Cursor separately) |
| `claude-code` | Spawns `claude` CLI directly |
| `codex` | Spawns `codex` CLI directly |
| `aider` | Spawns `aider` CLI directly |
| `windsurf` | Watches filesystem (open Windsurf separately) |
| `copilot` | Watches filesystem (open VS Code separately) |
| `cline` | Watches filesystem (open VS Code separately) |
| `custom` | Watches filesystem (use any tool) |

**Options:**
- `-a, --args <args>` — arguments to pass to the agent CLI (for `claude-code`, `codex`, `aider`)

### `agentlog sessions` (alias: `agentlog ls`)

List all recorded sessions with status, duration, file counts, and command counts.

```
ID        Agent         Started       Duration    Files  Cmds
───────────────────────────────────────────────────────────────
● a3f8b2c1 Cursor        2h ago        14m 32s     12     0
● 7e91d4f0 Claude Code   yesterday     8m 15s      6      3
```

**Options:**
- `-l, --limit <n>` — number of sessions to show (default: 20)

### `agentlog diff <session-id>`

Show what files were added, modified, or deleted during a session.

Supports **prefix matching** — you don't need the full 8-character ID:

```bash
agentlog diff a3f8          # matches a3f8b2c1
agentlog diff a3f8 --patch  # show full unified diffs
```

**Options:**
- `-p, --patch` — show full unified diff output for each file

### `agentlog rollback <session-id>`

Restore every file to its pre-session state. Files the agent created are deleted. Files the agent modified or deleted are restored.

```bash
agentlog rollback a3f8
```

Previews all actions before executing. Confirm with `y` or skip the prompt:

```bash
agentlog rollback a3f8 --yes
```

**Options:**
- `-y, --yes` — skip confirmation prompt

### `agentlog query "<question>"`

Ask a natural language question about your sessions using the built-in AI assistant. No setup or API keys required.

```bash
agentlog query "which session touched the auth module?"
agentlog query "what did I do yesterday?"
agentlog query "show me sessions that modified more than 5 files"
```

Only session metadata (file paths, event types, commands, timestamps) is sent — **never file contents**.

---

## Configuration

Edit `.agentlog/config.json` to customize ignore patterns:

```json
{
  "version": "1.0.0",
  "ignore": ["node_modules", ".git", "dist", ".next", "build", "__pycache__"],
  "maxSessionHistory": 100
}
```

Add entries to `ignore` to exclude directories from tracking. Each entry is matched as a directory name anywhere in the file tree.

---

## How It Works

1. **Snapshot** — `agentlog run` indexes all files in your project at session start
2. **Watch** — A filesystem watcher records every add, change, and delete with before/after content
3. **Store** — All events go into a local SQLite database (WAL mode for performance)
4. **Diff** — `agentlog diff` computes unified diffs from the stored snapshots
5. **Rollback** — `agentlog rollback` uses the *first* recorded snapshot per file to restore pre-session state
6. **Query** — `agentlog query` sends only metadata (paths, types, timestamps) to the AI for analysis

---

## Typical Workflow

```bash
# Before a risky agent session
agentlog run cursor

# Agent makes changes...
# Ctrl+C

# Review what happened
agentlog diff a3f8 --patch

# Happy with it? Move on.
# Not happy? Roll it all back.
agentlog rollback a3f8 --yes

# Later, query across all sessions
agentlog query "which sessions modified package.json?"
```

---

## Uninstall

```bash
npm uninstall -g agentlog
```

To remove tracking data from a project, delete the `.agentlog/` folder.

---

## License

MIT
