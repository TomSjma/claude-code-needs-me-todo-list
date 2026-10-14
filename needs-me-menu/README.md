# Needs me menu

A narrow bar of icons that runs your slash commands with a one-key shortcut. In fullscreen mode it docks beside the transcript with the icons lined up against the right edge; otherwise it shows as one row of icons and names above the prompt. Press `ctrl+x tab`, then an entry's key, to run it without the mouse.

## Commands

```
/menu                                     show or hide the menu
/menu add [icon] <key> <command> <label>  e.g. /menu add r code-review Review
/menu remove <key>
/menu list
/menu icons                               icons picked when add gets none
```

The key is one lowercase letter or digit. Leave out the icon and one is picked from the command's name (`/menu icons` lists them), or `⚡`.

The default entry is `📋` for `/needs-me`, which shows the number of open items next to its icon (`📋3`). This plugin needs the `needs-me` plugin from the same repository.

## What it runs, reads and writes

- Saves your entries in the plugin's own Claude Code store.
- Runs the slash command of the entry you press, through Claude Code; when the command cannot run directly, it puts `/<command> ` into the prompt instead.
- Reads the open count that the `needs-me` plugin publishes.

It runs no programs, reads no files and makes no network requests.
