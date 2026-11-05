// agent-interactive-terminal browser half.
//
// Two surfaces share one Host registry:
//   1. the Plugins page card for this bundle's `ait-terminal` row, which edits
//      the shell, session cap and default execution surface;
//   2. a right-Sidebar tab that lists the agent's live terminal sessions and
//      shows the same screen the agent reads, with an input line for the
//      person. Both sides write into the same PTY, so each one sees what the
//      other is doing.
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
    var BRIDGE = '/plugins/agent-interactive-terminal'
    var POLL_MS = 900

    var CSS = [
      '.ait-root{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12px}',
      '.ait-bar{display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:.5px solid var(--dsw-alias-border-l3);flex:none}',
      '.ait-select{min-width:0;flex:1;height:26px;border-radius:6px;border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);padding:0 6px;font-size:12px}',
      '.ait-btn{height:26px;padding:0 8px;border-radius:6px;border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);cursor:pointer;font-size:12px;white-space:nowrap}',
      '.ait-btn:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.ait-btn:disabled{opacity:.5;cursor:default}',
      '.ait-phase{color:var(--dsw-alias-label-tertiary);font-size:11px;white-space:nowrap}',
      '.ait-screen{margin:0;flex:1;min-height:0;overflow:auto;padding:10px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.45;white-space:pre;tab-size:4;background:var(--dsw-alias-bg-layer-0,var(--dsw-alias-bg-layer-1))}',
      '.ait-empty{margin:0;flex:1;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary);padding:20px;text-align:center}',
      '.ait-footer{display:flex;flex-direction:column;gap:6px;padding:8px 10px 10px;border-top:.5px solid var(--dsw-alias-border-l3);flex:none}',
      '.ait-inputrow{display:flex;gap:6px}',
      '.ait-input{min-width:0;flex:1;height:28px;border-radius:6px;border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);padding:0 8px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}',
      '.ait-keys{display:flex;gap:4px;flex-wrap:wrap}',
      '.ait-error{color:var(--dsw-alias-state-error-primary);padding:6px 10px;font-size:11px}',
      '.ait-iconbtn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:6px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.ait-iconbtn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
    ].join('')

    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="agent-interactive-terminal"]') === null) {
      var tag = document.createElement('style')
      tag.dataset.plugin = 'agent-interactive-terminal'
      tag.dataset.pluginCss = 'agent-interactive-terminal'
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

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
      'tab.title': 'Agent terminal',
      'tab.guide.title': 'Agent terminal',
      'tab.guide.description': 'Watch and share the terminal sessions the agent is using.',
      open: 'Open interactive terminal',
      'panel.new': 'New',
      'panel.close': 'Close',
      'panel.empty': 'No terminal session yet. The agent creates one with terminal_open, or you can start one here.',
      'panel.placeholder': 'Type into the shared terminal',
      'panel.send': 'Send',
      'panel.pick': 'Choose a session',
      'panel.error': 'The terminal bridge did not answer.',
      'key.ctrl-c': 'Ctrl-C',
      'key.escape': 'Esc',
      'key.tab': 'Tab',
      'key.up': 'Up',
      'key.down': 'Down',
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
      'tab.title': 'Agent 终端',
      'tab.guide.title': 'Agent 终端',
      'tab.guide.description': '查看并接管 agent 正在使用的终端会话。',
      open: '打开交互式终端',
      'panel.new': '新建',
      'panel.close': '关闭',
      'panel.empty': '还没有终端会话。agent 会用 terminal_open 创建，你也可以在这里直接开一个。',
      'panel.placeholder': '直接键入共享终端',
      'panel.send': '发送',
      'panel.pick': '选择一个会话',
      'panel.error': '终端桥接没有响应。',
      'key.ctrl-c': 'Ctrl-C',
      'key.escape': 'Esc',
      'key.tab': 'Tab',
      'key.up': '上',
      'key.down': '下',
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
        screen: function (id) { return request('/screen' + q + '&id=' + encodeURIComponent(id)) },
        open: function (cols, rows) { return request('/open' + q, { method: 'POST', body: { cols: cols, rows: rows } }) },
        send: function (id, text, submit) {
          return request('/send' + q, { method: 'POST', body: { id: id, text: text, submit: submit } })
        },
        key: function (id, key) { return request('/key' + q, { method: 'POST', body: { id: id, key: key } }) },
        close: function (id) { return request('/close' + q, { method: 'POST', body: { id: id } }) },
      }
    }

    function phaseLabel(screen) {
      if (!screen) return ''
      return (screen.phase || '') + ' · ' + screen.cols + 'x' + screen.rows
    }

    function AgentTerminalBody(props) {
      var api = props.api
      var t = props.t || function (key) { return (en[key] || key) }
      var apiRef = React.useRef(api)
      apiRef.current = api
      var sessionsState = React.useState([])
      var sessions = sessionsState[0]
      var setSessions = sessionsState[1]
      var selectedState = React.useState(null)
      var selected = selectedState[0]
      var setSelected = selectedState[1]
      var screenState = React.useState(null)
      var screen = screenState[0]
      var setScreen = screenState[1]
      var errorState = React.useState(null)
      var error = errorState[0]
      var setError = errorState[1]
      var draftState = React.useState('')
      var draft = draftState[0]
      var setDraft = draftState[1]
      var busyState = React.useState(false)
      var busy = busyState[0]
      var setBusy = busyState[1]
      var preRef = React.useRef(null)

      var refreshState = React.useCallback(function () {
        return apiRef.current.state().then(function (payload) {
          setError(null)
          var list = Array.isArray(payload.sessions) ? payload.sessions : []
          setSessions(list)
          setSelected(function (current) {
            if (current !== null && list.some(function (item) { return item.id === current })) return current
            return list.length > 0 ? list[0].id : null
          })
        }).catch(function (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
        })
      }, [])

      var refreshScreen = React.useCallback(function (id) {
        if (id === null) {
          setScreen(null)
          return Promise.resolve()
        }
        return apiRef.current.screen(id).then(function (payload) {
          setError(null)
          setScreen(payload)
        }).catch(function (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
        })
      }, [])

      React.useEffect(function () {
        refreshState()
        var timer = setInterval(function () {
          refreshState()
        }, POLL_MS * 5)
        return function () { clearInterval(timer) }
      }, [refreshState])

      React.useEffect(function () {
        refreshScreen(selected)
        var timer = setInterval(function () {
          refreshScreen(selected)
        }, POLL_MS)
        return function () { clearInterval(timer) }
      }, [selected, refreshScreen])

      React.useEffect(function () {
        if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight
      }, [screen && screen.revision])

      function act(promise) {
        setBusy(true)
        return promise.then(function (result) {
          setBusy(false)
          return result
        }, function (reason) {
          setBusy(false)
          setError(reason instanceof Error ? reason.message : String(reason))
        })
      }

      function onCreate() {
        act(api.open(100, 30)).then(function (created) {
          if (created !== undefined && created !== null && created.id) {
            refreshState().then(function () { setSelected(created.id) })
          }
        })
      }

      function onSend(event) {
        if (event) event.preventDefault()
        if (selected === null || draft.length === 0 || busy) return
        var text = draft
        setDraft('')
        act(api.send(selected, text, true)).then(function () {
          setTimeout(function () { refreshScreen(selected) }, 120)
        })
      }

      function onKey(key) {
        if (selected === null || busy) return
        act(api.key(selected, key)).then(function () {
          setTimeout(function () { refreshScreen(selected) }, 120)
        })
      }

      function onClose() {
        if (selected === null || busy) return
        act(api.close(selected)).then(function () {
          setScreen(null)
          refreshState()
        })
      }

      var options = sessions.map(function (item) {
        return React.createElement('option', { key: item.id, value: item.id }, item.name || item.id)
      })

      return React.createElement(
        'section',
        { className: 'ait-root' },
        React.createElement(
          'header',
          { className: 'ait-bar' },
          React.createElement(
            'select',
            {
              className: 'ait-select',
              value: selected === null ? '' : selected,
              onChange: function (event) { setSelected(event.target.value || null) },
              title: t('panel.pick'),
            },
            options.length === 0 ? React.createElement('option', { value: '' }, t('panel.empty')) : null,
            options,
          ),
          React.createElement('button', { className: 'ait-btn', onClick: onCreate, disabled: busy }, t('panel.new')),
          React.createElement('button', { className: 'ait-btn', onClick: onClose, disabled: busy || selected === null }, t('panel.close')),
        ),
        screen === null
          ? React.createElement('p', { className: 'ait-empty' }, t('panel.empty'))
          : React.createElement('pre', { className: 'ait-screen', ref: preRef }, (screen.lines || []).join('\n')),
        React.createElement(
          'footer',
          { className: 'ait-footer' },
          React.createElement(
            'div',
            { className: 'ait-keys' },
            React.createElement('span', { className: 'ait-phase' }, phaseLabel(screen)),
            React.createElement('button', { className: 'ait-btn', onClick: function () { onKey('ctrl-c') }, disabled: busy || selected === null }, t('key.ctrl-c')),
            React.createElement('button', { className: 'ait-btn', onClick: function () { onKey('escape') }, disabled: busy || selected === null }, t('key.escape')),
            React.createElement('button', { className: 'ait-btn', onClick: function () { onKey('tab') }, disabled: busy || selected === null }, t('key.tab')),
            React.createElement('button', { className: 'ait-btn', onClick: function () { onKey('up') }, disabled: busy || selected === null }, t('key.up')),
            React.createElement('button', { className: 'ait-btn', onClick: function () { onKey('down') }, disabled: busy || selected === null }, t('key.down')),
          ),
          React.createElement(
            'form',
            { className: 'ait-inputrow', onSubmit: onSend },
            React.createElement('input', {
              className: 'ait-input',
              value: draft,
              placeholder: t('panel.placeholder'),
              onChange: function (event) { setDraft(event.target.value) },
              disabled: selected === null,
            }),
            React.createElement('button', { className: 'ait-btn', type: 'submit', disabled: busy || selected === null || draft.length === 0 }, t('panel.send')),
          ),
          error === null ? null : React.createElement('div', { className: 'ait-error' }, error + ' ' + t('panel.error')),
        ),
      )
    }

    function TerminalGlyph() {
      return React.createElement(
        'svg',
        { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
        React.createElement('path', { d: 'M3 4L7 8L3 12', stroke: 'currentColor' }),
        React.createElement('path', { d: 'M9 12H13', stroke: 'currentColor' }),
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
              inject: function (sessionId) { return { api: apiFor(sessionId), t: t } },
            },
            AgentTerminalBody,
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
                  openTerminal: function () {
                    ctx.sidebarRight.openTab(TAB_KIND, {})
                  },
                }
              },
            },
            function OpenTerminalButton(props) {
              var label = (props.t || t)('open')
              return React.createElement(
                'button',
                {
                  className: 'ait-iconbtn',
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
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
