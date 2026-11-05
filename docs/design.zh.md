# Agent 原生的交互式终端：可落地方案

> **实现状态。** M1 的主体已经落地：`src/` 下有 PTY 包装、headless xterm 屏幕模型、相位与等待引擎、会话注册表和八个工具，`test/` 下有对应测试，用法见 [README.md](../README.md)（英文版见 [README.en.md](../README.en.md)）。本文档继续描述目标设计，M2 和 M3 的部分仍是设计而非实现；两者不一致时以代码和 README 为准。

面向 DeepSeek Harness 0.2.x 的实际代码，不是从零画饼。结论先放这里：这台机器上的 PTY 底座、会话注册表、屏幕仿真器、人机双向传输、后台任务唤醒，都已经存在，只是被拆在两个互不相通的终端实现里。真正要新建的不是“终端能力”，而是四样东西：给 Agent 的屏幕投影、按键与等待引擎、人机共用一个会话的租约，以及密码场景的挂起与人接管。

---

## 1. 现状盘点：已有什么，缺什么

| 包 | 已有能力 | 对本期的作用 |
|---|---|---|
| `dsh-subprocess` / `dsh-subprocess-local` | 基于 node-pty 的 `spawnTerminal`，带 rows/cols/TERM、`write`、`resize`（触发 SIGWINCH）、`inspectForeground`（前台进程组与是否在等 stdin）、`signalForeground`、整棵进程树 `terminate` | L0 原语，直接复用，不动 |
| `dsh-terminal` | 按 Agent 对象隔离的会话注册表，`spawn`、`startSend`、`read`、`signal`、`kill`、`list`，同一会话只允许一个活跃 send，进程退出时等待清理完成 | 扩展成共享注册表，不新起一套 |
| `dsh-terminal-bash` | bash/pwsh 后端，用 PS1 加 PROMPT_COMMAND 注入私有标记做就绪检测，三档结算（精确 stdin 等待、提示符标记、输出静默），行级 sanitizer，`@xterm/headless` 只用来回终端协议响应 | 改造点：喂屏幕模型、补 OSC 7、换 rcfile 包装 |
| `dsh-tool-terminal` | 6 个工具，256 KB 结果上限，前台等待与后台 job 两种发送 | 扩成 8 个工具，重写结果形状 |
| `dsh-api-terminal-controller` | 用户终端：headless xterm 加 serialize 做全屏快照，双工 attach 流带 write/resize/ack，最新连接持有输入，retain 保持进程，无人持有后空闲回收 | 共享会话的传输层与快照实现，几乎原样复用 |
| `dsh-client-ui-sidebar-terminal` | xterm.js 渲染、标签页、断线重连、“接管输入”按钮 | 加共享态横幅与租约按钮 |
| `dsh-jobs` / `dsh-tool-jobs` | 有界输出环、`job_output` 带超时等待、结算时唤醒空闲 Agent、`maxConsecutiveWakes` | 日志守夜与长任务的唤醒通道，不另造事件总线 |
| `dsh-credentials` | 命名密钥的解析、描述、存储，永不返回值 | 密钥注入的落点 |

缺口，按影响排序：

1. Agent 拿到的是行级增量文本，不是屏幕。全屏程序（vim、htop、less）没有 alt screen 概念，Ctrl-C 之外没有按键。
2. 没有“只等不等”的调用，也没有按内容匹配或按安静时长结算的等待。长任务的观察只能靠反复 send。
3. 人看的终端和 Agent 用的终端是两个互不可见的注册表，而且实验 bundle 里 `isolate: { terminals: true }`，两者连服务实例都不是同一个。
4. 密码没有安全通道：把密码写进 `text` 参数就等于写进 transcript。
5. Agent 的 shell 被固定成 bash/pwsh，不跟随 `$SHELL`；而用户的 `.bashrc` 一旦自己设 PS1，注入的标记就会被覆盖，退回纯静默判断。
6. 人敲进终端的键没有任何审计记录，Agent 也无从知道“刚才有人动过”。
7. 多个会话没有状态胶囊，回合之间只能靠模型自己记着。

