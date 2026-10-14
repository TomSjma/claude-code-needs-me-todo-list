import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Highlight, OpenItem, SessionList } from '../types'
import { lastQuestion } from './question.js'
import { age, findTty, focusTab, readTopic, tabTitle, writeTitle } from './terminal.js'

const PANE = 'needs-me'
const ADD = 'mcp__needs-me__add'
const RESOLVE = 'mcp__needs-me__resolve'
const UNDO_MS = 10_000
const SNOOZE_MS = 60 * 60_000
const OLD_MS = 24 * 60 * 60_000
const OTHER_SESSIONS_MS = 7 * OLD_MS
const PRUNE_MS = 30 * OLD_MS
const items = atom({ plugin: 'needs-me', key: 'items' } as const, [])
const highlight = atom({ plugin: 'needs-me', key: 'highlight' } as const, null)
const undo = atom({ plugin: 'needs-me', key: 'undo' } as const, null)
const now = atom({ plugin: 'needs-me', key: 'now' } as const, 0)
const count = atom({ plugin: 'needs-me', key: 'count' } as const, 0)

const GUIDANCE = `# Needs me
When you end a message with a question you need the user to answer, or an action only the user can do (run a command, log in, approve something, check a UI), call ${ADD} once per item, right where you raise it, with a short one-line text. Do not track rhetorical or optional offers.
When the user answers a question or says an action is done, call ${RESOLVE} with its id in the same turn.`

const session = {
  id: '',
  home: '',
  cwd: '',
  dir: '',
  topic: '',
  tty: undefined as string | undefined,
  isWorking: false,
  lastTitle: '',
}

const folderName = (path: string) => path.split('/').filter(Boolean).pop() ?? path

const isAwake = (item: OpenItem, at: number) => !item.snoozedUntil || item.snoozedUntil <= at

const listFile = (sessionId: string) => `${session.dir}/${sessionId}.json`

const refreshCount = async ($: EngineInterface) => {
  const at = await $.clock.now()
  const open = (await read($, items)).filter(item => isAwake(item, at)).length
  await update($, count, () => open)
  $.ui.status(open > 0 ? `📋 Needs me: ${open}` : undefined)
  if (!session.tty) return
  const title = tabTitle(session.topic || folderName(session.cwd), open, session.isWorking)
  if (title === session.lastTitle) return
  session.lastTitle = title
  await writeTitle($, session.tty, title).catch(() => undefined)
}

const save = async ($: EngineInterface) => {
  await syncId($)
  if (!session.id || !session.dir) return
  const list = await read($, items)
  const file = listFile(session.id)
  try {
    if (list.length === 0) {
      if (await $.fs.exists(file)) await $.process.run(['rm', '-f', file])
      return
    }
    const saved: SessionList = {
      sessionId: session.id,
      cwd: session.cwd,
      topic: session.topic,
      savedAt: await $.clock.now(),
      items: list,
    }
    await $.fs.write(file, JSON.stringify(saved))
  } catch (error) {
    $.ui.log(`needs-me: could not save the list: ${String(error)}`)
  }
}

const setItems = async ($: EngineInterface, change: (list: OpenItem[]) => OpenItem[]) => {
  await update($, items, change)
  await save($)
  await refreshCount($)
}

const readList = async ($: EngineInterface, file: string): Promise<SessionList | undefined> => {
  try {
    const text = await $.fs.read(file)
    return text.trim() ? (JSON.parse(text) as SessionList) : undefined
  } catch {
    return undefined
  }
}

