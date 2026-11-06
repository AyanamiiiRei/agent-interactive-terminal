# 在 Codex 里使用交互式终端

这个目录把现有的终端内核包装成一个 MCP server，并附带一份 Codex 插件清单。Codex 负责启动 MCP server，模型通过八个 `terminal_*` 工具驱动同一个 PTY；人和模型共享的终端画面在一个本地浏览器面板里。

## 安装

先在仓库里构建：

```bash
cd /home/sabu/Repositories/agent-interactive-terminal
npm install
npm run build
```

然后让 Codex 认识这个仓库里的插件市场：

```bash
codex plugin marketplace add /home/sabu/Repositories/agent-interactive-terminal
codex plugin add agent-interactive-terminal@agent-interactive-terminal
```

检查：

```bash
codex plugin list
codex mcp list
```

`codex mcp list` 里应该出现一行 `ait`，命令指向
`plugins/codex/bin/ait-mcp.mjs`。

如果不想用插件市场，也可以直接写用户级配置：

```bash
codex mcp add ait -- node /home/sabu/Repositories/agent-interactive-terminal/plugins/codex/bin/ait-mcp.mjs
```

## 使用

启动 `codex`，然后让模型打开一个终端，例如：

```text
打开一个交互式终端，启动 python，然后一步一步算一下这个项目里的数据。
```

`terminal_open` 的结果里会有一行：

```text
[panel: http://127.0.0.1:39063/?token=...]
```

把这个地址在浏览器里打开。面板里可以看到同一个 shell，键盘输入会先接管租约，停手四秒后自动交还给 agent。面板上还有只读、断开和关闭按钮。

当命令要求输入密码时，`terminal_send` 会返回 `human_required`。这时 agent 应该请你在面板里输入密码；MCP 适配层最多等 25 秒，等你输入完成、命令结算后把结果返回给模型。如果超过这个时间，模型可以再调用一次 `terminal_wait`。

## ChatGPT 桌面版里的 Codex

这台机器上安装的是 ChatGPT 桌面版，不是单独的 Codex GUI。它已经是合并后的形态：`/usr/lib/chatgpt/resources/linux-package-metadata.json` 里写着 `codexAppBrand` 是 `chatgpt`，`/usr/lib/chatgpt/resources/codex` 是它内置的 Codex 运行时。应用和命令行共用 `~/.codex`，所以插件、会话和 MCP 配置是同一份。

检查这台机器上的实际状态：

```bash
/usr/lib/chatgpt/resources/codex mcp list
/usr/lib/chatgpt/resources/codex plugin list
```

