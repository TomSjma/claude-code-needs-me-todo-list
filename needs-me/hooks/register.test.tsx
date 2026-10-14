import { expect, mock, test } from 'claude-code/testing'
import type { Engine, TestBody } from 'claude-code/testing'

type On = Parameters<TestBody>[1]

import { lastQuestion } from './question.js'

const PANE = {
  component: 'Pane',
  requestId: 'needs-me',
  props: {
    title: 'Needs me',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const DIR = '/home/me/.claude/needs-me'
const MINUTE = 60_000

const world = (
  on: On,
  options: { files?: Record<string, string>; ownsTitle?: boolean; isPlaced?: boolean; sessionId?: () => string } = {},
) => {
  const files: Record<string, string> = { ...options.files }
  const titles: string[] = []
  const statuses: (string | undefined)[] = []
  const toasts: string[] = []
  const focused: string[] = []
  const clock = mock.clock(on, { now: 1_000_000_000_000 })
  mock.env(on, {
    HOME: '/home/me',
    ...(options.ownsTitle ? { CLAUDE_CODE_DISABLE_TERMINAL_TITLE: '1' } : {}),
  })
  on('session.id', () => ({ value: options.sessionId?.() ?? 'session-a' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.register', (_, e) => ({ value: { tool: `mcp__needs-me__${e.name}` } }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: options.isPlaced === false ? { isPlaced: false, reason: 'narrow' } : { isPlaced: true } }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.status', (_, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  on('fs.read', (_, e) => {
    const text = files[e.path]
    if (text === undefined) throw new Error(`ENOENT ${e.path}`)
    return { value: text }
  })
  on('fs.write', (_, e) => {
    files[e.path] = e.text
    return { value: undefined }
  })
  on('fs.exists', (_, e) => ({ value: e.path in files }))
  on('fs.list', (_, e) => ({
    value: Object.keys(files)
      .filter(path => path.startsWith(`${e.path}/`))
      .map(path => ({
        name: path.slice(e.path.length + 1),
        kind: 'file' as const,
        size: files[path]?.length ?? 0,
        mtimeMs: clock.now(),
        isLink: false,
      })),
  }))
  on('process.run', (_, e) => {
    const [command, , script = '', , title = ''] = e.argv
    const ran = (stdout = '') => ({
      value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    })
    if (command === 'osascript') {
      focused.push(String(e.argv[2]))
      return ran(['Fix login bug', 'Todo mod demo setup'].includes(String(e.argv[2])) ? 'switched\n' : 'no tab\n')
    }
    if (command === 'rm') {
      delete files[e.argv[2] ?? '']
      return ran()
    }
    if (script.includes('ps -o tty')) return ran('/dev/ttys009\n')
    if (script.includes('ai-title')) {
      const topics: Record<string, string> = { 'session-a': 'Vertical right-edge menu bar', 'session-d': 'Todo mod demo setup' }
      const topic = e.argv[5] === '/home/me' ? topics[String(e.argv[4])] : undefined
      return ran(topic ? `{"type":"ai-title","aiTitle":"${topic}"}\n` : '')
    }
    if (script.includes('033]2')) titles.push(title)
    return ran()
  })

  return { files, titles, statuses, toasts, focused, clock }
}

const start = ($: Engine) =>
  $.session.start({ cwd: '/Users/me/my-app', surface: 'terminal', isInteractive: true })

const add = ($: Engine, id: string, text: string, kind = 'question') =>
  $.tool.call({ tool: 'mcp__needs-me__add', tool_use_id: `toolu_${id}`, kind, text })

const reply = ($: Engine, turnId: string, answer: string) =>
  $.turn.complete({ answer, durationMs: 10, isAborted: false, turnId, reason: 'answer' })

const typed = ($: Engine, text: string) =>
  $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })

const answerTurns = (on: On) => {
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
}

test('tracks, shows and resolves items on every surface', async ($, on) => {
  world(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const added = await add($, `abc${surface}`, 'Which branch?')
    expect(added.deny).toBeUndefined()

    const ui = await $.ui.mount({ plugin: 'needs-me', surface, ...PANE })
    const id = `abc${surface}`.slice(-6)
    expect((await ui.find({ key: `go-${id}` }))?.text).toContain('Which branch?')
    await ui.press({ key: `done-${id}` })
    expect(await ui.find({ type: 'Text', text: /Nothing open/ })).toBeDefined()
    await ui.unmount()
  }
})

test('resolve removes by id and reports unknown ids', async ($, on) => {
  world(on)
  await add($, 'x123456', 'Log in', 'action')
  const done = await $.tool.call({ tool: 'mcp__needs-me__resolve', id: '123456' })
  expect(done.result).toBe('Resolved 123456')
  const again = await $.tool.call({ tool: 'mcp__needs-me__resolve', id: '123456' })
  expect(again.result).toBe('No open item 123456')
})

test('a new item toasts when the pane cannot be placed', async ($, on) => {
  const { toasts } = world(on, { isPlaced: false })
  await add($, 't999999', 'Ship it?')
  expect(toasts[0]).toContain('Ship it?')
})

test('lastQuestion takes the last question of the final paragraph', async () => {
  expect(lastQuestion('Done.\n\nWant the safety net, and should I set up the repo?')).toBe(
    'Want the safety net, and should I set up the repo?',
  )
  expect(lastQuestion('Is it **fine**? Yes.\n\nAll done.')).toBeUndefined()
  expect(lastQuestion('- 1. Does ctrl+x ctrl+a bring it back?')).toBe('Does ctrl+x ctrl+a bring it back?')
})

test('clicking an item frames its message, clicking again removes the frame, and so does ticking it off', async ($, on) => {
  world(on)
  const redraws: string[] = []
  on('ui.invalidate', (_, e) => {
    redraws.push(e.event)
    return { value: undefined }
  })
  on('ui.selection', () => ({ value: { text: 'merge it today', requestId: 'msg-1' } }))
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.text}</Text>
  })
  const MESSAGE = {
    component: 'AssistantMessage',
    requestId: 'msg-1',
    props: { text: 'Should we merge it today or wait?', isFirstOfReply: true },
  } as const

  const pane = await $.ui.mount({ plugin: 'needs-me', surface: 'terminal', ...PANE })
  await pane.press({ key: 'add-selection' })
  const message = await $.ui.mount({ plugin: 'needs-me', surface: 'terminal', ...MESSAGE })
  expect(await message.find({ type: 'Box' })).toBeUndefined()

  const row = (await pane.findAll({ type: 'Button' })).find(one => one.key?.startsWith('go-'))
  await pane.press({ key: String(row?.key) })
  expect(await message.find({ type: 'Box' })).toBeDefined()
  expect((await message.findAll({ type: 'Text' })).map(one => one.text)).toContain('merge it today')

  await pane.press({ key: String(row?.key) })
  expect(await message.find({ type: 'Box' })).toBeUndefined()
  await pane.press({ key: String(row?.key) })
  expect(await message.find({ type: 'Box' })).toBeDefined()

  await pane.press({ key: String(row?.key).replace('go-', 'done-') })
  expect(await message.find({ type: 'Box' })).toBeUndefined()
  expect(redraws).toEqual(['ui.render', 'ui.render', 'ui.render', 'ui.render'])
})

test('/needs-me brings a pane hidden behind another tab to the front', async ($, on) => {
  const calls: string[] = []
  let isShown = false
  on('ui.open', (_, e) => {
    calls.push(`open:${e.focus === true}`)
    isShown = calls.includes('close')
    return { value: { isPlaced: true } }
  })
  on('ui.close', () => {
    calls.push('close')
    return { value: undefined }
  })
  on('ui.panes', () => ({ value: [{ id: 'needs-me', title: 'Needs me', isShown, isFocused: false, isPlaced: true }] }))
  await $.command.run({ command: 'needs-me', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })
  expect(calls).toEqual(['open:true', 'close', 'open:true'])
})

test('typing your own item in the pane adds it', async ($, on) => {
  world(on)
  const pane = await $.ui.mount({ plugin: 'needs-me', surface: 'terminal', ...PANE })
  await pane.input({ key: 'add-own', text: '  Check the   staging deploy ' })

  const row = (await pane.findAll({ type: 'Button' })).find(one => one.key?.startsWith('go-'))
  expect(row?.text).toContain('Check the staging deploy')
})

test('the list is saved to its own file per session, and the file goes when the list empties', async ($, on) => {
  const { files } = world(on)
  await start($)
  await add($, 'keep01', 'Keep me?')
  await add($, 'drop01', 'Drop me', 'action')
  await $.tool.call({ tool: 'mcp__needs-me__resolve', id: 'drop01' })

  const saved = JSON.parse(files[`${DIR}/session-a.json`] ?? '{}')
  expect(saved.cwd).toBe('/Users/me/my-app')
  expect(saved.items.map((item: { text: string }) => item.text)).toEqual(['Keep me?'])

  await $.tool.call({ tool: 'mcp__needs-me__resolve', id: 'keep01' })
  expect(files[`${DIR}/session-a.json`]).toBeUndefined()
})

test('other sessions: clicking one switches to its tab, or copies the resume command when no tab has it', async ($, on) => {
  const item = (id: string, text: string) => ({ id, kind: 'question', text, anchor: '' })
  const list = (sessionId: string, topic: string, items: unknown[]) =>
    JSON.stringify({ sessionId, cwd: '/Users/me/website', topic, savedAt: 0, items })
  const { focused } = world(on, {
    files: {
      [`${DIR}/session-a.json`]: list('session-a', '', [item('keep01', 'Keep me?')]),
      [`${DIR}/session-b.json`]: list('session-b', 'Fix login bug', [item('other1', 'Merge it?')]),
      [`${DIR}/session-c.json`]: list('session-c', 'Closed long ago', [item('other2', 'Still there?')]),
      [`${DIR}/session-d.json`]: list('session-d', '', [item('other3', 'Saved before topics were?')]),
    },
  })
  const copied: string[] = []
  on('ui.copy', (_, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } }
  })
  await start($)

  const ui = await $.ui.mount({ plugin: 'needs-me', surface: 'terminal', ...PANE })
  expect((await ui.find({ key: 'go-keep01' }))?.text).toContain('Keep me?')
  expect((await ui.find({ key: 'session-session-b' }))?.text).toContain('Fix login bug')
  expect(await ui.find({ type: 'Text', text: /Merge it\?/ })).toBeDefined()

  await ui.press({ key: 'session-session-b' })
  expect(focused).toEqual(['Fix login bug'])
  expect(copied).toEqual([])

  await ui.press({ key: 'session-session-c' })
  expect(copied).toEqual(['claude --resume session-c'])

  expect((await ui.find({ key: 'session-session-d' }))?.text).toContain('Todo mod demo setup')
  await ui.press({ key: 'session-session-d' })
  expect(focused).toEqual(['Fix login bug', 'Closed long ago', 'Todo mod demo setup'])
})