const otherSessions = async ($: EngineInterface): Promise<SessionList[]> => {
  if (!session.dir) return []
  const own = new Set([`${session.id}.json`, `${await $.session.id().catch(() => session.id)}.json`])
  const at = await $.clock.now()
  const entries = await $.fs.list(session.dir).catch(() => [])
  const lists = await Promise.all(
    entries
      .filter(entry => entry.kind === 'file' && entry.name.endsWith('.json'))
      .filter(entry => !own.has(entry.name) && at - entry.mtimeMs < OTHER_SESSIONS_MS)
      .map(entry => readList($, `${session.dir}/${entry.name}`)),
  )

  const found = lists.filter((list): list is SessionList => list !== undefined)
  for (const list of found) {
    if (!list.topic) list.topic = (await readTopic($, list.sessionId, session.home).catch(() => undefined)) ?? ''
  }

  return found
    .map(list => ({ ...list, items: list.items.filter(item => isAwake(item, at)) }))
    .filter(list => list.items.length > 0)
    .sort((a, b) => b.savedAt - a.savedAt)
}

// A resumed session reports a fresh id at start and its own id later, so the list follows the id.
const syncId = async ($: EngineInterface) => {
  if (!session.dir) return
  const id = await $.session.id().catch(() => session.id)
  if (!id || id === session.id) return
  const old = session.id
  session.id = id
  const saved = await readList($, listFile(id))
  if (saved) {
    await update($, items, list => [...saved.items, ...list.filter(one => !saved.items.some(s => s.id === one.id))])
  }
  if (old) await $.process.run(['rm', '-f', listFile(old)]).catch(() => undefined)
  await save($)
  await refreshCount($)
}

const pruneOld = async ($: EngineInterface) => {
  const at = await $.clock.now()
  for (const entry of await $.fs.list(session.dir).catch(() => [])) {
    if (entry.kind === 'file' && at - entry.mtimeMs > PRUNE_MS) {
      await $.process.run(['rm', '-f', `${session.dir}/${entry.name}`]).catch(() => undefined)
    }
  }
}

const startSession = async ($: EngineInterface, cwd: string) => {
  try {
    const home = await $.env.get('HOME')
    session.home = home ?? ''
    session.cwd = cwd
    session.dir = home ? `${home}/.claude/needs-me` : ''
    if (session.dir) {
      await syncId($)
      await pruneOld($)
    }
    if (await $.env.get('CLAUDE_CODE_DISABLE_TERMINAL_TITLE')) session.tty = await findTty($)
    session.topic = (await readTopic($, session.id, session.home).catch(() => undefined)) ?? ''
    if (session.topic) await save($)
  } catch (error) {
    $.ui.log(`needs-me: started without saving or tab title: ${String(error)}`)
  }
  await refreshCount($)
}

const refreshTopic = async ($: EngineInterface) => {
  await syncId($)
  if (!session.id) return
  const topic = (await readTopic($, session.id, session.home).catch(() => undefined)) ?? session.topic
  if (topic !== session.topic) {
    session.topic = topic
    await save($)
  }
  await refreshCount($)
}

const keepTime = async ($: EngineInterface) => {
  for (let tick = 0; ; tick += 1) {
    await syncId($)
    const at = await $.clock.now()
    await update($, now, () => at)
    await refreshCount($)
    await $.clock.sleep(tick < 15 ? 2_000 : 60_000)
  }
}

const addItem = async ($: EngineInterface, item: OpenItem) => {
  const stamped = { ...item, addedAt: item.addedAt ?? (await $.clock.now()) }
  await setItems($, list => [...list, stamped])
  const opened = await $.ui.open({ id: PANE, title: 'Needs me' })
  if (!opened.isPlaced) {
    $.ui.toast(`Needs me: ${item.text} (/needs-me to see all)`)
  }
}

const showPane = async ($: EngineInterface) => {
  await $.ui.open({ id: PANE, title: 'Needs me', focus: true })
  const pane = (await $.ui.panes()).find(one => one.id === PANE)
  if (pane && !pane.isShown) {
    await $.ui.close({ id: PANE })
    await $.ui.open({ id: PANE, title: 'Needs me', focus: true })
  }
}

const setHighlight = async ($: EngineInterface, change: (lit: Highlight | null) => Highlight | null) => {
  const before = await read($, highlight)
  await update($, highlight, change)
  if ((await read($, highlight)) !== before) $.ui.invalidate('ui.render')
}

