/**
 * Recorded replays for the demo page.
 *
 * Every result string here was written to match the real tool surface in
 * src/tools/index.ts: result text first, then the `[wait: ...] [phase: ...]`
 * line, then the status line exactly as statusLine() builds it.
 *
 * Screen markup: {g} green {c} cyan {m} magenta {y} amber {r} red {d} dim
 * {b} bold, closed by {/}.
 */
(function () {
  'use strict';

  /** Build a status line exactly like TerminalSession.statusLine(). */
  function st(o) {
    var d = {
      id: 's-3f2',
      shell: 'zsh',
      cwd: '/home/sabu/proj',
      size: '100x30',
      alt: 'no',
      lease: 'agent',
      access: 'collaborate',
      pending: 0,
      phase: 'idle',
      rev: 1,
      quiet: '0.4s',
    };
    for (var k in o) d[k] = o[k];
    return [
      'session ' + d.id,
      d.shell,
      'cwd ' + d.cwd,
      d.size,
      'alt=' + d.alt,
      'lease=' + d.lease,
      'access=' + d.access,
      'pending=' + d.pending,
      'phase=' + d.phase,
      'rev=' + d.rev,
      'quiet=' + d.quiet,
    ].join(' | ');
  }

  function lines() {
    return Array.prototype.slice.call(arguments);
  }

  var P1 = '{g}➜{/}  {d}~/proj{/} {g}main{/}';
  var P2 = '{g}➜{/}  {d}/srv/app{/} {g}main{/}';
  var P3 = '{g}➜{/}  {d}~/scratch{/}';

  var scenarios = [
    /* ------------------------------------------------------------------ */
    {
      id: 'build',
      label: { zh: '长任务', en: 'Long task' },
      beats: [
        {
          cap: {
            zh: '先开会话。返回的不是句柄，是一屏画面加一行状态——返回物本身就是「现在是什么局面」。',
            en: 'Open a session. What comes back is a screen plus one status line: the result is the situation itself, not a handle.',
          },
          tool: 'terminal_open',
          args: { name: 'build', cols: 100, rows: 30 },
          result: lines('$ ', '[session: s-3f2]', st({ rev: 3, quiet: '0.4s' })),
          screen: lines(P1, '$ '),
          chrome: { lease: 'agent', access: 'collaborate', phase: 'idle', pending: 0, running: false },
          hold: 1700,
        },
        {
          cap: {
            zh: '一条长命令。十五秒没等到结束，就返回 timeout 和 running。模型由此知道编译在进行中，而不是卡死——这个区别以前只能靠猜。',
            en: 'A long command. Fifteen seconds without finishing returns timeout and running, so the model knows the build is working rather than hung — a distinction it used to guess at.',
          },
          tool: 'terminal_send',
          args: { sessionId: 's-3f2', text: 'cargo build --release', timeoutMs: 15000 },
          result: lines(
            '   Compiling libc v0.2.155',
            '   Compiling serde v1.0.203',
            '   Compiling serde_json v1.0.117',
            '   Compiling node-pty v1.0.0',
            '[wait: timeout] [phase: running] [elapsed: 15000ms]',
            st({ phase: 'running', rev: 18, quiet: '0.2s' }),
          ),
          append: lines(
            '$ cargo build --release',
            '   {d}Updating{/} crates.io index',
            '   {c}Compiling{/} libc v0.2.155',
            '   {c}Compiling{/} serde v1.0.203',
            '   {c}Compiling{/} serde_json v1.0.117',
            '   {c}Compiling{/} node-pty v1.0.0',
          ),
          reveal: true,
          chrome: { lease: 'agent', access: 'collaborate', phase: 'running', pending: 0, running: true },
          hold: 2100,
        },
        {
          cap: {
            zh: '再等一次，命中 Finished 才结算。等待是查询，不是轮询：没输出的那二十六秒，模型这一侧什么都没花。',
            en: 'Wait again; it settles only when Finished matches. A wait is a query, not polling: during those 26 quiet seconds the model side spends nothing.',
          },
          tool: 'terminal_wait',
          args: { sessionId: 's-3f2', match: ['Finished'], timeoutMs: 60000 },
          result: lines(
            '    Finished `release` profile [optimized] target(s) in 41.2s',
            '$ ',
            '[wait: matched] [phase: idle] [elapsed: 26200ms]',
            st({ rev: 52, quiet: '0.9s' }),
          ),
          append: lines(
            '   {c}Compiling{/} agent-interactive-terminal v0.4.2',
            '    {g}Finished{/} `release` profile [optimized] target(s) in 41.2s',
            '$ ',
          ),
          reveal: true,
          chrome: { lease: 'agent', access: 'collaborate', phase: 'idle', pending: 0, running: false },
          hold: 2000,
        },
        {
          cap: {
            zh: '要细节就带 sinceRevision 取快照，只回变化的四行。它不改屏幕、不消费输出，和别的等待器同时读互不影响。',
            en: 'For detail, snapshot with sinceRevision and get only the four changed rows. It does not move the screen or consume output, so it can read alongside other waiters.',
          },
          tool: 'terminal_snapshot',
          args: { sessionId: 's-3f2', sinceRevision: 18, view: 'output', maxRows: 6 },
          result: lines(
            '   Compiling node-pty v1.0.0',
            '   Compiling agent-interactive-terminal v0.4.2',
            '    Finished `release` profile [optimized] target(s) in 41.2s',
            '$ ',
            '[changed rows: 6,7,8,9]',
            st({ rev: 52, quiet: '0.9s' }),
          ),
          chrome: {},
          hold: 1900,
        },
        {
          cap: {
            zh: '列会话：一行一个，相位、名字、尺寸。',
            en: 'List sessions: one per line, with phase, name, and size.',
          },
          tool: 'terminal_list',
          args: {},
          result: lines('s-3f2 (build) idle 100x30'),
          chrome: {},
          hold: 1500,
        },
        {
          cap: {
            zh: '关掉，进程树一起收干净。面板上的标签页同时消失。',
            en: 'Close it; the whole process tree goes with it, and the panel tab disappears.',
          },
          tool: 'terminal_close',
          args: { sessionId: 's-3f2' },
          result: lines('[closed: s-3f2]'),
          chrome: { lease: 'none', access: 'collaborate', phase: 'exited', pending: 0, running: false },
          hold: 1600,
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'sudo',
      label: { zh: '密码交接', en: 'Password handoff' },
      beats: [
        {
          cap: {
            zh: '第二段：一次 sudo。这是旧工具里最容易把密码灌进对话记录的场景。',
            en: 'Second: a sudo. This is the case where a plain exec tool funnels the password straight into the transcript.',
          },
          tool: 'terminal_open',
          args: { name: 'deploy', cwd: '/srv/app', cols: 100, rows: 30 },
          result: lines('$ ', '[session: s-9c1]', st({ id: 's-9c1', cwd: '/srv/app', rev: 2, quiet: '0.3s' })),
          screen: lines(P2, '$ '),
          chrome: { lease: 'agent', access: 'collaborate', phase: 'idle', pending: 0, running: false },
          hold: 1600,
        },
        {
          cap: {
            zh: 'wait 立刻以 human_required 返回，租约挂起。模型这一侧没有任何可以写密码的地方，它也不会继续往终端里打字。',
            en: 'The wait returns human_required at once and the lease suspends. There is nowhere for the model to put a password, and it stops writing to the terminal.',
          },
          tool: 'terminal_send',
          args: { sessionId: 's-9c1', text: 'sudo systemctl restart nginx', timeoutMs: 30000 },
          result: lines(
            '[sudo] password for sabu: ',
            '[wait: human_required] [phase: waiting_input] [elapsed: 12ms]',
            st({
              id: 's-9c1',
              cwd: '/srv/app',
              lease: 'human (suspended)',
              phase: 'waiting_input',
              rev: 31,
              quiet: '0.1s',
            }),
          ),
          append: lines('$ sudo systemctl restart nginx', '{d}[sudo]{/} password for sabu:'),
          chrome: { lease: 'human', access: 'collaborate', phase: 'waiting_input', pending: 0, running: false },
          gate: {
            kind: 'password',
            zh: '轮到你了：在下面这个终端里输入密码并按回车。sudo 不回显，模型也看不到你打了什么。',
            en: 'Your turn: type a password into the terminal below and press Enter. sudo does not echo it, and the model never sees it.',
          },
          hold: 0,
        },
        {
          who: 'system',
          note: {
            zh: '<b>用户已在终端输入。</b> 模型只收到一行「已输入密码」；内容不进上下文，也不进审计预览。',
            en: '<b>The user typed in the terminal.</b> The model only gets “password entered”; the value never enters the context or the audit preview.',
          },
          cap: {
            zh: '密码从键盘直接进 sudo，PTY 里没有经过模型，也没有经过这家网站。',
            en: 'The password goes from the keyboard straight to sudo — not through the model, and not through this page.',
          },
          chrome: { lease: 'agent', access: 'collaborate', phase: 'running', pending: 0, running: true },
          hold: 1800,
        },
        {
          cap: {
            zh: '用户交还之后，模型接着 wait，拿到 settled 和新的屏幕。整段对话里没有一个字节的密码。',
            en: 'After handback the model waits again and gets settled plus the new screen. Not one byte of the password is in the conversation.',
          },
          tool: 'terminal_wait',
          args: { sessionId: 's-9c1', quietMs: 800, timeoutMs: 20000 },
          result: lines(
            '● nginx.service - A high performance web server',
            '     Active: active (running) since Mon 2026-11-17 21:04:11 AEDT',
            '$ ',
            '[wait: settled] [phase: idle] [elapsed: 1841ms]',
            st({ id: 's-9c1', cwd: '/srv/app', rev: 58, quiet: '0.8s' }),
          ),
          append: lines(
            '     {g}●{/} nginx.service - A high performance web server',
            '          {d}Active:{/} {g}active (running){/} since Mon 2026-11-17 21:04:11 AEDT',
            '$ ',
          ),
          reveal: true,
          chrome: { lease: 'agent', access: 'collaborate', phase: 'idle', pending: 0, running: false },
          hold: 2100,
        },
        {
          cap: {
            zh: '再确认一次状态，然后收工。',
            en: 'Confirm the service state, then clean up.',
          },
          tool: 'terminal_send',
          args: { sessionId: 's-9c1', text: 'systemctl is-active nginx' },
          result: lines('active', '[wait: settled] [phase: idle] [elapsed: 41ms]', st({ id: 's-9c1', cwd: '/srv/app', rev: 61, quiet: '0.4s' })),
          append: lines('$ systemctl is-active nginx', '{g}active{/}', '$ '),
          chrome: {},
          hold: 1500,
        },
        {
          cap: {
            zh: '关会话。',
            en: 'Close the session.',
          },
          tool: 'terminal_close',
          args: { sessionId: 's-9c1' },
          result: lines('[closed: s-9c1]'),
          chrome: { lease: 'none', access: 'collaborate', phase: 'exited', pending: 0, running: false },
          hold: 1400,
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'shared',
      label: { zh: '接管与封禁', en: 'Takeover \u0026 sealing' },
      beats: [
        {
          cap: {
            zh: '第三段：你们真的在同一个 shell 里。先开一个 Python 会话。',
            en: 'Third: you really do share one shell. Start a Python session.',
          },
          tool: 'terminal_open',
          args: { name: 'python', cwd: '~/scratch', cols: 100, rows: 30 },
          result: lines('$ ', '[session: s-3f2]', st({ cwd: '/home/sabu/scratch', rev: 2, quiet: '0.3s' })),
          screen: lines(P3, '$ '),
          chrome: { lease: 'agent', access: 'collaborate', phase: 'idle', pending: 0, running: false },
          hold: 1500,
        },
        {
          cap: {
            zh: '停在 >>> 是 waiting_input，不是 idle：解释器在读 stdin。shell 停在 $ 才是 idle。两者都能收输入，但输入的去向不同。',
            en: 'Sitting at >>> is waiting_input, not idle: the interpreter is reading stdin. Only a shell at $ is idle. Both accept input, but it goes somewhere different.',
          },
          tool: 'terminal_send',
          args: { sessionId: 's-3f2', text: 'python3 -q' },
          result: lines(
            '>>> ',
            '[wait: settled] [phase: waiting_input] [elapsed: 310ms]',
            st({ cwd: '/home/sabu/scratch', phase: 'waiting_input', rev: 9, quiet: '0.3s' }),
          ),
          append: lines(
            '$ python3 -q',
            '{d}Python 3.12.4 (main, Sep  7 2026, 11:02:19) [GCC 14.2.1]{/}',
            '{d}Type "help", "copyright", "credits" or "license" for more information.{/}',
            '>>> ',
          ),
          reveal: true,
          chrome: { lease: 'agent', access: 'collaborate', phase: 'waiting_input', pending: 0, running: false },
          hold: 2000,
        },
        {
          cap: {
            zh: '模型先问一句，确认这个解释器是活的。',
            en: 'The model asks one question to confirm the interpreter is alive.',
          },
          tool: 'terminal_send',
          args: { sessionId: 's-3f2', text: 'print(1 + 1)' },
          result: lines('2', '>>> ', '[wait: settled] [phase: waiting_input] [elapsed: 22ms]', st({ cwd: '/home/sabu/scratch', phase: 'waiting_input', rev: 14, quiet: '0.3s' })),
          append: lines('>>> print(1 + 1)', '2', '>>> '),
          chrome: {},
          hold: 1500,
        },
        {
          cap: {
            zh: '你在这个屏幕上打字，不需要模型把键盘让出来。键入即接管，几秒不动再自动交还。',
            en: 'You type on the same screen; the model does not have to yield the keyboard. Typing takes the lease, and a few idle seconds hand it back.',
          },
          gate: {
            kind: 'input',
            zh: '轮到你了：点一下终端，输入一行 Python 再回车。试试 print(2 ** 10) 或 sum(range(101))，别的也可以。',
            en: 'Your turn: click the terminal, type a line of Python, press Enter. Try print(2 ** 10) or sum(range(101)) — anything else is fine too.',
          },
          chrome: { lease: 'human', access: 'collaborate', phase: 'waiting_input', pending: 0, running: false },
          hold: 0,
        },
        {
          cap: {
            zh: '你握着键盘的时候，模型的写入不阻塞、也不打断你，立刻返回排队标记。',
            en: 'While you hold the keyboard, the model\u2019s write neither blocks nor interrupts you: it returns a queued marker immediately.',
          },
          tool: 'terminal_send',
          args: { sessionId: 's-3f2', text: 'import sys; print(sys.version.split()[0])' },
          result: lines(
            '[queued: q-7f1] [pending: 1] control is held by the user; the command will run after handback. The user can cancel it.',
            st({
              cwd: '/home/sabu/scratch',
              lease: 'human',
              pending: 1,
              phase: 'waiting_input',
              rev: 64,
              quiet: '0.6s',
            }),
          ),
          chrome: { lease: 'human', access: 'collaborate', phase: 'waiting_input', pending: 1, running: false },
          hold: 1900,
        },
        {
          cap: {
            zh: '点顶栏的「交还」，或者停手几秒，键盘就回去了。',
            en: 'Click “hand back” in the top bar, or just stop typing for a few seconds.',
          },
          gate: {
            kind: 'handback',
            zh: '点面板顶栏右侧那个交还按钮（↺），把键盘还给模型。',
            en: 'Click the hand-back button (\u21ba) on the right of the panel bar to give the keyboard back.',
          },
          chrome: { lease: 'human', access: 'collaborate', phase: 'waiting_input', pending: 1, running: false },
          hold: 0,
        },
        {
          cap: {
            zh: '排队的那条命令按顺序执行了。模型用 terminal_wait 取结果——它没有在你的输入里插队。',
            en: 'The queued command runs in order. The model picks up the result with terminal_wait — it never cut in front of your typing.',
          },
          tool: 'terminal_wait',
          args: { sessionId: 's-3f2', match: ['3.12.4'], timeoutMs: 15000 },
          result: lines('3.12.4', '>>> ', '[wait: matched] [phase: waiting_input] [elapsed: 9ms]', st({ cwd: '/home/sabu/scratch', phase: 'waiting_input', rev: 71, quiet: '0.3s' })),
          append: lines('>>> import sys; print(sys.version.split()[0])', '3.12.4', '>>> '),
          chrome: { lease: 'agent', access: 'collaborate', phase: 'waiting_input', pending: 0, running: false },
          hold: 2000,
        },
        {
          cap: {
            zh: '点锁形图标，把会话变成只读。',
            en: 'Click the lock icon to make the session read-only.',
          },
          gate: {
            kind: 'access',
            value: 'observe',
            zh: '点面板顶栏的锁形图标（🔒），把会话设成只读。',
            en: 'Click the lock icon in the panel bar to make this session read-only.',
          },
          chrome: { lease: 'agent', phase: 'waiting_input', pending: 0, running: false },
          hold: 0,
        },
        {
          cap: {
            zh: '错误在服务端生成。绕过面板直接调用也一样被拒绝——只读不是前端少发几个按键。',
            en: 'The error is produced server-side. Calling around the panel is refused the same way — read-only is not a browser that stops sending keys.',
          },
          tool: 'terminal_send',
          args: { sessionId: 's-3f2', text: 'print(2)' },
          error: true,
          result: lines('{r}READ_ONLY{/} the user has made this terminal read-only'),
          chrome: { lease: 'agent', access: 'observe', phase: 'waiting_input', pending: 0, running: false },
          hold: 2000,
        },
        {
          cap: {
            zh: '再点盾形图标，封禁它。',
            en: 'Now the shield: seal it.',
          },
          gate: {
            kind: 'access',
            value: 'sealed',
            zh: '点面板顶栏的盾形图标（🛡），封禁这个会话。',
            en: 'Click the shield icon in the panel bar to seal the session.',
          },
          chrome: { lease: 'agent', phase: 'waiting_input', pending: 0, running: false },
          hold: 0,
        },
        {
          cap: {
            zh: '封禁之后，连尺寸、工作目录和名字都不再被列出，只剩一条被隐去的记录。',
            en: 'Once sealed, not even size, cwd, or name are listed; only a redacted record remains.',
          },
          tool: 'terminal_list',
          args: {},
          result: lines('s-3f2 sealed (hidden by the user)'),
          chrome: { lease: 'agent', access: 'sealed', phase: 'waiting_input', pending: 0, running: false },
          hold: 1900,
        },
        {
          cap: {
            zh: '同一条 PTY，人可以随时接管、降权、封禁，而模型拿到的始终是局面，不是后台权限。',
            en: 'One PTY: the person can take over, downgrade, or seal it at any moment, while the model only ever gets the situation, never backend authority.',
          },
          tool: 'terminal_send',
          args: { sessionId: 's-3f2', text: 'print(2)' },
          error: true,
          result: lines('{r}SEALED{/} the user has sealed this terminal; ask them to reconnect it'),
          chrome: { lease: 'none', access: 'sealed', phase: 'waiting_input', pending: 0, running: false },
          hold: 2200,
        },
      ],
    },
  ];

  /** Canned answers for the free-form REPL gate. */
  var REPL = {
    'print(2 ** 10)': '1024',
    'print(2**10)': '1024',
    'sum(range(101))': '5050',
    'print(1 + 1)': '2',
    'print("hi")': 'hi',
  };

  window.AIT = { scenarios: scenarios, statusLine: st, replAnswers: REPL };
})();
