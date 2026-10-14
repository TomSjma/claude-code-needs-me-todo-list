import type { EngineInterface } from 'claude-code'

const FIND_TTY = `p=$PPID
while [ "$p" -gt 1 ]; do
  t=$(ps -o tty= -p "$p" | tr -d ' ')
  case "$t" in ''|'??') ;; *) echo "/dev/$t"; exit 0 ;; esac
  p=$(ps -o ppid= -p "$p" | tr -d ' ')
done`

const READ_TOPIC = `f=$(ls "$2"/.claude/projects/*/"$1".jsonl 2>/dev/null | head -1)
[ -n "$f" ] && tail -c 400000 "$f" | grep '"type":"ai-title"' | tail -1`

const FOCUS_TAB = `on run argv
  set wanted to item 1 of argv
  tell application "System Events" to tell process "ghostty"
    repeat with w in windows
      repeat with g in (every tab group of w)
        repeat with b in (every radio button of g)
          if (name of b as text) ends with wanted then
            click b
            perform action "AXRaise" of w
            set frontmost to true
            return "switched"
          end if
        end repeat
      end repeat
    end repeat
  end tell
  return "no tab"
end run`

const WRITE_TITLE = `printf '\\033]2;%s\\007' "$1" > "$2"`

export async function findTty($: EngineInterface): Promise<string | undefined> {
  const { stdout } = await $.process.run(['sh', '-c', FIND_TTY])
  return stdout.trim() || undefined
}

export async function readTopic($: EngineInterface, sessionId: string, home: string): Promise<string | undefined> {
  const { stdout } = await $.process.run(['sh', '-c', READ_TOPIC, 'sh', sessionId, home])
  if (!stdout.trim()) return undefined
  try {
    const row = JSON.parse(stdout) as { aiTitle?: unknown }
    return typeof row.aiTitle === 'string' && row.aiTitle ? row.aiTitle : undefined
  } catch {
    return undefined
  }
}

export async function focusTab($: EngineInterface, topic: string): Promise<boolean> {
  const { stdout } = await $.process.run(['osascript', '-', topic], { stdin: FOCUS_TAB, timeoutMs: 5_000 })
  return stdout.trim() === 'switched'
}

export async function writeTitle($: EngineInterface, tty: string, title: string) {
  await $.process.run(['sh', '-c', WRITE_TITLE, 'sh', title, tty])
}

export const tabTitle = (topic: string, count: number, isWorking: boolean) =>
  `${isWorking ? '✳ ' : ''}${count > 0 ? `📋 ${count} · ` : ''}${topic}`

export const age = (ms: number) => {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`
}
