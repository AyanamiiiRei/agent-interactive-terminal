# 同类项目调研：这个仓库的机会在哪里

> 写于 2026-11-05，给继续实现这个仓库的人看的一份决策备忘，不是规则。
> 结论不改变“继续做独立库”的方向，只影响借鉴来源和优先级。
> 版本号与描述截至调研当天，来自 npm 元数据与各包 README，没有逐个安装实测。

## 一屏结论

- DSH 生态里终端类插件已经很多。社区目录 `dsh-plugin-catalog` 共 8655 条，按 terminal、pty、tty 命中 51 条，人工去掉主题、皮肤、股市终端之类的误命中，真正做终端面板或 Agent 终端工具的约三十个。
- 其中 `@hyzyn/dsh-tty` 覆盖了广度，`dsh-remote-console` 覆盖了人机共享与安全，两家各自实现了设计里一半以上的支柱。
- 官方 `@deepseek-ai/dsh-terminal` 加 `dsh-tool-terminal` 是事实标准，但官方工具面明确写着没有 TUI 与按键序列接口面。
- 本仓库 `src/types.ts` 里已经定下的 `human_required`、`human_took_over`、`lease_denied` 和 `LeaseState`，正好对应市场上没人做的那一块。
- 仓库在 14ff97a 已经落地租约、密码挂起、密钥注入和浏览器 demo 的初版，所以下面“空白”的第一条现在应读作“把它做成闭环并用测试钉住”，不是“尚未开始”。
- 所以独立库仍然成立。价值不在功能数量，在把契约、测试和安全语义做成别人可以对照的一份东西。

## 调研方法

本机没有配置插件市场索引源，`@deepseek-ai/dsh-experimental-plugin-market-bundle` 也没启用，所以 GUI 的 Discover 页不可用。替代做法是读 npm 上的包元数据与 README，加上社区维护的目录包 `dsh-plugin-catalog`（也就是 awesome-dsh-plugin 那套索引）。所有“它有某某能力”的判断都来自包自己的 README，属于自述，没有验证实现。

## 最接近的五个项目

| 包 | 版本 | 它能替你解决什么 | 短板 |
|---|---|---|---|
| `@hyzyn/dsh-tty` | 0.37.3 | 十九个 agent 工具；读当前屏幕且能读 TUI；正则等就绪信号；具名按键；tmux 持久化；ssh2 加跳板机；SFTP 与端口转发；按调用生效的权限档位；每轮 systemPrompt 里的终端快照 | 安全交接只有“可见可接管”，没有挂起态；没有屏幕差量 |
| `dsh-remote-console` | 0.10.12 | 人和 agent 共用一个 SSH PTY；认证期拒写；危险命令逐次审批；跨会话审计与脱敏；退出码靠 OSC 与 PROMPT_COMMAND 回传 | 只覆盖 SSH；没有通用的暂停与交还协议；没有差量 |
| `dsh-live-terminal` | 1.3.1 | 接管内置 bash 与 pwsh 前台命令到可见面板；截图支持文本、ANSI、PNG；wait、expect、按键、signal、resize、search、exec；多客户端输入租约；回放 | 租约是客户端之间，不是 agent 与人；没有认证期语义 |
| `dsh-terminal-manager` | 0.1.1 | SSH 与 Telnet 多会话；`tm_*` 工具面；危险命令守卫；会话共享；SFTP 与编辑器 | 面向网络设备运维，不是通用会话模型 |
| `dsh-terminal-panel` | 1.3.0 | 九个 `terminal_*` 工具；模型与用户共用同一批终端；把结算原因分成 idle、quiet、exited、timeout | 没有屏幕模型与租约 |

另外两个值得知道的存在：官方的 `@deepseek-ai/dsh-subprocess-ssh`（把 SSH 做成执行世界，0.1.6-alpha.1），以及 `@qlzt`、`@x1a0f3n9`、`@knyazevai`、`@prettier-ai`、`@xfcodeai` 这些用相同描述重新发布官方 seam 的 fork。fork 的数量说明这套接口被当成事实契约在用，也说明社区需要一个稳定的对照物。

## 可以直接借鉴的机制

这些是别人踩过坑之后留下的解法，自己重新想一遍大概率会掉进同一个坑。

