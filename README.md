# Needs me: a to-do list for Claude Code

A side pane in Claude Code that keeps track of what Claude is waiting on you for: the questions it asked and the things only you can do (log in, run a command, check a page). Plus **needs-me-menu**, a narrow icon bar of one-key shortcuts to your most-used commands.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install needs-me --marketplace TomSjma/claude-code-needs-me-todo-list
/plugin install needs-me-menu --marketplace TomSjma/claude-code-needs-me-todo-list
```

Answer `y` to add the marketplace, then pick a scope. Restart Claude Code.

From a shell instead:

```
claude plugin install needs-me --marketplace TomSjma/claude-code-needs-me-todo-list
claude plugin install needs-me-menu --marketplace TomSjma/claude-code-needs-me-todo-list
```

The pane docks beside the transcript in fullscreen mode when the terminal is at least 110 columns wide; otherwise it sits above the prompt.

## Needs me

Items get into the list three ways:

- **From Claude.** Claude is told to call the `add` tool whenever it asks you something or needs you to act, and `resolve` when you have.
- **From a reply.** If a reply ends with a question Claude didn't track, the last question is picked up automatically.
- **From you.** Type an item in the pane's text field, select text in the transcript and click `+ add selected text`, or run `/needs-me add <text>`.

What you can do with an item:

| Control | What it does |
| --- | --- |
| click the row | Scrolls to the message it came from and outlines it in yellow; click again to remove the outline |
| `↩` | Puts `> <question>` into the prompt, ready for your answer |
| `💤` | Hides it for an hour |
| `[ ✔ ]` | Ticks it off; `↶ undo (10s)` brings it back |

A question picked up from a reply is ticked off by itself when you send your next prompt.

Each row starts with its age (`5m`, `2h`, `1d`); items older than a day are dimmed.

### The count, outside the pane

- Status line: `📋 Needs me: 3`
- The menu icon: `📋3`
- The terminal tab title (optional, see below): `📋 3 · <session topic>`

### Other sessions

Below your own list, the pane shows the open items of your other Claude Code sessions from the last 7 days. Clicking a session switches to the terminal tab it runs in (see requirements below); if it isn't open, it copies `claude --resume <id>` instead.

Lists are saved per session in `~/.claude/needs-me/<session id>.json`, so `claude --resume` brings a session's items back. Files older than 30 days are deleted.

### Optional: the count in the tab title

Claude Code sets the tab title itself, so the plugin can only write it when that is turned off. Add this to the `env` section of `~/.claude/settings.json`:

```json
"CLAUDE_CODE_DISABLE_TERMINAL_TITLE": "1"
```

The plugin then writes `✳ 📋 2 · <session topic>` (the `✳` while Claude is working), keeping the topic Claude Code generates.

### Requirements for switching tabs

Switching to another session's tab works on **macOS with Ghostty** only, through macOS Accessibility:

1. Open System Settings → Privacy & Security → Accessibility, or run
   `open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"`
2. Turn on **Ghostty** (add it with `+` if it isn't listed).

Everything else works in any terminal.

## Menu (needs-me-menu)

A narrow bar of icons along the right edge of the dock. Each entry runs a slash command and has a one-key shortcut: press `ctrl+x tab`, then the key.

```
/menu                                     show or hide the menu
/menu add [icon] <key> <command> <label>  e.g. /menu add r code-review Review
/menu remove <key>
/menu list
/menu icons                               icons picked when add gets none
```

Leave out the icon and one is picked from the command's name (`/menu icons` lists them), or `⚡`. The Needs me entry shows the open count next to its icon. The menu needs the needs-me plugin installed.

## Development

Each plugin is a hooks module in `<plugin>/hooks/register.tsx` with tests beside it:

```
claude plugin validate needs-me
claude plugin test needs-me
```

## License

MIT. See [LICENSE](LICENSE).
