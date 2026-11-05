/**
 * Real terminal renderer for the right-sidebar panel.
 *
 * Built into `client/client.terminal.js` by `scripts/build-client.mjs`. The
 * chunk is loaded lazily by `client/index.js`, so xterm.js only arrives when a
 * terminal tab is actually opened.
 *
 * The panel is deliberately a terminal, not a chat box: there is no command
 * input, no send button and no key row. xterm.js owns the keyboard, and every
 * byte it emits goes straight into the PTY the agent drives.
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
    label: 'Solarized Dark',
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
  shortcuts: { ...DEFAULT_SHORTCUTS },
}

let cachedSettings = null
const settingsListeners = new Set()

/** Whether a palette is light enough to need dark-on-light chrome. */
function isLightTheme(key) {
  return key === 'light' || key === 'solarizedLight'
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

/** The terminal palette with the optional custom cursor color applied. */
function themeFor(settings) {
  const base = THEMES[settings.theme] !== undefined ? THEMES[settings.theme].theme : THEMES.dark.theme
  const theme = { ...base }
  if (typeof settings.cursorColor === 'string' && /^#[0-9a-f]{6}$/i.test(settings.cursorColor)) {
    theme.cursor = settings.cursorColor
  }
  return theme
}

/** Panel chrome colors that follow the terminal palette. */
function chromeFor(settings) {
  const light = isLightTheme(settings.theme)
  return light
    ? {
        bar: '#ececec',
        border: '#d6d6d6',
        chip: '#e0e0e0',
        chipHover: '#d5d5d5',
        text: '#2b2b2b',
        muted: '#6b6b6b',
        panel: '#f7f7f7',
        field: '#ffffff',
        fieldBorder: '#cfcfcf',
      }
    : {
        bar: '#242424',
        border: '#333333',
        chip: '#333333',
        chipHover: '#3d3d3d',
        text: '#e6e6e6',
        muted: '#9d9d9d',
        panel: '#242424',
        field: '#2c2c2c',
        fieldBorder: '#3d3d3d',
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

/** The session name when it is a real name, otherwise null. */
function humanName(name) {
  if (typeof name !== 'string' || name.trim() === '') return null
  if (/^s-[0-9a-f]{4,}/i.test(name)) return null
  return name
}

/** A drawn gear, matching the terminal glyph's stroke weight. */
function GearGlyph() {
  return React.createElement(
    'svg',
    { width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    React.createElement('circle', { cx: 8, cy: 8, r: 2.2, stroke: 'currentColor', strokeWidth: 1.5 }),
    React.createElement('path', {
      d: 'M8 1.6v1.5M8 12.9v1.5M1.6 8h1.5M12.9 8h1.5M3.5 3.5l1.1 1.1M11.4 11.4l1.1 1.1M12.5 3.5l-1.1 1.1M4.6 11.4l-1.1 1.1',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinecap: 'round',
    }),
  )
}

const PANEL_CSS = [
  '.ait-terminal{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}',
  '.ait-terminal-bar{display:flex;align-items:center;gap:8px;padding:5px 10px;background:var(--ait-bar);border-bottom:1px solid var(--ait-border);flex:none;font-size:12px;min-height:0;color:var(--ait-text)}',
  '.ait-terminal-name{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:40%;font-size:12px;flex:0 1 auto}',
  '.ait-banner{display:inline-flex;align-items:center;gap:6px;padding:2px 9px;border-radius:999px;font-size:11px;line-height:17px;background:var(--ait-banner-bg);color:var(--ait-banner-fg);white-space:nowrap;flex:0 1 auto;overflow:hidden;text-overflow:ellipsis}',
  '.ait-banner[data-state="agent"]{background:#3a3320;color:#f0e2b6}',
  '.ait-banner[data-state="human"]{background:#1f3a5f;color:#cfe3ff}',
  '.ait-banner[data-state="secret"]{background:#5a2b2b;color:#ffd6d6}',
  '.ait-banner[data-state="exited"]{background:#3a2a2a;color:#e0b4b4}',
  '.ait-terminal[data-light="true"] .ait-banner[data-state="agent"]{background:#f6e7bf;color:#57460f}',
  '.ait-terminal[data-light="true"] .ait-banner[data-state="human"]{background:#d7e7fb;color:#123b66}',
  '.ait-terminal[data-light="true"] .ait-banner[data-state="secret"]{background:#f8d7d7;color:#6d1b1b}',
  '.ait-terminal[data-light="true"] .ait-banner[data-state="exited"]{background:#eccfcf;color:#5b2222}',
  '.ait-terminal-actions{margin-left:auto;display:flex;gap:6px;align-items:center;flex:none}',
  '.ait-chip{border:0;border-radius:6px;padding:3px 10px;font-size:11px;background:var(--ait-chip);color:var(--ait-text);cursor:pointer;white-space:nowrap}',
  '.ait-chip:hover{background:var(--ait-chip-hover)}',
  '.ait-chip[data-primary="true"]{background:#3a5f8a;color:#eaf2ff}',
  '.ait-chip[data-primary="true"]:hover{background:#446e9e}',
  '.ait-term-host{flex:1;min-height:0;padding:8px 10px 10px}',
  '.ait-term-host .xterm{height:100%}',
  '.ait-term-host .xterm-viewport{background:transparent!important;scrollbar-width:thin;scrollbar-color:#4a4a4a transparent}',
  '.ait-term-host .xterm-viewport::-webkit-scrollbar{width:10px}',
  '.ait-term-host .xterm-viewport::-webkit-scrollbar-thumb{background:#3a3a3a;border-radius:5px}',
  '.ait-term-notice{padding:4px 10px;font-size:11px;color:#f0e2b6;background:#3a3320;flex:none}',
  '.ait-term-error{padding:10px 12px;font-size:12px;color:#ff9a9a;flex:none}',
  '.ait-settings-backdrop{position:absolute;inset:0;background:transparent;z-index:4}',
  '.ait-settings{position:absolute;top:34px;right:8px;bottom:8px;width:min(360px,calc(100% - 16px));z-index:5;display:flex;flex-direction:column;background:var(--ait-panel);color:var(--ait-text);border:1px solid var(--ait-border);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.45);overflow:hidden;font-size:12px}',
  '.ait-settings-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--ait-border);font-weight:600;font-size:12px}',
  '.ait-settings-body{overflow:auto;padding:6px 12px 12px}',
  '.ait-settings h4{margin:12px 0 6px;font-size:11px;font-weight:600;color:var(--ait-muted);text-transform:uppercase;letter-spacing:.04em}',
  '.ait-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:4px 0}',
  '.ait-row-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.ait-field{height:26px;border-radius:6px;border:1px solid var(--ait-field-border);background:var(--ait-field);color:var(--ait-text);padding:0 8px;font-size:12px;max-width:170px;min-width:0}',
  '.ait-field[type="number"]{width:76px;max-width:76px}',
  '.ait-field[type="color"]{width:40px;max-width:40px;padding:2px}',
  '.ait-check{width:16px;height:16px;accent-color:#3a5f8a}',
  '.ait-settings-foot{display:flex;justify-content:space-between;gap:8px;padding:10px 12px;border-top:1px solid var(--ait-border)}',
  '.ait-shortcut{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:3px 0}',
  '.ait-shortcut-key{font-family:ui-monospace,monospace;font-size:11px;padding:2px 7px;border-radius:5px;background:var(--ait-chip);color:var(--ait-text);cursor:pointer;border:0}',
  '.ait-shortcut-key[data-recording="true"]{outline:1px dashed #6a9bd8;color:#8ab4f8}',
  '.ait-term-bell{animation:ait-bell 220ms ease-in-out 2}',
  '@keyframes ait-bell{0%,100%{opacity:1}50%{opacity:.55}}',
].join('')

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

/** Short human label for a lease state. */
function bannerState(status) {
  if (status.phase === 'exited') return 'exited'
  if (status.suspended) return 'secret'
  return status.holder === 'human' ? 'human' : 'agent'
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

/**
 * One terminal body: an xterm instance attached to one Host session over a
 * WebSocket stream, plus the Ptyxis-style settings sheet.
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
  const [zoom, setZoom] = React.useState(0)
  settingsRef.current = settings
  const reconnectRef = React.useRef(null)

  React.useEffect(() => {
    injectCss()
    return subscribeSettings(setSettings)
  }, [])

  React.useEffect(() => {
    const host = hostRef.current
    if (host === null) return undefined
    let disposed = false
    let fitTimer = 0
    let exitTimer = 0
    let bellTimer = 0
    let hintAt = 0
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

    const control = (message) => {
      const socket = socketRef.current
      if (socket !== null && socket.readyState === 1) socket.send(JSON.stringify(message))
    }

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
    reconnectRef.current = () => {
      connectAttempt = 0
      exited = false
      const socket = socketRef.current
      if (socket !== null) {
        try {
          socket.close()
        } catch {
          // already closed
        }
      }
      term.reset()
      connect()
    }

    term.onData((data) => {
      if (!writableRef.current) {
        const now = Date.now()
        if (now - hintAt > 3000) {
          hintAt = now
          setNotice(labelsRef.current.takeoverHint)
          window.setTimeout(() => setNotice(null), 1600)
        }
        return
      }
      control({ type: 'write', data })
    })
    term.onResize(({ cols, rows }) => {
      control({ type: 'resize', cols, rows })
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
        if (selection) void navigator.clipboard.writeText(selection).catch(() => {})
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
      // A US layout types Ctrl+Plus as Ctrl+Shift+Equal; treat it as the same
      // gesture so the Ptyxis shortcut works without rebinding.
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
      if (document.activeElement === document.body || document.activeElement === null) term.focus()
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
      reconnectRef.current = null
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

  const state = bannerState(status)
  const bannerText =
    state === 'exited'
      ? labels.exited
      : state === 'secret'
        ? labels.secret
        : state === 'human'
          ? labels.human
          : labels.agent
  const chrome = chromeFor(settings)
  const light = isLightTheme(settings.theme)
  const size = Math.min(28, Math.max(8, settings.fontSize + zoom))

  const action =
    status.phase === 'exited'
      ? null
      : status.holder === 'human'
        ? React.createElement(
            'button',
            {
              className: 'ait-chip',
              type: 'button',
              onClick: () => {
                const socket = socketRef.current
                if (socket !== null && socket.readyState === 1) socket.send(JSON.stringify({ type: 'handback' }))
              },
            },
            labels.handback,
          )
        : React.createElement(
            'button',
            {
              className: 'ait-chip',
              'data-primary': 'true',
              type: 'button',
              onClick: () => {
                const socket = socketRef.current
                if (socket !== null && socket.readyState === 1) socket.send(JSON.stringify({ type: 'takeover' }))
                if (termRef.current !== null) termRef.current.focus()
              },
            },
            labels.takeover,
          )

  const style = {
    '--ait-bar': chrome.bar,
    '--ait-border': chrome.border,
    '--ait-chip': chrome.chip,
    '--ait-chip-hover': chrome.chipHover,
    '--ait-text': chrome.text,
    '--ait-muted': chrome.muted,
    '--ait-panel': chrome.panel,
    '--ait-field': chrome.field,
    '--ait-field-border': chrome.fieldBorder,
    background: THEMES[settings.theme].theme.background,
    color: THEMES[settings.theme].theme.foreground,
  }

  return React.createElement(
    'section',
    { className: 'ait-terminal', 'data-light': light ? 'true' : 'false', style },
    React.createElement(
      'header',
      { className: 'ait-terminal-bar' },
      React.createElement('span', { className: 'ait-terminal-name', title: status.name }, humanName(status.name) ?? '终端'),
      React.createElement('span', { className: 'ait-banner', 'data-state': state }, bannerText),
      React.createElement(
        'div',
        { className: 'ait-terminal-actions' },
        React.createElement(
          'button',
          {
            className: 'ait-chip',
            type: 'button',
            title: '终端设置',
            'aria-label': '终端设置',
            onClick: () => setPanelOpen((open) => !open),
          },
          React.createElement(GearGlyph, {}),
        ),
        React.createElement(
          'button',
          {
            className: 'ait-chip',
            type: 'button',
            title: labels.newTab,
            'aria-label': labels.newTab,
            onClick: () => {
              if (onNewRef.current) onNewRef.current()
            },
          },
          '+',
        ),
        action,
      ),
    ),
    notice === null ? null : React.createElement('div', { className: 'ait-term-notice' }, notice),
    React.createElement('div', { className: 'ait-term-host', ref: hostRef }),
    panelOpen
      ? React.createElement(
          React.Fragment,
          null,
          React.createElement('div', {
            className: 'ait-settings-backdrop',
            onClick: () => setPanelOpen(false),
          }),
          React.createElement(TerminalSettings, {
            settings,
            onChange: (patch) => writeSettings({ ...settings, ...patch }),
            onReset: () => resetSettings(),
            onClose: () => setPanelOpen(false),
            fontSize: size,
          }),
        )
      : null,
  )
}

/**
 * The settings sheet: an overlay inside the terminal panel, never a dialog.
 * Every change is written immediately, so the terminal updates as you edit.
 */
function TerminalSettings(props) {
  const { settings, onChange, onReset, onClose, fontSize } = props
  const [recording, setRecording] = React.useState(null)
  const rowRef = React.useRef(null)

  React.useEffect(() => {
    if (recording !== null && rowRef.current !== null) rowRef.current.focus()
  }, [recording])

  const set = (patch) => onChange(patch)
  const stack = FONT_STACKS.find((item) => item.value === settings.fontFamily) ?? FONT_STACKS[0]
  const shortcuts = settings.shortcuts
  const themeCursor = THEMES[settings.theme]?.theme.cursor ?? '#ffffff'

  const changeShortcut = (action, combo) => {
    if (combo === null) return
    onChange({ shortcuts: { ...shortcuts, [action]: combo } })
    setRecording(null)
  }

  return React.createElement(
    'div',
    { className: 'ait-settings', role: 'group', 'aria-label': '终端设置' },
    React.createElement(
      'div',
      { className: 'ait-settings-head' },
      React.createElement('span', null, '终端设置'),
      React.createElement('button', { className: 'ait-chip', type: 'button', onClick: onClose }, '关闭'),
    ),
    React.createElement(
      'div',
      { className: 'ait-settings-body' },
      React.createElement('h4', null, '外观'),
      React.createElement(
        'div',
        { className: 'ait-row' },
        React.createElement('span', { className: 'ait-row-label' }, '主题'),
        React.createElement(
          'select',
          { className: 'ait-field', value: settings.theme, onChange: (event) => set({ theme: event.target.value }) },
          Object.keys(THEMES).map((key) => React.createElement('option', { key, value: key }, THEMES[key].label)),
        ),
      ),
      React.createElement(
        'div',
        { className: 'ait-row' },
        React.createElement('span', { className: 'ait-row-label' }, '字体'),
        React.createElement(
          'select',
          {
            className: 'ait-field',
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
        React.createElement('input', {
          className: 'ait-field',
          type: 'number',
          min: 8,
          max: 28,
          value: settings.fontSize,
          onChange: (event) => set({ fontSize: Number(event.target.value) }),
        }),
      ),
      React.createElement(
        'div',
        { className: 'ait-row' },
        React.createElement('span', { className: 'ait-row-label' }, '行高'),
        React.createElement('input', {
          className: 'ait-field',
          type: 'number',
          min: 0.9,
          max: 2.2,
          step: 0.05,
          value: settings.lineHeight,
          onChange: (event) => set({ lineHeight: Number(event.target.value) }),
        }),
      ),
      React.createElement(
        'div',
        { className: 'ait-row' },
        React.createElement('span', { className: 'ait-row-label' }, '字重'),
        React.createElement(
          'select',
          { className: 'ait-field', value: settings.fontWeight, onChange: (event) => set({ fontWeight: Number(event.target.value) }) },
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
        React.createElement('input', {
          className: 'ait-check',
          type: 'checkbox',
          checked: settings.ligatures,
          onChange: (event) => set({ ligatures: event.target.checked }),
        }),
      ),
      React.createElement('h4', null, '光标'),
      React.createElement(
        'div',
        { className: 'ait-row' },
        React.createElement('span', { className: 'ait-row-label' }, '形状'),
        React.createElement(
          'select',
          { className: 'ait-field', value: settings.cursorStyle, onChange: (event) => set({ cursorStyle: event.target.value }) },
          React.createElement('option', { value: 'block' }, '方块'),
          React.createElement('option', { value: 'bar' }, '竖线'),
          React.createElement('option', { value: 'underline' }, '下划线'),
        ),
      ),
      React.createElement(
        'div',
        { className: 'ait-row' },
        React.createElement('span', { className: 'ait-row-label' }, '闪烁'),
        React.createElement('input', {
          className: 'ait-check',
          type: 'checkbox',
          checked: settings.cursorBlink,
          onChange: (event) => set({ cursorBlink: event.target.checked }),
        }),
      ),
      React.createElement(
        'div',
        { className: 'ait-row' },
        React.createElement('span', { className: 'ait-row-label' }, '颜色'),
        React.createElement(
          'span',
          { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
          React.createElement('input', {
            className: 'ait-field',
            type: 'color',
            value: /^#[0-9a-f]{6}$/i.test(settings.cursorColor) ? settings.cursorColor : themeCursor,
            onChange: (event) => set({ cursorColor: event.target.value }),
          }),
          React.createElement(
            'button',
            { className: 'ait-chip', type: 'button', onClick: () => set({ cursorColor: '' }), title: '跟随主题' },
            '主题色',
          ),
        ),
      ),
      React.createElement('h4', null, '滚动与提示'),
      React.createElement(
        'div',
        { className: 'ait-row' },
        React.createElement('span', { className: 'ait-row-label' }, '回滚行数'),
        React.createElement('input', {
          className: 'ait-field',
          type: 'number',
          min: 500,
          max: 200000,
          step: 500,
          value: settings.scrollback,
          onChange: (event) => set({ scrollback: Number(event.target.value) }),
        }),
      ),
      React.createElement(
        'div',
        { className: 'ait-row' },
        React.createElement('span', { className: 'ait-row-label' }, '响铃'),
        React.createElement(
          'select',
          { className: 'ait-field', value: settings.bell, onChange: (event) => set({ bell: event.target.value }) },
          React.createElement('option', { value: 'none' }, '关闭'),
          React.createElement('option', { value: 'visual' }, '视觉闪烁'),
          React.createElement('option', { value: 'sound' }, '提示音'),
        ),
      ),
      React.createElement('h4', null, '复制与粘贴'),
      React.createElement(
        'div',
        { className: 'ait-row' },
        React.createElement('span', { className: 'ait-row-label' }, '选中即复制'),
        React.createElement('input', {
          className: 'ait-check',
          type: 'checkbox',
          checked: settings.copyOnSelect,
          onChange: (event) => set({ copyOnSelect: event.target.checked }),
        }),
      ),
      React.createElement(
        'div',
        { className: 'ait-row' },
        React.createElement('span', { className: 'ait-row-label' }, '右键粘贴'),
        React.createElement('input', {
          className: 'ait-check',
          type: 'checkbox',
          checked: settings.pasteOnRightClick,
          onChange: (event) => set({ pasteOnRightClick: event.target.checked }),
        }),
      ),
      React.createElement('h4', null, '快捷键（点击后按下新的组合键）'),
      Object.keys(SHORTCUT_LABELS).map((action) =>
        React.createElement(
          'div',
          { className: 'ait-shortcut', key: action },
          React.createElement('span', { className: 'ait-row-label' }, SHORTCUT_LABELS[action]),
          React.createElement(
            'button',
            {
              ref: recording === action ? rowRef : undefined,
              type: 'button',
              className: 'ait-shortcut-key',
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
    React.createElement(
      'div',
      { className: 'ait-settings-foot' },
      React.createElement(
        'button',
        {
          className: 'ait-chip',
          type: 'button',
          onClick: () => {
            onReset()
            setRecording(null)
          },
        },
        '恢复默认',
      ),
      React.createElement(
        'span',
        { style: { color: 'var(--ait-muted)', fontSize: '11px', alignSelf: 'center' } },
        '当前字号 ' + fontSize + 'px',
      ),
    ),
  )
}
