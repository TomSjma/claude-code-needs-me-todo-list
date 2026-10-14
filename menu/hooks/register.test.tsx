import { expect, mock, test } from 'claude-code/testing'

const pane = (bodyColumns: number) => ({
  component: 'Pane',
  requestId: 'menu',
  props: {
    title: 'Menu',
    isFocused: true,
    bodyColumns,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const)
const PANE = { ...pane(28), props: { ...pane(28).props, placement: 'inline' } } as const

const menu = (args: string) => ({
  command: 'menu',
  args,
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 160 },
} as const)

test('Needs me is a default entry that runs its command', async ($, on) => {
  const ran: string[] = []
  on('command.run', { command: 'needs-me' }, () => {
    ran.push('needs-me')
    return { text: 'ok' }
  })
  const ui = await $.ui.mount({ plugin: 'menu', surface: 'terminal', ...PANE })
  expect((await ui.find({ key: 'run-o' }))?.text).toContain('Needs me')
  await ui.press({ key: 'run-o' })
  expect(ran).toEqual(['needs-me'])
})

test('add and remove change the menu', async ($, on) => {
  mock.store(on)
  const added = await $.command.run(menu('add 🔍 r code-review Review this'))
  expect(added.text).toContain('Review this')
  const ui = await $.ui.mount({ plugin: 'menu', surface: 'terminal', ...PANE })
  expect((await ui.find({ key: 'run-r' }))?.text).toContain('🔍 Review this')

  const bad = await $.command.run(menu('add 🔍 RR x y'))
  expect(bad.text).toContain('one lowercase letter')

  await $.command.run(menu('remove r'))
  expect(await ui.find({ key: 'run-r' })).toBeUndefined()
})

test('the dock shows icons only, at any width', async ($) => {
  const ui = await $.ui.mount({ plugin: 'menu', surface: 'terminal', ...pane(40) })
  const text = (await ui.find({ key: 'run-o' }))?.text ?? ''
  expect(text).toContain('📋')
  expect(text).not.toContain('Needs me')
})

test('add without an icon picks one from the command', async ($, on) => {
  mock.store(on)
  await $.command.run(menu('add r code-review Review'))
  await $.command.run(menu('add z unknown-thing Other'))
  const ui = await $.ui.mount({ plugin: 'menu', surface: 'terminal', ...PANE })
  expect((await ui.find({ key: 'run-r' }))?.text).toContain('🔎 Review')
  expect((await ui.find({ key: 'run-z' }))?.text).toContain('⚡ Other')
})

test('the Needs me entry shows how many items wait', async ($, on) => {
  on('state.get', { plugin: 'needs-me', key: 'count' }, () => ({ value: { value: 3, version: 1 } }))
  const ui = await $.ui.mount({ plugin: 'menu', surface: 'terminal', ...pane(6) })
  expect((await ui.find({ key: 'run-o' }))?.text).toContain('📋3')
})