const resolveItem = async ($: EngineInterface, item: OpenItem) => {
  await setItems($, list => list.filter(one => one.id !== item.id))
  await setHighlight($, lit => (lit?.anchor === item.anchor ? null : lit))
}

const tickOff = async ($: EngineInterface, item: OpenItem) => {
  await resolveItem($, item)
  const until = (await $.clock.now()) + UNDO_MS
  await update($, undo, () => ({ item, until }))
  void countDown($, until).catch(() => undefined)
}

const countDown = async ($: EngineInterface, until: number) => {
  for (let left = UNDO_MS; left > 0; left -= 1000) {
    await $.clock.sleep(1000)
    if ((await read($, undo))?.until !== until) return
    const at = await $.clock.now()
    await update($, now, () => at)
  }
  await update($, undo, last => (last?.until === until ? null : last))
}

const undoTick = async ($: EngineInterface) => {
  const last = await read($, undo)
  if (!last) return
  await update($, undo, () => null)
  await setItems($, list => [...list.filter(one => one.id !== last.item.id), last.item])
}

const snooze = async ($: EngineInterface, item: OpenItem) => {
  const until = (await $.clock.now()) + SNOOZE_MS
  await setItems($, list => list.map(one => (one.id === item.id ? { ...one, snoozedUntil: until } : one)))
}

const wakeAll = ($: EngineInterface) =>
  setItems($, list => list.map(({ snoozedUntil: _, ...one }) => one))

const addOwn = async ($: EngineInterface, typed: string): Promise<string> => {
  const text = typed.replace(/\s+/g, ' ').trim().slice(0, 200)
  if (!text) return 'Type a description first.'
  await addItem($, { id: crypto.randomUUID().slice(-6), kind: 'action', text, anchor: '' })

  return `Added to Needs me: ${text}`
}

const fromSelection = async ($: EngineInterface): Promise<string> => {
  const selected = await $.ui.selection()
  const text = selected?.text.replace(/\s+/g, ' ').trim()
  if (!selected || !text) return 'Select text in the transcript with the mouse first.'
  await addItem($, {
    id: crypto.randomUUID().slice(-6),
    kind: 'action',
    text: text.slice(0, 200),
    anchor: selected.requestId ?? '',
    quote: selected.text.trim(),
  })

  return `Added to Needs me: ${text.slice(0, 60)}`
}

const cut = (text: string, width: number) => (text.length > width ? `${text.slice(0, width - 1)}…` : text)

