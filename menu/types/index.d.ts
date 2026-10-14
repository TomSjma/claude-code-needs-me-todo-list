export type MenuEntry = {
  icon: string
  hotkey: string
  command: string
  label: string
}

declare module 'claude-code' {
  interface PluginState {
    menu: { entries: MenuEntry[] }
  }
}
