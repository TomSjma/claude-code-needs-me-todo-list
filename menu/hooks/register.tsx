import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { MenuEntry } from '../types'

const PANE = 'menu'
const STORE_KEY = 'entries'
const BAR_COLUMNS = 6
const ICONS: Record<string, string> = {
  'needs-me': '📋',
  'code-review': '🔎',
  review: '👀',
  'security-review': '🛡',
  simplify: '🧹',
  init: '🌱',
  loop: '🔁',
  test: '🧪',
  explain: '💡',
  commit: '📝',
  pr: '🚀',
  debug: '🐛',
  plan: '🗺',
  docs: '📚',
}
const FALLBACK_ICON = '⚡'
const DEFAULTS: MenuEntry[] = [
  { icon: '📋', hotkey: 'o', command: 'needs-me', label: 'Needs me' },
]
const needsMeCount = { plugin: 'needs-me', key: 'count' } as const
const entries = atom({ plugin: 'menu', key: 'entries' } as const, DEFAULTS)

const USAGE = `Usage:
  /menu                                    show or hide the menu
  /menu add [icon] <key> <command> <label> e.g. /menu add r code-review Review
  /menu remove <key>
  /menu list
  /menu icons                              icons picked when add gets none`

const save = async ($: EngineInterface, next: MenuEntry[]) => {
  await update($, entries, () => next)
  await $.store.set(STORE_KEY, next)
}

const toggle = async ($: EngineInterface) => {
  const isOpen = (await $.ui.panes()).some(pane => pane.id === PANE)
  if (isOpen) {
    await $.ui.close({ id: PANE })
    return 'Menu hidden.'
  }
  await $.ui.open({ id: PANE, title: 'Menu', columns: BAR_COLUMNS })
  return 'Menu shown. ctrl+x tab, then a key, runs an entry.'
}

const run = async ($: EngineInterface, entry: MenuEntry) => {
  const [command = '', ...rest] = entry.command.split(' ')
  try {
    await $.command.run({ command, args: rest.join(' ') })
  } catch {
    await $.prompt.fill({ text: `/${entry.command} `, mode: 'replace' })
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const stored = await $.store.get(STORE_KEY)
    if (Array.isArray(stored)) await update($, entries, () => stored as MenuEntry[])

    await $.command.register({
      name: 'menu',
      description: 'Show or hide the menu sidebar; add, remove or list entries',
      argumentHint: '[add <icon> <key> <command> <label> | remove <key> | list]',
    })
    void $.ui.open({ id: PANE, title: 'Menu', columns: BAR_COLUMNS })

    return next(e)
  })

  on('command.run', { command: 'menu' }, async ($, e) => {
    const [sub = '', ...words] = e.args.trim().split(/\s+/).filter(Boolean)
    const list = await read($, entries)

    if (sub === '') return { text: await toggle($) }

    if (sub === 'list') {
      const lines = list.map(one => `${one.hotkey}  ${one.icon} ${one.label}  → /${one.command}`)
      return { text: lines.length > 0 ? lines.join('\n') : 'The menu is empty.' }
    }

    if (sub === 'icons') {
      return { text: Object.entries(ICONS).map(([command, icon]) => `${icon}  /${command}`).join('\n') }
    }

    if (sub === 'add') {
      if (/^[a-z0-9]$/.test(words[0] ?? '')) {
        const name = (words[1] ?? '').replace(/^\//, '').split(' ')[0] ?? ''
        words.unshift(ICONS[name] ?? FALLBACK_ICON)
      }
      const [icon, hotkey, command, ...label] = words
      if (!icon || !hotkey || !command || label.length === 0) return { text: USAGE }
      if (!/^[a-z0-9]$/.test(hotkey)) return { text: 'The key must be one lowercase letter or digit.' }
      const entry: MenuEntry = { icon, hotkey, command: command.replace(/^\//, ''), label: label.join(' ') }
      await save($, [...list.filter(one => one.hotkey !== hotkey), entry])
      return { text: `Added ${icon} ${entry.label} on "${hotkey}".` }
    }

    if (sub === 'remove') {
      const hotkey = words[0] ?? ''
      if (!list.some(one => one.hotkey === hotkey)) return { text: `No entry on "${hotkey}".` }
      await save($, list.filter(one => one.hotkey !== hotkey))
      return { text: `Removed the entry on "${hotkey}".` }
    }

    return { text: USAGE }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, entries)
    const isBar = e.props.placement === 'dock'
    const { value: waiting = 0 } = await $.state.get(needsMeCount)
    const badge = (entry: MenuEntry) => (entry.command === 'needs-me' && waiting > 0 ? String(waiting) : '')

    return (
      <Box flexDirection={isBar ? 'column' : 'row'} alignItems={isBar ? 'flex-end' : 'flex-start'} gap={1}>
        {list.length === 0 && <Text dimColor>{isBar ? '∅' : 'Empty. /menu add …'}</Text>}
        {list.map(entry => (
          <Button
            key={`run-${entry.hotkey}`}
            plain
            hotkey={entry.hotkey}
            label={isBar ? `${entry.icon}${badge(entry)}` : `${entry.icon} ${entry.label}${badge(entry) && ` (${badge(entry)})`}`}
            onPress={() => run($, entry)}
          />
        ))}
      </Box>
    )
  })
}