---

## 2. 架构分层

**L0 终端原语**（已有，不改）
`ctx.subprocess.spawnTerminal`。node-pty 负责 PTY、SIGWINCH、进程组、信号、清理。这一层不要包 tmux，理由见第 10 节。

**L1 会话核心**（新建，落在 `dsh-terminal` 内部或拆成 `dsh-terminal-screen`）
每个会话一份状态：原始字节环、屏幕模型、活动观测、等待器集合、租约、审计出口。这一层是本次设计的主体。

**L2 会话服务**（扩展现有 `ctx.terminals`）
身份、发布、授权、清理继续由它负责；新增 `write`、`wait`、`snapshot`、`resize`、`press`、`lease`、事件发布。后端接口 `TerminalBackendSession` 相应扩展，bash/pwsh 后端实现。

**L3 工具面**（扩展 `dsh-tool-terminal`）
8 个模型可见工具，薄适配器，只做参数校验、等待编排、结果渲染与截断。

**L4 传输与 UI**（扩展 `dsh-api-terminal-controller` 与侧栏）
把用户终端从“自己管一套会话”改成“挂在同一个注册表上”，按 sessionId attach，租约与横幅在 UI 上可见。

三条不变量，贯穿所有层：

- **一个屏幕模型，两种投影。** 屏幕状态只有一份（headless xterm），给 Agent 的是文本投影，给浏览器的是 serialize 出来的 ANSI 快照加原始字节流。两边永远看到同一个终端。
- **写入是动作，等待是查询，状态是事实。** 三者分开存储，`send` 只是“写入加一次等待”的语法糖，长任务可以只查询不写入。
- **授权跟着会话出生，不跟着每次写入。** 打开会话时一次性定下沙箱与审批，之后每次按键不再逐条审批；代价用风险分类与人接管来补。

---

## 3. 状态机：相位与等待结果是两个轴

这是对原始描述的一处修正。`timeout` 不是会话状态，它是等待的返回原因；把它塞进状态会让模型误以为“超时等于进程结束”。

**相位（phase）**，任一时刻只有一个：

| 相位 | 含义 | 判定依据 |
|---|---|---|
| `starting` | 会话已创建，shell 还没就绪 | 启动未完成 |
| `running` | 前台有非 shell 进程，且没有证据表明它在等输入 | 前台进程组不是 shell 组，或没有 stdin 等待证据 |
| `waiting_input` | 前台进程被证明在读 stdin | `inspectForeground().inputWaiting`，或密码类提示符 |
| `idle` | shell 本身在提示符处等待 | 受控提示符标记到达，且前台组是 shell |
| `exited` | 顶层 shell 退出 | 进程退出 |

**等待结果（outcome）**，一次调用的返回原因：

`matched`、`quiet`、`settled`、`timeout`、`exited`、`human_required`、`human_took_over`、`lease_denied`。

`running` 与 `waiting_input` 的区别是这套设计里最有用的一条信息：命令在跑，和程序在问你话，Agent 该做的动作完全不同。REPL 停在 `>>>` 属于 `waiting_input`（解释器在读 stdin），shell 停在 `$` 属于 `idle`，两者都能“接收输入”，但输入去向不同。

状态转移由后端事件驱动，不由工具调用驱动：输出到达、前台进程组变化、提示符标记、租约变化、进程退出。这样即使 Agent 不调用工具，UI 上的状态也是对的。

---

## 4. 等待引擎

```ts
interface WaitSpec {
  match?: string[]              // 字面量子串，任一命中即可
  quietMs?: number              // 距最后一个输出字节的静默时长
  timeoutMs?: number            // 绝对上限，默认 30000，上限 600000
  settleOn?: SessionPhase[]     // 默认 ['waiting_input', 'idle']
  sinceRevision?: number        // 只匹配该版本之后的屏幕
}
```

结算优先级，从高到低：进程退出，租约被挂起或被人抢走，`match` 命中，`settleOn` 相位达成，`quietMs` 满足，`timeoutMs` 到期。

几个刻意的选择：

