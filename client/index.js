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
      'tab.title': 'Interactive Terminal',
      'tab.guide.title': 'New terminal',
      'tab.guide.description': 'Open a shell in the right sidebar, shared with the agent.',
      open: 'Open interactive terminal',
      'state.agent': 'Agent is driving',
      'state.human': 'You have control',
      'state.ready': 'Agent ready',
      'state.peeking': 'Agent is watching',
      'state.secret': 'Waiting for your password',
      'state.secretHint': 'The terminal is waiting for your password. Click here, then type it in the terminal.',
      'tag.agent': 'Agent',
      'state.exited': 'Process exited',
      'state.observe': 'Agent read-only',
      'state.sealed': 'Agent disconnected',
      'state.connecting': 'Connecting',
      'action.lock': 'Make read-only for the agent',
      'action.unlock': 'Let the agent type again',
      'action.seal': 'Disconnect the agent',
      'action.unseal': 'Reconnect the agent',
      'action.newTerminal': 'New terminal',
      'action.settings': 'Terminal settings',
      'hint.reconnecting': 'Connection lost, reconnecting…',
      'hint.disconnected': 'Connection lost. Close the tab and open the terminal again.',
      'hint.denied': 'The terminal refused that input.',
      'hint.connecting': 'Connecting to the shell…',
      'hint.copied': 'Copied',
      'starting': 'Starting a shell…',
      'gone': 'This terminal session has ended.',
      'openFailed': 'Could not open a terminal for this session.',
      'closeTab': 'Close terminal',
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
      'tab.title': '交互式终端',
      'tab.guide.title': '新建终端',
      'tab.guide.description': '在右侧边栏打开一个与 agent 共享的 shell。',
      open: '打开交互式终端',
      'state.agent': 'Agent 正在操作',
      'state.human': '你已接管',
      'state.ready': 'Agent 可操作',
      'state.peeking': 'Agent 正在查看',
      'state.secret': '需要你输入密码',
      'state.secretHint': '终端正在等待你输入密码。点这里把光标放到终端，然后输入密码。',
      'tag.agent': 'Agent',
      'state.exited': '进程已退出',
      'state.observe': 'Agent 只读',
      'state.sealed': 'Agent 已断开',
      'state.connecting': '正在连接',
      'action.lock': '设为只读，不让 agent 输入',
      'action.unlock': '恢复让 agent 输入',
      'action.seal': '断开 agent',
      'action.unseal': '恢复 agent 连接',
      'action.newTerminal': '新建终端',
      'action.settings': '终端设置',
      'hint.reconnecting': '连接中断，正在重连…',
      'hint.disconnected': '连接已断开，请关掉标签页重新打开终端。',
      'hint.denied': '终端拒绝了这次输入。',
      'hint.connecting': '正在连接 shell…',
      'hint.copied': '已复制',
      'starting': '正在启动 shell…',
      'gone': '这个终端会话已经结束。',
      'openFailed': '无法为这个会话打开终端。',
      'closeTab': '关闭终端',
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
        return { default: loaded.TerminalPanel }
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
        newTerminal: t('action.newTerminal'),
        settings: t('action.settings'),
        lock: t('action.lock'),
        unlock: t('action.unlock'),
        seal: t('action.seal'),
        unseal: t('action.unseal'),
        connecting: t('state.connecting'),
        connectingHint: t('hint.connecting'),
        copied: t('hint.copied'),
        denied: t('hint.denied'),
        reconnecting: t('hint.reconnecting'),
        disconnected: t('hint.disconnected'),
      }
    }

    /** The panel host: one page, with a strip of live sessions inside it. */
    function TerminalBody(props) {
      var t = props.t || function (key) { return (en[key] || key) }
      var sessionId = props.dshSessionId
      var api = React.useMemo(function () { return apiFor(sessionId) }, [sessionId])
      return React.createElement(
        React.Suspense,
        { fallback: React.createElement('section', { style: { padding: 16, fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' } }, t('starting')) },
        React.createElement(LazyTerminal, {
          sessionId: sessionId,
          api: api,
          attachPath: ATTACH,
          labels: labelsFor(t),
        }),
      )
    }

    /** The page title; sessions are numbered inside the page, not here. */
    function TerminalTitle(props) {
      var t = props.t || function (key) { return (en[key] || key) }
      return React.createElement(
        'span',
        { style: { display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 } },
        React.createElement(TerminalGlyph, {}),
        React.createElement('span', null, t('tab.title')),
      )
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

      /** Open the one terminal page, or focus it when it is already open. */
      function openPanel() {
        try {
          ctx.sidebarRight.openTab(TAB_KIND)
        } catch {
          // The pane is not mounted for this session yet; the header click can
          // be retried once the conversation is on screen.
        }
      }

      ctx.effect(function () {
        return ctx.sidebarRightTabs.register({
          id: TAB_ID,
          kind: TAB_KIND,
          multiple: false,
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
        return ctx.slots.inject('sidebar.right.pane.tab', function () {
          return ctx.slots.register(
            {
              name: 'sidebar.right.pane.tab',
              key: TAB_ID,
              locale: NS,
              inject: function (sessionId) {
                return { t: t, dshSessionId: sessionId }
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
              inject: function () {
                return {
                  t: t,
                  openTerminal: openPanel,
                }
              },
            },
            function OpenTerminalButton(props) {
              var label = (props.t || t)('open')
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
