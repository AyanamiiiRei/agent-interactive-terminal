# Agent Interactive Terminal

面向智能体、同时也能让人共用的有状态 PTY 终端会话。

> **当前处于实现早期。** M1 的主体已经落地：真正的 PTY、headless 屏幕模型、
> 相位与等待判定、八个面向模型的工具，以及测试。共享会话、控制租约和密码交接
> 属于 [ROADMAP.md](ROADMAP.md) 里的 M2 里程碑。目标接口的参考仍然是
> [docs/design.zh.md](docs/design.zh.md)。

## 要解决的问题

今天智能体能够调用的“终端”，本质上都是 `exec`：启动子进程、等它退出、收集
stdout 和 stderr。这个模型是无状态的、一次性的、基于管道的。它没有 TTY，所以
程序不会进入交互模式，shell 的启动配置不会按人的预期加载，长任务看不到过程，
人和智能体也没法在同一个终端里协作，只能靠复制粘贴。

常见的绕法都卡在同一个地方。往 stdin 里灌 `yes` 不等于回答提示；轮询管道等密码
提示，会把密码泄漏进对话记录；等输出安静区分不了“跑完了”和“跑得慢”；而无论
怎么解析 ANSI 字节，智能体都拿不到“此刻屏幕上是什么”。

## 方案概要

一个持久终端会话是一份有身份、有屏幕、有活动状态、有控制租约的资源。工具围绕
`session_id` 操作，拿回的是渲染后的屏幕加一行状态，而不是原始字节流。

- **真正的 PTY。** 会话跑在伪终端上，程序能检测到终端，进入交互模式，正常渲染
  进度，按自己的方式加载启动文件。
- **看屏幕，不看流。** 终端仿真器把 ANSI 解析成当前屏幕，智能体离散地拉取快照，
  不订阅实时流。
- **等待条件。** 一次调用可以等字面量命中、等输出安静、等超时、等 shell 空闲、
  等进程退出，谁先满足谁返回。
- **同一时刻只有一个写者。** 租约决定键盘归智能体还是归人。人可以随时接管，
  智能体不能自己抢回来。
- **密码交接。** 出现凭据提示时，会话挂起智能体，把控制权交给用户，并告诉模型
  停下来。密码不会进入模型上下文。
- **事件唤醒。** 日志守夜复用已有的后台任务通道，命中时唤醒空闲的智能体，而不是
  让它一直轮询。

## 试一下

需要 Node.js 20 或更新版本、用于编译 `node-pty` 的 C++ 工具链，以及 Linux 或
macOS。本里程碑里的前台进程观测只在 Linux 上生效，其他平台会退回提示符标记加
静默窗口的判定方式。

```bash
git clone https://github.com/AyanamiiiRei/agent-interactive-terminal.git
cd agent-interactive-terminal
npm install
npm test
npm run demo -- "git status"
```

`npm run demo` 不带参数时会进入一个交互循环，走的是和模型完全相同的工具面：

```text
› ls
› /snap
› /wait 5000
› /key ctrl-c
› /resize 120 40
› /quit
```

## 在代码里使用

这个库不依赖任何智能体框架。如果你清楚要等什么，可以直接用会话对象：

```ts
import { TerminalRegistry } from 'agent-interactive-terminal'

const sessions = new TerminalRegistry({ maxSessions: 2 })
const session = await sessions.open({ name: 'build', cols: 100, rows: 30 })

await session.write('npm run dev')
const result = await session.wait({ match: ['ready in'], timeoutMs: 60_000 })
console.log(result.outcome, result.phase)
console.log(result.view.text)

await session.close()
```

也可以把这些工具定义注册到你自己的模型运行时里：

```ts
import { createTerminalTools, toolIndex, TerminalRegistry } from 'agent-interactive-terminal'

const registry = new TerminalRegistry()
const tools = toolIndex(createTerminalTools(registry))
// 把每个工具的名称、描述和参数 schema 交给模型，
// 再把调用分发到 tools.get(name).execute(args)。
```

八个工具分别是 `terminal_open`、`terminal_send`、`terminal_wait`、
`terminal_snapshot`、`terminal_key`、`terminal_resize`、`terminal_close` 和
`terminal_list`。