export const register: Register = on => {
  let isTrackedThisTurn = false
  let questionRow = ''
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'add',
      description:
        'Track an open question you need the user to answer, or an action the user must do. Returns the item id.',
      isDeferred: false,
      inputSchema: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['question', 'action'] },
          text: { type: 'string', description: 'One line, under 80 characters' },
        },
        required: ['kind', 'text'],
      },
    })
    await $.tool.register({
      name: 'resolve',
      description: 'Remove an open item once the user answered it or did it.',
      isDeferred: false,
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    })
    await $.command.register({
      name: 'needs-me',
      description: 'Show what needs you; "add" adds the selected text or the words after it',
      argumentHint: '[add [text]]',
    })
    await startSession($, e.cwd)
    void keepTime($).catch(() => undefined)
    void $.ui.open({ id: PANE, title: 'Needs me' })

    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)

    return {
      sections: [
        ...composed.sections,
        { id: 'needs-me:guidance', text: GUIDANCE, scope: 'session' },
      ],
    }
  })

  on('command.run', { command: 'needs-me' }, async ($, e) => {
    const [sub = '', ...words] = e.args.trim().split(/\s+/).filter(Boolean)
    if (sub === 'add' && words.length > 0) return { text: await addOwn($, words.join(' ')) }
    if (sub === 'add') return { text: await fromSelection($) }

    await showPane($)

    return { text: 'Needs me pane opened.' }
  })

  on('turn.start', async ($, e, next) => {
    isTrackedThisTurn = false
    questionRow = ''
    session.isWorking = true
    await refreshCount($)

    return next(e)
  })

  on('session.append', async ($, e, next) => {
    const stored = await next(e)
    const isMainReply = e.door === 'response' && e.agentId === undefined
    const hasQuestion = e.message.content.some(
      block => block.type === 'text' && String(block.text).includes('?'),
    )
    if (isMainReply && hasQuestion && stored.uuid) questionRow = stored.uuid

    return stored
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined) return done

    session.isWorking = false
    const question = lastQuestion(e.answer)
    if (e.reason === 'answer' && !isTrackedThisTurn && question) {
      await addItem($, {
        id: e.turnId.slice(-6),
        kind: 'question',
        text: question,
        anchor: questionRow,
        quote: question,
        fromReply: true,
      })
    }
    await refreshTopic($)

    return done
  })

  on('tool.call', { tool: ADD }, async ($, e) => {
    const input = e as unknown as { kind?: string; text?: string; tool_use_id: string }
    const item: OpenItem = {
      id: e.tool_use_id.slice(-6),
      kind: input.kind === 'action' ? 'action' : 'question',
      text: String(input.text ?? '').slice(0, 200),
      anchor: e.tool_use_id,
    }
    isTrackedThisTurn = true
    await addItem($, item)

    return { result: `Tracked as ${item.id}` }
  })

  on('tool.call', { tool: RESOLVE }, async ($, e) => {
    const id = String((e as unknown as { id?: string }).id ?? '')
    const item = (await read($, items)).find(one => one.id === id)
    if (!item) {
      return { result: `No open item ${id}` }
    }
    await resolveItem($, item)

    return { result: `Resolved ${id}` }
  })

  on('prompt.submit', async ($, e, next) => {
    await setHighlight($, () => null)
    const isTypedPrompt = e.origin.kind === 'composer' && !e.text.trimStart().startsWith('/')
    if (isTypedPrompt && (await read($, items)).some(item => item.fromReply)) {
      await setItems($, list => list.filter(item => !item.fromReply))
    }

    return next(e)
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const lit = await read($, highlight)
    if (lit?.anchor !== e.requestId) return next(e)

    const { Box, Text, Markdown } = $.ui.resolve(e)
    const paragraphs = e.props.text.split(/\n\s*\n/)
    const at = lit.quote ? paragraphs.findIndex(one => one.includes(lit.quote ?? '')) : -1
    if (!lit.quote || at === -1) {
      return <Box borderStyle="round" borderColor="yellow" flexDirection="column">{await next(e)}</Box>
    }

    const before = paragraphs.slice(0, at).join('\n\n')
    const after = paragraphs.slice(at + 1).join('\n\n')
    const [head = '', ...tail] = (paragraphs[at] ?? '').split(lit.quote)

    return (
      <Box borderStyle="round" borderColor="yellow" flexDirection="column">
        {before && <Markdown text={before} />}
        <Text>
          <Text color="yellow">▶ </Text>
          {head}
          <Text backgroundColor="yellow" color="black" bold>
            {lit.quote}
          </Text>
          {tail.join(lit.quote)}
        </Text>
        {after && <Markdown text={after} />}
      </Box>
    )
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const lit = await read($, highlight)
    if (lit?.anchor !== e.requestId) return next(e)
    const { Box } = $.ui.resolve(e)

    return <Box borderStyle="round" borderColor="yellow" flexDirection="column">{await next(e)}</Box>
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const lit = await read($, highlight)
    if (lit?.anchor !== e.requestId) return next(e)
    const { Box } = $.ui.resolve(e)

    return <Box borderStyle="round" borderColor="yellow" flexDirection="column">{await next(e)}</Box>
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const Input = 'Input' in ui ? ui.Input : undefined
    const at = Math.max(await read($, now), await $.clock.now())
    const all = await read($, items)
    const list = all.filter(item => isAwake(item, at))
    const snoozed = all.length - list.length
    const last = await read($, undo)
    const others = await otherSessions($)
    const columns = e.props.bodyColumns ?? 40
    const width = Math.max(10, columns - 22)

    return (
      <Box flexDirection="column">
        {list.length === 0 && <Text dimColor>Nothing open.</Text>}
        <Button key="add-selection" plain onPress={() => fromSelection($).then(text => $.ui.toast(text))}>
          <Text dimColor>+ add selected text</Text>
        </Button>
        {Input && (
          <Input
            key="add-own"
            placeholder="+ type your own item, Enter adds it"
            value=""
            submitLabel="add"
            onSubmit={async (typed: string) => {
              if (typed.trim()) await addOwn($, typed)
            }}
          />
        )}
        {last && (
          <Button key="undo" plain onPress={() => undoTick($)}>
            <Text color="yellow">↶ undo ({Math.max(1, Math.ceil((last.until - at) / 1000))}s)</Text>{' '}
            <Text dimColor>{cut(last.item.text, width)}</Text>
          </Button>
        )}
        {list.map(item => {
          const isOld = item.addedAt !== undefined && at - item.addedAt > OLD_MS
          return (
            <Box flexDirection="row">
              <Button
                key={`go-${item.id}`}
                plain
                dimColor={isOld}
                onPress={async () => {
                  if (!item.anchor) return
                  const lit = await read($, highlight)
                  if (lit?.anchor === item.anchor && lit.quote === item.quote) {
                    await setHighlight($, () => null)
                    return
                  }
                  await setHighlight($, () => ({ anchor: item.anchor, quote: item.quote }))
                  await $.ui
                    .scroll({ to: { requestId: item.anchor }, block: 'center' })
                    .catch(() => $.ui.toast('Could not scroll there; the message is outlined in yellow.'))
                }}
              >
                <Text dimColor>{(item.addedAt === undefined ? '' : age(at - item.addedAt)).padStart(3)} </Text>
                <Text color={item.kind === 'question' ? 'cyan' : 'yellow'}>
                  {item.kind === 'question' ? '? ' : '! '}
                </Text>
                {cut(item.text, width)}
              </Button>
              {item.kind === 'question' && (
                <Button
                  key={`reply-${item.id}`}
                  plain
                  label=" ↩"
                  onPress={() => $.prompt.fill({ text: `> ${item.text}\n\n`, mode: 'replace' })}
                />
              )}
              <Button key={`snooze-${item.id}`} plain label=" 💤" onPress={() => snooze($, item)} />
              <Button key={`done-${item.id}`} plain label=" [ ✔ ] " onPress={() => tickOff($, item)} />
            </Box>
          )
        })}
        {snoozed > 0 && (
          <Button key="wake" plain dimColor onPress={() => wakeAll($)}>
            {`💤 ${snoozed} snoozed, click to show again`}
          </Button>
        )}
        {others.length > 0 && (
          <Box marginTop={1}>
            <Text dimColor>── Other sessions ──</Text>
          </Box>
        )}
        {others.map(other => (
          <Box flexDirection="column" paddingLeft={2}>
            <Button
              key={`session-${other.sessionId}`}
              plain
              onPress={async press => {
                const isSwitched = other.topic ? await focusTab($, other.topic).catch(() => false) : false
                if (isSwitched) return
                const command = `claude --resume ${other.sessionId}`
                await $.ui.copy({ text: command, surface: press.surface })
                $.ui.toast(`No open tab for this session. Copied: ${command}`)
              }}
            >
              <Text bold>{cut(other.topic || folderName(other.cwd), width)}</Text>
              <Text dimColor> {folderName(other.cwd)} · {age(at - other.savedAt)} · go to tab</Text>
            </Button>
            {other.items.map(item => (
              <Text dimColor>
                {'  '}
                {item.kind === 'question' ? '? ' : '! '}
                {cut(item.text, width)}
              </Text>
            ))}
          </Box>
        ))}
      </Box>
    )
  })
}
