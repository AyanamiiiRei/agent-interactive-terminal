// agent-interactive-terminal browser half.
//
// Three surfaces share one Host registry:
//   1. the bundle page in Plugins, which holds the full runtime policy and the
//      embedded browser preferences;
//   2. the same settings on the `ait-terminal` row page;
//   3. a right-Sidebar terminal tab. Each tab is one live session, rendered by
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
      'host.title': 'Runtime policy',
      'host.description': 'These values are written to the plugin configuration and decide how the agent chooses its shell surface.',
      title: 'Default shell',
      description: 'Choose which shell new terminal sessions start. Auto follows your login shell; on Windows it prefers WSL, then PowerShell. On Windows, zsh and bash run inside WSL.',
      auto: 'Auto (follow $SHELL)',
      zsh: 'zsh',
      bash: 'bash',
      savedSettings: 'Saved. The new policy applies to later agent work.',
      failed: 'The deployment did not accept that value.',
      readOnly: 'Configuration is read-only in this deployment.',
      unavailable: 'This plugin is not loaded, so it cannot be configured right now.',
      'policy.title': 'Tool policy',
      'policy.description': 'Choose which execution surface the agent reaches for first.',
      'mode.exec': 'One-shot first',
      'mode.terminal': 'Interactive first',
      'mode.force': 'Terminal only',
      'mode.execHint': 'The agent uses bash for shell commands by default and reaches for the interactive terminal only when a program needs it.',
      'mode.terminalHint': 'The agent uses the interactive terminal by default and keeps bash for a short fallback command.',
      'mode.forceHint': 'The bash tool is hidden from every agent. All shell work must go through the interactive terminal.',
      'max.title': 'Concurrent sessions',
      'max.description': 'How many terminal sessions one agent may keep open at the same time.',
      'proactive.title': 'Use the terminal proactively',
      'proactive.description': 'When work fits a REPL, the agent enters an interactive environment such as Python and types the code there instead of packing everything into one command.',
      'appearance.title': 'Appearance and controls',
      'appearance.description': 'These preferences live in this browser and apply to the sidebar terminal immediately.',
      'appearance.loading': 'Loading terminal preferences…',
      'tab.title': 'Interactive Terminal',
      'tab.terminal': 'Terminal',
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
      'input.lock': 'Lock input',
      'input.locked': 'Input locked',
      'input.unlock': 'Unlock input',
      'input.hint': 'Terminal keyboard input is locked; the agent can still work.',
      'empty.title': 'No open terminals',
      'empty.description': 'Open a shell shared with the agent.',
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
      'host.title': '运行策略',
      'host.description': '这些设置会写入插件配置，并决定 agent 优先使用哪种执行方式。',
      title: '默认 shell',
      description: '选择新终端会话用哪个 shell 启动。自动表示跟随登录 shell；Windows 上优先 WSL，其次 PowerShell。Windows 上选择 zsh 或 bash 会在 WSL 里运行。',
      auto: '自动（跟随 $SHELL）',
      zsh: 'zsh',
      bash: 'bash',
      savedSettings: '已保存，新策略会应用到之后的 agent 操作。',
      failed: '本部署没有接受这个值。',
      readOnly: '本部署的配置是只读的。',
      unavailable: '该插件当前未加载，暂时无法配置。',
      'policy.title': '工具使用策略',
      'policy.description': '选择 agent 默认优先使用哪种执行方式。',
      'mode.exec': '一次性命令',
      'mode.terminal': '交互式优先',
      'mode.force': '强制交互式',
      'mode.execHint': 'agent 默认用 bash 执行命令，交互式终端只在程序需要时使用。',
      'mode.terminalHint': 'agent 默认使用交互式终端，bash 仅作为简短的补充命令。',
      'mode.forceHint': 'bash 工具会对所有 agent 隐藏，所有 shell 操作都必须走交互式终端。',
      'max.title': '并发会话上限',
      'max.description': '一个 agent 同时保留的终端会话数量。',
      'proactive.title': '主动使用交互式终端',
      'proactive.description': '适合 REPL 的任务会先进入交互环境（例如 python），再把代码输入进去，而不是把全部逻辑塞进一条命令。',
      'appearance.title': '外观与操作',
      'appearance.description': '这些偏好只保存在当前浏览器，修改后会立即应用到右侧终端。',
      'appearance.loading': '正在加载终端设置…',
      'tab.title': '交互式终端',
      'tab.terminal': '终端',
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
      'input.lock': '锁定输入',
      'input.locked': '输入已锁定',
      'input.unlock': '解锁输入',
      'input.hint': '终端键盘输入已锁定；agent 仍可继续工作。',
      'empty.title': '没有打开的终端',
      'empty.description': '打开一个与 agent 共享的 shell。',
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

    var CONFIG_CSS = `
.ait-config{display:flex;flex-direction:column;gap:8px;max-width:560px;padding:8px 0 20px;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue","Segoe UI",system-ui,sans-serif;color:var(--dsw-alias-label-primary);-webkit-font-smoothing:antialiased}
.ait-config *,.ait-config *::before,.ait-config *::after{box-sizing:border-box}
.ait-config-card{border:1px solid var(--dsw-alias-settings-card-stroke);border-radius:10px;background:var(--dsw-alias-settings-card-fill);overflow:hidden}
.ait-config-row{position:relative;display:flex;flex-direction:column;gap:8px;padding:12px 16px}
.ait-config-row + .ait-config-row::before{content:"";position:absolute;top:0;left:16px;right:0;height:1px;background:var(--dsw-alias-border-l1)}
.ait-config-label{font-size:15px;line-height:20px;font-weight:500;color:var(--dsw-alias-label-primary)}
.ait-config-hint{font-size:13px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.ait-config-inline{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.ait-config-copy{flex:1;min-width:0}
.ait-config-select{width:100%;max-width:320px;height:44px;border:0;border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent);color:var(--dsw-alias-label-primary);padding:0 12px;font:inherit;font-size:15px;outline:none;cursor:pointer;transition:background-color 320ms cubic-bezier(0.32,0.72,0,1),box-shadow 320ms cubic-bezier(0.32,0.72,0,1)}
.ait-config-select:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}
.ait-config-select:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-link)}
.ait-config-input{width:120px;height:40px;border:0;border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent);color:var(--dsw-alias-label-primary);padding:0 10px;font:inherit;font-size:15px;outline:none;transition:background-color 320ms cubic-bezier(0.32,0.72,0,1),box-shadow 320ms cubic-bezier(0.32,0.72,0,1)}
.ait-config-input:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}
.ait-config-input:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-link)}
.ait-config-section{display:flex;flex-direction:column;gap:8px;margin-top:24px}
.ait-config-section:first-child{margin-top:0}
.ait-config-heading{font-size:15px;line-height:20px;font-weight:600;color:var(--dsw-alias-label-primary)}
.ait-config-section-hint{margin:0;font-size:13px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.ait-config-segment{display:flex;gap:2px;width:100%;max-width:360px;padding:2px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent)}
.ait-config-segment button{flex:1;min-width:0;height:32px;border:1px solid transparent;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;font-weight:500;padding:0 8px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:background-color 320ms cubic-bezier(0.32,0.72,0,1),color 320ms cubic-bezier(0.32,0.72,0,1),border-color 320ms cubic-bezier(0.32,0.72,0,1)}
.ait-config-segment button:hover{color:var(--dsw-alias-label-primary)}
.ait-config-segment button[data-on="true"]{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);font-weight:600}
.ait-config-segment button:disabled{opacity:0.4;cursor:default}
.ait-config-segment button:focus-visible{outline:2px solid var(--dsw-alias-link);outline-offset:-2px}
.ait-config-switch{position:relative;width:51px;height:31px;flex:none;border:0;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 18%,transparent);cursor:pointer;transition:background-color 320ms cubic-bezier(0.32,0.72,0,1)}
.ait-config-switch::after{content:"";position:absolute;top:2px;left:2px;width:27px;height:27px;border-radius:50%;background:var(--dsw-alias-bg-base);transition:transform 320ms cubic-bezier(0.32,0.72,0,1)}
.ait-config-switch[data-on="true"]{background:var(--dsw-alias-link)}
.ait-config-switch[data-on="true"]::after{transform:translateX(20px)}
.ait-config-switch:disabled{opacity:0.4;cursor:default}
.ait-config-switch:focus-visible{outline:2px solid var(--dsw-alias-link);outline-offset:2px}
.ait-config-message{display:flex;align-items:center;gap:8px;min-height:20px;font-size:13px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.ait-config-message .dot{width:6px;height:6px;flex:none;border-radius:50%;background:var(--dsw-alias-label-tertiary)}
.ait-config-message[data-kind="saved"] .dot{background:var(--dsw-alias-state-success-primary)}
.ait-config-message[data-kind="failed"] .dot{background:var(--dsw-alias-state-error-primary)}
.ait-config-unavailable{margin:0;padding:8px 0 20px;font-size:13px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.ait-config-loading{padding:16px;font-size:13px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.ait-config-appearance{margin-top:2px}
.ait-title{display:inline-flex;align-items:center;gap:6px;min-width:0;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue","Segoe UI",system-ui,sans-serif}
.ait-title svg{width:20px;height:20px;flex:none;color:var(--dsw-alias-label-secondary)}
`
    var configCssInjected = false

    function injectConfigCss() {
      if (configCssInjected || typeof document === 'undefined') return
      configCssInjected = true
      var style = document.createElement('style')
      style.textContent = CONFIG_CSS
      document.head.appendChild(style)
    }

    var LazyTerminal = React.lazy(function () {
      return require.async('./client.terminal.js').then(function (loaded) {
        return { default: loaded.TerminalPanel }
      })
    })
    var LazyPreferences = React.lazy(function () {
      return require.async('./client.terminal.js').then(function (loaded) {
        return { default: loaded.TerminalPreferences }
      })
    })

    /**
     * Keep a component in sync with the shared Host config form. The row page
     * normally passes a one-shot form snapshot, but the bundle page has no row
     * form, so both pages read the same `configForms` controller here.
     */
    function useConfigSnapshot(form) {
      var initial = React.useState(function () { return form ? form.getSnapshot() : null })
      var snapshot = initial[0]
      var setSnapshot = initial[1]
      React.useEffect(function () {
        if (!form) {
          setSnapshot(null)
          return undefined
        }
        setSnapshot(form.getSnapshot())
        return form.subscribe(function () { setSnapshot(form.getSnapshot()) })
      }, [form])
      return snapshot
    }

    function SettingsPage(props) {
      var t = props.t || function (key) { return (en[key] || key) }
      var form = props.configForm || null
      var snapshot = useConfigSnapshot(form)
      var fallback = props.form && props.form.state ? props.form.state : null
      var state = snapshot || fallback
      var values = state && state.value ? state.value : {}
      var ready = Boolean(
        state &&
        state.value &&
        state.writable !== false &&
        state.status !== 'loading' &&
        state.status !== 'unavailable',
      )
      var saveFn = form
        ? function (ops, revision) { return form.mutate(ops, revision) }
        : props.form && typeof props.form.mutate === 'function'
          ? props.form.mutate
          : null
      var modes = ['exec', 'terminal', 'force']
      var rawMode = values.mode
      var shellFallback = values.shell || 'auto'
      var modeFallback = modes.indexOf(rawMode) >= 0 ? rawMode : 'terminal'
      var maxFallback = typeof values.maxSessions === 'number' ? values.maxSessions : 4
      var proactiveFallback = values.proactive === true
      var shellState = React.useState(shellFallback)
      var shell = shellState[0]
      var setShell = shellState[1]
      var modeState = React.useState(modeFallback)
      var mode = modeState[0]
      var setMode = modeState[1]
      var maxState = React.useState(maxFallback)
      var maxSessions = maxState[0]
      var setMaxSessions = maxState[1]
      var proactiveState = React.useState(proactiveFallback)
      var proactive = proactiveState[0]
      var setProactive = proactiveState[1]
      var notice = React.useState(null)
      var message = notice[0]
      var setMessage = notice[1]

      React.useEffect(function () {
        setShell(shellFallback)
      }, [shellFallback])
      React.useEffect(function () {
        setMode(modeFallback)
      }, [modeFallback])
      React.useEffect(function () {
        setMaxSessions(maxFallback)
      }, [maxFallback])
      React.useEffect(function () {
        setProactive(proactiveFallback)
      }, [proactiveFallback])

      if (props.view === 'summary') {
        return React.createElement('span', null, t('host.description'))
      }

      if (!form && !props.form) {
        return React.createElement('p', { className: 'ait-config-unavailable' }, t('unavailable'))
      }

      function save(ops) {
        if (!saveFn) {
          setMessage('failed')
          return
        }
        setMessage(null)
        Promise.resolve(saveFn(ops, state && state.revision)).then(function (accepted) {
          setMessage(accepted ? 'saved' : 'failed')
        }).catch(function () {
          setMessage('failed')
        })
      }

      function saveShell(next) {
        setShell(next)
        save([{ op: 'set', path: ['shell'], value: next }])
      }

      function saveMode(next) {
        setMode(next)
        save([{ op: 'set', path: ['mode'], value: next }])
      }

      function saveProactive(next) {
        setProactive(next)
        save([{ op: 'set', path: ['proactive'], value: next }])
      }

      function commitMaxSessions() {
        var parsed = Number(maxSessions)
        var next = Number.isFinite(parsed) ? Math.round(parsed) : 4
        next = Math.max(1, Math.min(16, next))
        setMaxSessions(next)
        if (next !== maxFallback) {
          save([{ op: 'set', path: ['maxSessions'], value: next }])
        }
      }

      var shellOptions = ['auto', 'zsh', 'bash'].map(function (id) {
        return React.createElement('option', { key: id, value: id }, t(id))
      })
      var modeHint = t('mode.' + mode + 'Hint')
      var blockedText = !state
        ? 'unavailable'
        : state.status === 'unavailable'
          ? 'unavailable'
          : state.status === 'loading'
            ? null
            : state.writable === false
              ? 'readOnly'
              : null

      return React.createElement(
        'div',
        { className: 'ait-config' },
        React.createElement(
          'div',
          { className: 'ait-config-section' },
          React.createElement('div', { className: 'ait-config-heading' }, t('host.title')),
          React.createElement('div', { className: 'ait-config-section-hint' }, t('host.description')),
          React.createElement(
            'div',
            { className: 'ait-config-card' },
            React.createElement(
              'div',
              { className: 'ait-config-row' },
              React.createElement('div', { className: 'ait-config-label' }, t('title')),
              React.createElement('div', { className: 'ait-config-hint' }, t('description')),
              React.createElement(
                'select',
                {
                  className: 'ait-config-select',
                  value: shell,
                  disabled: !ready,
                  onChange: function (event) { saveShell(event.target.value) },
                },
                shellOptions,
              ),
            ),
            React.createElement(
              'div',
              { className: 'ait-config-row' },
              React.createElement('div', { className: 'ait-config-label' }, t('max.title')),
              React.createElement('div', { className: 'ait-config-hint' }, t('max.description')),
              React.createElement(
                'input',
                {
                  className: 'ait-config-input',
                  type: 'number',
                  min: 1,
                  max: 16,
                  step: 1,
                  value: maxSessions,
                  disabled: !ready,
                  onChange: function (event) {
                    var next = Number(event.target.value)
                    setMaxSessions(Number.isFinite(next) ? next : 4)
                  },
                  onBlur: commitMaxSessions,
                },
              ),
            ),
            React.createElement(
              'div',
              { className: 'ait-config-row' },
              React.createElement('div', { className: 'ait-config-label' }, t('policy.title')),
              React.createElement('div', { className: 'ait-config-hint' }, t('policy.description')),
              React.createElement(
                'div',
                { className: 'ait-config-segment', role: 'group', 'aria-label': t('policy.title') },
                modes.map(function (id) {
                  return React.createElement(
                    'button',
                    {
                      key: id,
                      type: 'button',
                      'data-on': mode === id ? 'true' : 'false',
                      'aria-pressed': mode === id ? 'true' : 'false',
                      title: t('mode.' + id + 'Hint'),
                      disabled: !ready,
                      onClick: function () { saveMode(id) },
                    },
                    t('mode.' + id),
                  )
                }),
              ),
              React.createElement('div', { className: 'ait-config-hint' }, modeHint),
            ),
            React.createElement(
              'div',
              { className: 'ait-config-row' },
              React.createElement(
                'div',
                { className: 'ait-config-inline' },
                React.createElement(
                  'div',
                  { className: 'ait-config-copy' },
                  React.createElement('div', { className: 'ait-config-label' }, t('proactive.title')),
                  React.createElement('div', { className: 'ait-config-hint' }, t('proactive.description')),
                ),
                React.createElement('button', {
                  className: 'ait-config-switch',
                  type: 'button',
                  role: 'switch',
                  'aria-checked': proactive ? 'true' : 'false',
                  'aria-label': t('proactive.title'),
                  'data-on': proactive ? 'true' : 'false',
                  disabled: !ready,
                  onClick: function () { saveProactive(!proactive) },
                }),
              ),
            ),
          ),
          message === null
            ? null
            : React.createElement(
                'div',
                { className: 'ait-config-message', 'data-kind': message },
                React.createElement('span', { className: 'dot' }),
                React.createElement('span', null, t(message === 'saved' ? 'savedSettings' : 'failed')),
              ),
          blockedText === null
            ? null
            : React.createElement(
                'div',
                { className: 'ait-config-message' },
                React.createElement('span', { className: 'dot' }),
                React.createElement('span', null, t(blockedText)),
              ),
        ),
        React.createElement(
          'div',
          { className: 'ait-config-section' },
          React.createElement('div', { className: 'ait-config-heading' }, t('appearance.title')),
          React.createElement('div', { className: 'ait-config-section-hint' }, t('appearance.description')),
          React.createElement(
            'div',
            { className: 'ait-config-appearance' },
            React.createElement(
              React.Suspense,
              { fallback: React.createElement('div', { className: 'ait-config-loading' }, t('appearance.loading')) },
              React.createElement(LazyPreferences),
            ),
          ),
        ),
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
        title: t('tab.title'),
        terminal: t('tab.terminal'),
        closeTab: t('closeTab'),
        newTerminal: t('action.newTerminal'),
        lockInput: t('input.lock'),
        inputLocked: t('input.locked'),
        unlockInput: t('input.unlock'),
        inputHint: t('input.hint'),
        noSessions: t('empty.title'),
        emptyHint: t('empty.description'),
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
        { fallback: React.createElement('section', { className: 'ait-config-loading' }, t('starting')) },
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
        { className: 'ait-title' },
        React.createElement(TerminalGlyph, {}),
        React.createElement('span', null, t('tab.title')),
      )
    }

    function TerminalGlyph() {
      return React.createElement(
        'svg',
        { width: 20, height: 20, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
        React.createElement('path', { d: 'M3 4L7 8L3 12', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        React.createElement('path', { d: 'M9 12H13', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }),
      )
    }

    var inject = ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs', 'configForms']

    function apply(ctx) {
      injectConfigCss()
      ctx.effect(function () {
        return ctx.locale.register(NS, { en: en, zh: zh })
      })
      var t = ctx.locale.bind(NS)
      var configForm = null
      try {
        if (ctx.configForms && typeof ctx.configForms.get === 'function') {
          configForm = ctx.configForms.get('ait-terminal')
        }
      } catch {
        // The page still renders a read-only explanation if the Host config
        // namespace cannot be resolved in this deployment.
      }
      var configInject = function () { return { t: t, configForm: configForm } }

      ctx.slots.inject('plugins.row.config', function () {
        return ctx.slots.register(
          {
            name: 'plugins.row.config',
            key: ROW_KEY,
            id: 'agent-interactive-terminal',
            locale: NS,
            inject: configInject,
          },
          SettingsPage,
        )
      })

      // The bundle page is where the full terminal configuration lives. It has
      // no row `form` prop, so the component reads the shared Host entry's config
      // controller injected above.
      ctx.slots.inject('plugins.bundle.config', function () {
        return ctx.slots.register(
          {
            name: 'plugins.bundle.config',
            key: 'agent-interactive-terminal',
            id: 'agent-interactive-terminal-bundle',
            locale: NS,
            inject: configInject,
          },
          SettingsPage,
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
