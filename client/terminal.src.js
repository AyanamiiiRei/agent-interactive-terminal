/**
 * Real terminal renderer for the right-sidebar panel.
 *
 * Built into `client/client.terminal.js` by `scripts/build-client.mjs`. The
 * chunk is loaded lazily by `client/index.js`, so xterm.js only arrives when a
 * terminal tab is actually opened.
 *
 * Interaction model: typing always allowed, and the first keystroke takes the
 * lease from the agent. A few seconds after the last keystroke the lease goes
 * back to the agent automatically in collaborate mode, which a thin countdown
 * line communicates. The person can also make the session read-only or sealed,
 * which are server-enforced access levels rather than local typing locks.
 * Mouse clicks never change the lease, so selecting and copying output works
 * in every state.
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
  adwaita: {
    label: 'Adwaita',
    theme: {
      background: '#0d1117',
      foreground: '#e6edf3',
      cursor: '#f2a65a',
      cursorAccent: '#0d1117',
      selectionBackground: 'rgba(242, 166, 90, 0.30)',
      black: '#0d1117',
      red: '#ff7b72',
      green: '#7ee787',
      yellow: '#e3b341',
      blue: '#79c0ff',
      magenta: '#d2a8ff',
      cyan: '#56d4dd',
      white: '#e6edf3',
      brightBlack: '#6e7681',
      brightRed: '#ffa198',
      brightGreen: '#aff5b4',
      brightYellow: '#f2cc60',
      brightBlue: '#a5d6ff',
      brightMagenta: '#e2c5ff',
      brightCyan: '#9aeaf2',
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
  theme: 'adwaita',
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

/** The palette for one theme key, falling back to the default. */
function paletteOf(key) {
  return THEMES[key] !== undefined ? THEMES[key].theme : THEMES.dark.theme
}

/** True when a palette background is light enough to need dark chrome text. */
function isLightPalette(palette) {
  const value = palette.background
  const match = /^#([0-9a-f]{6})$/i.exec(value)
  if (match === null) return false
  const hex = match[1]
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  const linear = (channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
  return luminance > 0.55
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
  // Version 2 introduced `follow`: older saves carried a fixed palette that
  // was only the previous default, so they migrate to following DSH once.
  const version = Number.isFinite(candidate.version) ? Number(candidate.version) : 0
  if (version >= 3 && (candidate.theme === 'follow' || THEMES[candidate.theme] !== undefined)) {
    next.theme = candidate.theme
  } else if (version === 2 && (candidate.theme === 'follow' || candidate.theme === undefined)) {
    // Version 3 made the dark Adwaita palette the default. A version 2 save
    // that only inherited the old `follow` default migrates once; an explicit
    // fixed palette is kept.
    next.theme = 'adwaita'
  } else if (version >= 2 && (candidate.theme === 'follow' || THEMES[candidate.theme] !== undefined)) {
    next.theme = candidate.theme
  }
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
  // A settings edit is always current-version input; without this marker
  // normalizeSettings would treat the patch as a legacy save and reset the
  // theme to the default, making every theme pick look inert.
  cachedSettings = normalizeSettings({ ...next, version: 3 })
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...cachedSettings, version: 3 }))
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

/** Resolve `follow` against the scheme DSH is currently showing. */
function resolvedThemeKey(settings, scheme) {
  if (settings.theme !== 'follow') return settings.theme
  return scheme === 'light' ? 'light' : 'dark'
}

/** The terminal palette with the optional custom cursor color applied. */
function themeFor(settings, scheme) {
  const base = paletteOf(resolvedThemeKey(settings, scheme))
  const theme = { ...base }
  if (typeof settings.cursorColor === 'string' && /^#[0-9a-f]{6}$/i.test(settings.cursorColor)) {
    theme.cursor = settings.cursorColor
  }
  return theme
}

/**
 * The light/dark scheme DSH resolved for the document. The shell sets
 * `body[data-ds-dark-theme]` from the user's choice, so watching that
 * attribute covers both an explicit switch and the system preference.
 */
