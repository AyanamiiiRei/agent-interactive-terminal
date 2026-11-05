/**
 * Real terminal renderer for the right-sidebar panel.
 *
 * Built into `client/client.terminal.js` by `scripts/build-client.mjs`. The
 * chunk is loaded lazily by `client/index.js`, so xterm.js only arrives when a
 * terminal tab is actually opened.
 *
 * Interaction model: there is no takeover button. Typing is always allowed
 * unless the person explicitly locked the keyboard, and the first keystroke
 * takes the lease from the agent. A few seconds after the last keystroke the
 * lease goes back to the agent automatically, which a thin countdown line
 * communicates. Mouse clicks never change the lease, so selecting and copying
 * output works in every state.
 */
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import xtermCss from '@xterm/xterm/css/xterm.css'
import * as React from 'react'

/** Theme palette: background, foreground, cursor and the 16 ANSI colors. */
const THEMES = {
  dark: {
    label: '深色',
    theme: {
      background: '#1e1e1e',
      foreground: '#d4d4d4',
      cursor: '#f2f2f2',
      cursorAccent: '#1e1e1e',
      selectionBackground: '#264f78',
      black: '#1e1e1e',
      red: '#e06c75',
      green: '#98c379',
      yellow: '#e5c07b',
      blue: '#61afef',
      magenta: '#c678dd',
      cyan: '#56b6c2',
      white: '#dcdfe4',
      brightBlack: '#5c6370',
      brightRed: '#e06c75',
      brightGreen: '#98c379',
      brightYellow: '#e5c07b',
      brightBlue: '#61afef',
      brightMagenta: '#c678dd',
      brightCyan: '#56b6c2',
      brightWhite: '#ffffff',
    },
  },
  light: {
    label: '浅色',
    theme: {
      background: '#fafafa',
      foreground: '#383a42',
      cursor: '#526fff',
      cursorAccent: '#fafafa',
      selectionBackground: '#cfe3ff',
      black: '#383a42',
      red: '#e45649',
      green: '#50a14f',
      yellow: '#c18401',
      blue: '#4078f2',
      magenta: '#a626a4',
      cyan: '#0184bc',
      white: '#a0a1a7',
      brightBlack: '#696c77',
      brightRed: '#e45649',
      brightGreen: '#50a14f',
      brightYellow: '#c18401',
      brightBlue: '#4078f2',
      brightMagenta: '#a626a4',
      brightCyan: '#0184bc',
      brightWhite: '#1b1d22',
    },
  },
  solarizedDark: {
    label: 'Solarized',
    theme: {
      background: '#002b36',
      foreground: '#839496',
      cursor: '#93a1a1',
      cursorAccent: '#002b36',
      selectionBackground: '#073642',
      black: '#073642',
      red: '#dc322f',
      green: '#859900',
      yellow: '#b58900',
      blue: '#268bd2',
      magenta: '#d33682',
      cyan: '#2aa198',
      white: '#eee8d5',
      brightBlack: '#586e75',
      brightRed: '#cb4b16',
      brightGreen: '#586e75',
      brightYellow: '#657b83',
      brightBlue: '#839496',
      brightMagenta: '#6c71c4',
      brightCyan: '#93a1a1',
      brightWhite: '#fdf6e3',
    },
  },
  solarizedLight: {
    label: 'Solarized Light',
    theme: {
      background: '#fdf6e3',
      foreground: '#657b83',
      cursor: '#586e75',
      cursorAccent: '#fdf6e3',
      selectionBackground: '#eee8d5',
      black: '#073642',
      red: '#dc322f',
      green: '#859900',
      yellow: '#b58900',
      blue: '#268bd2',
      magenta: '#d33682',
      cyan: '#2aa198',
      white: '#eee8d5',
      brightBlack: '#93a1a1',
      brightRed: '#cb4b16',
      brightGreen: '#586e75',
      brightYellow: '#657b83',
      brightBlue: '#839496',
      brightMagenta: '#6c71c4',
      brightCyan: '#93a1a1',
      brightWhite: '#fdf6e3',
    },
  },
  dracula: {
    label: 'Dracula',
    theme: {
      background: '#282a36',
      foreground: '#f8f8f2',
      cursor: '#f8f8f2',
      cursorAccent: '#282a36',
      selectionBackground: '#44475a',
      black: '#21222c',
      red: '#ff5555',
      green: '#50fa7b',
      yellow: '#f1fa8c',
      blue: '#bd93f9',
      magenta: '#ff79c6',
      cyan: '#8be9fd',
      white: '#f8f8f2',
      brightBlack: '#6272a4',
      brightRed: '#ff6e6e',
      brightGreen: '#69ff94',
      brightYellow: '#ffffa5',
      brightBlue: '#d6acff',
      brightMagenta: '#ff92df',
      brightCyan: '#a4ffff',
      brightWhite: '#ffffff',
    },
  },
  oneDark: {
    label: 'One Dark',
    theme: {
      background: '#282c34',
      foreground: '#abb2bf',
      cursor: '#528bff',
      cursorAccent: '#282c34',
      selectionBackground: '#3e4451',
      black: '#282c34',
      red: '#e06c75',
      green: '#98c379',
      yellow: '#e5c07b',
      blue: '#61afef',
      magenta: '#c678dd',
      cyan: '#56b6c2',
      white: '#abb2bf',
      brightBlack: '#5c6370',
      brightRed: '#e06c75',
      brightGreen: '#98c379',
      brightYellow: '#e5c07b',
      brightBlue: '#61afef',
      brightMagenta: '#c678dd',
      brightCyan: '#56b6c2',
      brightWhite: '#ffffff',
    },
  },
  gnome: {
    label: 'GNOME',
    theme: {
      background: '#241f31',
      foreground: '#deddda',
      cursor: '#deddda',
      cursorAccent: '#241f31',
      selectionBackground: '#5e5c64',
      black: '#241f31',
      red: '#c01c28',
      green: '#2ec27e',
      yellow: '#f5e0b3',
      blue: '#1c71d8',
      magenta: '#813d9c',
      cyan: '#229adf',
      white: '#deddda',
      brightBlack: '#5e5c64',
      brightRed: '#e01b24',
      brightGreen: '#57e389',
      brightYellow: '#f8e45c',
      brightBlue: '#62a0ea',
      brightMagenta: '#c061cb',
      brightCyan: '#48cbe8',
      brightWhite: '#ffffff',
    },
  },
  tango: {
    label: 'Tango',
    theme: {
      background: '#2e3436',
      foreground: '#d3d7cf',
      cursor: '#d3d7cf',
      cursorAccent: '#2e3436',
      selectionBackground: '#4e5a5e',
      black: '#2e3436',
      red: '#cc0000',
      green: '#4e9a06',
      yellow: '#c4a000',
      blue: '#3465a4',
      magenta: '#75507b',
      cyan: '#06989a',
      white: '#d3d7cf',
      brightBlack: '#555753',
      brightRed: '#ef2929',
      brightGreen: '#8ae234',
      brightYellow: '#fce94f',
      brightBlue: '#729fcf',
      brightMagenta: '#ad7fa8',
      brightCyan: '#34e2e2',
      brightWhite: '#eeeeec',
    },
  },
}

const DEFAULT_SHORTCUTS = {
  copy: 'ctrl+shift+c',
  paste: 'ctrl+shift+v',
  newTab: 'ctrl+shift+t',
  closeTab: 'ctrl+shift+w',
  fontIncrease: 'ctrl+=',
  fontDecrease: 'ctrl+-',
  fontReset: 'ctrl+0',
}

const SHORTCUT_LABELS = {
  copy: '复制选中内容',
  paste: '粘贴',
  newTab: '新建终端',
  closeTab: '关闭终端',
  fontIncrease: '放大字号',
  fontDecrease: '缩小字号',
  fontReset: '恢复字号',
}

const FONT_STACKS = [
  { id: 'jetbrains', label: 'JetBrains Mono', value: '"JetBrains Mono", "Fira Code", "Source Code Pro", ui-monospace, monospace' },
  { id: 'fira', label: 'Fira Code', value: '"Fira Code", "JetBrains Mono", ui-monospace, monospace' },
  { id: 'source', label: 'Source Code Pro', value: '"Source Code Pro", "JetBrains Mono", ui-monospace, monospace' },
  { id: 'ubuntu', label: 'Ubuntu Mono', value: '"Ubuntu Mono", "DejaVu Sans Mono", monospace' },
  { id: 'dejavu', label: 'DejaVu Sans Mono', value: '"DejaVu Sans Mono", ui-monospace, monospace' },
  { id: 'mono', label: 'System monospace', value: 'ui-monospace, monospace' },
]

