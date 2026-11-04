// agent-interactive-terminal browser half: the configuration card the Plugins
// page shows for this bundle's `ait-terminal` row. The row's Config schema is
// projected by the Host settings service, so the card only renders the fields
// and writes through the form the page passes in.
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
    }

    function Card(props) {
      var form = props.form
      var state = form && form.state
      var ready = state && state.value && state.writable !== false
      var t = props.t || function (key) { return (en[key] || key) }
      var fallback = state && state.value && state.value.shell ? state.value.shell : 'auto'
      var current = React.useState(fallback)
      var value = current[0]
      var setValue = current[1]
      var notice = React.useState(null)
      var message = notice[0]
      var setMessage = notice[1]

      React.useEffect(function () {
        setValue(fallback)
      }, [fallback])

      if (props.view === 'summary') {
        return React.createElement('span', null, t('description'))
      }

      if (!form) {
        return React.createElement('p', { style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 13 } }, t('unavailable'))
      }

      function save(next) {
        setValue(next)
        setMessage(null)
        var ops = [{ op: 'set', path: ['shell'], value: next }]
        form.mutate(ops, state && state.revision).then(function (accepted) {
          setMessage(accepted ? 'saved' : 'failed')
        }).catch(function () {
          setMessage('failed')
        })
      }

      var options = ['auto', 'zsh', 'bash'].map(function (id) {
        return React.createElement('option', { key: id, value: id }, t(id))
      })

      return React.createElement(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px 0' } },
        React.createElement('div', { style: { fontSize: 14, fontWeight: 500, color: 'var(--dsw-alias-label-primary)' } }, t('title')),
        React.createElement('div', { style: { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)' } }, t('description')),
        React.createElement(
          'select',
          {
            value: value,
            disabled: !ready,
            onChange: function (event) { save(event.target.value) },
            style: {
              maxWidth: '280px',
              height: '32px',
              borderRadius: '8px',
              border: '0.5px solid var(--dsw-alias-border-l4)',
              background: 'var(--dsw-alias-bg-layer-3)',
              color: 'var(--dsw-alias-label-primary)',
              padding: '0 10px',
              fontSize: '13px',
            },
          },
          options,
        ),
        message === 'saved' ? React.createElement('div', { style: { fontSize: 12, color: 'var(--dsw-alias-state-success-primary)' } }, t('saved')) : null,
        message === 'failed' ? React.createElement('div', { style: { fontSize: 12, color: 'var(--dsw-alias-state-error-primary)' } }, t('failed')) : null,
        ready ? null : React.createElement('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' } }, t('readOnly')),
      )
    }

    var inject = ['slots', 'locale']

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
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
