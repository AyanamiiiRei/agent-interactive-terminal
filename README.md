<h1 align="center">🖥️ Agent Interactive Terminal</h1>

<p align="center">有状态、跑在真实 PTY 上的终端会话，让智能体和人在同一块屏幕前协作。</p>

<p align="center">
  🌐 <b>简体中文</b> · <a href="README.en.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/AyanamiiiRei/agent-interactive-terminal/actions/workflows/ci.yml"><img src="https://github.com/AyanamiiiRei/agent-interactive-terminal/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="Node"></a>
  <img src="https://img.shields.io/badge/tests-68%20passing-brightgreen" alt="Tests">
  <a href="https://github.com/AyanamiiiRei/agent-interactive-terminal/stargazers"><img src="https://img.shields.io/github/stars/AyanamiiiRei/agent-interactive-terminal?style=social" alt="Stars"></a>
</p>

> DeepSeek Harness bundle：八个 `terminal_*` 工具、一块实时共享的 xterm 面板，以及不经过模型上下文的密码交接。68 个测试在 Linux 的 Node 20/22 上通过；完整设计见 [docs/design.zh.md](docs/design.zh.md)。

## 为什么

模型常用的 `exec` 没有 TTY：程序不进入交互模式，长任务看不到过程，密码会被卷进对话，人也无法和模型共用同一个 shell。

这个项目把终端做成有身份、有屏幕、有相位、有租约的资源。模型读取离散的屏幕快照，而不是一条字节流；人可以随时接管、只读或彻底断开连接。

## 安装

需要 Node.js 20+ 和用于编译 `node-pty` 的 C++ 工具链。在 DSH 的 Plugins → Discover 里添加市场索引：

```text
https://raw.githubusercontent.com/AyanamiiiRei/agent-interactive-terminal/main/plugin-market.json
```

搜索 `agent-interactive-terminal` 安装，或在 Add plugin 里直接填 Git 规格。首次安装要批准 `node-pty` 的构建脚本；升级到新版本后重启一次 DSH。

```bash
git clone https://github.com/AyanamiiiRei/agent-interactive-terminal.git
cd agent-interactive-terminal
npm install
npm run build
```

### 平台

Linux 和 macOS 直接使用本机 zsh/bash；macOS 未设置 `$SHELL` 时默认 `/bin/zsh`。Windows 自动寻找 `wsl.exe`：可用时在 WSL 里启动 zsh（没装 zsh 就用 bash），并把生成的 rc 翻译成 WSL 路径；找不到 WSL 时退回 PowerShell 7、Windows PowerShell 或 `cmd.exe`。手动选 zsh/bash 但没有 WSL 会明确报错。原生 PowerShell/cmd 没有提示符标记，等待会退回屏幕内容和输出静默判断，精度不如 WSL。

## 快速开始

```bash
npm run demo -- "git status"   # 一条命令，看模型拿到的屏幕和状态行
npm run demo                   # 交互循环：/snap、/wait、/key、/resize、/quit
npm run attach                 # 浏览器 attach 示例，打开终端里打印的地址
```

## 在 DSH 里

终端图标在会话标题栏。点开后右侧是 xterm 面板，会话标签按当前顺序编号，中键关闭；agent 活跃时，上边栏和终端下方会环绕 RGB 流光。当前标签的租约、只读、断开和密码等待都显示在状态胶囊里。

- **键盘归属**：人敲键即接管，停手几秒自动交回；agent 写入时面板自动切到对应会话。
- **访问级别**：`collaborate`（协作）、`observe`（只读）、`sealed`（读写都断开，列表里只剩脱敏记录）。
- **工具策略**：一次性命令优先、交互式优先、强制交互式；后者会隐藏 agent 的 bash。另有“主动使用交互式终端”开关，让 REPL 任务先进入 python 等交互环境。
- **设置**：主题、字体、光标、快捷键、回滚、响铃、复制粘贴、租约超时都在终端设置里；默认 Adwaita 深色，也可跟随 DSH。

## 在代码里

不依赖任何智能体框架，可以直接使用 `TerminalRegistry`：

```ts
import { TerminalRegistry } from 'agent-interactive-terminal'

const sessions = new TerminalRegistry({ maxSessions: 2 })
const session = await sessions.open({ name: 'build', cols: 100, rows: 30 })

await session.write('npm run dev')
const result = await session.wait({ match: ['ready in'], timeoutMs: 60_000 })
console.log(result.outcome, result.view.text)

session.takeOver()
await session.write('y', { origin: 'human' })
session.handBack()
await session.close()
```

也可以把 `createTerminalTools(registry)` 交给自己的模型运行时。密码提示会让 `wait` 返回 `human_required` 并挂起 agent；用 `session.write(secret, { origin: 'human' })` 回答，密码不会经过模型。`npm run attach` 的浏览器示例只绑定 `127.0.0.1`，没有鉴权，仅供本地演示。

## 工具

| 工具 | 作用 |
| --- | --- |
| `terminal_open` | 打开会话，返回 id、状态行和初始屏幕 |
| `terminal_send` | 写入文本（默认回车提交），并等待结算 |
| `terminal_wait` | 只等待，不写入 |
| `terminal_snapshot` | 读取屏幕或输出尾部，可按版本号取增量 |
| `terminal_key` | 按下具名按键，如 `ctrl-c`、`enter`、`page-down` |
| `terminal_resize` | 调整终端尺寸 |
| `terminal_close` | 关闭会话并清理进程树 |
| `terminal_list` | 列出会话、相位、尺寸和目录 |

## 设计

屏幕只有一份，两种投影：给模型的是文本，给浏览器的是序列化 ANSI。写入是动作，等待是查询，状态是事实，三者分开。授权在会话创建时给定，由服务端执行，不是前端丢按键。

```
src/screen/        headless xterm 屏幕模型
src/pty/           node-pty 与前台进程观测
src/session/       会话、注册表、shell 启动
src/tools/         八个工具
src/attach.ts      浏览器双工 attach
src/bridge.ts      面板使用的回环 HTTP 桥
client/            DSH 浏览器半边与 xterm 面板
test/              68 个测试
```

## 状态

已实现屏幕快照、等待、租约、密码交接、密钥注入、审计、zsh/bash 集成、共享面板、macOS 和 Windows WSL 启动。尚未实现：审计之外的打码区间、空闲会话回收、fish 集成；细节和明确的非目标见 [ROADMAP.md](ROADMAP.md)。

## 许可证

MIT，见 [LICENSE](LICENSE)。

<p align="center">如果这个项目帮你省了点事，点个 ⭐ 就是最好的支持。</p>

<p align="center">🌐 <a href="README.en.md">Read this in English</a></p>