const STORAGE_KEY = 'ait:terminal-settings'
const LOCK_PREFIX = 'ait:terminal-locked:'

const DEFAULT_SETTINGS = {
  theme: 'dark',
  fontFamily: FONT_STACKS[0].value,
  fontSize: 13,
  lineHeight: 1.15,
  fontWeight: 400,
  fontWeightBold: 700,
  ligatures: false,
  cursorStyle: 'block',
  cursorBlink: true,
  cursorColor: '',
  scrollback: 10000,
  bell: 'none',
  copyOnSelect: true,
  pasteOnRightClick: true,
  idleHandback: 4,
  shortcuts: { ...DEFAULT_SHORTCUTS },
}

let cachedSettings = null
const settingsListeners = new Set()

/** Whether a palette is light enough to need dark-on-light chrome. */
function isLightTheme(key) {
  return key === 'light' || key === 'solarizedLight'
}

/** The palette for one theme key, falling back to the default. */
function paletteOf(key) {
  return THEMES[key] !== undefined ? THEMES[key].theme : THEMES.dark.theme
}

/**
 * Merge stored settings over the defaults and drop values of the wrong shape,
 * so a hand-edited localStorage entry cannot break the terminal.
 *
 * @param {unknown} raw - decoded storage value.
 * @returns the usable settings.
 */
function normalizeSettings(raw) {
  const next = { ...DEFAULT_SETTINGS, shortcuts: { ...DEFAULT_SHORTCUTS } }
  if (raw === null || typeof raw !== 'object') return next
  const candidate = raw
  if (typeof candidate.theme === 'string' && THEMES[candidate.theme] !== undefined) next.theme = candidate.theme
  if (typeof candidate.fontFamily === 'string' && candidate.fontFamily.trim() !== '') next.fontFamily = candidate.fontFamily
  if (Number.isFinite(candidate.fontSize)) next.fontSize = Math.min(28, Math.max(8, Number(candidate.fontSize)))
  if (Number.isFinite(candidate.lineHeight)) next.lineHeight = Math.min(2.2, Math.max(0.9, Number(candidate.lineHeight)))
  if (Number.isFinite(candidate.fontWeight)) next.fontWeight = Number(candidate.fontWeight)
  if (Number.isFinite(candidate.fontWeightBold)) next.fontWeightBold = Number(candidate.fontWeightBold)
  if (typeof candidate.ligatures === 'boolean') next.ligatures = candidate.ligatures
  if (candidate.cursorStyle === 'block' || candidate.cursorStyle === 'bar' || candidate.cursorStyle === 'underline') next.cursorStyle = candidate.cursorStyle
  if (typeof candidate.cursorBlink === 'boolean') next.cursorBlink = candidate.cursorBlink
  if (typeof candidate.cursorColor === 'string') next.cursorColor = candidate.cursorColor
  if (Number.isFinite(candidate.scrollback)) next.scrollback = Math.min(200000, Math.max(500, Number(candidate.scrollback)))
  if (candidate.bell === 'none' || candidate.bell === 'sound' || candidate.bell === 'visual') next.bell = candidate.bell
  if (typeof candidate.copyOnSelect === 'boolean') next.copyOnSelect = candidate.copyOnSelect
  if (typeof candidate.pasteOnRightClick === 'boolean') next.pasteOnRightClick = candidate.pasteOnRightClick
  if (Number.isFinite(candidate.idleHandback)) next.idleHandback = Math.min(30, Math.max(1, Number(candidate.idleHandback)))
  if (candidate.shortcuts !== null && typeof candidate.shortcuts === 'object') {
    for (const action of Object.keys(DEFAULT_SHORTCUTS)) {
      const combo = candidate.shortcuts[action]
      if (typeof combo === 'string' && normalizeCombo(combo) !== null) next.shortcuts[action] = normalizeCombo(combo)
    }
  }
  return next
}

/** Read settings from localStorage; the result is cached until written. */
function currentSettings() {
  if (cachedSettings !== null) return cachedSettings
  let stored = null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw !== null) stored = JSON.parse(raw)
  } catch {
    stored = null
  }
  cachedSettings = normalizeSettings(stored)
  return cachedSettings
}

/**
 * Persist and broadcast a settings change so every open terminal updates.
 *
 * @param {object} next - complete settings object.
 */
function writeSettings(next) {
  cachedSettings = normalizeSettings(next)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedSettings))
  } catch {
    // Private-mode storage can refuse writes; the value still applies in memory.
  }
  for (const listener of settingsListeners) listener(cachedSettings)
}

/** Subscribe to settings changes. */
function subscribeSettings(listener) {
  settingsListeners.add(listener)
  return () => settingsListeners.delete(listener)
}

/** Reset storage and restore the defaults. */
function resetSettings() {
  cachedSettings = normalizeSettings(null)
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to remove.
  }
  for (const listener of settingsListeners) listener(cachedSettings)
}

/** Whether the person locked the keyboard for this terminal. */
function readLock(terminalId) {
  try {
    return window.localStorage.getItem(LOCK_PREFIX + terminalId) === '1'
  } catch {
    return false
  }
}

/** Persist the lock state for this terminal. */
function writeLock(terminalId, locked) {
  try {
    if (locked) window.localStorage.setItem(LOCK_PREFIX + terminalId, '1')
    else window.localStorage.removeItem(LOCK_PREFIX + terminalId)
  } catch {
    // Nothing to persist.
  }
}

/** The terminal palette with the optional custom cursor color applied. */
function themeFor(settings) {
  const base = paletteOf(settings.theme)
  const theme = { ...base }
  if (typeof settings.cursorColor === 'string' && /^#[0-9a-f]{6}$/i.test(settings.cursorColor)) {
    theme.cursor = settings.cursorColor
  }
  return theme
}

/** Panel chrome colors that follow the terminal palette. */
function chromeFor(settings) {
  const palette = paletteOf(settings.theme)
  return {
    light: isLightTheme(settings.theme),
    accent: palette.blue,
    text: palette.foreground,
    muted: isLightTheme(settings.theme) ? '#6a6d73' : '#9a9da3',
    surface: palette.background,
  }
}

/**
 * Normalize a keyboard combo string to the form used by the shortcut table.
 * Returns null for anything that is not a usable binding.
 *
 * @param {string} combo - candidate like "ctrl+shift+t".
 * @returns {string | null} the normalized combo, or null.
 */
function normalizeCombo(combo) {
  const parts = String(combo)
    .toLowerCase()
    .split('+')
    .map((part) => part.trim())
    .filter((part) => part !== '')
  const key = parts.pop()
  if (key === undefined) return null
  const modifiers = new Set(parts)
  if (modifiers.size !== parts.length) return null
  for (const modifier of modifiers) {
    if (modifier !== 'ctrl' && modifier !== 'alt' && modifier !== 'shift' && modifier !== 'meta') return null
  }
  if (!/^[a-z0-9=+-]$/.test(key) && !/^f([1-9]|1[0-2])$/.test(key) && key !== 'space') return null
  return [...modifiers].sort().concat(key).join('+')
}

/**
 * Turn a keydown into the same combo string stored in settings.
 *
 * @param {KeyboardEvent} event - the key event.
 * @returns {string | null} the combo, or null for a modifier-only press.
 */
function comboFromEvent(event) {
  const parts = []
  if (event.ctrlKey) parts.push('ctrl')
  if (event.altKey) parts.push('alt')
  if (event.shiftKey) parts.push('shift')
  if (event.metaKey) parts.push('meta')
  let key = ''
  if (/^Key[A-Z]$/.test(event.code)) key = event.code.slice(3).toLowerCase()
  else if (/^Digit\d$/.test(event.code)) key = event.code.slice(5)
  else if (event.code === 'Equal') key = '='
  else if (event.code === 'Minus') key = '-'
  else if (event.code === 'Space') key = 'space'
  else if (/^F([1-9]|1[0-2])$/.test(event.code)) key = event.code.toLowerCase()
  else if (event.key !== undefined && /^[a-z0-9=+-]$/i.test(event.key)) key = event.key.toLowerCase()
  if (key === '') return null
  return normalizeCombo(parts.concat(key).join('+'))
}

/** Pretty label for a combo. */
function comboLabel(combo) {
  if (typeof combo !== 'string') return ''
  const modifiers = { ctrl: 'Ctrl', shift: 'Shift', alt: 'Alt', meta: 'Meta' }
  const parts = combo.split('+')
  const key = parts.pop() ?? ''
  const head = ['ctrl', 'shift', 'alt', 'meta'].filter((name) => parts.includes(name)).map((name) => modifiers[name])
  const last = key === 'space' ? 'Space' : key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1)
  return head.concat(last).join('+')
}