这两条命令都会看到 `ait` 和 `agent-interactive-terminal@agent-interactive-terminal`，说明桌面版内置的 Codex 已经加载了这个插件。ChatGPT 和 Codex 的插件目录是打通的，官方说明见 [ChatGPT Learn 的 Plugins 文档](https://learn.chatgpt.com/docs/plugins)。

在桌面版里测试时，打开 ChatGPT，切换到 Codex，新建一个会话，然后直接说：

```text
用 agent-interactive-terminal 的 terminal 工具打开一个终端，运行 echo app-ok，把输出读回来，然后关闭它。
```

它会和命令行一样弹工具审批。允许之后，`terminal_open` 的结果里会带 `[panel: http://127.0.0.1:...]`。这个地址是浏览器面板，仍然可用；桌面版还带一个 MCP App 侧边栏面板，见下一节。

### 侧边栏里的交互式终端

仓库现在也带一个 MCP App 面板，入口是 `terminal_panel`。它的 `_meta` 里声明了两个 entrypoint：`thread` 是对话右侧的面板，`global` 是全局侧边栏。宿主支持 MCP Extensions 时，重启 ChatGPT 桌面版并在新的 Codex 会话里打开侧边栏，应该能看到 “Interactive Terminal” 这个入口；点开后是一个 xterm，里面列出现有会话，也可以新建。

这个面板和内置的终端不是同一个东西。截图里 Codex 自带的 “终端” 是 Codex 自己的 PTY 视图，agent 通过 `exec_command` 和 `write_stdin` 能读能写；而 “Interactive Terminal” 面板走的是本项目的 `terminal_*` 会话，有屏幕模型、等待、租约、只读和断开。两边不要混用。

面板里的按键通过 app-only 的 `terminal_ui_*` 工具写回 PTY，初始画面是 ANSI 快照，之后用长轮询拿原始输出。MCP App 不能用本机 WebSocket，所以这条链路完全走 `tools/call`。面板本身不发起网络请求，资源由 MCP server 的 `resources/read` 返回。

侧边栏没有出现入口时，先确认桌面版已经重启，然后在新的 Codex 会话里执行：

```bash
/usr/lib/chatgpt/resources/codex mcp list
```

`ait` 仍然是 enabled 就说明 server 配置没问题；如果入口仍然不出现，可能是当前桌面版还没有启用这个 extension entrypoint，浏览器面板仍然可用。

如果桌面版是在插件安装之前就已经打开的，退出 ChatGPT 再重新打开，或者至少新建一个 Codex 会话，让它重新读取插件列表。即使 Plugins 页面没有把本地市场列出来，只要 `~/.codex/config.toml` 里有这个插件，桌面版的 Codex 仍然会加载它的 MCP 工具；上面的 `mcp list` 能直接验证这一点。

## 环境变量

| 变量 | 作用 |
| --- | --- |
| `AIT_PANEL=0` | 不启动浏览器面板，只提供 MCP 工具。 |
| `AIT_PANEL_PORT` | 固定面板端口；默认让操作系统分配。 |
| `AIT_PANEL_TOKEN` | 固定面板 token；默认每次启动随机生成。 |
| `AIT_BLOCK_HUMAN_MS` | `terminal_send` 等待人完成输入的最长时间，默认 25000 毫秒；设为 0 关闭。 |

这些变量写在 Codex 的 MCP 配置里也可以，例如 `codex mcp add` 的 `--env`。

## 安全边界

这个 shell 跑在 Codex 自己的沙箱之外。Codex 的 `exec_command` 仍然受它自己的沙箱和审批约束；`terminal_*` 工具是一个用户明确打开、可以在浏览器里看见和接管的共享终端，不应该被用来绕过审批或沙箱规则。插件里的 skill 和 MCP server 的 `instructions` 都会这样提醒模型。

面板只绑定 `127.0.0.1`，页面、API 和 WebSocket 都要求 token。token 会出现在 `terminal_open` 的工具结果里，因此也会进入模型上下文；这是当前 MVP 的取舍。远程 SSH 场景需要自己做端口转发。

## 当前限制

- Codex 的 TUI 里没有侧栏，面板只能是一个浏览器标签页。
- Codex 0.167 会把 MCP 工具挂在统一 `exec` 工具的嵌套工具里；模型通过 `tools.mcp__ait__terminal_open` 这样的名字调用，也可以从 `ALL_TOOLS` 里找到它们。较旧的 Codex 版本可能直接列出 `mcp__ait__*`。
- 插件系统目前不执行插件内的 hooks，所以密码输入完成后不能由 hook 自动给 Codex 发一条新消息；阻塞等待和手动 `terminal_wait` 是当前的替代方案。
- `.mcp.json` 里写的是本机的绝对路径。如果仓库移动了，需要同步修改 `plugins/codex/.mcp.json`，或者改用 `codex mcp add`。
- 面板是单进程的：Codex 退出后，它启动的会话和面板一起结束。

## 文件

```text
src/mcp/                 MCP stdio server 与 CLI
src/panel/               独立 HTTP/WebSocket 面板与页面
plugins/codex/           Codex 插件清单、MCP 配置、skill
.agents/plugins/         Codex 插件市场索引
```
