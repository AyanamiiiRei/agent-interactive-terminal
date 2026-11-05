# Agent 命令拦截方案

这份文档只描述设计，不包含实现。终端现在会把 agent 的每一次写入直接送进 PTY，
拦截要做的是在写入之前插入一个可配置的检查点，并尽量复用 DSH 已有的审批通道，
而不是自己再造一套弹窗。

## 目标与边界

- 只拦截 agent 发起的写入。人在面板里的键盘输入永远直接进入终端，不经过审批，
  也不会因为拦截设置而变慢。
- 三种模式，按会话分别设置：危险命令审批、不拦截、全部确认。
- 审批走 `@deepseek-ai/dsh-user-approval` 的 `ctx.approval`，复用现有的审批面板、
  超时取消和审计记录。终端不新增模态框。
- 模式是安全设置，只能由人改，agent 的工具调用不能把模式改松，否则拦截没有意义。

## 现状

`terminal_send` 工具最终调用 `session.write(text, { origin: 'agent' })`。会话层已经
会拒绝只读和隔离档的写入，但它拿不到 agent、调用 id 和中止信号，所以审批应该放在
工具层，在 `session.write` 之前完成。

审批服务在 `dsh-base` 里已经组合，Web profile 默认策略是 `ask`。`request` 只能在
一个尚未结束的轮次里调用，而终端工具本来就只会在轮次里执行，所以时机是合适的。
审批结果是 `allowed-once`、`rejected`、`cancelled`、`unavailable` 之一；缺少应答者
时按拒绝处理。

## 三个模式

| 模式 | 行为 | 默认 |
| --- | --- | --- |
| `risky` | 提交的命令命中危险命令分类时才请求审批；普通命令直接写入 | 是 |
| `off` | 不检查，保持现在的行为 | 否 |
| `strict` | 每一次 agent 写入都请求审批，包括 `submit: false` 的逐字输入和 `terminal_key` | 否 |

`strict` 模式会很吵，但它是唯一能覆盖“把危险命令拆成多次输入”这种规避方式的档位。
`risky` 只看每次提交的整行或整段文本，这是一个需要写进文档的边界。

模式存在会话对象上，默认 `risky`，通过 attach 的状态消息广播给面板。它不写磁盘，
Host 重启后会话本身消失，重新打开时回到默认值。

## 判定点

在 `src/tools/index.ts` 里：

1. `terminal_send` 在调用 `session.write` 之前检查 `session.guardMode`。
2. `risky` 模式用分类器检查将要提交的文本；`submit: false` 且文本不构成多行时跳过。
3. `strict` 模式对每个 `terminal_send` 和 `terminal_key` 都发起审批。
4. 审批通过后重新确认租约仍属于 agent、访问级别仍是 `collaborate`，再写入；如果在
   等待审批期间人接管了键盘，写入按现有的 `LEASE_DENIED` 失败，不要偷偷重试。
5. 被拒绝、被取消或审批通道不可用时，不写入，并向模型返回明确的错误码
   （`COMMAND_REJECTED`、`APPROVAL_CANCELLED`、`APPROVAL_UNAVAILABLE`），提示它
   停下来向人解释，而不是换一条写法绕过。

## 危险命令分类

分类器是一组保守的正则，覆盖这些类别：

- 递归删除和通配删除：`rm -rf`、`rm -r` 作用于根目录、家目录或变量展开的路径；
- 磁盘和分区：`mkfs`、`fdisk`、`parted`、`dd of=/dev/`、`wipefs`；
- 权限提升和系统服务：`sudo`、`su -`、`systemctl`、`service`、`mount`、`umount`；
- 包管理与系统变更：`dnf`、`apt`、`pacman`、`rpm -e`、`pip install` 之外的系统级安装；
- 远程代码执行：`curl ... | sh`、`wget ... | bash`、`eval "$(curl ...)"`；
- 版本控制破坏：`git push --force`、`git reset --hard`、`git clean -fd`；
- 进程和权限：`kill -9`、`pkill`、`chmod 777`、`chown -R`；
- 凭据和外发：读取 `~/.ssh`、`.env`、`~/.aws` 后配合网络命令。

分类器只负责“值得让人看一眼”，不是安全边界。真正的安全边界是 `strict` 模式。

## 审批调用

```ts
const approval = ctx.get('approval')
if (approval === undefined) {
  // 仅在拦截启用时：按拒绝处理，返回 APPROVAL_UNAVAILABLE
}
const outcome = await approval.request({
  agent: exec.agent,
  toolName: 'terminal_send',
  callId: exec.callId,
  reason: `run in terminal ${session.id}: ${preview}`,
  displayReason: {
    en: `Allow this command in terminal ${session.id}? ${preview}`,
    zh: `允许在终端 ${session.id} 里执行这条命令吗？${preview}`,
  },
  ...(exec.signal ? { signal: exec.signal } : {}),
})
```

`preview` 截断到两百个字符并去掉控制字符。审批服务本身会把请求和结果写进会话审计，
终端再加一条自己的 `kind: 'intercept'` 审计，记录模式、决定、命令摘要和审批调用 id，
方便事后回看。

## 设置入口

模式开关放在终端面板的状态栏或设置浮层里，做成三选一，并显示当前模式。它通过
attach 的一条客户端消息（例如 `guard`）发送，服务端校验只接受这三个值。agent 的
工具列表里不提供修改模式的工具；它最多只能通过状态看到当前模式。

这一条是方案里最重要的约束：如果 agent 能自己把模式改成 `off`，拦截就只是装饰。

## 与只读和隔离的关系

三档访问级别继续独立生效，优先级不变：`sealed` 拒绝一切读写，`observe` 拒绝写入，
`collaborate` 才轮到命令拦截。也就是说，只读档下不会出现审批请求，因为写入在更早
的位置就被拒绝了。

## 测试

- 分类器单测：命中与不命中的典型命令，多行文本按整段判断。
- `off` 模式：agent 写入直接到达 PTY，不调用审批。
- `risky` 模式：普通命令不审批；危险命令在没有审批服务时被拒绝。
- `strict` 模式：每个 `terminal_send` 都审批，`terminal_key` 也审批。
- 审批结果映射：allow、reject、cancel、unavailable 四条路径各自返回正确错误码。
- 人输入不被拦截：`origin: 'human'` 的写入不经过工具层。
- 模式不可被工具修改：工具列表里没有对应工具，attach 的 `guard` 消息只接受合法值。
- 审批期间租约被抢走后写入失败，且不重试。

## 实施顺序

1. 会话加 `guard` 字段，状态广播，面板加三选一开关。
2. 危险命令分类器和 `terminal_send` 的检查，接入 `ctx.approval`。
3. 审计条目和错误码，补齐单测。
4. 更新 README 和设计文档，说明默认值和 `risky` 的边界。

## 未决问题

- 无人值守部署里审批无法到达人，`risky` 模式会失败关闭。是否允许配置
  `approvalUnavailable: 'deny' | 'allow'`，需要明确决定；方案倾向只允许 `deny`。
- 审批等待期间命令没有发出去，人可能已经开始输入；恢复写入前必须重新检查租约。
- 多行粘贴按一整段检查，可能误报，也可能漏报拆分后的命令；`strict` 是兜底。
- 是否要给 `strict` 加“本次会话内允许同一条命令”的临时放行，避免重复确认，留给
  后续迭代。
