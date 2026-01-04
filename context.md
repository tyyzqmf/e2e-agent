在 @anthropic-ai/claude-agent-sdk 中，query 方法的行为和错误原因需要从它的设计定位来理解。
简短的回答是：query 方法本身通常不会自动执行跨会话的上下文压缩（Compaction），它更倾向于执行单次任务。

以下是导致你频繁遇到 400 Input is too long 错误的核心原因以及解决方案：

## 1. 为什么 query 会报错？
query 方法在 SDK 中的定位通常是 “Stateless”（无状态） 或 “New Session”（新会话） 模式。

- 重复累积： 如果你在循环中不断调用 query 并手动将之前的对话历史塞进 prompt 或 options 中，SDK 会把这些内容原封不动地发给 API。由于 API 限制了单次请求的最大 Token 数（Input + Expected Output < Max Window），一旦历史记录过长，就会触发 400 错误。
- Tool Output 过大： Claude Agent SDK 经常配合 bash、read_file 等工具使用。如果 Claude 调用工具读取了一个巨大的日志文件或代码库，这些内容会被直接填充进当前的上下文。
- Max Tokens 限制： 在某些平台（如 AWS Bedrock），如果你设置的 max_tokens（输出限制）很大，API 会预留这部分空间。如果 Input + max_tokens 超过了模型上限，也会报错。

## 2. query vs. ClaudeSDKClient (或 Session 模式)

在 Anthropic SDK 的架构中，上下文管理通常分为两个层级：
模式,是否自动压缩,适用场景
query() 方法,否,单次、独立的任务。每次调用通常开启一个干净的新环境。
ClaudeSDKClient (Session),是 (有条件),多轮对话、复杂 Agent 任务。它会维护一个 Session，并支持**挂钩（Hooks）**来实现压缩。

## 3. 如何解决 400 错误？
### 方法 A：改用 Session 模式（推荐）
如果你需要多轮对话，不应反复调用 query，而应使用 SDK 提供的 ClaudeSDKClient（或类似 Session 对象）。

```
// 伪代码示例
const client = new ClaudeSDKClient(options);
const session = await client.createSession();

// 在同一个 session 中进行对话，SDK 会尝试通过内部机制或提示用户进行 /compact
await session.query("第一轮指令");
await session.query("基于上一轮的跟进"); 
```

### 方法 B：手动触发压缩指令

如果你在使用类似 Claude Code 的底层逻辑，SDK 允许你发送特定的控制指令。当发现上下文过长（可以通过查看 message.usage 获知）时，发送 /compact 字符串给 Agent，这会触发 SDK 内部的“总结并清理”逻辑。

### 方法 C：精简工具输出（Context Engineering）

这是最有效的手段。不要让 Agent 一次性读取整个文件：限制读取范围： 使用 grep 或 tail 而不是 cat 整个文件。分段处理： 如果是分析长文档，改用 RAG（检索增强生成）模式，只将相关片段放入上下文。

### 方法 D：配置 max_tokens检查你的 ClaudeAgentOptions。

如果 max_tokens 设置得过高（例如 4096 或更高），尝试将其调低（例如 1024），为输入 Token 腾出更多空间。