test('a question taken from a reply is ticked off by the next typed prompt; others stay', async ($, on) => {
  world(on)
  answerTurns(on)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  await add($, 'track1', 'Log in to the issue tracker', 'action')
  await $.turn.start({ text: 'merge?', turnId: 'turn-0001' })
  await reply($, 'turn-0001', 'Done.\n\nShould I merge it?')
  const ui = await $.ui.mount({ plugin: 'needs-me', surface: 'terminal', ...PANE })
  expect((await ui.find({ key: 'go-n-0001' }))?.text).toContain('Should I merge it?')

  await typed($, '/menu')
  expect(await ui.find({ key: 'go-n-0001' })).toBeDefined()
  await typed($, 'yes, merge it')
  expect(await ui.find({ key: 'go-n-0001' })).toBeUndefined()
  expect(await ui.find({ key: 'go-track1' })).toBeDefined()
})

test('a ticked item can be undone for 10 seconds', async ($, on) => {
  const { clock } = world(on)
  await add($, 'tick01', 'Ship it?')
  const ui = await $.ui.mount({ plugin: 'needs-me', surface: 'terminal', ...PANE })

  await ui.press({ key: 'done-tick01' })
  await ui.press({ key: 'undo' })
  expect(await ui.find({ key: 'go-tick01' })).toBeDefined()

  await ui.press({ key: 'done-tick01' })
  expect((await ui.find({ key: 'undo' }))?.text).toContain('(10s)')
  await clock.advance(3_000)
  expect((await ui.find({ key: 'undo' }))?.text).toContain('(7s)')
  await clock.advance(7_000)
  expect(await ui.find({ key: 'undo' })).toBeUndefined()
  expect(await ui.find({ key: 'go-tick01' })).toBeUndefined()
})

