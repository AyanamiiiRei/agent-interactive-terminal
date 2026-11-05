// agent-interactive-terminal browser half.
//
// Two surfaces share one Host registry:
//   1. the Plugins page card for this bundle's `ait-terminal` row, which edits
//      the shell, session cap and default execution surface;
//   2. a right-Sidebar terminal tab. Each tab is one live session, rendered by
//      xterm.js over a WebSocket attach stream. Typing goes straight into the
//      PTY the agent drives; there is no command input and no key row.
//
// Loaded by dsh-client-modules through the package `dsh.client` manifest; the
// id must equal the package name so the module attaches to the row that
// imports that package.
window.__ModuleLoader__.load({
  id: 'agent-interactive-terminal',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    var React = require('react')

    var NS = 'settings.agent-interactive-terminal'
    var ROW_KEY = 'agent-interactive-terminal#ait-terminal'
    var TAB_KIND = 'agent-terminal'
    var TAB_ID = 'agent-interactive-terminal'
    var BRIDGE = '/agent-terminal-bridge'
    var ATTACH = BRIDGE + '/attach'

    var en = {
      title: 'Default shell',
      description: 'Choose which shell new terminal sessions start. Auto follows your login shell.',
      auto: 'Auto (follow $SHELL)',
      zsh: 'zsh',
      bash: 'bash',
      saved: 'Saved. New sessions use this shell.',
      failed: 'The deployment did not accept that value.',
      readOnly: 'Configuration is read-only in this deployment.',
      unavailable: 'This plugin is not loaded, so it cannot be configured right now.',
      'mode.title': 'Default execution surface',
      'mode.description': 'Tells the agent whether to reach for the interactive terminal or one-shot commands first. Auto leaves the choice to the model.',
      'mode.auto': 'Auto (model decides)',
      'mode.terminal': 'Interactive terminal first',
      'mode.exec': 'One-shot commands first',
      'tab.title': 'Terminal',
      'tab.guide.title': 'New terminal',
      'tab.guide.description': 'Open a shell in the right sidebar, shared with the agent.',
      open: 'Open terminal',
      'state.agent': 'Agent is driving',
      'state.human': 'You have control',
      'state.ready': 'Agent ready',
      'state.peeking': 'Agent is watching',
      'state.secret': 'Waiting for your password',
      'state.secretHint': 'The terminal is waiting for your password. Click here, then type it in the terminal.',
      'tag.agent': 'Agent',
      'state.exited': 'Process exited',
      'state.observe': 'Read-only',
      'state.sealed': 'Agent cut off',
      'state.sealedHint': 'The agent can no longer see or type here. Click the plug to reconnect it.',
      'state.connecting': 'Connecting',
      'action.lock': 'Make read-only for the agent',
      'action.unlock': 'Let the agent type again',
      'action.seal': 'Cut the agent off',
      'action.unseal': 'Reconnect the agent',
      'action.settings': 'Terminal settings',
      'hint.reconnecting': 'Connection lost, reconnecting…',
      'hint.disconnected': 'Connection lost. Close the tab and open the terminal again.',
      'hint.denied': 'The terminal refused that input.',
      'hint.connecting': 'Connecting to the shell…',
      'hint.copied': 'Copied',
      'starting': 'Starting a shell…',
      'gone': 'This terminal session has ended.',
      'openFailed': 'Could not open a terminal for this session.',
      'closeTab': 'Close tab',
    }
    var zh = {
      title: '默认 shell',
      description: '选择新终端会话用哪个 shell 启动。自动表示跟随登录 shell。',
      auto: '自动（跟随 $SHELL）',
      zsh: 'zsh',
      bash: 'bash',
      saved: '已保存，新会话会使用这个 shell。',
      failed: '本部署没有接受这个值。',
      readOnly: '本部署的配置是只读的。',
      unavailable: '该插件当前未加载，暂时无法配置。',
      'mode.title': '默认执行方式',
      'mode.description': '告诉 agent 优先使用交互式终端还是一次性命令。自动表示由模型自己选择。',
      'mode.auto': '自动（由模型决定）',
      'mode.terminal': '优先交互式终端',
      'mode.exec': '优先一次性命令',
      'tab.title': '终端',
      'tab.guide.title': '新建终端',
      'tab.guide.description': '在右侧边栏打开一个与 agent 共享的 shell。',
      open: '打开终端',
      'state.agent': 'Agent 正在操作',
      'state.human': '你已接管',
      'state.ready': 'Agent 可操作',
      'state.peeking': 'Agent 正在查看',
      'state.secret': '需要你输入密码',
      'state.secretHint': '终端正在等待你输入密码。点这里把光标放到终端，然后输入密码。',
      'tag.agent': 'Agent',
      'state.exited': '进程已退出',
      'state.observe': '只读',
      'state.sealed': '已隔离',
      'state.sealedHint': 'agent 已经看不到也动不了这个终端。点插头可以恢复连接。',
      'state.connecting': '正在连接',
      'action.lock': '设为只读，不让 agent 输入',
      'action.unlock': '恢复让 agent 输入',
      'action.seal': '断开 agent',
      'action.unseal': '恢复 agent 连接',
      'action.settings': '终端设置',
      'hint.reconnecting': '连接中断，正在重连…',
      'hint.disconnected': '连接已断开，请关掉标签页重新打开终端。',
      'hint.denied': '终端拒绝了这次输入。',
      'hint.connecting': '正在连接 shell…',
      'hint.copied': '已复制',
      'starting': '正在启动 shell…',
      'gone': '这个终端会话已经结束。',
      'openFailed': '无法为这个会话打开终端。',
      'closeTab': '关闭标签页',
    }

    var selectStyle = {
      maxWidth: '320px',
      height: '32px',
      borderRadius: '8px',
      border: '0.5px solid var(--dsw-alias-border-l4)',
      background: 'var(--dsw-alias-bg-layer-3)',
      color: 'var(--dsw-alias-label-primary)',
      padding: '0 10px',
      fontSize: '13px',
    }

    var LazyTerminal = React.lazy(function () {
      return require.async('./client.terminal.js').then(function (loaded) {
        return { default: loaded.TerminalView }
      })
    })

    function Card(props) {
      var form = props.form
      var state = form && form.state
      var ready = state && state.value && state.writable !== false
      var t = props.t || function (key) { return (en[key] || key) }
      var fallback = state && state.value && state.value.shell ? state.value.shell : 'auto'
      var modeFallback = state && state.value && state.value.mode ? state.value.mode : 'auto'
      var current = React.useState(fallback)
      var value = current[0]
      var setValue = current[1]
      var modeState = React.useState(modeFallback)
      var mode = modeState[0]
      var setMode = modeState[1]
      var notice = React.useState(null)
      var message = notice[0]
      var setMessage = notice[1]

      React.useEffect(function () {
        setValue(fallback)
      }, [fallback])
      React.useEffect(function () {
        setMode(modeFallback)
      }, [modeFallback])

      if (props.view === 'summary') {
        return React.createElement('span', null, t('description'))
      }

      if (!form) {
        return React.createElement('p', { style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 13 } }, t('unavailable'))
      }

      function save(ops) {
        setMessage(null)
        form.mutate(ops, state && state.revision).then(function (accepted) {
          setMessage(accepted ? 'saved' : 'failed')
        }).catch(function () {
          setMessage('failed')
        })
      }

      function saveShell(next) {
        setValue(next)
        save([{ op: 'set', path: ['shell'], value: next }])
      }

      function saveMode(next) {
        setMode(next)
        save([{ op: 'set', path: ['mode'], value: next }])
      }

      var options = ['auto', 'zsh', 'bash'].map(function (id) {
        return React.createElement('option', { key: id, value: id }, t(id))
      })
      var modeOptions = ['auto', 'terminal', 'exec'].map(function (id) {
        return React.createElement('option', { key: id, value: id }, t('mode.' + id))
      })

      return React.createElement(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '14px', padding: '16px 0' } },
        React.createElement(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
          React.createElement('div', { style: { fontSize: 14, fontWeight: 500, color: 'var(--dsw-alias-label-primary)' } }, t('title')),
          React.createElement('div', { style: { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)' } }, t('description')),
          React.createElement(
            'select',
            {
              value: value,
              disabled: !ready,
              onChange: function (event) { saveShell(event.target.value) },
              style: selectStyle,
            },
            options,
          ),
        ),
        React.createElement(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
          React.createElement('div', { style: { fontSize: 14, fontWeight: 500, color: 'var(--dsw-alias-label-primary)' } }, t('mode.title')),
          React.createElement('div', { style: { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)' } }, t('mode.description')),
          React.createElement(
            'select',
            {
              value: mode,
              disabled: !ready,
              onChange: function (event) { saveMode(event.target.value) },
              style: selectStyle,
            },
            modeOptions,
          ),
        ),
        message === 'saved' ? React.createElement('div', { style: { fontSize: 12, color: 'var(--dsw-alias-state-success-primary)' } }, t('saved')) : null,
        message === 'failed' ? React.createElement('div', { style: { fontSize: 12, color: 'var(--dsw-alias-state-error-primary)' } }, t('failed')) : null,
        ready ? null : React.createElement('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' } }, t('readOnly')),
      )
    }

    /**
     * One JSON request against the Host bridge.
     * @param {string} path - bridge path with its query string.
     * @param {{ method?: string, body?: object }} [init] - method and JSON body.
     * @returns {Promise<any>} the decoded response; rejection carries the Host message.
     */
    function request(path, init) {
      var options = { credentials: 'same-origin', headers: {} }
      if (init && init.method) {
        options.method = init.method
        options.headers['content-type'] = 'application/json'
        options.body = JSON.stringify(init.body || {})
      }
      return fetch(BRIDGE + path, options).then(function (response) {
        return response.json().catch(function () { return {} }).then(function (payload) {
          if (!response.ok) {
            throw new Error(payload && payload.error ? payload.error : 'bridge request failed: ' + response.status)
          }
          return payload
        })
      })
    }

    /**
     * Bind the bridge calls to one DSH session.
     * @param {string} sessionId - Session that owns the terminal registry.
     * @returns the call surface the panel component uses.
     */
    function apiFor(sessionId) {
      var q = '?sessionId=' + encodeURIComponent(sessionId)
      return {
        state: function () { return request('/state' + q) },
        open: function (cols, rows) { return request('/open' + q, { method: 'POST', body: { cols: cols, rows: rows } }) },
        close: function (id) { return request('/close' + q, { method: 'POST', body: { id: id } }) },
      }
    }

    function bindingKey(sessionId, tabId) {
      return 'ait:tab:' + sessionId + ':' + tabId
    }

    function readBinding(sessionId, tabId) {
      try {
        var raw = window.localStorage.getItem(bindingKey(sessionId, tabId))
        if (!raw) return null
        var parsed = JSON.parse(raw)
        return parsed && typeof parsed.id === 'string' ? parsed : null
      } catch (error) {
        return null
      }
    }

    function writeBinding(sessionId, tabId, value) {
      try {
        window.localStorage.setItem(bindingKey(sessionId, tabId), JSON.stringify(value))
      } catch (error) {
        // Private-mode storage can refuse writes; the navigation params still work.
      }
    }

    function clearBinding(sessionId, tabId) {
      try {
        window.localStorage.removeItem(bindingKey(sessionId, tabId))
      } catch (error) {
        // Nothing to do.
      }
    }

    function humanName(name) {
      if (typeof name !== 'string' || name.trim() === '') return null
      if (/^s-[0-9a-f]{4,}/i.test(name)) return null
      if (/^\d+$/.test(name)) return null
      return name
    }

    function terminalLabel(t, id) {
      return /^\d+$/.test(id) ? t('tab.title') + ' ' + id : t('tab.title')
    }

    function takeParams(tab, props) {
      var params = tab && tab.navigation && tab.navigation.params
      if (!params && props.navigation) params = props.navigation.params
      return params && typeof params === 'object' ? params : null
    }

    function useTabRecord(props) {
      if (typeof props.useTabInfo === 'function') {
        var info = props.useTabInfo()
        if (info && info.tab) return info.tab
      }
      return props.tab || null
    }

    function labelsFor(t) {
      return {
        agent: t('state.agent'),
        ready: t('state.ready'),
        peeking: t('state.peeking'),
        human: t('state.human'),
        secret: t('state.secret'),
        secretHint: t('state.secretHint'),
        agentTag: t('tag.agent'),
        exited: t('state.exited'),
        observe: t('state.observe'),
        sealed: t('state.sealed'),
        sealedHint: t('state.sealedHint'),
        connecting: t('state.connecting'),
        connectingHint: t('hint.connecting'),
        copied: t('hint.copied'),
        settings: t('action.settings'),
        lock: t('action.lock'),
        unlock: t('action.unlock'),
        seal: t('action.seal'),
        unseal: t('action.unseal'),
        reconnecting: t('hint.reconnecting'),
        disconnected: t('hint.disconnected'),
        denied: t('hint.denied'),
      }
    }

    /**
     * One terminal tab: resolve the session it is bound to, attaching
     * immediately, and spawn a shell when the tab was opened without one.
     */
    function TerminalBody(props) {
      var t = props.t || function (key) { return (en[key] || key) }
      var sessionId = props.dshSessionId
      var tab = useTabRecord(props)
      var tabId = tab && tab.id ? tab.id : props.tabId
      var params = takeParams(tab, props)
      var initial = params && typeof params.id === 'string' ? { id: params.id, name: params.name || params.id } : null
      var bound = React.useRef(initial || (tabId ? readBinding(sessionId, tabId) : null))
      var errorState = React.useState(null)
      var error = errorState[0]
      var setError = errorState[1]
      var targetState = React.useState(bound.current)
      var target = targetState[0]
      var setTarget = targetState[1]

      React.useEffect(function () {
        if (target !== null || sessionId === undefined) return undefined
        var alive = true
        apiFor(sessionId).open(120, 30).then(function (created) {
          if (!alive) return
          var next = { id: created.id, name: created.name || created.id }
          if (tabId) writeBinding(sessionId, tabId, next)
          setTarget(next)
        }).catch(function (reason) {
          if (!alive) return
          setError(reason instanceof Error ? reason.message : String(reason))
        })
        return function () { alive = false }
      }, [target, sessionId, tabId])

      React.useEffect(function () {
        if (target !== null && tabId && sessionId !== undefined) writeBinding(sessionId, tabId, target)
      }, [target, tabId, sessionId])

      // A restored tab may point at a shell that no longer exists. Only a fresh
      // spawn (params) is guaranteed to be alive; everything else is checked
      // once and the tab is closed when the Host no longer knows the session.
      React.useEffect(function () {
        if (target === null || sessionId === undefined) return undefined
        if (params && params.id === target.id) return undefined
        if (!props.closeTab || !tabId) return undefined
        var alive = true
        apiFor(sessionId).state().then(function (payload) {
          if (!alive) return
          var sessions = Array.isArray(payload.sessions) ? payload.sessions : []
          var found = sessions.some(function (session) { return session.id === target.id })
          if (!found) props.closeTab(tabId)
        }).catch(function () {
          // The bridge being unreachable is not evidence the session is gone.
        })
        return function () { alive = false }
      }, [])

      function closeThisTab() {
        if (props.closeTab && tabId) props.closeTab(tabId)
      }

      if (error !== null) {
        return React.createElement(
          'section',
          { style: { display: 'flex', flexDirection: 'column', gap: 12, padding: 16, fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } },
          React.createElement('div', null, t('openFailed')),
          React.createElement('div', { style: { color: 'var(--dsw-alias-state-error-primary)' } }, error),
          React.createElement('button', { type: 'button', onClick: closeThisTab, style: { alignSelf: 'flex-start', height: 26, padding: '0 10px', borderRadius: 6, border: '0.5px solid var(--dsw-alias-border-l4)', background: 'transparent', color: 'inherit', cursor: 'pointer' } }, t('closeTab')),
        )
      }

      if (target === null) {
        return React.createElement('section', { style: { padding: 16, fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' } }, t('starting'))
      }

      return React.createElement(
        React.Suspense,
        { fallback: React.createElement('section', { style: { padding: 16, fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' } }, t('starting')) },
        React.createElement(LazyTerminal, {
          sessionId: sessionId,
          terminalId: target.id,
          name: target.name,
          attachPath: ATTACH,
          labels: labelsFor(t),
          onNewTab: props.openNew,
          onCloseTab: closeThisTab,
        }),
      )
    }

    /** The chip title: the session name, or the generic terminal label. */
    function TerminalTitle(props) {
      var t = props.t || function (key) { return (en[key] || key) }
      var tab = useTabRecord(props)
      var params = takeParams(tab, props)
      var tabId = tab && tab.id ? tab.id : props.tabId
      var stored = tabId && props.dshSessionId ? readBinding(props.dshSessionId, tabId) : null
      var id = (params && typeof params.id === 'string' && params.id) || (stored && stored.id) || ''
      var name = humanName(params && params.name) || humanName(stored && stored.name)
      var label = terminalLabel(t, id)
      var title = name ? label + ' · ' + name : label
      return React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 } }, React.createElement(TerminalGlyph, {}), React.createElement('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, title))
    }

    function TerminalGlyph() {
      return React.createElement(
        'svg',
        { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
        React.createElement('path', { d: 'M3 4L7 8L3 12', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        React.createElement('path', { d: 'M9 12H13', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }),
      )
    }

    var inject = ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs']

    function apply(ctx) {
      ctx.effect(function () {
        return ctx.locale.register(NS, { en: en, zh: zh })
      })
      var t = ctx.locale.bind(NS)

      ctx.slots.inject('plugins.row.config', function () {
        return ctx.slots.register(
          {
            name: 'plugins.row.config',
            key: ROW_KEY,
            id: 'agent-interactive-terminal',
            locale: NS,
            inject: function () { return { t: t } },
          },
          Card,
        )
      })

      function findOpenTab(sessionId, terminalId) {
        var tabs = ctx.sidebarRight.openTabs.getSnapshot()
        for (var index = 0; index < tabs.length; index += 1) {
          var item = tabs[index]
          if (item.kind !== TAB_KIND) continue
          // The inventory carries no navigation params, so the per-tab binding
          // written by the body is the authority on which shell it shows.
          var bound = readBinding(sessionId, item.tabId)
          if (bound !== null && bound.id === terminalId) return item
        }
        return null
      }

      function openTerminalTab(sessionId, target) {
        var existing = findOpenTab(sessionId, target.id)
        if (existing !== null) {
          ctx.sidebarRight.focus(existing.tabId)
          return
        }
        ctx.sidebarRight.openTab(TAB_KIND, { params: { id: target.id, name: target.name } })
      }

      function openRecentOrCreate(sessionId) {
        var api = apiFor(sessionId)
        api.state().then(function (payload) {
          var list = Array.isArray(payload.sessions) ? payload.sessions : []
          if (list.length > 0) {
            var recent = list[list.length - 1]
            openTerminalTab(sessionId, { id: recent.id, name: recent.name || recent.id })
            return undefined
          }
          return api.open(120, 30).then(function (created) {
            openTerminalTab(sessionId, { id: created.id, name: created.name || created.id })
          })
        }).catch(function () {
          // No live agent for this view, or the bridge is not mounted.
        })
      }

      var syncInFlight = false
      function syncTerminals(sessionId) {
        if (typeof sessionId !== 'string' || syncInFlight) return
        syncInFlight = true
        var api = apiFor(sessionId)
        api.state().then(function (payload) {
          var list = Array.isArray(payload.sessions) ? payload.sessions : []
          for (var index = 0; index < list.length; index += 1) {
            var item = list[index]
            if (!item || typeof item.id !== 'string') continue
            if (findOpenTab(sessionId, item.id) === null) {
              try {
                ctx.sidebarRight.openTab(TAB_KIND, { params: { id: item.id, name: item.name || '' } })
              } catch {
                // The pane is not mounted for this session yet; the next tick retries.
              }
            }
          }
          return undefined
        }).catch(function () {
          // No live agent for this view, or the bridge is not mounted.
        }).then(function () {
          syncInFlight = false
        })
      }

      function openNewTab(sessionId) {
        if (typeof sessionId !== 'string') return
        apiFor(sessionId).open(120, 30).then(function (created) {
          ctx.sidebarRight.openTab(TAB_KIND, { params: { id: created.id, name: created.name || created.id } })
        }).catch(function () {
          // The panel shows its own error if the tab cannot attach.
        })
      }

      ctx.effect(function () {
        return ctx.sidebarRightTabs.register({
          id: TAB_ID,
          kind: TAB_KIND,
          multiple: true,
          priority: 'extension',
          title: function () { return t('tab.title') },
          guide: [
            {
              id: 'open',
              order: 30,
              title: function () { return t('tab.guide.title') },
              description: function () { return t('tab.guide.description') },
            },
          ],
        })
      })

      ctx.effect(function () {
        return ctx.sidebarRight.registerCloseHandler(TAB_KIND, function (sessionId, tab) {
          var params = tab.navigation && tab.navigation.params
          var bound = params && typeof params.id === 'string' ? params : readBinding(sessionId, tab.id)
          if (bound && typeof bound.id === 'string') {
            void apiFor(sessionId).close(bound.id).catch(function () {})
          }
          clearBinding(sessionId, tab.id)
        })
      })

      ctx.effect(function () {
        return ctx.slots.inject('sidebar.right.pane.tab', function () {
          return ctx.slots.register(
            {
              name: 'sidebar.right.pane.tab',
              key: TAB_ID,
              locale: NS,
              inject: function (sessionId) {
                return {
                  t: t,
                  dshSessionId: sessionId,
                  openNew: function () { openNewTab(sessionId) },
                  closeTab: function (tabId) { ctx.sidebarRight.close(tabId) },
                }
              },
            },
            TerminalBody,
          )
        })
      })

      ctx.effect(function () {
        return ctx.slots.inject('sidebar.right.pane.tab.title', function () {
          return ctx.slots.register(
            {
              name: 'sidebar.right.pane.tab.title',
              key: TAB_ID,
              locale: NS,
              inject: function (sessionId) { return { t: t, dshSessionId: sessionId } },
            },
            TerminalTitle,
          )
        })
      })

      ctx.effect(function () {
        return ctx.slots.inject('conversation.session.header.utilities', function () {
          return ctx.slots.register(
            {
              name: 'conversation.session.header.utilities',
              id: 'agent-terminal-open',
              order: 30,
              locale: NS,
              inject: function (sessionId) {
                return {
                  t: t,
                  openTerminal: function () { openRecentOrCreate(sessionId) },
                  syncTerminals: function () { syncTerminals(sessionId) },
                }
              },
            },
            function OpenTerminalButton(props) {
              var label = (props.t || t)('open')
              React.useEffect(function () {
                if (typeof props.syncTerminals !== 'function') return undefined
                props.syncTerminals()
                var timer = window.setInterval(props.syncTerminals, 4000)
                return function () {
                  window.clearInterval(timer)
                }
              }, [])
              return React.createElement(
                'button',
                {
                  className: 'ait-icon-btn',
                  type: 'button',
                  title: label,
                  'aria-label': label,
                  onClick: function (event) {
                    event.preventDefault()
                    event.stopPropagation()
                    props.openTerminal()
                  },
                },
                React.createElement(TerminalGlyph, {}),
              )
            },
          )
        })
      })

      if (!document.querySelector('style[data-plugin-css="agent-interactive-terminal/header"]')) {
        var tag = document.createElement('style')
        tag.dataset.plugin = 'agent-interactive-terminal'
        tag.dataset.pluginCss = 'agent-interactive-terminal/header'
        tag.textContent = '.ait-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:6px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}.ait-icon-btn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}'
        document.head.appendChild(tag)
      }
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