## 现在已经能用的部分

- 每个会话一条真正的 PTY，从 `$SHELL`（或指定路径）启动，带
  `TERM=xterm-256color`、工作目录和额外的环境变量。
- headless xterm 屏幕模型，支持备用屏幕、滚动回溯、软换行合并、光标与标题跟踪，
  以及去掉 shell 画在光标之后、用暗色格子渲染的补全建议。
- 同一份屏幕的两种投影：给模型的文本屏幕，和给浏览器 attach 流的序列化 ANSI。
- 相位 `starting`、`running`、`waiting_input`、`idle`、`exited`。bash 通过包装
  的 rcfile 装提示符标记；zsh 和其他 shell 退回前台进程组加短暂静默窗口的判定。
- 等待引擎支持字面量命中、静默、相位稳定和超时，按固定优先级判定；另外支持
  Ctrl-C 式中断和括号粘贴。
- 具名按键覆盖中断、EOF、挂起、方向键、翻页和常用 Ctrl 组合，另外支持调整尺寸
  和关闭时清理整棵进程树。
- 十七个测试，覆盖屏幕模型、会话生命周期和工具层。

按设计尚未实现的部分：浏览器接入同一条活动会话、带接管的单写者租约、密码检测与
人工交接、密钥注入、按模式唤醒的后台任务，以及 Windows 对齐。详见
[ROADMAP.md](ROADMAP.md)。

## 设计分层

整个设计分五层：

1. **PTY 原语**：启动、写入、调整尺寸、发信号、观测前台进程组、清理整棵进程树。
2. **会话核心**：每个会话一份屏幕模型、活动观测、等待器、控制租约、打码与审计。
3. **会话服务**：身份、发布、授权、清理，以及状态变更事件。
4. **工具面**：一组面向模型的工具，负责写入、等待、读屏、按键、调整尺寸和关闭。
5. **传输与界面**：浏览器终端通过 attach 流接入，和智能体共享同一条会话记录。

三层之间有三条不变量。屏幕状态只有一份，两种投影：给智能体的是文本，给浏览器
的是序列化后的 ANSI。写入是动作，等待是查询，状态是事实，三者分开，长任务才能
只看不写。授权在创建会话时一次给定，而不是每次按键重新审批。

完整设计，包括工具 schema、数据结构、租约协议和已知的尖角，在
[docs/design.zh.md](docs/design.zh.md)。

## 仓库结构

```
src/screen/model.ts    headless xterm 屏幕模型与两种投影
src/pty/pty.ts         node-pty 包装
src/pty/proc.ts        Linux 前台进程组与 stdin 等待观测
src/session/session.ts TerminalSession：写入、等待、按键、快照、尺寸、关闭
src/session/registry.ts 会话 id、并发上限、查找与清理
src/session/shell.ts   $SHELL 解析与启动文件包装
src/tools/index.ts     八个面向模型的工具定义
src/cli/demo.ts        走工具面的交互演示
test/                  屏幕、会话与工具测试
docs/design.zh.md      完整设计文档
ROADMAP.md             里程碑、范围与明确的非目标
```

## 状态与路线图

M1 做单智能体的可读屏幕和判定准确的等待。M2 加共享会话、控制租约和密码交接。
M3 打磨 shell 保真与多会话上下文。[ROADMAP.md](ROADMAP.md) 列出了每一项和每一个
明确的非目标。

## 相关工作

设计是对着 DeepSeek Harness 写的，建立在它已有的原语上：基于 node-pty 的终端
启动器、按所有者隔离的会话注册表、带提示符标记的 shell 后端、headless xterm
屏幕、双工 attach 流，以及能唤醒空闲智能体的后台任务通道。方案是把这些拼成
同一个会话模型，而不是推倒重来。

值得一读的前作包括 tmux 与 screen 的会话复用、expect 的脚本化交互，以及
libvterm、xterm.js、pyte 在终端仿真上的工作。

## 参与

欢迎提 issue 和设计意见，尤其是做过智能体工具或终端复用器的人。想实现某个
里程碑的话，先开 issue 对一下范围，避免和路线图脱节。

## 许可证

MIT，见 [LICENSE](LICENSE)。