- **`match` 只做字面子串，不做正则。** 模型写正则在终端文本上很容易踩到回溯和转义，而真实需求（`Password:`、`ready to accept connections`、`yes/no`、`Traceback`）用子串就够了。正则留给部署方配置里的密码提示符规则，那部分由人写、由人审。
- **`quietMs` 默认 800ms，不是现在的 3000ms。** 3000ms 是给无标记兜底用的保守值；作为普通等待默认值，它让每条命令都白等三秒。真正可靠的信号是提示符标记与 stdin 等待证据，静默只是兜底。
- **静默按“最后一个输出字节”计时，不按“最后一行变化”计时。** 进度条每秒重绘一次就不算安静，这是对的：它在工作，不该被判定为完成。
- **多个等待器互不消费。** 因为判断依据是屏幕状态而不是输出偏移，Agent 的一次 `wait` 和 UI 的一次 attach 可以同时进行，不会互相吃掉对方的输出。这解决了增量流模型下“谁读了谁负责”的老问题。

实现上，等待器注册到会话的变更信号（输出、相位、租约）与一个静默定时器，任一触发就重新求值。没有轮询，没有订阅泄漏，工具调用取消时直接注销。

---

## 5. 工具接口

8 个工具，其中 `terminal_send` 是主力，其余按需出现。

| 工具 | 作用 | 关键参数 |
|---|---|---|
| `terminal_open` | 建会话 | `type`、`name`、`cwd`、`shell`、`login`、`envRefs`、`cols`、`rows` |
| `terminal_send` | 写入并等待 | `sessionId`、`text`、`submit`、`paste`、`wait`、`run_in_background`、`secretRef` |
| `terminal_wait` | 只等不写 | `sessionId`、`match`、`quietMs`、`timeoutMs`、`run_in_background` |
| `terminal_snapshot` | 取当前屏幕 | `sessionId`、`view`、`sinceRevision`、`maxRows` |
| `terminal_key` | 按键 | `sessionId`、`key`、`repeat` |
| `terminal_resize` | 改尺寸 | `sessionId`、`cols`、`rows` |
| `terminal_close` | 关会话 | `sessionId` |
| `terminal_list` | 列会话 | 无 |

四个设计决定：