/** A short state label key for the status pill. */
function uiState(status, locked, painted) {
  if (!painted) return 'connecting'
  if (status.phase === 'exited') return 'exited'
  if (status.suspended) return 'secret'
  if (locked) return 'locked'
  return status.holder === 'human' ? 'human' : 'agent'
}

const PANEL_CSS = `
.ait-terminal{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;font-family:"Cantarell","Inter",system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ait-text);background:var(--ait-bg)}
.ait-terminal *, .ait-terminal *::before, .ait-terminal *::after{box-sizing:border-box}
.ait-terminal[data-light="true"] .ait-state[data-state="agent"]{color:#8a5a00;background:color-mix(in srgb,#c18401 16%,transparent)}
.ait-terminal[data-light="true"] .ait-state[data-state="secret"]{color:#b3261e;background:color-mix(in srgb,#d93025 13%,transparent)}
.ait-terminal[data-light="true"] .ait-state[data-state="exited"]{color:#8c4a4a;background:color-mix(in srgb,#a05050 11%,transparent)}
.ait-terminal[data-light="true"] .ait-notice{color:#8a5a00;background:color-mix(in srgb,#c18401 10%,transparent)}
.ait-terminal[data-light="true"] .ait-swatch{border-color:rgba(0,0,0,.16);box-shadow:inset 0 1px 0 rgba(255,255,255,.4)}
.ait-terminal[data-light="true"] .ait-host{box-shadow:0 1px 2px rgba(0,0,0,.08)}
.ait-bar{display:flex;align-items:center;gap:8px;height:40px;padding:0 8px 0 11px;flex:none;background:linear-gradient(to bottom,color-mix(in srgb,var(--ait-bg) 91%,var(--ait-fg) 9%),color-mix(in srgb,var(--ait-bg) 87%,var(--ait-fg) 13%));border-bottom:1px solid color-mix(in srgb,var(--ait-fg) 13%,transparent);position:relative;z-index:2}
.ait-glyph{display:grid;place-items:center;width:18px;height:18px;flex:none;color:var(--ait-accent);opacity:.85}
.ait-name{font-size:11.5px;font-weight:600;letter-spacing:.01em;color:var(--ait-fg);opacity:.72;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:32%;flex:0 1 auto}
.ait-name:empty{display:none}
.ait-state{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 9px 0 7px;border-radius:999px;font-size:10.5px;font-weight:500;letter-spacing:.01em;color:var(--ait-fg);background:color-mix(in srgb,var(--ait-fg) 8%,transparent);transition:background-color .25s ease,color .25s ease;flex:0 0 auto}
.ait-state .dot{width:5px;height:5px;border-radius:50%;background:currentColor;box-shadow:0 0 0 3px color-mix(in srgb,currentColor 16%,transparent);transition:box-shadow .25s ease}
.ait-state-text{animation:ait-fade-in .18s ease}
.ait-state[data-state="agent"]{color:#e7c07d;background:color-mix(in srgb,#e7c07d 14%,transparent)}
.ait-state[data-state="agent"] .dot{animation:ait-breathe 2.8s ease-in-out infinite}
.ait-state[data-state="human"]{color:var(--ait-accent);background:color-mix(in srgb,var(--ait-accent) 15%,transparent)}
.ait-state[data-state="secret"]{color:#ff9e9e;background:color-mix(in srgb,#ff7a7a 17%,transparent)}
.ait-state[data-state="secret"] .dot{animation:ait-pulse 1.6s ease-in-out infinite}
.ait-state[data-state="locked"]{color:var(--ait-muted);background:color-mix(in srgb,var(--ait-fg) 7%,transparent)}
.ait-state[data-state="exited"]{color:#d99a9a;background:color-mix(in srgb,#d99a9a 12%,transparent)}
.ait-state[data-state="connecting"]{color:var(--ait-muted);background:color-mix(in srgb,var(--ait-fg) 7%,transparent)}
.ait-state[data-state="connecting"] .dot{animation:ait-pulse 1.4s ease-in-out infinite}
.ait-actions{margin-left:auto;display:flex;align-items:center;gap:2px;flex:none}
.ait-icon{width:28px;height:28px;display:grid;place-items:center;border:0;padding:0;border-radius:8px;background:transparent;color:var(--ait-muted);cursor:pointer;transition:background-color .15s ease,color .15s ease,transform .12s ease}
.ait-icon:hover{background:color-mix(in srgb,var(--ait-fg) 10%,transparent);color:var(--ait-fg)}
.ait-icon:active{transform:scale(.93)}
.ait-icon[data-on="true"]{color:var(--ait-accent);background:color-mix(in srgb,var(--ait-accent) 16%,transparent)}
.ait-icon[data-flash="true"]{animation:ait-flash .45s ease}
.ait-icon[data-tip]{position:relative}
.ait-icon[data-tip]::after{content:attr(data-tip);position:absolute;top:calc(100% + 7px);right:0;padding:4px 7px;border-radius:6px;font-size:10.5px;line-height:1.2;white-space:nowrap;color:var(--ait-fg);background:color-mix(in srgb,var(--ait-bg) 78%,var(--ait-fg) 22%);border:1px solid color-mix(in srgb,var(--ait-fg) 13%,transparent);box-shadow:0 6px 18px rgba(0,0,0,.32);opacity:0;transform:translateY(-2px);pointer-events:none;transition:opacity .12s ease,transform .12s ease;z-index:6}
.ait-icon[data-tip]:hover::after,.ait-icon[data-tip]:focus-visible::after{opacity:1;transform:none}
.ait-idle{position:absolute;left:0;right:0;bottom:-1px;height:2px;background:linear-gradient(90deg,var(--ait-accent),color-mix(in srgb,var(--ait-accent) 35%,transparent));transform-origin:left;animation-name:ait-idle;animation-timing-function:linear;animation-fill-mode:forwards;opacity:.9}
.ait-notice{padding:5px 12px;font-size:11px;color:#e8c07d;background:color-mix(in srgb,#e8c07d 9%,transparent);border-bottom:1px solid color-mix(in srgb,var(--ait-fg) 8%,transparent);flex:none;animation:ait-fade-in .16s ease}
.ait-stage{position:relative;flex:1;min-height:0;display:flex}
.ait-host{flex:1;min-height:0;margin:6px 8px 8px;padding:8px 10px 10px;border-radius:10px;border:1px solid color-mix(in srgb,var(--ait-fg) 9%,transparent);background:var(--ait-bg);box-shadow:inset 0 1px 0 color-mix(in srgb,var(--ait-fg) 4%,transparent),0 1px 2px rgba(0,0,0,.16);overflow:hidden}
.ait-host .xterm{height:100%}
.ait-host:focus-within{border-color:color-mix(in srgb,var(--ait-accent) 32%,transparent);box-shadow:inset 0 1px 0 color-mix(in srgb,var(--ait-fg) 4%,transparent),0 0 0 2px color-mix(in srgb,var(--ait-accent) 9%,transparent)}
.ait-host .xterm-viewport{background:transparent!important;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--ait-fg) 22%,transparent) transparent}
.ait-host .xterm-viewport::-webkit-scrollbar{width:10px}
.ait-host .xterm-viewport::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--ait-fg) 18%,transparent);border-radius:6px;border:2px solid transparent;background-clip:content-box}
.ait-host .xterm-viewport::-webkit-scrollbar-thumb:hover{background:color-mix(in srgb,var(--ait-fg) 28%,transparent);background-clip:content-box}
.ait-term-bell{animation:ait-bell .22s ease-in-out 2}
.ait-connecting{position:absolute;inset:6px 8px 8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;border-radius:10px;border:1px solid color-mix(in srgb,var(--ait-fg) 9%,transparent);background:var(--ait-bg);box-shadow:inset 0 1px 0 color-mix(in srgb,var(--ait-fg) 4%,transparent),0 1px 2px rgba(0,0,0,.16);color:var(--ait-muted);font-size:11.5px;pointer-events:none;z-index:1}
.ait-spinner{width:18px;height:18px;border-radius:50%;border:2px solid color-mix(in srgb,var(--ait-fg) 14%,transparent);border-top-color:var(--ait-accent);animation:ait-spin .7s linear infinite}
.ait-toast{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 11px;border-radius:999px;background:color-mix(in srgb,var(--ait-bg) 78%,var(--ait-fg) 22%);border:1px solid color-mix(in srgb,var(--ait-fg) 13%,transparent);box-shadow:0 8px 24px rgba(0,0,0,.35);color:var(--ait-fg);font-size:11px;z-index:3;animation:ait-toast-in .18s ease;pointer-events:none}
.ait-toast svg{color:var(--ait-accent)}
.ait-backdrop{position:absolute;inset:0;z-index:4;background:transparent}
.ait-sheet{position:absolute;top:44px;right:8px;width:min(344px,calc(100% - 16px));max-height:calc(100% - 52px);z-index:5;display:flex;flex-direction:column;overflow:hidden;border-radius:14px;background:color-mix(in srgb,var(--ait-bg) 86%,var(--ait-fg) 14%);border:1px solid color-mix(in srgb,var(--ait-fg) 16%,transparent);box-shadow:0 24px 64px -16px rgba(0,0,0,.6),0 0 0 1px rgba(0,0,0,.2);backdrop-filter:blur(20px);animation:ait-sheet-in .19s cubic-bezier(.2,.8,.2,1)}
.ait-bar,.ait-sheet,.ait-sheet-foot,.ait-themes,.ait-row-label,.ait-group-label{user-select:none}
.ait-sheet-head{display:flex;align-items:center;justify-content:space-between;padding:13px 14px 11px;flex:none;background:linear-gradient(to bottom,color-mix(in srgb,var(--ait-fg) 4%,transparent),transparent)}
.ait-sheet-head .ait-sheet-title{letter-spacing:.02em}
.ait-sheet-tabs{display:flex;gap:2px;padding:0 10px;border-bottom:1px solid color-mix(in srgb,var(--ait-fg) 9%,transparent);flex:none}
.ait-sheet-tab{flex:1;border:0;background:transparent;color:var(--ait-muted);font:inherit;font-size:11.5px;padding:7px 4px 8px;border-bottom:2px solid transparent;margin-bottom:-1px;cursor:pointer;transition:color .15s ease,border-color .15s ease}
.ait-sheet-tab:hover{color:var(--ait-fg)}
.ait-sheet-tab[data-on="true"]{color:var(--ait-fg);border-bottom-color:var(--ait-accent)}
.ait-sheet-hint{font-size:10.5px;line-height:1.5;color:var(--ait-muted);margin:0 0 7px}
.ait-sheet-title{font-size:12.5px;font-weight:600;letter-spacing:.01em}
.ait-sheet-body{flex:1;min-height:0;overflow:auto;padding:2px 14px 12px;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--ait-fg) 20%,transparent) transparent}
.ait-tab-body{animation:ait-tab-in .16s ease}
.ait-sheet-body::-webkit-scrollbar{width:8px}
.ait-sheet-body::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--ait-fg) 16%,transparent);border-radius:4px}
.ait-group{margin-top:10px}
.ait-group-label{font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--ait-muted);margin:0 0 7px}
.ait-card{border-radius:11px;background:color-mix(in srgb,var(--ait-fg) 5%,transparent);border:1px solid color-mix(in srgb,var(--ait-fg) 8%,transparent);overflow:hidden}
.ait-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:38px;padding:6px 11px}
.ait-row + .ait-row{border-top:1px solid color-mix(in srgb,var(--ait-fg) 7%,transparent)}
.ait-row-label{flex:1;min-width:0;font-size:12px;color:var(--ait-fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ait-row-hint{font-size:10.5px;color:var(--ait-muted);margin-top:1px}
.ait-select,.ait-input{height:28px;min-width:0;border-radius:7px;border:1px solid color-mix(in srgb,var(--ait-fg) 16%,transparent);background:color-mix(in srgb,var(--ait-bg) 70%,var(--ait-fg) 12%);color:var(--ait-fg);padding:0 8px;font-size:11.5px;font-family:inherit;outline:none;transition:border-color .15s ease,box-shadow .15s ease}
.ait-select:focus,.ait-input:focus{border-color:var(--ait-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--ait-accent) 22%,transparent)}
.ait-select{max-width:172px;appearance:none;padding-right:24px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%239a9da3' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 7px center;background-size:10px 6px}
.ait-input[type="number"]{width:62px;text-align:right;font-variant-numeric:tabular-nums;appearance:textfield}
.ait-input[type="number"]::-webkit-inner-spin-button,.ait-input[type="number"]::-webkit-outer-spin-button{appearance:none;margin:0}
.ait-color{position:relative;display:inline-block;width:26px;height:26px;border-radius:7px;border:1px solid color-mix(in srgb,var(--ait-fg) 18%,transparent);overflow:hidden;cursor:pointer;padding:0}
.ait-color span{position:absolute;inset:0;display:block;border-radius:6px}
.ait-color input{position:absolute;inset:0;opacity:0;cursor:pointer;border:0;padding:0}
.ait-switch{position:relative;width:32px;height:18px;flex:none;border:0;padding:0;border-radius:999px;background:color-mix(in srgb,var(--ait-fg) 20%,transparent);cursor:pointer;transition:background-color .18s ease}
.ait-switch::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.3);transition:transform .18s cubic-bezier(.2,.8,.2,1)}
.ait-switch[data-on="true"]{background:var(--ait-accent)}
.ait-switch[data-on="true"]::after{transform:translateX(14px)}
.ait-segment{display:inline-flex;padding:2px;border-radius:8px;background:color-mix(in srgb,var(--ait-fg) 8%,transparent);gap:2px}
.ait-segment button{border:0;background:transparent;color:var(--ait-muted);font:inherit;font-size:11px;padding:3px 8px;border-radius:6px;cursor:pointer;transition:background-color .15s ease,color .15s ease}
.ait-segment button[data-on="true"]{background:color-mix(in srgb,var(--ait-fg) 14%,transparent);color:var(--ait-fg);box-shadow:0 1px 2px rgba(0,0,0,.18)}
.ait-stepper{display:inline-flex;align-items:center;gap:1px;height:28px;padding:2px;border-radius:8px;background:color-mix(in srgb,var(--ait-fg) 8%,transparent)}
.ait-stepper button{width:24px;height:24px;border:0;padding:0;border-radius:6px;background:transparent;color:var(--ait-fg);font:inherit;font-size:13px;line-height:1;cursor:pointer;transition:background-color .15s ease}
.ait-stepper button:hover{background:color-mix(in srgb,var(--ait-fg) 12%,transparent)}
.ait-stepper-value{min-width:22px;text-align:center;font-size:11.5px;font-variant-numeric:tabular-nums;color:var(--ait-fg)}
.ait-themes{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:8px}
.ait-theme{position:relative;display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:8px;border:1px solid transparent;background:transparent;color:var(--ait-fg);font:inherit;font-size:11px;text-align:left;cursor:pointer;transition:background-color .15s ease,border-color .15s ease}
.ait-theme:hover{background:color-mix(in srgb,var(--ait-fg) 7%,transparent)}
.ait-theme[data-on="true"]{border-color:color-mix(in srgb,var(--ait-accent) 70%,transparent);background:color-mix(in srgb,var(--ait-accent) 10%,transparent)}
.ait-swatch{width:26px;height:26px;flex:none;border-radius:7px;display:flex;flex-direction:column;gap:3px;padding:4px 5px;border:1px solid rgba(255,255,255,.14);overflow:hidden;box-shadow:inset 0 1px 0 rgba(255,255,255,.06)}
.ait-swatch-dots{display:flex;gap:2px}
.ait-swatch-dots i{display:block;width:3px;height:3px;border-radius:50%}
.ait-swatch-line{display:block;height:2px;border-radius:1px;opacity:.55}
.ait-theme-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:8px}
.ait-theme-check{position:absolute;top:5px;right:5px;display:flex;color:var(--ait-accent)}
.ait-key{font-family:ui-monospace,"JetBrains Mono",monospace;font-size:10.5px;font-weight:500;padding:4px 7px;border-radius:6px;border:1px solid color-mix(in srgb,var(--ait-fg) 14%,transparent);background:color-mix(in srgb,var(--ait-fg) 6%,transparent);box-shadow:0 1px 0 color-mix(in srgb,var(--ait-fg) 10%,transparent);color:var(--ait-fg);cursor:pointer;transition:border-color .15s ease,background-color .15s ease}
.ait-key:hover{background:color-mix(in srgb,var(--ait-fg) 10%,transparent)}
.ait-key[data-recording="true"]{border-color:var(--ait-accent);color:var(--ait-accent);animation:ait-pulse 1.2s ease-in-out infinite}
.ait-sheet-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;flex:none;border-top:1px solid color-mix(in srgb,var(--ait-fg) 10%,transparent)}
.ait-ghost{border:0;background:transparent;color:var(--ait-muted);font:inherit;font-size:11.5px;padding:6px 9px;border-radius:7px;cursor:pointer;transition:background-color .15s ease,color .15s ease}
.ait-ghost:hover{background:color-mix(in srgb,var(--ait-fg) 8%,transparent);color:var(--ait-fg)}
.ait-saved{font-size:10.5px;color:var(--ait-muted)}
@keyframes ait-idle{from{transform:scaleX(1)}to{transform:scaleX(0)}}
@keyframes ait-sheet-in{from{opacity:0;transform:translateY(-6px) scale(.985)}to{opacity:1;transform:none}}
@keyframes ait-fade-in{from{opacity:0}to{opacity:1}}
@keyframes ait-tab-in{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}
@keyframes ait-toast-in{from{opacity:0;transform:translate(-50%,4px)}to{opacity:1;transform:translate(-50%,0)}}
@keyframes ait-spin{to{transform:rotate(360deg)}}
@keyframes ait-pulse{0%,100%{opacity:1}50%{opacity:.55}}
@keyframes ait-breathe{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes ait-flash{0%{background:color-mix(in srgb,var(--ait-accent) 35%,transparent)}100%{background:transparent}}
@keyframes ait-bell{0%,100%{opacity:1}50%{opacity:.5}}
@media (prefers-reduced-motion: reduce){
  .ait-state[data-state="agent"] .dot,.ait-state[data-state="secret"] .dot,.ait-state[data-state="connecting"] .dot{animation:none}
  .ait-state-text,.ait-sheet,.ait-tab-body,.ait-toast,.ait-notice,.ait-icon{animation:none;transition:none}
  .ait-idle{animation:none!important;opacity:.3}
  .ait-spinner{animation:none;border-top-color:var(--ait-accent);opacity:.7}
}
`