test('snooze hides an item for an hour and lowers the count; age is shown', async ($, on) => {
  const { clock, statuses } = world(on)
  await start($)
  await add($, 'nap001', 'Review the PR?')
  await clock.advance(5 * MINUTE)
  const ui = await $.ui.mount({ plugin: 'needs-me', surface: 'terminal', ...PANE })
  expect((await ui.find({ key: 'go-nap001' }))?.text).toMatch(/^ 5m \? Review the PR\?/)
  expect(statuses.at(-1)).toBe('📋 Needs me: 1')

  await ui.press({ key: 'snooze-nap001' })
  expect(await ui.find({ key: 'go-nap001' })).toBeUndefined()
  expect((await ui.find({ key: 'wake' }))?.text).toContain('1 snoozed')
  expect(statuses.at(-1)).toBeUndefined()

  await clock.advance(61 * MINUTE)
  expect(await ui.find({ key: 'go-nap001' })).toBeDefined()
  expect(statuses.at(-1)).toBe('📋 Needs me: 1')
})

test('reply puts the question into the prompt', async ($, on) => {
  world(on)
  const filled: string[] = []
  on('prompt.fill', (_, e) => {
    filled.push(e.text)
    return { isFilled: true }
  })
  await add($, 'ask001', 'Which branch?')
  const ui = await $.ui.mount({ plugin: 'needs-me', surface: 'terminal', ...PANE })
  await ui.press({ key: 'reply-ask001' })
  expect(filled).toEqual(['> Which branch?\n\n'])
})

