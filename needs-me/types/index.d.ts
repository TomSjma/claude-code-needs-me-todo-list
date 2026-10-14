export type OpenItem = {
  id: string
  kind: 'question' | 'action'
  text: string
  anchor: string
  quote?: string
  addedAt?: number
  fromReply?: true
  snoozedUntil?: number
}

export type Highlight = { anchor: string; quote?: string }

export type Undo = { item: OpenItem; until: number }

export type SessionList = {
  sessionId: string
  cwd: string
  topic: string
  savedAt: number
  items: OpenItem[]
}

declare module 'claude-code' {
  interface PluginState {
    'needs-me': { items: OpenItem[]; highlight: Highlight | null; undo: Undo | null; now: number; count: number }
  }
}