1. **命令回显的剔除。** 等待正则命中时，刚发进去的命令本身也会回显并命中。`@hyzyn/dsh-tty` 用 OSC 133 的 A 到 B 边界，把命令区间从候选文本里削掉；没有标记的环境退回“按发送记录剔除”，只有削掉后不再命中才算数，超时且只命中回显时单独标 `echoOnly`。
2. **认证期拒写。** `dsh-remote-console` 在屏幕停在 `password:`、`(yes/no)?`、`Permission denied` 时，拒绝 agent 的任何写入并回 `AUTH_REQUIRED`。这比“等模型自己识趣”可靠得多，也是本仓库租约挂起最自然的触发条件之一。
3. **审计字段与脱敏。** 它的审计记录命令、退出码、审批结果、传输路径与 sha256，写入前对 Bearer token、`sk-*`、`password=`、`token:`、`secret=` 一类赋值脱敏，并且在终端结束后删除含屏幕内容的会话日志，只保留审计。这套字段划分可以直接照抄。
4. **读屏不推进游标。** `tty_screen` 明确只读、不推进未读区，`tty_send` 只初始化不推进，超时也不消耗未读区，换个 pattern 还能再等。本仓库用屏幕状态做等待时天然满足这一点，但别忘了在文档里把它写成性质，否则后来的人会顺手改成“读走”。
5. **tmux 重连后的重画。** 持久会话 attach 回来时不能回放宿主缓冲，要 `refresh-client` 重画一次，否则屏幕重影。如果以后加持久化，这条能省掉一整天调试。
6. **权限档位按调用生效，并同步裁剪工具面。** `@hyzyn/dsh-tty` 把工具分成读、写、执行三类，每次调用按会话档位判定，受限档还会把写与执行类工具从 agent 的工具表里摘掉。两层都做，比只做其中一层稳。
7. **短命令不上屏。** `dsh-live-terminal` 默认只有运行超过 1500ms 的命令才建终端标签，否则每条 `ls` 都会开一个 tab。任何“让 agent 的命令可见”的设计都会遇到这个，提前留一个阈值。
8. **用真实 PTY 录制做测试。** 有插件明确写着“用真实 PTY 捕获验证”，社区里 `dsh-claude-tui` 就是这么做的。把 vim、htop、less、python REPL、psql 的字节流存成 fixture，比手工点终端可靠得多。

## 仍然没人做的四件事

这四条在三十来个终端插件里没有看到对应实现，也正好是本仓库 `types.ts` 已经预留的位置。

1. **租约状态机。** 最接近的两个：`dsh-remote-console` 会拒绝认证期写入，但没有挂起与交还的状态；`dsh-live-terminal` 有输入权租约，但那是多个浏览器客户端之间的。把“agent 被明确挂起、人接管、交还后恢复、审计能区分谁写的”做成闭环，目前没人做。本仓库已有初版（14ff97a），差距在闭环与验证，不在有无。
2. **屏幕差量。** 所有插件要么返回整屏，要么返回尾部文本，没有按变化行返回、并标注 resize 重排的。长任务观察和日志守夜的 token 成本主要在这里。
3. **事件驱动的守夜。** `tty_expect` 和各类 wait 都在一次工具调用里同步等，超时就返回。没有“命中某行就唤醒空闲 agent”的机制。独立库可以只定义钩子，把通道留给宿主。
4. **跨环境的层感知。** 本地、SSH、容器、chroot 各有人做，但没有一个把“当前在哪一层、怎么进来的、怎么退出去”作为会话状态。`dsh-worlds` 把 PTY 放进 Docker，但也没有层栈。

## 与本仓库现有代码的对应

- `src/types.ts`：相位与等待结果已经分开，`WaitOutcome` 已经含 `human_required`、`human_took_over`、`lease_denied`，这一点比多数插件做得好。可以考虑给 `TerminalView` 或 `WaitResult` 加一个 `reflowed` 标记，否则 resize 之后的 `changedRows` 会误导调用方。
- `src/session/session.ts`：等待已经是按屏幕状态求值而不是消费输出偏移，这个选择是对的，多个观察者才能互不影响。注意结算优先级要固定成“退出、租约挂起、match、相位、quiet、超时”，并且写进测试，不然以后改一处就会漂移。
- `src/screen/model.ts`：差量和 `alt` 标记都在这里落地。软换行拼接、尾随空行裁剪、光标可见性这三件事建议先用 fixture 钉住，再谈别的。
- `test/`：现有测试偏单元。建议补一组录制的真实终端字节流，作为屏幕投影的黄金用例，这是独立库最容易建立可信度的地方。

## 三个建议

1. **先用 fixture 钉住屏幕模型。** 理由是各家的 bug 几乎都集中在 ANSI 解析和换行拼接上，而这一层一旦稳定，后面所有能力都有地基。代价是要花时间收集和裁剪录制数据。
2. **把租约做成一个收拢的、可测试的协议。** 初版已经在 14ff97a，下一步不是重写，而是用测试钉住三件事：结算优先级（退出、挂起、match、相位、quiet、超时）、挂起只由新输出触发、交还之后每一笔写入都能回答“是谁写的”。代价是要把 `session.ts` 里写入、等待、投影三处的判断收拢到一处，否则以后每加一个状态就会漂移。
3. **差量可以晚一点，但接口先定。** 只要 `WaitResult` 里留着 `revision` 与 `changedRows` 的语义，实现可以放到 M2。层感知与守夜建议留到有宿主接入之后再谈。

## 参考

- `@hyzyn/dsh-tty` 0.37.3，npm
- `dsh-remote-console` 0.10.12，npm，MIT
- `dsh-live-terminal` 1.3.1，npm
- `dsh-terminal-manager` 0.1.1，npm
- `dsh-terminal-panel` 1.3.0，npm
- `@deepseek-ai/dsh-terminal`、`@deepseek-ai/dsh-tool-terminal`、`@deepseek-ai/dsh-subprocess-ssh`，官方包
- `dsh-plugin-catalog`，社区目录，8655 条