function dshScheme() {
  if (
    typeof document !== 'undefined' &&
    document.body !== null &&
    typeof document.body !== 'undefined' &&
    typeof document.body.hasAttribute === 'function' &&
    document.body.hasAttribute('data-ds-dark-theme')
  ) {
    return 'dark'
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
  return 'light'
}

/** Subscribe to DSH scheme changes. */
function useDshScheme() {
  const [scheme, setScheme] = React.useState(dshScheme)
  React.useEffect(() => {
    const update = () => setScheme(dshScheme())
    const observer = typeof MutationObserver === 'function' ? new MutationObserver(update) : null
    if (observer !== null && document.body !== null && typeof document.body !== 'undefined') {
      observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    }
    const query = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null
    if (query !== null) {
      if (typeof query.addEventListener === 'function') query.addEventListener('change', update)
      else if (typeof query.addListener === 'function') query.addListener(update)
    }
    update()
    return () => {
      if (observer !== null) observer.disconnect()
      if (query !== null) {
        if (typeof query.removeEventListener === 'function') query.removeEventListener('change', update)
        else if (typeof query.removeListener === 'function') query.removeListener(update)
      }
    }
  }, [])
  return scheme
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
function uiState(status, painted, typing, peeking) {
  if (!painted) return 'connecting'
  if (status.phase === 'exited') return 'exited'
  if (status.access === 'sealed') return 'sealed'
  if (status.suspended) return 'secret'
  if (status.access === 'observe') return 'observe'
  if (status.holder === 'human') return 'human'
  if (typing) return 'typing'
  if (peeking) return 'peeking'
  return 'agent'
}

const PANEL_CSS = `
@property --ait-rgb-angle{syntax:'<angle>';inherits:false;initial-value:0deg}
/* The terminal page follows the DSH settings language: inset cards, a single
   blue interaction accent, 15/13 typography, and token-only chrome colors.
   The terminal palette itself stays in --ait-bg/--ait-fg because it is content. */
.ait-panel{--ait-panel-fg:#e8edf2;--ait-panel-muted:rgba(232,237,242,0.56);--ait-panel-faint:rgba(232,237,242,0.30);--ait-panel-line:rgba(255,255,255,0.08);--ait-panel-line-strong:rgba(255,255,255,0.14);--ait-accent:#f2a65a;--ait-accent-soft:rgba(242,166,90,0.14);--ait-accent-line:rgba(242,166,90,0.34);position:relative;display:flex;flex-direction:column;height:calc(100% - 16px);min-height:0;margin:8px;padding:0;overflow:hidden;border:1px solid var(--ait-panel-line);border-radius:14px;background:radial-gradient(120% 90% at 0% 0%,rgba(242,166,90,0.10),transparent 52%),linear-gradient(180deg,#151b23 0%,#0f141a 100%);color:var(--ait-panel-fg);box-shadow:0 18px 44px rgba(0,0,0,0.30),0 2px 8px rgba(0,0,0,0.22),inset 0 1px 0 rgba(255,255,255,0.05);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue","Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.ait-panel *,.ait-panel *::before,.ait-panel *::after{box-sizing:border-box}
.ait-panel-tabs{position:relative;display:flex;align-items:center;gap:8px;flex:none;height:48px;padding:0 8px 0 12px;border:0;border-bottom:1px solid var(--ait-panel-line);background:linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0));overflow:hidden}
.ait-panel-tabs>*{position:relative;z-index:1}
.ait-panel-mark{display:grid;place-items:center;width:26px;height:26px;flex:none;border:1px solid var(--ait-accent-line);border-radius:8px;background:var(--ait-accent-soft);color:var(--ait-accent)}
.ait-panel-mark svg{width:15px;height:15px}
.ait-panel-title{flex:none;font-size:13.5px;line-height:18px;font-weight:600;letter-spacing:0.01em;color:var(--ait-panel-fg);white-space:nowrap}
.ait-panel-tab-scroll{display:flex;align-items:center;gap:3px;flex:1 1 auto;min-width:0;height:30px;padding:0;border:0;border-radius:0;background:transparent;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;overscroll-behavior-x:contain;scroll-behavior:smooth}
.ait-panel-tab-scroll::-webkit-scrollbar{display:none}
.ait-panel-tab{display:flex;align-items:center;flex:0 0 auto;min-width:0;max-width:none;height:28px;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--ait-panel-muted);overflow:hidden;transition:background-color 180ms cubic-bezier(0.2,0.8,0.2,1),border-color 180ms cubic-bezier(0.2,0.8,0.2,1),color 180ms cubic-bezier(0.2,0.8,0.2,1),box-shadow 180ms cubic-bezier(0.2,0.8,0.2,1);animation:ait-session-tab-in 180ms cubic-bezier(0.2,0.8,0.2,1) both}
.ait-panel-tab:hover{background:rgba(255,255,255,0.06);color:var(--ait-panel-fg)}
.ait-panel-tab[data-on="true"]{background:var(--ait-accent-soft);border-color:var(--ait-accent-line);color:#f7e5d0;box-shadow:inset 0 1px 0 rgba(255,255,255,0.06)}
.ait-panel-tab[data-closing="true"]{animation:ait-session-tab-out 180ms cubic-bezier(0.2,0.8,0.2,1) both;pointer-events:none}
.ait-panel-tab-main{display:flex;align-items:center;gap:6px;min-width:0;flex:1 1 auto;height:100%;padding:0 2px 0 8px;border:0;background:transparent;color:inherit;font:inherit;font-size:12.5px;font-weight:500;text-align:left;cursor:pointer}
.ait-panel-tab[data-on="true"] .ait-panel-tab-main{font-weight:600}
.ait-panel-tab[data-on="true"] .ait-panel-tab-dot{background:var(--ait-accent)}
.ait-panel-tab[data-on="true"] .ait-panel-tab-dot[data-holder="human"]{background:#57e389}
.ait-panel-tab-dot{width:6px;height:6px;flex:none;border-radius:50%;background:var(--ait-panel-faint);transition:background-color 180ms cubic-bezier(0.2,0.8,0.2,1)}
.ait-panel-tab-dot[data-holder="human"]{background:#57e389}
.ait-panel-tab-dot[data-holder="human"]+*{color:#d8f5df}
.ait-panel-tab-dot[data-phase="running"]{background:#62a0ea}
.ait-panel-tab-dot[data-phase="waiting_input"]{background:#f5c211}
.ait-panel-tab-dot[data-phase="exited"]{background:rgba(232,237,242,0.24)}
.ait-panel-tab-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ait-panel-tab-close{display:grid;place-items:center;width:18px;height:18px;margin-right:4px;flex:none;border:0;border-radius:5px;background:transparent;color:var(--ait-panel-faint);cursor:pointer;opacity:0;transition:opacity 140ms cubic-bezier(0.2,0.8,0.2,1),background-color 140ms cubic-bezier(0.2,0.8,0.2,1),color 140ms cubic-bezier(0.2,0.8,0.2,1)}
.ait-panel-tab-close svg{width:12px;height:12px}
.ait-panel-tab:hover .ait-panel-tab-close,.ait-panel-tab:focus-within .ait-panel-tab-close,.ait-panel-tab[data-on="true"] .ait-panel-tab-close{opacity:1}
.ait-panel-tab-close:hover{background:rgba(255,255,255,0.10);color:#ffffff}
.ait-panel-tab-main:focus-visible,.ait-panel-tab-close:focus-visible{outline:2px solid var(--ait-accent);outline-offset:-2px}
.ait-panel-add{width:28px;height:28px;flex:none;margin-left:2px;display:grid;place-items:center;border:1px solid var(--ait-panel-line);border-radius:7px;background:rgba(255,255,255,0.04);color:var(--ait-panel-muted);cursor:pointer;transition:background-color 180ms cubic-bezier(0.2,0.8,0.2,1),border-color 180ms cubic-bezier(0.2,0.8,0.2,1),color 180ms cubic-bezier(0.2,0.8,0.2,1),transform 120ms cubic-bezier(0.2,0.8,0.2,1)}
.ait-panel-add svg{width:15px;height:15px}
.ait-panel-add:hover{border-color:var(--ait-accent-line);background:var(--ait-accent-soft);color:var(--ait-accent)}
.ait-panel-add:active{transform:scale(0.94)}
.ait-panel-add:focus-visible{outline:2px solid var(--ait-accent);outline-offset:2px}
.ait-panel-body{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;padding:0}
.ait-panel-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;margin:10px;padding:36px 24px;text-align:center;border:1px solid var(--ait-panel-line);border-radius:12px;background:radial-gradient(120% 100% at 50% 0%,rgba(242,166,90,0.08),rgba(255,255,255,0.025) 55%,rgba(255,255,255,0.015));color:var(--ait-panel-faint)}
.ait-panel-empty svg{width:30px;height:30px;margin-bottom:4px;color:var(--ait-accent);opacity:0.9}
.ait-empty-title{max-width:280px;font-size:14px;line-height:20px;font-weight:600;color:var(--ait-panel-fg)}
.ait-empty-hint{max-width:280px;font-size:12.5px;line-height:18px;color:var(--ait-panel-muted)}
.ait-panel-empty .ait-panel-open{margin-top:10px}
.ait-panel-open{height:34px;padding:0 16px;border:0;border-radius:8px;background:var(--ait-accent);color:#1d1309;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;box-shadow:0 4px 14px rgba(242,166,90,0.22);transition:background-color 180ms cubic-bezier(0.2,0.8,0.2,1),transform 120ms cubic-bezier(0.2,0.8,0.2,1),box-shadow 180ms cubic-bezier(0.2,0.8,0.2,1)}
.ait-panel-open:hover{background:#f7b46e;box-shadow:0 6px 18px rgba(242,166,90,0.28)}
.ait-panel-open:active{transform:scale(0.97)}
.ait-panel-open:focus-visible{outline:2px solid var(--ait-accent);outline-offset:2px}

.ait-terminal{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;gap:0;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue","Segoe UI",system-ui,sans-serif;color:var(--ait-panel-fg);background:transparent;-webkit-font-smoothing:antialiased}
.ait-terminal *,.ait-terminal *::before,.ait-terminal *::after{box-sizing:border-box}
.ait-terminal-card{position:relative;z-index:1;display:flex;flex-direction:column;flex:1;min-height:0;margin:0 10px 10px;overflow:hidden;border:1px solid var(--ait-panel-line);border-radius:10px;background:var(--ait-bg);box-shadow:inset 0 1px 0 rgba(255,255,255,0.03),0 1px 2px rgba(0,0,0,0.18);transition:border-color 180ms cubic-bezier(0.2,0.8,0.2,1),box-shadow 180ms cubic-bezier(0.2,0.8,0.2,1)}
.ait-terminal-card:focus-within{border-color:var(--ait-accent-line);box-shadow:inset 0 1px 0 rgba(255,255,255,0.04),0 0 0 1px var(--ait-accent-soft)}
.ait-bar{position:relative;display:flex;align-items:center;gap:8px;height:38px;padding:0 8px 0 12px;flex:none;border:0;border-bottom:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.025);z-index:2}
.ait-state{display:inline-flex;align-items:center;gap:6px;min-width:0;height:22px;padding:0 8px;border:1px solid rgba(255,255,255,0.07);border-radius:999px;background:rgba(255,255,255,0.03);font-size:12px;line-height:16px;font-weight:400;color:var(--ait-panel-muted);transition:color 180ms cubic-bezier(0.2,0.8,0.2,1)}
.ait-state .dot{width:6px;height:6px;flex:none;border-radius:50%;background:var(--ait-panel-faint);transition:background-color 180ms cubic-bezier(0.2,0.8,0.2,1)}
.ait-state[data-state="agent"] .dot,.ait-state[data-state="ready"] .dot{background:#57e389}
.ait-state[data-state="typing"] .dot,.ait-state[data-state="peeking"] .dot{background:#62a0ea}
.ait-state[data-state="human"] .dot{background:#57e389}
.ait-state[data-state="observe"] .dot{background:#f5c211}
.ait-state[data-state="secret"] .dot{background:#f5c211}
.ait-state[data-state="sealed"] .dot{background:#ff7b72}
.ait-state[data-state="exited"] .dot{background:rgba(232,237,242,0.30)}
.ait-state[data-state="connecting"] .dot{background:rgba(232,237,242,0.30)}
.ait-state[data-state="secret"],.ait-state[data-state="sealed"]{color:var(--ait-panel-fg)}
.ait-state-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ait-actions{display:flex;align-items:center;gap:2px;margin-left:auto;flex:none;padding:2px;border:1px solid rgba(255,255,255,0.07);border-radius:8px;background:rgba(255,255,255,0.025)}
.ait-icon{width:26px;height:26px;display:grid;place-items:center;border:0;padding:0;border-radius:6px;background:transparent;color:var(--ait-panel-muted);cursor:pointer;transition:background-color 180ms cubic-bezier(0.2,0.8,0.2,1),color 180ms cubic-bezier(0.2,0.8,0.2,1),transform 120ms cubic-bezier(0.2,0.8,0.2,1)}
.ait-icon svg{width:15px;height:15px}
.ait-icon:hover{background:rgba(255,255,255,0.08);color:#ffffff}
.ait-icon:active{transform:scale(0.94)}
.ait-icon:focus-visible{outline:2px solid var(--ait-accent);outline-offset:2px}
.ait-icon[data-on="true"]{color:var(--ait-accent);background:var(--ait-accent-soft)}
.ait-icon[data-on="true"]:hover{background:rgba(242,166,90,0.20)}
.ait-icon[data-flash="true"]{background:rgba(255,255,255,0.12)}
.ait-icon[data-tip]{position:relative}
.ait-icon[data-tip]::after{content:attr(data-tip);position:absolute;top:calc(100% + 8px);right:0;padding:5px 8px;border-radius:6px;font-size:12px;line-height:1.35;white-space:nowrap;color:#e8edf2;background:#1f2833;border:1px solid rgba(255,255,255,0.12);box-shadow:0 4px 14px rgba(0,0,0,0.35);opacity:0;transform:translateY(-3px);pointer-events:none;transition:opacity 140ms cubic-bezier(0.2,0.8,0.2,1),transform 140ms cubic-bezier(0.2,0.8,0.2,1);z-index:6}
.ait-icon[data-tip]:hover::after,.ait-icon[data-tip]:focus-visible::after{opacity:1;transform:none}
.ait-cmd{display:flex;align-items:center;gap:6px;min-height:18px;padding:6px 12px 0;flex:none;overflow:hidden;font-size:12px;line-height:16px;color:var(--ait-panel-faint)}
.ait-cmd-tag{flex:none;font-size:10.5px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--ait-accent)}
.ait-cmd-text{min-width:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ait-panel-muted)}
.ait-notice{display:flex;align-items:center;gap:8px;min-height:32px;margin:8px 10px 0;padding:7px 10px;flex:none;border:1px solid var(--ait-panel-line);border-radius:8px;background:rgba(255,255,255,0.035);font-size:12px;line-height:16px;color:var(--ait-panel-muted)}
.ait-notice::before{content:"";width:6px;height:6px;flex:none;border-radius:50%;background:var(--ait-panel-faint)}
.ait-secret{display:flex;align-items:center;gap:8px;width:auto;min-height:36px;margin:8px 10px 0;padding:7px 10px;flex:none;border:1px solid rgba(245,194,17,0.28);border-radius:8px;background:rgba(245,194,17,0.08);color:var(--ait-panel-fg);font:inherit;font-size:12px;line-height:16px;text-align:left;cursor:pointer;transition:background-color 180ms cubic-bezier(0.2,0.8,0.2,1),border-color 180ms cubic-bezier(0.2,0.8,0.2,1)}
.ait-secret:hover{background:rgba(245,194,17,0.13)}
.ait-secret:focus-visible{outline:2px solid var(--ait-accent);outline-offset:2px}
.ait-secret-dot{width:6px;height:6px;flex:none;border-radius:50%;background:#f5c211}
.ait-secret-text{min-width:0;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}

.ait-stage{position:relative;flex:1;min-height:0;display:flex;background:var(--ait-bg);overflow:hidden}
.ait-host{flex:1;min-height:0;padding:8px 11px 10px;background:var(--ait-bg);overflow:hidden}
.ait-host .xterm{height:100%}
.ait-host:focus-within{outline:none}
.ait-host .xterm-viewport{background:transparent!important;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--ait-fg) 22%,transparent) transparent}
.ait-host .xterm-viewport::-webkit-scrollbar{width:10px}
.ait-host .xterm-viewport::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--ait-fg) 18%,transparent);border-radius:6px;border:2px solid transparent;background-clip:content-box}
.ait-host .xterm-viewport::-webkit-scrollbar-thumb:hover{background:color-mix(in srgb,var(--ait-fg) 28%,transparent);background-clip:content-box}
.ait-term-bell{animation:ait-bell 320ms ease 1}
.ait-connecting{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:var(--ait-bg);color:var(--ait-panel-muted);font-size:12px;line-height:16px;pointer-events:none;z-index:1}
.ait-connecting::before{content:"";width:120px;height:4px;border-radius:2px;background:rgba(255,255,255,0.10)}
.ait-spinner{display:none}
.ait-connecting-text{opacity:0.7}
.ait-toast{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:8px;background:#1f2833;color:#e8edf2;border:1px solid rgba(255,255,255,0.12);box-shadow:0 8px 24px rgba(0,0,0,0.28);font-size:12px;line-height:16px;z-index:3;pointer-events:none;animation:ait-toast-in 320ms cubic-bezier(0.32,0.72,0,1)}
.ait-toast svg{width:20px;height:20px;color:currentColor}
.ait-backdrop{position:absolute;inset:0;z-index:4;background:var(--dsw-alias-bg-mask-1);animation:ait-fade-in 320ms cubic-bezier(0.32,0.72,0,1)}

.ait-sheet{position:absolute;inset:8px;z-index:5;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-base);box-shadow:none;backdrop-filter:none;animation:ait-sheet-in 320ms cubic-bezier(0.32,0.72,0,1)}
.ait-sheet,.ait-sheet-foot,.ait-themes,.ait-row-label,.ait-group-label,.ait-sheet-tabs{user-select:none}
.ait-sheet-embedded{position:static;inset:auto;display:block;overflow:visible;border:0;border-radius:0;background:transparent;box-shadow:none;backdrop-filter:none;animation:none}
.ait-sheet-embedded .ait-sheet-tabs{margin:0 0 8px}
.ait-sheet-embedded .ait-sheet-body{padding:0;overflow:visible}
.ait-sheet-embedded .ait-sheet-foot{height:auto;min-height:56px;padding:12px 0 0;border-top:1px solid var(--dsw-alias-border-l1)}

.ait-sheet-head{display:flex;align-items:center;justify-content:space-between;height:52px;padding:0 8px 0 16px;flex:none}
.ait-sheet-title{font-size:15px;line-height:20px;font-weight:600;letter-spacing:-0.01em;color:var(--dsw-alias-label-primary)}
.ait-sheet-head .ait-icon{width:36px;height:36px}
.ait-sheet-head .ait-icon[data-tip]::after{display:none}
.ait-sheet-tabs{display:flex;gap:2px;height:32px;margin:0 16px;padding:2px;flex:none;border:0;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent)}
.ait-sheet-tab{flex:1;min-width:0;border:1px solid transparent;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;font-weight:500;padding:0 8px;cursor:pointer;transition:background-color 320ms cubic-bezier(0.32,0.72,0,1),color 320ms cubic-bezier(0.32,0.72,0,1),border-color 320ms cubic-bezier(0.32,0.72,0,1)}
.ait-sheet-tab:hover{color:var(--dsw-alias-label-primary)}
.ait-sheet-tab[data-on="true"]{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);font-weight:600}
.ait-sheet-tab:focus-visible{outline:2px solid var(--dsw-alias-link);outline-offset:-2px}
.ait-sheet-hint{margin:0 0 8px;font-size:13px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.ait-sheet-body{flex:1;min-height:0;overflow:auto;padding:0 16px 24px;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l2) transparent;overscroll-behavior:contain}
.ait-sheet-body::-webkit-scrollbar{width:8px}
.ait-sheet-body::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:4px}
.ait-tab-body{animation:ait-tab-in 320ms cubic-bezier(0.32,0.72,0,1)}
.ait-group{margin-top:24px}
.ait-group:first-child{margin-top:8px}
.ait-group-label{margin:0 0 8px;font-size:13px;line-height:18px;font-weight:400;letter-spacing:0;text-transform:none;color:var(--dsw-alias-label-secondary)}
.ait-card{border:1px solid var(--dsw-alias-settings-card-stroke);border-radius:10px;background:var(--dsw-alias-settings-card-fill);overflow:hidden}
.ait-row{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;padding:0 16px;font-size:15px;line-height:20px;color:var(--dsw-alias-label-primary)}
.ait-row + .ait-row::before{content:"";position:absolute;top:0;left:16px;right:0;height:1px;background:var(--dsw-alias-border-l1)}
.ait-row-label{flex:1;min-width:0;font-size:15px;line-height:20px;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ait-row-label:has(.ait-row-hint){white-space:normal;overflow:visible}
.ait-row-hint{margin-top:2px;font-size:13px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.ait-select,.ait-input{height:44px;min-width:0;border:0;border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent);color:var(--dsw-alias-label-primary);padding:0 12px;font:inherit;font-size:15px;outline:none;transition:background-color 320ms cubic-bezier(0.32,0.72,0,1),box-shadow 320ms cubic-bezier(0.32,0.72,0,1)}
.ait-select{max-width:180px;cursor:pointer}
.ait-select:disabled,.ait-input:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}
.ait-select:focus-visible,.ait-input:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-link)}
.ait-input[type="number"]{width:68px;text-align:right;font-variant-numeric:tabular-nums;appearance:textfield}
.ait-input[type="number"]::-webkit-inner-spin-button,.ait-input[type="number"]::-webkit-outer-spin-button{appearance:none;margin:0}
.ait-color-wrap{display:inline-flex;align-items:center;gap:6px}
.ait-color{position:relative;display:inline-block;width:32px;height:32px;flex:none;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;overflow:hidden;cursor:pointer;padding:0;background:transparent}
.ait-color span{position:absolute;inset:0;display:block;border-radius:7px}
.ait-color input{position:absolute;inset:0;opacity:0;cursor:pointer;border:0;padding:0}
.ait-color:focus-within{outline:2px solid var(--dsw-alias-link);outline-offset:2px}
.ait-switch{position:relative;width:51px;height:31px;flex:none;border:0;padding:0;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 18%,transparent);cursor:pointer;transition:background-color 320ms cubic-bezier(0.32,0.72,0,1)}
.ait-switch::after{content:"";position:absolute;top:2px;left:2px;width:27px;height:27px;border-radius:50%;background:var(--dsw-alias-switch-thumb);transition:transform 320ms cubic-bezier(0.32,0.72,0,1)}
.ait-switch[data-on="true"]{background:var(--dsw-alias-link)}
.ait-switch[data-on="true"]::after{transform:translateX(20px)}
.ait-switch:focus-visible{outline:2px solid var(--dsw-alias-link);outline-offset:2px}
.ait-segment{display:inline-flex;align-items:center;gap:2px;height:32px;padding:2px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent)}
.ait-segment button{height:28px;border:1px solid transparent;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;font-weight:500;padding:0 10px;cursor:pointer;transition:background-color 320ms cubic-bezier(0.32,0.72,0,1),border-color 320ms cubic-bezier(0.32,0.72,0,1),color 320ms cubic-bezier(0.32,0.72,0,1)}
.ait-segment button:hover{color:var(--dsw-alias-label-primary)}
.ait-segment button[data-on="true"]{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);font-weight:600}
.ait-segment button:focus-visible{outline:2px solid var(--dsw-alias-link);outline-offset:-2px}
.ait-stepper{display:inline-flex;align-items:center;gap:1px;height:32px;padding:2px;border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent)}
.ait-stepper button{width:28px;height:28px;border:0;padding:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:15px;line-height:1;cursor:pointer;transition:background-color 320ms cubic-bezier(0.32,0.72,0,1),transform 160ms cubic-bezier(0.32,0.72,0,1)}
.ait-stepper button:hover{background:var(--dsw-alias-interactive-bg-hover)}
.ait-stepper button:active{transform:scale(0.98)}
.ait-stepper button:focus-visible{outline:2px solid var(--dsw-alias-link);outline-offset:-2px}
.ait-stepper-value{min-width:24px;text-align:center;font-size:13px;line-height:18px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}
.ait-themes{display:flex;flex-direction:column}
.ait-theme{position:relative;display:flex;align-items:center;gap:12px;min-height:44px;padding:0 16px;border:0;border-radius:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:15px;line-height:20px;text-align:left;cursor:pointer;transition:background-color 320ms cubic-bezier(0.32,0.72,0,1)}
.ait-theme + .ait-theme::before{content:"";position:absolute;top:0;left:16px;right:0;height:1px;background:var(--dsw-alias-border-l1)}
.ait-theme:hover{background:var(--dsw-alias-interactive-bg-hover)}
.ait-theme:focus-visible{outline:2px solid var(--dsw-alias-link);outline-offset:-2px}
.ait-theme[data-on="true"] .ait-theme-name{font-weight:500}
.ait-swatch{width:24px;height:24px;flex:none;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;display:flex;flex-direction:column;gap:2px;padding:3px 4px;overflow:hidden;box-shadow:none}
.ait-swatch-dots{display:flex;gap:2px}
.ait-swatch-dots i{display:block;width:3px;height:3px;border-radius:50%}
.ait-swatch-line{display:block;height:2px;width:14px;border-radius:1px;opacity:0.55}
.ait-swatch-line-short{width:9px}
.ait-theme-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ait-theme-check{display:flex;flex:none;width:20px;height:20px;color:var(--dsw-alias-link)}
.ait-theme-check svg{width:20px;height:20px}
.ait-key{min-height:32px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 5%,transparent);color:var(--dsw-alias-label-primary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;font-weight:500;cursor:pointer;transition:background-color 320ms cubic-bezier(0.32,0.72,0,1),border-color 320ms cubic-bezier(0.32,0.72,0,1),color 320ms cubic-bezier(0.32,0.72,0,1)}
.ait-key:hover{background:var(--dsw-alias-interactive-bg-hover)}
.ait-key:focus-visible{outline:2px solid var(--dsw-alias-link);outline-offset:2px}
.ait-key[data-recording="true"]{border-color:var(--dsw-alias-link);color:var(--dsw-alias-link);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-link) 18%,transparent)}
.ait-sheet-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;height:56px;padding:0 16px;flex:none;border-top:1px solid var(--dsw-alias-border-l1)}
.ait-ghost{height:44px;padding:0 12px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-link);font:inherit;font-size:15px;font-weight:500;cursor:pointer;transition:background-color 320ms cubic-bezier(0.32,0.72,0,1),transform 160ms cubic-bezier(0.32,0.72,0,1)}
.ait-ghost:hover{background:var(--dsw-alias-interactive-bg-hover)}
.ait-ghost:active{transform:scale(0.98)}
.ait-ghost:focus-visible{outline:2px solid var(--dsw-alias-link);outline-offset:2px}
.ait-saved{font-size:13px;line-height:18px;color:var(--dsw-alias-label-tertiary)}

/* The settings sheet lives inside the dark terminal card, so it uses the
   same graphite surface and warm accent as the rest of the panel. The embedded
   copy on the light plugin page is deliberately excluded. */
.ait-panel .ait-sheet:not(.ait-sheet-embedded){border-color:rgba(255,255,255,0.10);border-radius:12px;background:linear-gradient(180deg,#161d26 0%,#10161d 100%);color:#e8edf2;box-shadow:0 24px 60px rgba(0,0,0,0.48),inset 0 1px 0 rgba(255,255,255,0.04)}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-sheet-title{color:#e8edf2}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-sheet-head{border-bottom:1px solid rgba(255,255,255,0.06)}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-sheet-head .ait-icon{color:rgba(232,237,242,0.56)}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-sheet-head .ait-icon:hover{background:rgba(255,255,255,0.08);color:#ffffff}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-sheet-tabs{background:rgba(255,255,255,0.06)}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-sheet-tab{color:rgba(232,237,242,0.56)}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-sheet-tab:hover{color:#e8edf2}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-sheet-tab[data-on="true"]{background:rgba(255,255,255,0.10);border-color:rgba(255,255,255,0.12);color:#ffffff}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-sheet-hint,
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-group-label,
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-row-hint,
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-saved{color:rgba(232,237,242,0.56)}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-card{border-color:rgba(255,255,255,0.08);background:rgba(255,255,255,0.035)}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-row{color:#e8edf2}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-row-label{color:#e8edf2}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-row + .ait-row::before,
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-theme + .ait-theme::before{background:rgba(255,255,255,0.07)}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-select,
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-input{background:rgba(255,255,255,0.06);color:#e8edf2}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-select:disabled,
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-input:disabled{color:rgba(232,237,242,0.30)}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-select:focus-visible,
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-input:focus-visible{box-shadow:0 0 0 2px #f2a65a}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-segment,
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-stepper{background:rgba(255,255,255,0.06)}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-segment button,
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-stepper button{color:rgba(232,237,242,0.56)}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-segment button:hover,
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-stepper button:hover{color:#e8edf2;background:rgba(255,255,255,0.08)}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-segment button[data-on="true"]{background:rgba(255,255,255,0.10);border-color:rgba(255,255,255,0.12);color:#ffffff}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-stepper-value{color:#e8edf2}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-theme{color:#e8edf2}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-theme:hover{background:rgba(255,255,255,0.05)}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-theme[data-on="true"]{background:rgba(242,166,90,0.10)}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-theme-check{color:#f2a65a}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-color{border-color:rgba(255,255,255,0.14)}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-key{border-color:rgba(255,255,255,0.10);background:rgba(255,255,255,0.05);color:#e8edf2}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-key:hover{background:rgba(255,255,255,0.08)}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-key[data-recording="true"]{border-color:#f2a65a;color:#f2a65a;box-shadow:0 0 0 2px rgba(242,166,90,0.16)}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-switch{background:rgba(255,255,255,0.16)}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-switch::after{background:#fbfbfb}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-switch[data-on="true"]{background:#f2a65a}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-sheet-foot{border-top-color:rgba(255,255,255,0.07)}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-ghost{color:#f2a65a}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-ghost:hover{background:rgba(242,166,90,0.10)}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-sheet-body{scrollbar-color:rgba(255,255,255,0.16) transparent}
.ait-panel .ait-sheet:not(.ait-sheet-embedded) .ait-sheet-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.16)}

/* Agent activity: a rotating RGB border and travelling light on the top bar
   and the black tablecloth below the terminal card. */
.ait-panel::before{content:"";position:absolute;inset:0;z-index:9;padding:1.5px;border-radius:14px;background:conic-gradient(from var(--ait-rgb-angle),#ff3d8b,#ff9d00,#f5ff3d,#3dff9a,#3de1ff,#7a5cff,#ff3d8b);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;opacity:0;pointer-events:none;transition:opacity 350ms ease;filter:drop-shadow(0 0 5px rgba(61,225,255,0.35))}
.ait-panel-tabs::before{content:"";position:absolute;inset:0;z-index:0;background:linear-gradient(105deg,transparent 18%,rgba(255,61,139,0.16) 33%,rgba(245,255,61,0.12) 43%,rgba(61,225,255,0.18) 54%,rgba(122,92,255,0.14) 64%,transparent 79%);background-size:220% 100%;opacity:0;pointer-events:none;transition:opacity 350ms ease}
.ait-panel-tabs::after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;z-index:2;background:linear-gradient(90deg,#ff3d8b,#ff9d00,#f5ff3d,#3dff9a,#3de1ff,#7a5cff,#ff3d8b);background-size:220% 100%;opacity:0;pointer-events:none;transition:opacity 350ms ease;filter:drop-shadow(0 0 5px rgba(61,225,255,0.55))}
.ait-panel-body::before{content:"";position:absolute;left:9%;right:9%;bottom:-8px;height:54px;z-index:0;border-radius:50%;background:linear-gradient(90deg,#ff3d8b,#3de1ff,#7a5cff);filter:blur(24px);opacity:0;pointer-events:none;transition:opacity 400ms ease}
.ait-panel-body::after{content:"";position:absolute;left:12px;right:12px;bottom:4px;height:3px;z-index:2;border-radius:999px;background:linear-gradient(90deg,#ff3d8b,#ff9d00,#f5ff3d,#3dff9a,#3de1ff,#7a5cff,#ff3d8b);background-size:200% 100%;opacity:0;pointer-events:none;transition:opacity 350ms ease;filter:drop-shadow(0 0 7px rgba(61,225,255,0.55))}
.ait-panel:has(.ait-terminal[data-agent-active="true"]){box-shadow:0 18px 44px rgba(0,0,0,0.30),0 2px 8px rgba(0,0,0,0.22),inset 0 1px 0 rgba(255,255,255,0.05),0 0 28px rgba(61,225,255,0.16),0 0 46px rgba(255,61,139,0.10)}
.ait-panel:has(.ait-terminal[data-agent-active="true"])::before{opacity:1;animation:ait-rgb-spin 3s linear infinite}
.ait-panel:has(.ait-terminal[data-agent-active="true"]) .ait-panel-tabs::before{opacity:1;animation:ait-rgb-sheen 3.2s linear infinite}
.ait-panel:has(.ait-terminal[data-agent-active="true"]) .ait-panel-tabs::after{opacity:0.95;animation:ait-rgb-slide 2.2s linear infinite}
.ait-panel:has(.ait-terminal[data-agent-active="true"]) .ait-panel-body::before{opacity:0.30;animation:ait-rgb-breathe 3s ease-in-out infinite}
.ait-panel:has(.ait-terminal[data-agent-active="true"]) .ait-panel-body::after{opacity:0.95;animation:ait-rgb-slide 2.5s linear infinite reverse}
@keyframes ait-rgb-spin{to{--ait-rgb-angle:360deg}}
@keyframes ait-rgb-slide{from{background-position:0% 50%}to{background-position:200% 50%}}
@keyframes ait-rgb-sheen{from{background-position:200% 0}to{background-position:-200% 0}}
@keyframes ait-rgb-breathe{0%,100%{opacity:0.20}50%{opacity:0.38}}

/* Light palettes keep the dark outer shell, but the terminal card's own
   status bar and inline chrome need dark text so they stay readable. */
.ait-terminal[data-light="true"] .ait-terminal-card{border-color:rgba(15,17,21,0.12);box-shadow:inset 0 1px 0 rgba(255,255,255,0.6),0 1px 2px rgba(0,0,0,0.08)}
.ait-terminal[data-light="true"] .ait-terminal-card:focus-within{border-color:rgba(180,83,9,0.42);box-shadow:inset 0 1px 0 rgba(255,255,255,0.65),0 0 0 1px rgba(180,83,9,0.12)}
.ait-terminal[data-light="true"] .ait-bar{background:#f7f7f5;border-bottom-color:rgba(15,17,21,0.08)}
.ait-terminal[data-light="true"] .ait-state{color:#4b5563;border-color:rgba(15,17,21,0.08);background:rgba(15,17,21,0.035)}
.ait-terminal[data-light="true"] .ait-state[data-state="secret"],.ait-terminal[data-light="true"] .ait-state[data-state="sealed"]{color:#7a2e2e}
:where(.ait-terminal[data-light="true"]) .ait-state .dot{background:rgba(15,17,21,0.34)}
.ait-terminal[data-light="true"] .ait-actions{border-color:rgba(15,17,21,0.08);background:rgba(15,17,21,0.025)}
.ait-terminal[data-light="true"] .ait-icon{color:#5f6670}
.ait-terminal[data-light="true"] .ait-icon:hover{background:rgba(15,17,21,0.06);color:#111827}
.ait-terminal[data-light="true"] .ait-icon[data-on="true"]{color:#b45309;background:rgba(242,166,90,0.18)}
.ait-terminal[data-light="true"] .ait-icon[data-on="true"]:hover{background:rgba(242,166,90,0.26)}
.ait-terminal[data-light="true"] .ait-icon[data-flash="true"]{background:rgba(15,17,21,0.08)}
.ait-terminal[data-light="true"] .ait-cmd{color:#6b7280}
.ait-terminal[data-light="true"] .ait-cmd-text{color:#4b5563}
.ait-terminal[data-light="true"] .ait-notice{border-color:rgba(15,17,21,0.08);background:#f7f7f5;color:#4b5563}
.ait-terminal[data-light="true"] .ait-notice::before{background:rgba(15,17,21,0.34)}
.ait-terminal[data-light="true"] .ait-secret{border-color:rgba(180,83,9,0.28);background:rgba(245,194,17,0.12);color:#3b2f0b}
.ait-terminal[data-light="true"] .ait-secret:hover{background:rgba(245,194,17,0.18)}
.ait-terminal[data-light="true"] .ait-connecting{color:#4b5563}
.ait-terminal[data-light="true"] .ait-connecting::before{background:rgba(15,17,21,0.10)}

@keyframes ait-idle{from{transform:scaleX(1)}to{transform:scaleX(0)}}
@keyframes ait-sheet-in{from{opacity:0;transform:translateY(8px) scale(0.985)}to{opacity:1;transform:none}}
@keyframes ait-fade-in{from{opacity:0}to{opacity:1}}
@keyframes ait-toast-in{from{opacity:0;transform:translate(-50%,4px)}to{opacity:1;transform:translate(-50%,0)}}
@keyframes ait-bell{0%,100%{opacity:1}50%{opacity:0.6}}
@keyframes ait-tab-in{from{opacity:0;transform:translateY(2px) scale(0.96)}to{opacity:1;transform:none}}
@keyframes ait-session-tab-in{from{opacity:0;max-width:0;transform:translateY(2px) scale(0.96)}to{opacity:1;max-width:180px;transform:none}}
@keyframes ait-session-tab-out{from{opacity:1;max-width:180px;transform:none}to{opacity:0;max-width:0;transform:scale(0.96)}}

.ait-tab-body>.ait-group{animation:ait-rise 320ms cubic-bezier(0.32,0.72,0,1) both}
.ait-tab-body>.ait-group:nth-child(2){animation-delay:30ms}
.ait-tab-body>.ait-group:nth-child(3){animation-delay:60ms}
.ait-tab-body>.ait-group:nth-child(4){animation-delay:90ms}
@keyframes ait-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}

@media (pointer:coarse){
  .ait-icon,.ait-sheet-head .ait-icon{width:44px;height:44px}
  .ait-panel-add{width:44px;height:44px}
  .ait-panel-tab-close{width:28px;height:28px;opacity:0.8}
  .ait-select,.ait-input,.ait-theme,.ait-row{min-height:44px}
  .ait-key{min-height:44px}
}
@media (prefers-reduced-motion:reduce){
  .ait-sheet,.ait-tab-body,.ait-tab-body>.ait-group,.ait-toast,.ait-backdrop,.ait-icon,.ait-panel-tab,.ait-panel-tab-close,.ait-panel-add,.ait-panel-open,.ait-secret,.ait-switch,.ait-switch::after,.ait-sheet-tabs,.ait-sheet-tab,.ait-segment button,.ait-stepper button,.ait-theme,.ait-key,.ait-ghost,.ait-panel::before,.ait-panel-tabs::before,.ait-panel-tabs::after,.ait-panel-body::before,.ait-panel-body::after{animation:none!important;transition:none!important}
  .ait-idle{animation:none!important;opacity:0.3}
  .ait-tab-body>.ait-group{opacity:1;transform:none}
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

/** Two sliders: quieter and more legible than a gear at this size. */
function SettingsIcon() {
  return React.createElement(
    'svg',
    { width: 20, height: 20, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    React.createElement('path', {
      d: 'M2.6 5h3.2M9.4 5h4M2.6 11h3.6M9.8 11h3.6',
      stroke: 'currentColor',
      strokeWidth: 1.2,
      strokeLinecap: 'round',
    }),
    React.createElement('circle', { cx: 7.4, cy: 5, r: 1.6, stroke: 'currentColor', strokeWidth: 1.2 }),
    React.createElement('circle', { cx: 8.6, cy: 11, r: 1.6, stroke: 'currentColor', strokeWidth: 1.2 }),
  )
}

/** A padlock; `open` draws the shackle lifted for the unlocked state. */
function LockIcon(open) {
  return React.createElement(
    'svg',
    { width: 20, height: 20, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    React.createElement('rect', { x: 3.3, y: 7, width: 9.4, height: 6.6, rx: 1.6, stroke: 'currentColor', strokeWidth: 1.2 }),
    open
      ? React.createElement('path', { d: 'M5.6 7V4.9a2.6 2.6 0 0 1 5 1', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' })
      : React.createElement('path', { d: 'M5.4 7V5.1a2.6 2.6 0 0 1 5.2 0V7', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }),
    React.createElement('circle', { cx: 8, cy: 10.2, r: 0.9, fill: 'currentColor' }),
  )
}

/** A plug; `pulled` shows the cable disconnected for the sealed state. */
function PlugIcon(pulled) {
  return React.createElement(
    'svg',
    { width: 20, height: 20, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    React.createElement('path', {
      d: 'M5.1 2.4v3.1M10.9 2.4v3.1',
      stroke: 'currentColor',
      strokeWidth: 1.2,
      strokeLinecap: 'round',
    }),
    React.createElement('rect', {
      x: 3.4,
      y: 5.6,
      width: 9.2,
      height: 3.6,
      rx: 1.2,
      stroke: 'currentColor',
      strokeWidth: 1.2,
    }),
    React.createElement('path', {
      d: pulled ? 'M8 9.2v1.1M8 13.2l-1.3 1M8 13.2l1.3 1' : 'M8 9.2v4.4',
      stroke: 'currentColor',
      strokeWidth: 1.2,
      strokeLinecap: 'round',
    }),
  )
}

/** A check for the selected theme swatch. */
function CheckIcon() {
  return React.createElement(
    'svg',
    { width: 20, height: 20, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    React.createElement('path', {
      d: 'M3.4 8.3l2.9 2.9 6.3-6.4',
      stroke: 'currentColor',
      strokeWidth: 1.2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
  )
}

/** A close glyph for the settings sheet. */
function CloseIcon() {
  return React.createElement(
    'svg',
    { width: 20, height: 20, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    React.createElement('path', { d: 'M4 4l8 8M12 4l-8 8', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }),
  )
}

/** A plus glyph for the new-session control. */
function PlusIcon() {
  return React.createElement(
    'svg',
    { width: 20, height: 20, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    React.createElement('path', {
      d: 'M8 3.4v9.2M3.4 8h9.2',
      stroke: 'currentColor',
      strokeWidth: 1.2,
      strokeLinecap: 'round',
    }),
  )
}

/** A small terminal prompt mark used by the panel header. */
function TerminalMark() {
  return React.createElement(
    'svg',
    { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    React.createElement('rect', { x: 2, y: 3, width: 12, height: 10, rx: 2, stroke: 'currentColor', strokeWidth: 1.1 }),
    React.createElement('path', {
      d: 'M4.6 6.1l1.9 1.9-1.9 1.9M8 9.9h3',
      stroke: 'currentColor',
      strokeWidth: 1.1,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
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
  const { sessionId, terminalId, labels, onNewTab, onCloseTab, autoFocus = true } = props
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
    command: '',
    commandAt: 0,
    peekAt: 0,
    access: 'collaborate',
  })
  const [agentPulse, setAgentPulse] = React.useState(false)
  const [peekPulse, setPeekPulse] = React.useState(false)
  const sweepTimer = React.useRef(0)
  const peekTimer = React.useRef(0)
  const seenAgentAt = React.useRef(0)
  const seenPeekAt = React.useRef(0)
  const [notice, setNotice] = React.useState(null)
  const scheme = useDshScheme()
  const [settings, setSettings] = React.useState(() => currentSettings())
  const [panelOpen, setPanelOpen] = React.useState(false)
  const [zoom, setZoom] = React.useState(0)
  const [inputEpoch, setInputEpoch] = React.useState(0)
  const [flash, setFlash] = React.useState(false)
  const [painted, setPainted] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  settingsRef.current = settings

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
      theme: themeFor(initial, scheme),
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
      const command = typeof message.command === 'string' ? message.command : ''
      const commandAt = typeof message.commandAt === 'number' ? message.commandAt : 0
      const peekAt = typeof message.peekAt === 'number' ? message.peekAt : 0
      const access = message.access === 'observe' || message.access === 'sealed' ? message.access : 'collaborate'
      const next = {
        phase: message.phase || 'running',
        holder: (message.lease && message.lease.holder) || 'agent',
        suspended: Boolean(message.lease && message.lease.suspended),
        name: message.name || props.name || terminalId,
        cols: message.cols || 0,
        rows: message.rows || 0,
        command,
        commandAt,
        peekAt,
        access,
      }
      setStatus(next)
      writableRef.current = next.holder === 'human'
      const agentAt = typeof message.agentAt === 'number' ? message.agentAt : 0
      if (agentAt > 0 && agentAt !== seenAgentAt.current) {
        seenAgentAt.current = agentAt
        // The agent is producing input right now; hold the sweep for a moment
        // even when the command is short, and let the phase keep it on longer.
        setAgentPulse(true)
        if (sweepTimer.current !== 0) window.clearTimeout(sweepTimer.current)
        sweepTimer.current = window.setTimeout(() => {
          sweepTimer.current = 0
          setAgentPulse(false)
        }, 1600)
      }
      if (peekAt > 0 && peekAt !== seenPeekAt.current) {
        seenPeekAt.current = peekAt
        setPeekPulse(true)
        if (peekTimer.current !== 0) window.clearTimeout(peekTimer.current)
        peekTimer.current = window.setTimeout(() => {
          peekTimer.current = 0
          setPeekPulse(false)
        }, 1800)
      }
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

    // A keystroke takes the keyboard, not a click. The local view becomes
    // writable immediately; the server's lease confirmation arrives soon after
    // and the write that follows is processed in order behind the takeover.
    term.onData((data) => {
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
      // The terminal owns these chords: keep the browser (page zoom) and the
      // app-level shortcut table out of them while the terminal has focus.
      const consume = () => {
        event.preventDefault()
        event.stopPropagation()
        return false
      }
      if (combo === shortcuts.copy) {
        const selection = term.getSelection()
        if (selection) {
          void navigator.clipboard
            .writeText(selection)
            .then(() => setCopied(true))
            .catch(() => {})
        }
        return consume()
      }
      if (combo === shortcuts.paste) {
        void navigator.clipboard
          .readText()
          .then((text) => {
            if (text) term.paste(text)
          })
          .catch(() => {})
        return consume()
      }
      if (combo === shortcuts.newTab) {
        if (onNewRef.current) onNewRef.current()
        return consume()
      }
      if (combo === shortcuts.closeTab) {
        if (onCloseRef.current) onCloseRef.current()
        return consume()
      }
      if (combo === shortcuts.fontIncrease || (shortcuts.fontIncrease === 'ctrl+=' && combo === 'ctrl+shift+=')) {
        setZoom((value) => Math.min(15, value + 1))
        return consume()
      }
      if (combo === shortcuts.fontDecrease) {
        setZoom((value) => Math.max(-5, value - 1))
        return consume()
      }
      if (combo === shortcuts.fontReset) {
        setZoom(0)
        return consume()
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

    // A terminal panel is for typing: when the person activates its tab, put
    // the caret in the terminal instead of leaving focus on the tab strip. An
    // automatic switch from agent activity must not steal focus from an input
    // outside the panel, so in that case only move the caret when the focus is
    // already inside the panel or nowhere in particular.
    const focusTimer = window.setTimeout(() => {
      if (disposed) return
      if (!autoFocus) {
        const active = document.activeElement
        const inside =
          active !== null &&
          typeof active.closest === 'function' &&
          active.closest('.ait-panel') !== null
        if (!inside && active !== document.body) return
      }
      term.focus()
    }, 80)

    return () => {
      disposed = true
      window.clearTimeout(focusTimer)
      if (fitTimer !== 0) window.clearTimeout(fitTimer)
      if (exitTimer !== 0) window.clearTimeout(exitTimer)
      if (bellTimer !== 0) window.clearTimeout(bellTimer)
      if (copyTimer !== 0) window.clearTimeout(copyTimer)
      if (sweepTimer.current !== 0) window.clearTimeout(sweepTimer.current)
      if (peekTimer.current !== 0) window.clearTimeout(peekTimer.current)
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

  // Keep the sweep on while the agent's command runs, then let it fade a
  // moment after the shell settles instead of cutting it at submit time.
  React.useEffect(() => {
    const running =
      status.phase === 'running' && status.access === 'collaborate' && status.holder === 'agent' && !status.suspended
    if (running) {
      setAgentPulse(true)
      if (sweepTimer.current !== 0) {
        window.clearTimeout(sweepTimer.current)
        sweepTimer.current = 0
      }
      return
    }
    if (!agentPulse || sweepTimer.current !== 0) return
    sweepTimer.current = window.setTimeout(() => {
      sweepTimer.current = 0
      setAgentPulse(false)
    }, 1500)
  }, [status.phase, status.access, status.holder, status.suspended, agentPulse])

  React.useEffect(() => {
    const term = termRef.current
    if (term === null) return
    const size = Math.min(28, Math.max(8, settings.fontSize + zoom))
    term.options.theme = themeFor(settings, scheme)
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
  }, [settings, zoom, scheme])

  // The person has the keyboard only while they keep typing. Every keystroke
  // restarts this timer; when it fires the lease goes back to the agent and the
  // countdown line disappears with the next status message.
  React.useEffect(() => {
    if (status.access !== 'collaborate' || status.phase === 'exited' || status.holder !== 'human' || status.suspended) return undefined
    const ms = Math.max(1, settings.idleHandback) * 1000
    const timer = window.setTimeout(() => {
      send({ type: 'handback' })
    }, ms)
    return () => window.clearTimeout(timer)
    // send is stable through the ref-backed socket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.holder, status.suspended, status.phase, status.access, settings.idleHandback, inputEpoch])

  React.useEffect(() => {
    if (!copied) return undefined
    const timer = window.setTimeout(() => setCopied(false), 1200)
    return () => window.clearTimeout(timer)
  }, [copied])

  const focusTerminal = () => {
    const term = termRef.current
    if (term !== null) term.focus()
  }

  const setAccess = (value) => {
    send({ type: 'access', value })
    focusTerminal()
  }

  const toggleObserve = () => {
    setAccess(status.access === 'observe' ? 'collaborate' : 'observe')
  }

  const toggleSeal = () => {
    setAccess(status.access === 'sealed' ? 'collaborate' : 'sealed')
  }

  const closePanel = () => {
    setPanelOpen(false)
    focusTerminal()
  }

  const state = uiState(status, painted, agentPulse, peekPulse)
  const readOnly = status.access === 'observe'
  const sealed = status.access === 'sealed'
  const bannerText =
    state === 'exited'
      ? labels.exited
      : state === 'secret'
        ? labels.secret
        : state === 'observe'
          ? labels.observe
          : state === 'sealed'
            ? labels.sealed
          : state === 'connecting'
            ? labels.connecting
            : state === 'human'
              ? labels.human
              : state === 'typing'
                ? labels.agent
                : state === 'peeking'
                  ? labels.peeking
                  : labels.ready
  const palette = paletteOf(resolvedThemeKey(settings, scheme))
  const size = Math.min(28, Math.max(8, settings.fontSize + zoom))
  const countdownMs = Math.max(1, settings.idleHandback) * 1000
  const showCountdown =
    status.access === 'collaborate' && !status.suspended && status.phase !== 'exited' && status.holder === 'human'

  // Only local palette variables are inline. Every piece of chrome reads a
  // DSH alias token from PANEL_CSS, so the panel follows the app theme while
  // the terminal body keeps the palette the person chose.
  const style = {
    '--ait-bg': palette.background,
    '--ait-fg': palette.foreground,
  }

  return React.createElement(
    'section',
    {
      className: 'ait-terminal',
      'data-terminal-id': terminalId,
      'data-agent-active': agentPulse ? 'true' : 'false',
      'data-light': isLightPalette(palette) ? 'true' : 'false',
      style,
      onKeyDown: (event) => {
        if (event.key !== 'Escape' || !panelOpen) return
        event.preventDefault()
        event.stopPropagation()
        closePanel()
      },
    },
    React.createElement(
      'div',
      { className: 'ait-terminal-card' },
    React.createElement(
      'header',
      { className: 'ait-bar' },
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
            style: { '--ait-idle-duration': countdownMs + 'ms' },
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
            'data-tip': readOnly ? labels.unlock : labels.lock,
            'aria-label': readOnly ? labels.unlock : labels.lock,
            'data-on': readOnly ? 'true' : 'false',
            'data-kind': 'observe',
            'data-flash': flash ? 'true' : 'false',
            onClick: () => {
              toggleObserve()
              setFlash(true)
              window.setTimeout(() => setFlash(false), 500)
            },
          },
          LockIcon(readOnly),
        ),
        React.createElement(
          'button',
          {
            className: 'ait-icon',
            type: 'button',
            'data-tip': sealed ? labels.unseal : labels.seal,
            'aria-label': sealed ? labels.unseal : labels.seal,
            'data-on': sealed ? 'true' : 'false',
            'data-kind': 'seal',
            onClick: toggleSeal,
          },
          PlugIcon(sealed),
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
    status.command !== '' && !readOnly && !sealed && !status.suspended && status.phase !== 'exited'
      ? React.createElement(
          'div',
          { className: 'ait-cmd', title: status.command },
          React.createElement('span', { className: 'ait-cmd-tag' }, labels.agentTag),
          React.createElement('code', { className: 'ait-cmd-text' }, status.command),
        )
      : null,
    state === 'secret'
      ? React.createElement(
          'button',
          { type: 'button', className: 'ait-secret', onClick: focusTerminal },
          React.createElement('span', { className: 'ait-secret-dot' }),
          React.createElement('span', { className: 'ait-secret-text' }, labels.secretHint),
        )
      : null,
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
            scheme,
            onChange: (patch) => writeSettings({ ...settings, ...patch }),
            onReset: () => resetSettings(),
            onClose: closePanel,
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
  const scheme = props.scheme === 'light' ? 'light' : 'dark'
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
  const palette = paletteOf(resolvedThemeKey(settings, scheme))
  const themeCursor = palette.cursor ?? palette.foreground

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

  // Follow DSH comes first; the swatch previews the palette the `follow` mode
  // resolves to right now instead of a fixed one.
  const themeButton = (key) => {
    const swatch = THEMES[key === 'follow' ? resolvedThemeKey(settings, scheme) : key].theme
    const label = key === 'follow' ? '跟随 DSH' : THEMES[key].label
    return React.createElement(
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
        { className: 'ait-swatch', style: { background: swatch.background } },
        React.createElement(
          'span',
          { className: 'ait-swatch-dots' },
          React.createElement('i', { style: { background: swatch.red } }),
          React.createElement('i', { style: { background: swatch.yellow } }),
          React.createElement('i', { style: { background: swatch.green } }),
        ),
        React.createElement('span', {
          className: 'ait-swatch-line',
          style: { background: swatch.foreground },
        }),
        React.createElement('span', {
          className: 'ait-swatch-line ait-swatch-line-short',
          style: { background: swatch.foreground },
        }),
      ),
      React.createElement('span', { className: 'ait-theme-name' }, label),
      settings.theme === key ? React.createElement('span', { className: 'ait-theme-check' }, CheckIcon()) : null,
    )
  }

  const themeGroup = group(
    '主题',
    card(
      React.createElement(
        'div',
        { className: 'ait-themes' },
        ['follow', ...Object.keys(THEMES)].map(themeButton),
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
          { className: 'ait-color-wrap' },
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
    {
      className: props.embedded ? 'ait-sheet ait-sheet-embedded' : 'ait-sheet',
      role: 'group',
      'aria-label': '终端设置',
    },
    props.embedded
      ? null
      : React.createElement(
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

/**
 * The same terminal preferences, but embedded in the plugin configuration page.
 * It shares the browser-local settings with the sidebar sheet, so editing the
 * theme, font, cursor, or shortcuts here updates a live terminal immediately.
 */
export function TerminalPreferences() {
  const [settings, setSettings] = React.useState(() => currentSettings())
  const scheme = useDshScheme()

  React.useEffect(() => {
    injectCss()
    return subscribeSettings(() => setSettings(currentSettings()))
  }, [])

  const size = Math.min(28, Math.max(8, settings.fontSize))
  return React.createElement(TerminalSettings, {
    embedded: true,
    settings,
    scheme,
    onChange: (patch) => writeSettings({ ...settings, ...patch }),
    onReset: () => resetSettings(),
    fontSize: size,
  })
}

/**
 * The single sidebar page: one tab per live Host session, with our own tab
 * strip. The Host owns the sessions; this view only lists, selects, opens and
 * closes them, so an agent-created session appears here on the next poll and a
 * closed one disappears for both sides.
 *
 * Tabs size to their label, the add button follows the last tab, and a
 * middle click on a tab closes that session. A tab entering or leaving runs a
 * short fade/scale transition so the strip does not jump.
 * When the agent writes to a session the panel switches to it, unless the
 * person currently holds that session's lease; then the switch waits for the
 * lease to return to the agent.
 */
export function TerminalPanel(props) {
  const { sessionId, api, attachPath, labels } = props
  const [sessions, setSessions] = React.useState([])
  const [selected, setSelected] = React.useState(null)
  const [error, setError] = React.useState(null)
  const selectedRef = React.useRef(null)
  const sessionsRef = React.useRef([])
  const closingRef = React.useRef(new Set())
  const closeTimers = React.useRef(new Map())
  const creating = React.useRef(false)
  const polling = React.useRef(false)
  const booted = React.useRef(false)
  const primed = React.useRef(false)
  const seenAgentAt = React.useRef(new Map())
  const autoFocus = React.useRef(true)
  const scrollRef = React.useRef(null)
  const tabRefs = React.useRef(new Map())
  selectedRef.current = selected
  sessionsRef.current = sessions

  const openNew = React.useCallback(() => {
    if (creating.current) return
    creating.current = true
    api
      .open(120, 30)
      .then((created) => {
        const item = {
          id: String(created.id),
          name: created.name || String(created.id),
          agentAt: 0,
          holder: 'agent',
        }
        setSessions((prev) => (prev.some((session) => session.id === item.id) ? prev : [...prev, item]))
        autoFocus.current = true
        setSelected(item.id)
        setError(null)
      })
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : String(reason))
      })
      .then(() => {
        creating.current = false
      })
  }, [api])

  const selectSession = (id) => {
    autoFocus.current = true
    setSelected(id)
  }

  const closeSession = React.useCallback(
    (id) => {
      if (closingRef.current.has(id)) return
      const list = sessionsRef.current
      const index = list.findIndex((session) => session.id === id)
      if (index < 0) return
      const remaining = list.filter((session) => session.id !== id)
      closingRef.current.add(id)
      // Keep the tab mounted for the leave animation, but take it out of the
      // selection immediately so the body switches without waiting.
      setSessions((prev) => prev.map((session) => (session.id === id ? { ...session, closing: true } : session)))
      if (selectedRef.current === id) {
        const neighbor = remaining[index] ?? remaining[index - 1] ?? null
        autoFocus.current = true
        setSelected(neighbor === null ? null : neighbor.id)
      }
      api.close(id).catch(() => {})
      const timer = window.setTimeout(() => {
        closeTimers.current.delete(id)
        closingRef.current.delete(id)
        setSessions((prev) => prev.filter((session) => session.id !== id))
      }, 180)
      closeTimers.current.set(id, timer)
    },
    [api],
  )

  React.useEffect(
    () => () => {
      for (const timer of closeTimers.current.values()) window.clearTimeout(timer)
      closeTimers.current.clear()
      closingRef.current.clear()
    },
    [],
  )

  const moveTab = (index) => {
    if (sessions.length === 0) return
    const target = sessions[(index + sessions.length) % sessions.length]
    selectSession(target.id)
    const element = tabRefs.current.get(target.id)
    if (element !== undefined) element.focus()
  }

  const onTabKeyDown = (event, index) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      moveTab(index + 1)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      moveTab(index - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      moveTab(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      moveTab(sessions.length - 1)
    }
  }

  const labelOf = (session, index) => {
    const named = typeof session.name === 'string' && session.name.trim() !== '' && session.name !== String(session.id)
    return named ? session.name : `${labels.terminal ?? 'Terminal'} ${index + 1}`
  }

  React.useEffect(() => {
    let alive = true
    const tick = () => {
      if (!alive || polling.current) return
      polling.current = true
      const now = Date.now()
      api
        .state()
        .then((payload) => {
          if (!alive) return
          // A closing tab is still mounted for its leave animation. Leaving the
          // list alone for one tick keeps it from being re-added by the Host
          // snapshot, and the next tick is only 180ms away.
          if (closingRef.current.size > 0) return
          const list = Array.isArray(payload.sessions) ? payload.sessions : []
          const items = list
            .filter((session) => session && typeof session.id === 'string')
            .map((session) => ({
              id: session.id,
              name: session.name || session.id,
              agentAt: typeof session.agentAt === 'number' ? session.agentAt : 0,
              holder: session.holder === 'human' ? 'human' : 'agent',
            }))
          setSessions(items)
          const active = items.find((session) => session.id === selectedRef.current)
          let nextSelected = null
          let selectionSet = false
          const choose = (id) => {
            nextSelected = id
            selectionSet = true
          }
          if (!primed.current) {
            // The first poll is a baseline: no old activity may steal the
            // view. If the agent is writing right now, open on that session.
            primed.current = true
            for (const item of items) seenAgentAt.current.set(item.id, item.agentAt)
            if (selectedRef.current === null || active === undefined) {
              const recent = items
                .filter((item) => item.agentAt > 0 && now - item.agentAt < 5000)
                .reduce((best, item) => (best === null || item.agentAt > best.agentAt ? item : best), null)
              const next = recent !== null ? recent : items[items.length - 1]
              if (next !== undefined) choose(next.id)
            }
          } else if (active === undefined || active.holder !== 'human') {
            let pick = null
            for (const item of items) {
              const previous = seenAgentAt.current.get(item.id)
              const advanced = previous === undefined ? item.agentAt > 0 : item.agentAt > previous
              if (advanced && (pick === null || item.agentAt > pick.agentAt)) pick = item
            }
            for (const item of items) seenAgentAt.current.set(item.id, item.agentAt)
            if (pick !== null && pick.id !== selectedRef.current) {
              autoFocus.current = false
              choose(pick.id)
            }
          } else {
            // The person holds the active lease. Leave the new agentAt values
            // unacknowledged so the next poll after handback still switches.
          }
          for (const id of [...seenAgentAt.current.keys()]) {
            if (!items.some((item) => item.id === id)) seenAgentAt.current.delete(id)
          }
          if (
            !selectionSet &&
            selectedRef.current !== null &&
            !items.some((item) => item.id === selectedRef.current)
          ) {
            const next = items[items.length - 1]
            choose(next === undefined ? null : next.id)
          }
          if (selectionSet) setSelected(nextSelected)
          setError(null)
          if (!booted.current) {
            booted.current = true
            if (items.length === 0) openNew()
          }
        })
        .catch(() => {
          // A rejected poll is not proof the sessions died; keep the last list.
        })
        .then(() => {
          polling.current = false
        })
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [api, openNew])

  React.useEffect(() => {
    const wrap = scrollRef.current
    if (wrap === null || selected === null) return
    const tab = tabRefs.current.get(selected)
    if (tab === undefined) return
    const wrapRect = wrap.getBoundingClientRect()
    const tabRect = tab.getBoundingClientRect()
    if (tabRect.left < wrapRect.left) {
      wrap.scrollLeft -= wrapRect.left - tabRect.left + 4
    } else if (tabRect.right > wrapRect.right) {
      wrap.scrollLeft += tabRect.right - wrapRect.right + 4
    }
  }, [selected, sessions.length])

  React.useEffect(() => {
    const wrap = scrollRef.current
    if (wrap === null) return undefined
    // A vertical wheel over a horizontal strip is a scroll, not a page jump.
    const onWheel = (event) => {
      if (wrap.scrollWidth <= wrap.clientWidth) return
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
      event.preventDefault()
      wrap.scrollLeft += event.deltaY
    }
    wrap.addEventListener('wheel', onWheel, { passive: false })
    return () => wrap.removeEventListener('wheel', onWheel)
  }, [])

  const current = sessions.find((session) => session.id === selected) || null

  return React.createElement(
    'section',
    { className: 'ait-panel' },
    React.createElement(
      'div',
      { className: 'ait-panel-tabs' },
      React.createElement('span', { className: 'ait-panel-mark', 'aria-hidden': 'true' }, TerminalMark()),
      React.createElement('span', { className: 'ait-panel-title' }, labels.terminal),
      React.createElement(
        'div',
        { className: 'ait-panel-tab-scroll', role: 'tablist', 'aria-label': labels.title, ref: scrollRef },
        sessions.map((session, index) => {
          const label = labelOf(session, index)
          const on = session.id === selected
          const closeTitle = `${labels.closeTab ?? ''} ${label}`.trim()
          return React.createElement(
            'div',
            {
              key: session.id,
              className: 'ait-panel-tab',
              'data-on': on ? 'true' : 'false',
              'data-closing': session.closing ? 'true' : 'false',
              onAuxClick: (event) => {
                if (event.button !== 1) return
                event.preventDefault()
                event.stopPropagation()
                closeSession(session.id)
              },
              onMouseDown: (event) => {
                // Stop the browser's middle-click autoscroll before it starts.
                if (event.button === 1) event.preventDefault()
              },
              ref: (element) => {
                if (element === null) tabRefs.current.delete(session.id)
                else tabRefs.current.set(session.id, element)
              },
            },
            React.createElement(
              'button',
              {
                type: 'button',
                role: 'tab',
                className: 'ait-panel-tab-main',
                title: label,
                'aria-selected': on ? 'true' : 'false',
                onClick: () => selectSession(session.id),
                onKeyDown: (event) => onTabKeyDown(event, index),
              },
              React.createElement('span', {
                className: 'ait-panel-tab-dot',
                'data-holder': session.holder || 'agent',
                'data-phase': session.phase || 'idle',
                'aria-hidden': 'true',
              }),
              React.createElement('span', { className: 'ait-panel-tab-label' }, label),
            ),
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'ait-panel-tab-close',
                title: closeTitle,
                'aria-label': closeTitle,
                onClick: (event) => {
                  event.stopPropagation()
                  closeSession(session.id)
                },
              },
              CloseIcon(),
            ),
          )
        }),
      ),
      React.createElement(
        'button',
        { type: 'button', className: 'ait-panel-add', title: labels.newTerminal, 'aria-label': labels.newTerminal, onClick: openNew },
        PlusIcon(),
      ),
    ),
    React.createElement(
      'div',
      { className: 'ait-panel-body' },
      current !== null
        ? React.createElement(TerminalView, {
            key: current.id,
            sessionId: sessionId,
            terminalId: current.id,
            name: current.name,
            attachPath: attachPath,
            labels: labels,
            autoFocus: autoFocus.current,
            onNewTab: openNew,
            onCloseTab: () => closeSession(current.id),
          })
        : React.createElement(
            'div',
            { className: 'ait-panel-empty' },
            React.createElement(
              'svg',
              { width: 28, height: 28, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
              React.createElement('rect', { x: 2, y: 3.5, width: 12, height: 9, rx: 1.6, stroke: 'currentColor', strokeWidth: 1.1 }),
              React.createElement('path', { d: 'M4.6 6.4l1.8 1.7-1.8 1.7M7.7 9.8h2.5', stroke: 'currentColor', strokeWidth: 1.1, strokeLinecap: 'round', strokeLinejoin: 'round' }),
            ),
            React.createElement('span', { className: 'ait-empty-title' }, error === null ? labels.noSessions : labels.newTerminal),
            React.createElement('span', { className: 'ait-empty-hint' }, error === null ? labels.emptyHint : error),
            React.createElement(
              'button',
              { type: 'button', className: 'ait-panel-open', onClick: openNew },
              labels.newTerminal,
            ),
          ),
    ),
  )
}