**去掉 `terminal_signal`。** 模型该表达的是“按 Ctrl-C”，不是“给进程组发 SIGINT”。`terminal_key("ctrl-c")` 在实现里仍然走 `signalForeground(SIGINT)`（比写 `\x03` 更可靠，不受 ISIG 状态影响），但语义对人、对模型都更自然。`ctrl-z` 对应 SIGTSTP，`ctrl-d` 是写 `\x04`（EOF 不是信号），`ctrl-\` 对应 SIGQUIT。

**`send` 带 `paste` 选项。** 多行文本如果直接写进 PTY，会被 shell 当成多次回车逐行执行。默认在文本含换行时用括号粘贴（`\x1b[200~` 与 `\x1b[201~`）包起来，除非模型显式要求逐行喂给 REPL。

**`view` 决定投影类型，默认 `auto`。** 这是对“Agent 只看屏幕快照”的一处修正：编译日志打五千行，屏幕上只剩三十行，模型真正需要的是“本次命令新增输出的尾部”。所以 `auto` 的规则是：处于 alt screen，或者前台是非 shell 的交互程序，返回屏幕；否则返回新增输出尾部加最后一行提示符。`screen` 与 `output` 可以强制覆盖。屏幕用于判断“现在是什么局面”，输出尾部用于读日志，两者不能互相替代。

**结果统一带一行状态标签。** 字段顺序固定，便于人眼扫读：

```
[session s-3f2 | shell zsh | cwd ~/proj | host build-box | 120x32 | alt=no | lease=agent | phase=idle | rev=41 | quiet=2.1s]
```

一次 sudo 的完整闭环：

```
terminal_send(s1, "sudo systemctl restart nginx")
  -> outcome: human_required
     phase: waiting_input
     screen: "[sudo] password for sabu: "
     hint: "密码提示，请用户在该终端输入"
  -> 模型结束本回合，告知用户
用户输入密码，点击“交还控制”
  -> host 以普通用户消息投递“已输入密码，继续”
terminal_wait(s1, { timeoutMs: 20000 })
  -> phase: idle, screen: "● nginx.service - ... active (running)"
```

长任务观察：

```
terminal_send(s2, "cargo build --release", { wait: { timeoutMs: 15000 } })
  -> outcome: timeout, phase: running, view: output tail 40 行
terminal_wait(s2, { timeoutMs: 20000 })
  -> outcome: settled, phase: idle
```

日志守夜（复用 jobs，不新造订阅）：

```
terminal_wait(s3, {
  match: ["ERROR", "Traceback", "panic:"],
  timeoutMs: 600000,
  run_in_background: true
})
  -> jobId: termwatch-...
...任务结算时，空闲 Agent 被唤醒...
job_output(jobId) 拿到命中的那几行，terminal_snapshot 看现场
```

---

## 6. 关键数据结构

```ts
type SessionKind = 'agent' | 'user'
type Holder = 'agent' | 'human' | 'none'

interface SessionRecord {
  id: TerminalSessionId
  name?: string
  kind: SessionKind
  owner?: Agent                 // 只有 agent 会话有
  backend: TerminalBackendSession
  screen: ScreenModel           // 唯一的事实来源
  raw: ByteRing                 // 只给 UI 重连补帧用
  phase: SessionPhase
  lease: LeaseState
  waiters: Set<Waiter>
  revision: number              // 每次解析到输出就递增
  lastOutputAt: number
  lastAgentWriteAt?: number
  lastHumanWriteAt?: number
  context: { cwd?: string; host?: string; shell: string; alt: boolean }
  redactions: RedactionSpan[]   // 敏感写入在投影上的遮罩
  caps: { maxRows: number; maxBytes: number }
}

interface LeaseState {
  holder: Holder
  since: number
  reason: 'open' | 'takeover' | 'handback' | 'secret-prompt' | 'idle-release'
  suspended: boolean            // 密码挂起期间为 true
}

interface ScreenModel {
  cols: number
  rows: number
  revision: number
  alt: boolean
  cursor: { row: number; col: number; visible: boolean }
  title: string
  screenText(opts: { since?: number; maxRows?: number }): ScreenDelta
  scrollback(fromBottom: number, count: number): string[]
}
```

`ScreenModel` 由 `@xterm/headless` 直接实现：`buffer.active` 给行与单元格，`getCell(x)` 给颜色、反显、暗色、宽度，`line.isWrapped` 用来把软换行的行拼回整句，`onTitleChange` 给窗口标题，`serialize` 给 UI 快照。单元格属性是识别 ghost 文本的依据：提示符光标之后的、落在暗色或 8 号前景上的单元格，以及不随光标前移而消失的尾部文本，判为建议文本并在投影中丢弃。

扩展后的后端契约（新增部分）：

```ts
interface TerminalBackendSession {
  readonly motd: string
  read(req: TerminalReadRequest): TerminalReadResult
  status(): TerminalSessionStatus
  close(reason: string): Promise<void>

  // 新增
  write(data: Uint8Array, o: { origin: 'agent' | 'human' | 'system'; sensitive?: boolean }): Promise<void>
  wait(spec: WaitSpec, signal?: AbortSignal): Promise<WaitResult>
  snapshot(o: { since?: number; maxRows?: number }): ScreenDelta
  resize(cols: number, rows: number): Promise<void>
  press(key: NamedKey, repeat?: number): Promise<void>
  lease(): LeaseState
}
```

---

## 7. 人机共享与控制权

目标不是“人也能看”，而是“人和 Agent 轮流用同一个键盘”。协议如下。

**单写者租约。** 任一时刻只有一方能写。Agent 在 `open` 时拿到租约，每次 `send` 前校验；人可以在 UI 上抢占，Agent 永远不能抢占人。

**人侧接管是显式的。** 面板上方有横幅“Agent 正在操作”，点“接管输入”才转移租约；在 Agent 持有租约期间，终端里的按键会被拦下并提示，而不是悄悄送进 PTY。不做“窗口聚焦即接管”，否则用户点一下侧栏就把 Agent 正在跑的交互命令打断。

**人被拦截时，Agent 立刻知道。** 租约在人手里时，`send` 不阻塞，直接返回 `lease_denied`，并提示“控制权在用户手里，请等待或请求归还”。正在进行的 `wait` 在人接管时以 `human_took_over` 结算，因为人的输入可能改变了命令的语义，静默成功会误导模型。

**交还要显式，且要能唤醒。** 用户点“交还控制”时，host 通过普通客户端路径投递一条用户消息（例如“已输入密码，继续”），复用现有的会话持久化与唤醒规则，不另造通知通道。Agent 下一回合调用 `terminal_wait` 就能接上。

**密码自动挂起。** 当租约在 Agent 手里，而屏幕出现密码类提示（`Password:`、`passphrase for`、`[sudo] password for`、`Verification code`、`OTP`，外加部署方配置的正则），或者前台进程被识别为 `sudo`、`ssh` 的密码阶段，服务立刻把租约置为 `suspended`，相位置为 `waiting_input`，正在等待的调用以 `human_required` 结算并附带提示。UI 弹横幅并可以响铃。模型拿不到任何密码，也不会继续往终端里写。

**审计要区分写者。** 每条写入在会话日志里落一条事件：`{ sessionId, actor: 'agent' | 'human', source: 'tool' | 'ui', bytes, textHash, firstLine, sensitive }`。Agent 的写入本来就躺在 transcript 里，人的写入只有这条记录，没有它就无法追责，也无法在事后解释“为什么屏幕变成了这样”。

### 7.1 右侧边栏的终端

实现由三块组成：Host 的 WebSocket attach（`src/attach.ts`）、一个只回环的 HTTP
桥（`src/bridge.ts`），和 bundle 的浏览器半边（`client/`）。

attach 是双工流：连上之后先订阅输出，再发 `hello`（id、名字、尺寸、相位、租约）
和 `snapshot`（`@xterm/addon-serialize` 产生的 ANSI），然后把订阅期间攒下的输出
补发出去。之后二进制帧就是 PTY 字节，文本帧是控制消息：`write`、`resize`、
`takeover`、`handback`。`write` 在服务端再校验一次租约，租约在人手里时回
`denied`，不是靠前端自觉。shell 退出时服务端发 `exited`，带退出码，然后关掉
socket；前端收到之后把标签页关掉，这条事件是生命周期的唯一事实来源。

浏览器端不再有输入框。xterm.js 的 `onData` 原样送进 PTY，输出原样写回终端；
键盘、选中复制、右键或 Ctrl+Shift+V 粘贴、窗口 resize 全部由模拟器处理。每个
标签页绑定一条 Host 会话，绑定关系写在 localStorage，刷新之后能恢复到同一条
会话；恢复时如果 Host 已经不认得这条会话，标签页会自己关掉。

设置面板完全在浏览器端：主题（七套带完整 16 色的调色板）、字体、字号、行高、
字重、光标、回滚、响铃、复制粘贴选项和快捷键表，改动立即写进 xterm 的 options
并保存到 localStorage。它是嵌在终端里的浮层，不是模态对话框。

---

## 8. 密钥与三种认证模式

| 模式 | 落点 | 模型能看到什么 |
|---|---|---|
| Agent 有密钥 | `terminal_open({ envRefs: { GITHUB_TOKEN: 'cred://github' } })`，spawn 时由 `ctx.credentials.resolve` 注入子进程环境 | 只知道变量名，值不进上下文，也不经过终端 |
| 人手动输入 | 密码挂起加交还，见上一节 | 只知道“需要人来输”，拿不到值 |
| 指纹与硬件密钥 | 天然只能人做，靠共享终端 | 什么也拿不到 |

`terminal_send` 另外接受 `secretRef` 与 `sensitive`：只在相位为 `waiting_input` 且提示符属于密码类时才允许，值直接从凭据服务写进 PTY，结果只回字节数，不回内容。写入期间记录一段 redaction 区间（行范围与列范围），Agent 的投影在这些行上打码，UI 仍然显示原样，因为那是用户自己的屏幕。

不要给“在普通提示符下把 token 打进命令行”开口子。命令行会回显，回显会进屏幕，屏幕会进上下文，绕一圈还是泄漏；需要 token 的场景一律走 spawn 时的环境注入。

---

## 9. 上下文与多会话

MVP 的规矩：每个 Agent 同时最多两个会话，其中一个不命名的主会话，其余必须命名；`terminal_list` 只回一行一个的压缩状态；工具结果默认有界（屏幕 40 行、输出尾部 200 行、单次 16 KB）。

跨回合的多会话感知，复用 `dsh-tmux-context` 已经验证过的模式：在 `agent/pre-step` 上，把会话状态压缩成两三行运行时上下文，只在状态变化时注入。

```
terminals: s-3f2 idle since 2m | s-9ab running "cargo build" 14m | s-1cd exited code=1
```

这比每回合把屏幕塞进上下文便宜得多，也比让模型自己记住可靠。后续再谈自动摘要与后台降级，不要一上来就做多会话并行。

---

## 10. 八个开放问题的判断

**后端：自研 PTY，保留后端接口，不做 tmux。** node-pty 已经在依赖里，`spawnTerminal` 已经把 SIGWINCH、前台进程组、stdin 等待、进程树清理都包好了。tmux 会引入第二套屏幕模型（capture-pane 的输出和 xterm 的渲染不一定一致）、第二个进程树、另一套清理语义，而且它最大的卖点是跨进程持久，而这恰恰不是目标（会话本来就进程本地）。tmux 留给用户在 shell 里自己开。

**前端：xterm.js 加现有双工 attach 流，不复用 tmux attach。** 传输层、快照、重连、输入确认、尺寸协商在 `dsh-api-terminal-controller` 里已经写完并有测试，浏览器端本来也要一个模拟器才能渲染，tmux attach 省不掉这一层。

**终端仿真器：`@xterm/headless` 6 加 serialize。** 它已经是两个包的依赖，和 UI 用同一个引擎，alt screen、scrollback、单元格属性、软换行标记都齐，还能做确定性的回放测试（喂一段录制的字节流，断言投影）。pyte 是 Python 生态，vt100 太弱，tmux capture-pane 只在选了 tmux 后端时才成立。

**API 粒度与命名：8 个工具，send 是主力，wait 独立，key 独立，snapshot 独立，去掉 signal。** 理由有两个：回合经济学要求常见路径一次调用完成（写加等），而长任务和守夜要求能“只观察不写入”，所以 wait 必须独立；信号是终端语义的实现细节，按键才是模型的心智模型。

**状态机与默认值：相位与结果两轴，超时 30s，静默 800ms，匹配字面量，优先级从退出到超时依次降低。** 把 `timeout` 当状态是这版设计最容易犯的错，它会让模型把“我等到超时”读成“进程结束了”。

**接管协议：单写者租约，人可抢占，Agent 不可，显式交还，密码自动挂起，UI 横幅。** 唯一需要权衡的是“聚焦即接管”还是“按钮接管”，选后者，因为前者会在用户无意点击时打断 Agent。

**多会话演进：先限量加状态胶囊，再谈分级与摘要。** 上下文爆炸的根源不是会话数量，而是每回合把屏幕全文搬进 prompt。胶囊注入能把这个成本压到每回合几十个 token。

**权限审计与密钥：审批落在 open，风险分类落在写入，审计落在会话日志，密钥落在 credentials。** 逐条写入审批在交互场景里不可行（一次 `y` 也要审批，人会被逼疯），所以把审批前移到“开一个能执行任意命令的 shell”，再用沙箱、风险分类和人接管兜住。

另外两条与 TUI 有关的判断：默认引导模型用非交互替代（`top` 换 `mpstat`，`vim` 换 `sed`，`nmtui` 换 `nmcli`），TUI 只作兜底；真进了 alt screen，返回光标位置与变化行，不假装理解语义，多模态截图放到后续。

---

## 11. MVP 与演进

**必须做（第一个可发布版本）**

| 阶段 | 内容 | 依赖 |
|---|---|---|
| M1 | 屏幕模型与文本投影；8 个工具；等待引擎与 diff；长任务与守夜；会话上限、空闲回收、写入审计 | 无 |
| M2 | 统一注册表；用户终端 attach 到 Agent 会话；租约与人接管；密码挂起；密钥环境注入；`$SHELL` 与 rcfile 包装 | M1 |
| M3 | zsh/fish 集成与 ghost 文本清理；状态胶囊；风险分类与高危强制接管 | M2 |

M2 排在 M1 之后不是因为它次要，而是因为共享会话的屏幕、租约、状态都建立在 M1 的模型上。没有屏幕模型，UI 和 Agent 看到的就不是同一个东西，共享没有意义。

**可以后置**

tmux 后端、容器与远程执行后端、跨 harness 重启的会话恢复、跨 Agent 共享、TUI 语义理解与截图、录制回放、多会话自动摘要、Windows 上的按键与 alt screen 对齐。

**明确不做**

让 Agent 驱动用户自己开的、无沙箱的终端；给模型实时流式订阅；把终端输出直接拼进系统提示词。

---

## 12. 落地改动清单

| 改动 | 包 | 规模 |
|---|---|---|
| 屏幕模型、投影、diff、redaction | 新建 `dsh-terminal-screen` | L |
| 会话相位、租约、等待器、事件 | `dsh-terminal` | L |
| 喂仿真器、OSC 7、rcfile 包装、按键 | `dsh-terminal-bash` | M |
| 8 个工具与渲染 | `dsh-tool-terminal` | M |
| Agent 会话 attach、租约桥接 | `dsh-api-terminal-controller` | M |
| 共享横幅、接管与交还 | `dsh-client-ui-sidebar-terminal` | S |
| 守夜 job | `dsh-tool-terminal` 复用 `dsh-jobs` | S |
| 密钥注入 | `dsh-terminal-bash` 依赖 `dsh-credentials` | S |

挂载时有一个坑：现有实验 bundle 用 `isolate: { terminals: true }` 给终端注册表开了独立实例，侧栏的用户终端根本看不见它。做共享会话时必须去掉这个隔离，让整个 host 只有一份 `ctx.terminals`，否则 M2 无从谈起。

测试策略用录制的字节流做黄金用例：把 vim、htop、less、python REPL、psql 的真实输出存成 fixture，喂给屏幕模型断言投影结果。这比手工在终端里点可靠得多，也是选 xterm headless 而不是自己写解析器的主要理由之一。等待引擎则用假时钟做优先级与竞态测试，租约用并发 fuzz 验证“同一时刻只有一个写者”。

---

## 13. 已知的尖角

1. **屏幕不等于命令结束。** 一个不输出的命令跑十秒，屏幕看起来是静的。靠前台进程组与 stdin 等待证据判断，静默只作兜底，结果里永远不声称“命令已退出”。
2. **TUI 依然难用。** 有光标和 diff 也只能做到“能按对键”，做不到“理解界面”。这是产品边界，不是实现缺陷。
3. **密码检测会误判。** 一个脚本打印 `Password:` 并不代表要人输。规则可配，且永远保留手动接管作为兜底。
4. **ghost 文本靠样式判断会漏。** 有些主题的建议文本颜色与正文接近。所以再加一条：只信 Agent 自己写进去的内容，提示符之后来源不明的尾部文本一律不进投影。
5. **resize 会造成重排。** 人一拖窗口，scrollback 重排，行号全变。diff 结果要带 `reflowed` 标记，让模型知道行号不可跨调用复用。
6. **人在 Agent 等待期间输入。** 等待结果必须标明 `human_took_over`，否则模型会把人类造成的输出算到自己命令头上。
7. **沙箱边界要写在 UI 上。** 用户接管的 Agent 终端仍然跑在 Agent 的沙箱里，文件权限比用户自己的终端窄。横幅上要写清楚，否则用户会以为是权限 bug。
8. **会话不跨重启。** 这是既有约束，产品文案里要提前说，不要等用户丢了一个小时的编译现场才发现。
