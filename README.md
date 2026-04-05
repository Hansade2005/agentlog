# AgentLog

Record, query, diff, and rollback AI coding agent sessions — locally, with SQLite.

AgentLog wraps any AI coding agent session and records every file change and shell command into a local SQLite database. Review what an agent did, compare sessions, search history, export reports, and roll back any session in seconds.

Works with **Cursor**, **Claude Code**, **Codex**, **Windsurf**, **GitHub Copilot**, **Cline**, **Aider**, and any custom tool.

No cloud. No accounts. No native compilation. Everything stays on your machine.

---

## Install

```bash
npm install -g @pipilot-dev/agentlog
```

Requires **Node.js 18+**. Works on Windows, macOS, and Linux.

---

## Quick Start

```bash
cd my-project
agentlog init                          # one-time setup
agentlog run cursor                    # start recording (returns immediately)
# ... use Cursor normally ...
agentlog stop                          # end session

agentlog status                        # is it recording?
agentlog watch                         # live tail of changes
agentlog log                           # git-log-style history
agentlog diff a3f8 --patch             # full diffs
agentlog undo                          # quick undo last session
agentlog search "auth"                 # find sessions by file
agentlog stats                         # analytics dashboard
agentlog query "what changed today?"   # ask AI
```

---

## 16 Commands

### Recording

| Command | Description |
|---|---|
| `agentlog init` | Initialize AgentLog in the current directory |
| `agentlog run <agent>` | Start recording a session |
| `agentlog stop` | Stop the active recording session |
| `agentlog status` | Check if recording + live summary of current session |
| `agentlog watch` | Live tail of file changes as they happen |

### Browsing

| Command | Description |
|---|---|
| `agentlog sessions` / `ls` | Table view of all sessions |
| `agentlog log` | Git-log-style history with file details |
| `agentlog search [pattern]` | Find sessions by file pattern (e.g. `"*.js"`, `"auth"`) |

### Inspection

| Command | Description |
|---|---|
| `agentlog diff <id>` | Show what changed (supports `--patch`, `--compare`) |
| `agentlog stats` | Analytics dashboard |
| `agentlog query "<question>"` | Ask AI about your sessions |

### Actions

| Command | Description |
|---|---|
| `agentlog rollback <id>` | Rollback a session (supports `--files` for selective rollback) |
| `agentlog undo` | Quick undo of the last session — no ID needed |
| `agentlog export <id>` | Export as JSON, Markdown, or unified patch |
| `agentlog tag <id>` | Add tags (`--add`) or notes (`--note`) |

### Maintenance

| Command | Description |
|---|---|
| `agentlog clean` | Prune old sessions, show DB size, reclaim disk space |

---

## How Recording Works

**For GUI agents (Cursor, Windsurf, Copilot, Cline, custom):**
```bash
agentlog run cursor       # spawns background daemon, returns immediately
# ... use your editor normally — all changes are recorded ...
agentlog stop             # ends session
```

**For CLI agents (Claude Code, Codex, Aider):**
```bash
agentlog run claude-code  # wraps the CLI in foreground, records everything
# ... agent runs, session ends when it exits ...
```

**What gets recorded:**
- Every file add, modify, delete — with full before/after snapshots
- Binary files detected and labeled (not snapshotted)
- Files over 5 MB skipped automatically
- Shell commands executed by CLI agents

---

## Platform Guides

```bash
agentlog run cursor              # Cursor (background)
agentlog run claude-code         # Claude Code (wraps CLI)
agentlog run codex               # Codex (wraps CLI)
agentlog run aider               # Aider (wraps CLI)
agentlog run windsurf            # Windsurf (background)
agentlog run copilot             # Copilot (background)
agentlog run cline               # Cline (background)
agentlog run custom              # Any tool (background)
```

Pass arguments to CLI agents: `agentlog run aider --args "--model gpt-4"`

---

## Key Features

**Background Daemon** — GUI agents run a background watcher. No terminal babysitting.

**Session Tagging** — `agentlog run cursor --tag feature auth` then filter with `agentlog sessions --tag feature`.

**Selective Rollback** — `agentlog rollback <id> --files src/auth.js src/db.js` to rollback specific files only.

**Quick Undo** — `agentlog undo` rolls back the last session without needing to look up the ID.

**Live Watch** — `agentlog watch` shows file changes in real-time as the agent works.

**Session Search** — `agentlog search "*.test.js"` finds all sessions that touched test files.

**Git-Log View** — `agentlog log` shows sessions with file details, like `git log --stat`.

**Session Comparison** — `agentlog diff <id1> --compare <id2>` shows which files each session touched.

**Export** — `agentlog export <id> --format md` for Markdown, `json` for data, `patch` for diffs.

**AI Query** — `agentlog query "which sessions broke the tests?"` — no API key needed.

**Analytics** — `agentlog stats` shows event breakdowns, agent distribution, most-changed files.

**DB Cleanup** — `agentlog clean --keep 50` prunes old sessions and vacuums the database.

---

## Configuration

`.agentlog/config.json`:

```json
{
  "ignore": ["node_modules", ".git", "dist", ".next", "build"],
  "maxSessionHistory": 100,
  "maxFileSize": 5242880,
  "excludeExtensions": [".pyc", ".class", ".o", ".exe", ".dll", ".so"]
}
```

---

## Uninstall

```bash
npm uninstall -g @pipilot-dev/agentlog
rm -rf .agentlog/
```

## License

MIT