let cssInjected = false

function injectCss() {
  if (cssInjected || typeof document === 'undefined') return
  cssInjected = true
  const style = document.createElement('style')
  style.dataset.plugin = 'agent-interactive-terminal'
  style.dataset.pluginCss = 'agent-interactive-terminal/terminal'
  style.textContent = xtermCss + PANEL_CSS
  document.head.appendChild(style)
}

/** A short beep for the bell, kept silent if audio is unavailable. */
function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (Ctx === undefined) return
    const context = new Ctx()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = 880
    gain.gain.value = 0.03
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.06)
    oscillator.onended = () => {
      void context.close()
    }
  } catch {
    // Audio is a nicety, not a requirement.
  }
}

/** A small terminal glyph that anchors the bar. */
function TerminalGlyph() {
  return React.createElement(
    'svg',
    { width: 17, height: 17, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    React.createElement('path', {
      d: 'M3.4 5.1l3.3 2.9-3.3 2.9M8.9 11h3.7',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
  )
}

/** Two sliders: quieter and more legible than a gear at this size. */
function SettingsIcon() {
  return React.createElement(
    'svg',
    { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    React.createElement('path', {
      d: 'M2.6 5h3.2M9.4 5h4M2.6 11h3.6M9.8 11h3.6',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinecap: 'round',
    }),
    React.createElement('circle', { cx: 7.4, cy: 5, r: 1.6, stroke: 'currentColor', strokeWidth: 1.5 }),
    React.createElement('circle', { cx: 8.6, cy: 11, r: 1.6, stroke: 'currentColor', strokeWidth: 1.5 }),
  )
}

/** A padlock; `open` draws the shackle lifted for the unlocked state. */
function LockIcon(open) {
  return React.createElement(
    'svg',
    { width: 15, height: 15, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    React.createElement('rect', { x: 3.3, y: 7, width: 9.4, height: 6.6, rx: 1.6, stroke: 'currentColor', strokeWidth: 1.5 }),
    open
      ? React.createElement('path', { d: 'M5.6 7V4.9a2.6 2.6 0 0 1 5 1', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' })
      : React.createElement('path', { d: 'M5.4 7V5.1a2.6 2.6 0 0 1 5.2 0V7', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
    React.createElement('circle', { cx: 8, cy: 10.2, r: 0.9, fill: 'currentColor' }),
  )
}

/** A plus for a new terminal. */
function PlusIcon() {
  return React.createElement(
    'svg',
    { width: 15, height: 15, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    React.createElement('path', { d: 'M8 3.2v9.6M3.2 8h9.6', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }),
  )
}

/** A check for the selected theme swatch. */
function CheckIcon() {
  return React.createElement(
    'svg',
    { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    React.createElement('path', {
      d: 'M3.4 8.3l2.9 2.9 6.3-6.4',
      stroke: 'currentColor',
      strokeWidth: 1.8,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
  )
}

/** A close glyph for the settings sheet. */
function CloseIcon() {
  return React.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    React.createElement('path', { d: 'M4 4l8 8M12 4l-8 8', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }),
  )
}

/** A switch, rendered as a button with the switch role. */
function Switch(props) {
  return React.createElement('button', {
    type: 'button',
    role: 'switch',
    className: 'ait-switch',
    'aria-checked': props.checked ? 'true' : 'false',
    'data-on': props.checked ? 'true' : 'false',
    onClick: () => props.onChange(!props.checked),
  })
}

/** A segmented control: a small set of mutually exclusive options. */
function Segmented(props) {
  return React.createElement(
    'span',
    { className: 'ait-segment' },
    props.options.map((option) =>
      React.createElement(
        'button',
        {
          key: option.value,
          type: 'button',
          'data-on': props.value === option.value ? 'true' : 'false',
          onClick: () => props.onChange(option.value),
        },
        option.label,
      ),
    ),
  )
}

/**
 * One terminal body: an xterm instance attached to one Host session over a
 * WebSocket stream, plus the settings sheet and the idle-handback indicator.
 */
export function TerminalView(props) {
  const { sessionId, terminalId, labels, onNewTab, onCloseTab } = props
  const hostRef = React.useRef(null)
  const termRef = React.useRef(null)
  const fitRef = React.useRef(null)
  const socketRef = React.useRef(null)
  const writableRef = React.useRef(false)
  const labelsRef = React.useRef(labels)
  const onCloseRef = React.useRef(onCloseTab)
  const onNewRef = React.useRef(onNewTab)
  const settingsRef = React.useRef(null)
  const lockedRef = React.useRef(readLock(terminalId))
  labelsRef.current = labels
  onCloseRef.current = onCloseTab
  onNewRef.current = onNewTab

  const [status, setStatus] = React.useState({
    phase: 'starting',
    holder: 'agent',
    suspended: false,
    name: props.name || terminalId,
    cols: 0,
    rows: 0,
  })
  const [notice, setNotice] = React.useState(null)
  const [settings, setSettings] = React.useState(() => currentSettings())
  const [panelOpen, setPanelOpen] = React.useState(false)
  const [locked, setLocked] = React.useState(lockedRef.current)
  const [zoom, setZoom] = React.useState(0)
  const [inputEpoch, setInputEpoch] = React.useState(0)
  const [flash, setFlash] = React.useState(false)
  const [painted, setPainted] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  settingsRef.current = settings
  lockedRef.current = locked

  React.useEffect(() => {
    injectCss()
    return subscribeSettings(setSettings)
  }, [])

  const send = (message) => {
    const socket = socketRef.current
    if (socket !== null && socket.readyState === 1) socket.send(JSON.stringify(message))
  }

  React.useEffect(() => {
    const host = hostRef.current
    if (host === null) return undefined
    let disposed = false
    let fitTimer = 0
    let exitTimer = 0
    let bellTimer = 0
    let lockHintAt = 0
    let exited = false
    const initial = settingsRef.current !== null ? settingsRef.current : currentSettings()

    const term = new Terminal({
      allowProposedApi: true,
      convertEol: false,
      cursorBlink: initial.cursorBlink,
      cursorStyle: initial.cursorStyle,
      fontFamily: initial.fontFamily,
      fontSize: initial.fontSize,
      fontWeight: initial.fontWeight,
      fontWeightBold: initial.fontWeightBold,
      lineHeight: initial.lineHeight,
      letterSpacing: 0,
      scrollback: initial.scrollback,
      theme: themeFor(initial),
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    try {
      term.loadAddon(new WebLinksAddon())
    } catch {
      // A link addon that cannot attach is not worth failing the terminal over.
    }
    term.open(host)
    termRef.current = term
    fitRef.current = fit
    const fitNow = () => {
      if (disposed) return
      if (host.clientWidth < 8 || host.clientHeight < 8) return
      try {
        fit.fit()
      } catch {
        return
      }
      term.scrollToBottom()
    }
    const fitSoon = () => {
      if (fitTimer !== 0) return
      fitTimer = window.setTimeout(() => {
        fitTimer = 0
        fitNow()
      }, 60)
    }
    fitNow()

    const showStatus = (message) => {
      const next = {
        phase: message.phase || 'running',
        holder: (message.lease && message.lease.holder) || 'agent',
        suspended: Boolean(message.lease && message.lease.suspended),
        name: message.name || props.name || terminalId,
        cols: message.cols || 0,
        rows: message.rows || 0,
      }
      setStatus(next)
      writableRef.current = next.holder === 'human'
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url =
      protocol +
      '//' +
      window.location.host +
      (props.attachPath || '/agent-terminal-bridge/attach') +
      '?sessionId=' +
      encodeURIComponent(sessionId) +
      '&id=' +
      encodeURIComponent(terminalId)

    let connectAttempt = 0

    const connect = () => {
      if (disposed) return
      const ws = new WebSocket(url)
      ws.binaryType = 'arraybuffer'
      socketRef.current = ws
      ws.onopen = () => {
        if (disposed) return
        connectAttempt = 0
        setNotice(null)
      }
      ws.onmessage = (event) => {
        if (disposed) return
        if (typeof event.data === 'string') {
          let message
          try {
            message = JSON.parse(event.data)
          } catch {
            return
          }
          if (message.type === 'hello') {
            setStatus((current) => Object.assign({}, current, { name: message.name || current.name }))
            if (Number.isInteger(message.cols) && Number.isInteger(message.rows)) {
              setStatus((current) => Object.assign({}, current, { cols: message.cols, rows: message.rows }))
            }
          } else if (message.type === 'snapshot') {
            term.write(typeof message.data === 'string' ? message.data : '')
            setPainted(true)
          } else if (message.type === 'status') {
            showStatus(message)
          } else if (message.type === 'denied') {
            setNotice(message.reason || labelsRef.current.denied)
            window.setTimeout(() => setNotice(null), 2500)
          } else if (message.type === 'exited') {
            exited = true
            showStatus(message)
            setStatus((current) => Object.assign({}, current, { phase: 'exited' }))
            writableRef.current = false
            const code = Number.isInteger(message.exitCode) ? message.exitCode : null
            setNotice(labelsRef.current.exited + (code === null ? '' : ' · ' + code))
            exitTimer = window.setTimeout(() => {
              if (!disposed && onCloseRef.current) onCloseRef.current()
            }, 1200)
          }
          return
        }
        term.write(new Uint8Array(event.data))
      }
      ws.onclose = () => {
        if (disposed) return
        if (exited) return
        if (connectAttempt < 4) {
          connectAttempt += 1
          setNotice(labelsRef.current.reconnecting)
          window.setTimeout(() => {
            if (!disposed) connect()
          }, 400 * connectAttempt)
        } else {
          setNotice(labelsRef.current.disconnected)
        }
      }
      ws.onerror = () => {
        // onclose carries the retry.
      }
    }

    const showLockHint = () => {
      const now = Date.now()
      if (now - lockHintAt < 2500) return
      lockHintAt = now
      setNotice(labelsRef.current.lockHint)
      window.setTimeout(() => setNotice(null), 1800)
    }

    // A keystroke takes the keyboard, not a click. The local view becomes
    // writable immediately; the server's lease confirmation arrives soon after
    // and the write that follows is processed in order behind the takeover.
    term.onData((data) => {
      if (lockedRef.current) {
        showLockHint()
        return
      }
      if (!writableRef.current) {
        send({ type: 'takeover' })
        writableRef.current = true
      }
      send({ type: 'write', data })
      setInputEpoch((value) => value + 1)
    })
    term.onResize(({ cols, rows }) => {
      send({ type: 'resize', cols, rows })
    })
    term.onBell(() => {
      const bell = settingsRef.current !== null ? settingsRef.current.bell : 'none'
      if (bell === 'sound') {
        beep()
      } else if (bell === 'visual') {
        if (bellTimer !== 0) window.clearTimeout(bellTimer)
        host.classList.add('ait-term-bell')
        bellTimer = window.setTimeout(() => {
          bellTimer = 0
          host.classList.remove('ait-term-bell')
        }, 500)
      }
    })

    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true
      const combo = comboFromEvent(event)
      const current = settingsRef.current !== null ? settingsRef.current : initial
      const shortcuts = current.shortcuts
      if (combo === null) return true
      if (combo === shortcuts.copy) {
        const selection = term.getSelection()
        if (selection) {
          void navigator.clipboard
            .writeText(selection)
            .then(() => setCopied(true))
            .catch(() => {})
        }
        return false
      }
      if (combo === shortcuts.paste) {
        void navigator.clipboard
          .readText()
          .then((text) => {
            if (text) term.paste(text)
          })
          .catch(() => {})
        return false
      }
      if (combo === shortcuts.newTab) {
        if (onNewRef.current) onNewRef.current()
        return false
      }
      if (combo === shortcuts.closeTab) {
        if (onCloseRef.current) onCloseRef.current()
        return false
      }
      if (combo === shortcuts.fontIncrease || (shortcuts.fontIncrease === 'ctrl+=' && combo === 'ctrl+shift+=')) {
        setZoom((value) => Math.min(15, value + 1))
        return false
      }
      if (combo === shortcuts.fontDecrease) {
        setZoom((value) => Math.max(-5, value - 1))
        return false
      }
      if (combo === shortcuts.fontReset) {
        setZoom(0)
        return false
      }
      return true
    })

    let copyTimer = 0
    term.onSelectionChange(() => {
      if (copyTimer !== 0) return
      copyTimer = window.setTimeout(() => {
        copyTimer = 0
        const current = settingsRef.current
        if (current !== null && current.copyOnSelect === false) return
        const selection = term.getSelection()
        if (selection) void navigator.clipboard.writeText(selection).catch(() => {})
      }, 120)
    })

    const onContextMenu = (event) => {
      event.preventDefault()
      const current = settingsRef.current
      if (current !== null && current.pasteOnRightClick === false) return
      void navigator.clipboard
        .readText()
        .then((text) => {
          if (text) term.paste(text)
        })
        .catch(() => {})
    }
    const onPointerDown = () => term.focus()
    host.addEventListener('contextmenu', onContextMenu)
    host.addEventListener('pointerdown', onPointerDown)
    const observer = new ResizeObserver(fitSoon)
    observer.observe(host)
    window.addEventListener('resize', fitSoon)

    connect()

    // A terminal panel is for typing: when its tab becomes active, put the
    // caret in the terminal instead of leaving focus on the tab strip.
    const focusTimer = window.setTimeout(() => {
      if (disposed) return
      term.focus()
    }, 80)

    return () => {
      disposed = true
      window.clearTimeout(focusTimer)
      if (fitTimer !== 0) window.clearTimeout(fitTimer)
      if (exitTimer !== 0) window.clearTimeout(exitTimer)
      if (bellTimer !== 0) window.clearTimeout(bellTimer)
      if (copyTimer !== 0) window.clearTimeout(copyTimer)
      observer.disconnect()
      window.removeEventListener('resize', fitSoon)
      host.removeEventListener('contextmenu', onContextMenu)
      host.removeEventListener('pointerdown', onPointerDown)
      const socket = socketRef.current
      if (socket !== null) {
        try {
          socket.close()
        } catch {
          // already closed
        }
      }
      socketRef.current = null
      term.dispose()
      termRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, terminalId])

  React.useEffect(() => {
    const term = termRef.current
    if (term === null) return
    const size = Math.min(28, Math.max(8, settings.fontSize + zoom))
    term.options.theme = themeFor(settings)
    term.options.fontFamily = settings.fontFamily
    term.options.fontSize = size
    term.options.fontWeight = settings.fontWeight
    term.options.fontWeightBold = settings.fontWeightBold
    term.options.lineHeight = settings.lineHeight
    term.options.cursorStyle = settings.cursorStyle
    term.options.cursorBlink = settings.cursorBlink
    term.options.scrollback = settings.scrollback
    const host = hostRef.current
    if (host !== null) {
      host.style.fontVariantLigatures = settings.ligatures ? 'contextual' : 'none'
      host.style.fontFeatureSettings = settings.ligatures ? '"calt" 1, "liga" 1' : '"calt" 0, "liga" 0'
    }
    if (fitRef.current !== null) {
      try {
        fitRef.current.fit()
      } catch {
        // The container may be hidden while a tab is in the background.
      }
    }
  }, [settings, zoom])

  // The person has the keyboard only while they keep typing. Every keystroke
  // restarts this timer; when it fires the lease goes back to the agent and the
  // countdown line disappears with the next status message.
  React.useEffect(() => {
    if (locked || status.phase === 'exited' || status.holder !== 'human' || status.suspended) return undefined
    const ms = Math.max(1, settings.idleHandback) * 1000
    const timer = window.setTimeout(() => {
      send({ type: 'handback' })
    }, ms)
    return () => window.clearTimeout(timer)
    // send is stable through the ref-backed socket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.holder, status.suspended, status.phase, locked, settings.idleHandback, inputEpoch])

  React.useEffect(() => {
    if (!copied) return undefined
    const timer = window.setTimeout(() => setCopied(false), 1200)
    return () => window.clearTimeout(timer)
  }, [copied])

  const focusTerminal = () => {
    const term = termRef.current
    if (term !== null) term.focus()
  }

  const toggleLock = () => {
    const next = !locked
    setLocked(next)
    writeLock(terminalId, next)
    if (next) send({ type: 'handback' })
    // Clicking the lock must not leave the keyboard on the button: the next
    // natural gesture is to type into the terminal again.
    focusTerminal()
  }

  const closePanel = () => {
    setPanelOpen(false)
    focusTerminal()
  }

  const state = uiState(status, locked, painted)
  const bannerText =
    state === 'exited'
      ? labels.exited
      : state === 'secret'
        ? labels.secret
        : state === 'locked'
          ? labels.locked
          : state === 'connecting'
            ? labels.connecting
            : state === 'human'
              ? labels.human
              : labels.agent
  const chrome = chromeFor(settings)
  const palette = paletteOf(settings.theme)
  const size = Math.min(28, Math.max(8, settings.fontSize + zoom))
  const countdownMs = Math.max(1, settings.idleHandback) * 1000
  const showCountdown = !locked && !status.suspended && status.phase !== 'exited' && status.holder === 'human'

  const style = {
    '--ait-bg': palette.background,
    '--ait-fg': palette.foreground,
    '--ait-text': chrome.text,
    '--ait-muted': chrome.muted,
    '--ait-accent': chrome.accent,
    background: `color-mix(in srgb, ${palette.background} 95%, ${palette.foreground} 5%)`,
    color: palette.foreground,
  }

  return React.createElement(
    'section',
    {
      className: 'ait-terminal',
      'data-light': chrome.light ? 'true' : 'false',
      style,
      onKeyDown: (event) => {
        if (event.key !== 'Escape' || !panelOpen) return
        event.preventDefault()
        event.stopPropagation()
        closePanel()
      },
    },
    React.createElement(
      'header',
      { className: 'ait-bar' },
      React.createElement('span', { className: 'ait-glyph' }, TerminalGlyph()),
      React.createElement('span', { className: 'ait-name', title: status.name }, humanName(status.name) ?? ''),
      React.createElement(
        'span',
        { className: 'ait-state', 'data-state': state, 'aria-live': 'polite' },
        React.createElement('span', { className: 'dot' }),
        React.createElement('span', { className: 'ait-state-text', key: state }, bannerText),
      ),
      showCountdown
        ? React.createElement('div', {
            className: 'ait-idle',
            key: inputEpoch,
            style: { animationDuration: countdownMs + 'ms' },
          })
        : null,
      React.createElement(
        'div',
        { className: 'ait-actions' },
        React.createElement(
          'button',
          {
            className: 'ait-icon',
            type: 'button',
            'data-tip': locked ? labels.unlock : labels.lock,
            'aria-label': locked ? labels.unlock : labels.lock,
            'data-on': locked ? 'true' : 'false',
            'data-flash': flash ? 'true' : 'false',
            onClick: () => {
              toggleLock()
              setFlash(true)
              window.setTimeout(() => setFlash(false), 500)
            },
          },
          LockIcon(locked),
        ),
        React.createElement(
          'button',
          {
            className: 'ait-icon',
            type: 'button',
            'data-tip': labels.newTab,
            'aria-label': labels.newTab,
            onClick: () => {
              if (onNewRef.current) onNewRef.current()
            },
          },
          PlusIcon(),
        ),
        React.createElement(
          'button',
          {
            className: 'ait-icon',
            type: 'button',
            'data-tip': labels.settings,
            'aria-label': labels.settings,
            onClick: () => setPanelOpen((open) => !open),
          },
          SettingsIcon(),
        ),
      ),
    ),
    notice === null ? null : React.createElement('div', { className: 'ait-notice' }, notice),
    React.createElement(
      'div',
      { className: 'ait-stage' },
      React.createElement('div', { className: 'ait-host', ref: hostRef }),
      painted
        ? null
        : React.createElement(
            'div',
            { className: 'ait-connecting' },
            React.createElement('span', { className: 'ait-spinner' }),
            React.createElement('span', { className: 'ait-connecting-text' }, labels.connectingHint),
          ),
    ),
    copied
      ? React.createElement(
          'div',
          { className: 'ait-toast' },
          CheckIcon(),
          React.createElement('span', null, labels.copied),
        )
      : null,
    panelOpen
      ? React.createElement(
          React.Fragment,
          null,
          React.createElement('div', {
            className: 'ait-backdrop',
            onClick: closePanel,
          }),
          React.createElement(TerminalSettings, {
            settings,
            onChange: (patch) => writeSettings({ ...settings, ...patch }),
            onReset: () => resetSettings(),
            onClose: closePanel,
            fontSize: size,
          }),
        )
      : null,
  )
}

/** The session name when it is a real name, otherwise null. */
function humanName(name) {
  if (typeof name !== 'string' || name.trim() === '') return null
  if (/^s-[0-9a-f]{4,}/i.test(name)) return null
  return name
}

/**
 * The settings sheet: an overlay inside the terminal panel, never a dialog.
 * Every change is written immediately, so the terminal updates as you edit.
 */
function TerminalSettings(props) {
  const { settings, onChange, onReset, onClose, fontSize } = props
  const [recording, setRecording] = React.useState(null)
  const [tab, setTab] = React.useState('theme')
  const rowRef = React.useRef(null)

  React.useEffect(() => {
    if (recording !== null && rowRef.current !== null) rowRef.current.focus()
  }, [recording])
  React.useEffect(() => {
    setRecording(null)
  }, [tab])

  const set = (patch) => onChange(patch)
  const stack = FONT_STACKS.find((item) => item.value === settings.fontFamily) ?? FONT_STACKS[0]
  const shortcuts = settings.shortcuts
  const palette = paletteOf(settings.theme)
  const themeCursor = palette.cursor ?? '#ffffff'

  const changeShortcut = (action, combo) => {
    if (combo === null) return
    onChange({ shortcuts: { ...shortcuts, [action]: combo } })
    setRecording(null)
  }

  const clamp = (value, min, max) => {
    const number = Number(value)
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : min
  }

  const tabs = [
    ['theme', '主题与字体'],
    ['behavior', '光标与行为'],
    ['keys', '快捷键'],
  ]

  const card = (...rows) => React.createElement('div', { className: 'ait-card' }, ...rows)
  const group = (label, body) =>
    React.createElement(
      'div',
      { className: 'ait-group' },
      React.createElement('p', { className: 'ait-group-label' }, label),
      body,
    )

  const themeGroup = group(
    '主题',
    card(
      React.createElement(
        'div',
        { className: 'ait-themes' },
        Object.keys(THEMES).map((key) =>
          React.createElement(
            'button',
            {
              key,
              type: 'button',
              className: 'ait-theme',
              'data-on': settings.theme === key ? 'true' : 'false',
              'aria-pressed': settings.theme === key ? 'true' : 'false',
              onClick: () => set({ theme: key }),
            },
            React.createElement(
              'span',
              { className: 'ait-swatch', style: { background: THEMES[key].theme.background } },
              React.createElement(
                'span',
                { className: 'ait-swatch-dots' },
                React.createElement('i', { style: { background: THEMES[key].theme.red } }),
                React.createElement('i', { style: { background: THEMES[key].theme.yellow } }),
                React.createElement('i', { style: { background: THEMES[key].theme.green } }),
              ),
              React.createElement('span', {
                className: 'ait-swatch-line',
                style: { background: THEMES[key].theme.foreground, width: '14px' },
              }),
              React.createElement('span', {
                className: 'ait-swatch-line',
                style: { background: THEMES[key].theme.foreground, width: '9px' },
              }),
            ),
            React.createElement('span', { className: 'ait-theme-name' }, THEMES[key].label),
            settings.theme === key
              ? React.createElement('span', { className: 'ait-theme-check' }, CheckIcon())
              : null,
          ),
        ),
      ),
    ),
  )

  const fontGroup = group(
    '字体',
    card(
      React.createElement(
        'div',
        { className: 'ait-row' },
        React.createElement('span', { className: 'ait-row-label' }, '字体'),
        React.createElement(
          'select',
          {
            className: 'ait-select',
            value: stack.id,
            onChange: (event) => {
              const next = FONT_STACKS.find((item) => item.id === event.target.value)
              if (next !== undefined) set({ fontFamily: next.value })
            },
          },
          FONT_STACKS.map((item) => React.createElement('option', { key: item.id, value: item.id }, item.label)),
        ),
      ),
      React.createElement(
        'div',
        { className: 'ait-row' },
        React.createElement('span', { className: 'ait-row-label' }, '字号'),
        React.createElement(
          'span',
          { className: 'ait-stepper' },
          React.createElement(
            'button',
            {
              type: 'button',
              'aria-label': '减小字号',
              onClick: () => set({ fontSize: Math.max(8, settings.fontSize - 1) }),
            },
            '−',
          ),
          React.createElement('span', { className: 'ait-stepper-value' }, String(fontSize)),
          React.createElement(
            'button',
            {
              type: 'button',
              'aria-label': '增大字号',
              onClick: () => set({ fontSize: Math.min(28, settings.fontSize + 1) }),
            },
            '+',
          ),
        ),
      ),
      React.createElement(
        'div',
        { className: 'ait-row' },
        React.createElement('span', { className: 'ait-row-label' }, '行高'),
        React.createElement('input', {
          className: 'ait-input',
          type: 'number',
          min: 0.9,
          max: 2.2,
          step: 0.05,
          value: settings.lineHeight,
          onChange: (event) => set({ lineHeight: clamp(event.target.value, 0.9, 2.2) }),
        }),
      ),
      React.createElement(
        'div',
        { className: 'ait-row' },
        React.createElement('span', { className: 'ait-row-label' }, '字重'),
        React.createElement(
          'select',
          {
            className: 'ait-select',
            value: settings.fontWeight,
            onChange: (event) => set({ fontWeight: Number(event.target.value) }),
          },
          [
            [300, '细体 300'],
            [400, '常规 400'],
            [500, '中等 500'],
            [600, '半粗 600'],
            [700, '粗体 700'],
          ].map(([value, label]) => React.createElement('option', { key: value, value }, label)),
        ),
      ),
      React.createElement(
        'div',
        { className: 'ait-row' },
        React.createElement('span', { className: 'ait-row-label' }, '连字'),
        React.createElement(Switch, {
          checked: settings.ligatures,
          onChange: (checked) => set({ ligatures: checked }),
        }),
      ),
    ),
  )

  const cursorGroup = group(
    '光标',
    card(
      React.createElement(
        'div',
        { className: 'ait-row' },
        React.createElement('span', { className: 'ait-row-label' }, '形状'),
        React.createElement(Segmented, {
          value: settings.cursorStyle,
          options: [
            { value: 'block', label: '方块' },
            { value: 'bar', label: '竖线' },
            { value: 'underline', label: '下划线' },
          ],
          onChange: (value) => set({ cursorStyle: value }),
        }),
      ),
      React.createElement(
        'div',
        { className: 'ait-row' },
        React.createElement('span', { className: 'ait-row-label' }, '闪烁'),
        React.createElement(Switch, {
          checked: settings.cursorBlink,
          onChange: (checked) => set({ cursorBlink: checked }),
        }),
      ),
      React.createElement(
        'div',
        { className: 'ait-row' },
        React.createElement('span', { className: 'ait-row-label' }, '颜色'),
        React.createElement(
          'span',
          { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
          React.createElement(
            'label',
            { className: 'ait-color', title: '选择光标颜色' },
            React.createElement('span', {
              style: {
                background: /^#[0-9a-f]{6}$/i.test(settings.cursorColor) ? settings.cursorColor : themeCursor,
              },
            }),
            React.createElement('input', {
              type: 'color',
              value: /^#[0-9a-f]{6}$/i.test(settings.cursorColor) ? settings.cursorColor : themeCursor,
              onChange: (event) => set({ cursorColor: event.target.value }),
            }),
          ),
          React.createElement(
            'button',
            { className: 'ait-ghost', type: 'button', onClick: () => set({ cursorColor: '' }) },
            '主题色',
          ),
        ),
      ),
    ),
  )

  const scrollGroup = group(
    '滚动与提示',
    card(
      React.createElement(
        'div',
        { className: 'ait-row' },
        React.createElement('span', { className: 'ait-row-label' }, '回滚行数'),
        React.createElement('input', {
          className: 'ait-input',
          type: 'number',
          min: 500,
          max: 200000,
          step: 500,
          value: settings.scrollback,
          onChange: (event) => set({ scrollback: clamp(event.target.value, 500, 200000) }),
        }),
      ),
      React.createElement(
        'div',
        { className: 'ait-row' },
        React.createElement('span', { className: 'ait-row-label' }, '响铃'),
        React.createElement(Segmented, {
          value: settings.bell,
          options: [
            { value: 'none', label: '关闭' },
            { value: 'visual', label: '闪烁' },
            { value: 'sound', label: '声音' },
          ],
          onChange: (value) => set({ bell: value }),
        }),
      ),
    ),
  )

  const interactionGroup = group(
    '交互与剪贴板',
    card(
      React.createElement(
        'div',
        { className: 'ait-row' },
        React.createElement(
          'span',
          null,
          React.createElement('div', { className: 'ait-row-label' }, '停止输入后交还'),
          React.createElement('div', { className: 'ait-row-hint' }, '秒；打字期间由你控制'),
        ),
        React.createElement('input', {
          className: 'ait-input',
          type: 'number',
          min: 1,
          max: 30,
          step: 1,
          value: settings.idleHandback,
          onChange: (event) => set({ idleHandback: clamp(event.target.value, 1, 30) }),
        }),
      ),
      React.createElement(
        'div',
        { className: 'ait-row' },
        React.createElement('span', { className: 'ait-row-label' }, '选中即复制'),
        React.createElement(Switch, {
          checked: settings.copyOnSelect,
          onChange: (checked) => set({ copyOnSelect: checked }),
        }),
      ),
      React.createElement(
        'div',
        { className: 'ait-row' },
        React.createElement('span', { className: 'ait-row-label' }, '右键粘贴'),
        React.createElement(Switch, {
          checked: settings.pasteOnRightClick,
          onChange: (checked) => set({ pasteOnRightClick: checked }),
        }),
      ),
    ),
  )

  const keysGroup = React.createElement(
    'div',
    { className: 'ait-group' },
    React.createElement('p', { className: 'ait-sheet-hint' }, '点击右侧组合键重新绑定，按 Esc 取消。'),
    card(
      ...Object.keys(SHORTCUT_LABELS).map((action) =>
        React.createElement(
          'div',
          { className: 'ait-row', key: action },
          React.createElement('span', { className: 'ait-row-label' }, SHORTCUT_LABELS[action]),
          React.createElement(
            'button',
            {
              ref: recording === action ? rowRef : undefined,
              type: 'button',
              className: 'ait-key',
              'data-recording': recording === action ? 'true' : 'false',
              title: '点击后按下新的组合键',
              onClick: () => setRecording(recording === action ? null : action),
              onKeyDown: (event) => {
                if (recording !== action) return
                event.preventDefault()
                event.stopPropagation()
                if (event.key === 'Escape') {
                  setRecording(null)
                  return
                }
                changeShortcut(action, comboFromEvent(event))
              },
            },
            recording === action ? '按下组合键…' : comboLabel(shortcuts[action]),
          ),
        ),
      ),
    ),
  )

  const panels = {
    theme: [themeGroup, fontGroup],
    behavior: [cursorGroup, scrollGroup, interactionGroup],
    keys: [keysGroup],
  }
  const activeLabel = tabs.find(([id]) => id === tab)?.[1] ?? ''

  return React.createElement(
    'div',
    { className: 'ait-sheet', role: 'group', 'aria-label': '终端设置' },
    React.createElement(
      'div',
      { className: 'ait-sheet-head' },
      React.createElement('span', { className: 'ait-sheet-title' }, '终端设置'),
      React.createElement(
        'button',
        {
          className: 'ait-icon',
          type: 'button',
          'data-tip': '关闭',
          'aria-label': '关闭',
          onClick: onClose,
        },
        CloseIcon(),
      ),
    ),
    React.createElement(
      'div',
      { className: 'ait-sheet-tabs', role: 'tablist', 'aria-label': '设置分类' },
      tabs.map(([id, label]) =>
        React.createElement(
          'button',
          {
            key: id,
            type: 'button',
            role: 'tab',
            className: 'ait-sheet-tab',
            'aria-selected': tab === id ? 'true' : 'false',
            'data-on': tab === id ? 'true' : 'false',
            onClick: () => setTab(id),
          },
          label,
        ),
      ),
    ),
    React.createElement(
      'div',
      { className: 'ait-sheet-body', role: 'tabpanel', 'aria-label': activeLabel },
      React.createElement('div', { className: 'ait-tab-body', key: tab }, ...(panels[tab] ?? [])),
    ),
    React.createElement(
      'div',
      { className: 'ait-sheet-foot' },
      React.createElement(
        'button',
        {
          className: 'ait-ghost',
          type: 'button',
          onClick: () => {
            onReset()
            setRecording(null)
          },
        },
        '恢复默认',
      ),
      React.createElement('span', { className: 'ait-saved' }, '改动自动保存 · ' + fontSize + 'px'),
    ),
  )
}