test('with the terminal title handed over, the tab shows the count and the topic', async ($, on) => {
  const { titles } = world(on, { ownsTitle: true })
  answerTurns(on)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  await start($)
  expect(titles.at(-1)).toBe('Vertical right-edge menu bar')

  await add($, 'tab001', 'Ship it?')
  expect(titles.at(-1)).toBe('📋 1 · Vertical right-edge menu bar')
  await $.turn.start({ text: 'go', turnId: 'turn-9' })
  expect(titles.at(-1)).toBe('✳ 📋 1 · Vertical right-edge menu bar')
  await reply($, 'turn-9', 'All done.')
  expect(titles.at(-1)).toBe('📋 1 · Vertical right-edge menu bar')
})

test('without the title handed over, the tab title is left alone', async ($, on) => {
  const { titles } = world(on)
  await start($)
  await add($, 'tab002', 'Ship it?')
  expect(titles).toEqual([])
})

test('a resumed session whose id arrives late still finds its own list and not as another session', async ($, on) => {
  let id = 'fresh-id'
  const saved = { sessionId: 'session-a', cwd: '/a', topic: '', savedAt: 0, items: [{ id: 'keep01', kind: 'action', text: 'seconds after', anchor: '' }] }
  const { files, clock } = world(on, { sessionId: () => id, files: { [`${DIR}/session-a.json`]: JSON.stringify(saved) } })
  await start($)
  await add($, 'new001', 'Added before the id settled', 'action')
  id = 'session-a'
  await clock.advance(2_000)

  const ui = await $.ui.mount({ plugin: 'needs-me', surface: 'terminal', ...PANE })
  expect((await ui.find({ key: 'go-keep01' }))?.text).toContain('seconds after')
  expect((await ui.find({ key: 'go-new001' }))?.text).toContain('Added before the id settled')
  expect(await ui.find({ key: 'session-session-a' })).toBeUndefined()
  expect(Object.keys(files)).toEqual([`${DIR}/session-a.json`])
})
