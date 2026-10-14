# Needs me

A side pane in Claude Code that lists what Claude is waiting on you for: the questions it asked and the actions only you can do, such as logging in, running a command or checking a page.

## How items get in

- **Claude adds them.** The plugin gives Claude two tools, `add` and `resolve`, and a short instruction to track each question or action it hands you and to resolve it when you have answered.
- **From the end of a reply.** If a reply ends with a question Claude did not track, the last question is added and ticked off by itself when you send your next prompt.
- **You add them.** Type in the pane's text field, select text in the transcript and click `+ add selected text`, or run `/needs-me add <text>`.

## What you can do

- Click a row to scroll to the message it came from, outlined in yellow; click again to remove the outline.
- `↩` puts `> <question>` into the prompt. `💤` hides the item for an hour. `[ ✔ ]` ticks it off, with `↶ undo` for 10 seconds.
- Each row shows its age; items older than a day are dimmed.
- The open count shows on the status line (`📋 Needs me: 3`) and, optionally, in the terminal tab title.
- **Other sessions:** the pane lists open items from your other Claude Code sessions of the last 7 days. Clicking one switches to its terminal tab (macOS and Ghostty only), or copies `claude --resume <id>` when no tab has it.

## What it runs, reads and writes

Everything stays on your machine; the plugin makes no network requests.

| What | Why |
| --- | --- |
| Writes `~/.claude/needs-me/<session id>.json` | Saves each session's open items so `claude --resume` brings them back; deletes files older than 30 days with `rm -f` |
| Reads the other files in `~/.claude/needs-me/` | Shows other sessions' open items |
| Runs `sh` with `ls`, `tail` and `grep` on `~/.claude/projects/*/<session id>.jsonl` | Reads the session's topic (the last `ai-title` row of its transcript); nothing else from the transcript is read |
| Runs `osascript` (macOS) against System Events and Ghostty, only when you click another session | Finds the Ghostty tab whose title ends with that session's topic and switches to it; needs Accessibility permission for Ghostty |
| Runs `sh` with `ps`, only when `CLAUDE_CODE_DISABLE_TERMINAL_TITLE` is set | Finds the terminal device of the Claude Code process |
| Writes an OSC 2 escape sequence to that terminal device, only when `CLAUDE_CODE_DISABLE_TERMINAL_TITLE` is set | Sets the tab title to `✳ 📋 2 · <topic>` |
| Adds a short section to the system prompt | Tells Claude when to call `add` and `resolve` |

## Optional settings

To show the count in the tab title, add this to the `env` section of `~/.claude/settings.json` (Claude Code then stops setting the title itself, and this plugin writes it with the session topic kept):

```json
"CLAUDE_CODE_DISABLE_TERMINAL_TITLE": "1"
```

To switch tabs from the Other sessions list on macOS, turn on Ghostty under System Settings → Privacy & Security → Accessibility.
