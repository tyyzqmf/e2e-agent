# Bun 特性优化分析报告

> 分析日期: 2026-01-07
> 项目: e2e-agent
> 分析目标: 评估项目对 Bun 原生特性的使用情况及优化潜力

## 当前使用情况总览

| Bun 特性 | 当前状态 | 优化潜力 |
|---------|---------|---------|
| `bun:sqlite` | ✅ **已完全采用** | — |
| `Bun.$` (Shell 语法) | ❌ 未使用 | 🟡 中等 |
| `bun build --compile` | ❌ 未实现 | 🔴 **高** |
| WebSocket 原生支持 | ❌ 未实现 | 🔴 **高** |
| `Bun.file()` 惰性 I/O | ⚠️ 部分使用 | 🟡 中等 |

---

## 1. `bun:sqlite` — ✅ 已完全采用（无需优化）

### 当前实现

**文件位置**: `src/cli/services/job.ts:7`

```typescript
import { Database } from "bun:sqlite";
```

### 实现亮点

项目已经很好地利用了这个特性：

- **WAL 模式**: 启用 Write-Ahead Logging 提升并发性能
- **事务处理**: 使用 `db.transaction()` 保证数据一致性
- **完整的作业队列**: 实现了 jobs 和 queue 两张表的管理
- **索引优化**: 为 status 和 created_at 字段创建了索引

### 代码示例

```typescript
// WAL 模式启用
this.db.exec("PRAGMA journal_mode = WAL");

// 事务使用
const transaction = this.db.transaction(() => {
    this.db.prepare(`INSERT INTO jobs ...`).run({ ... });
    this.db.prepare(`INSERT INTO queue ...`).run({ ... });
});
transaction();
```

### 结论

这部分已经是最佳实践，**无需改进**。

---

## 2. `Bun.$` (Shell 脚本式编程) — 🟡 中等优化潜力

### 当前实现

**文件位置**: `src/cli/services/executor.ts:351-359`

项目使用 `Bun.spawn()` 执行系统命令：

```typescript
// 当前代码 - 清理 chrome-devtools-mcp 进程
const cleanup = spawn({
    cmd: ["pkill", "-f", "chrome-devtools-mcp"],
    stdout: "ignore",
    stderr: "ignore",
});
await cleanup.exited;
```

### 优化方案

使用 `Bun.$` 可以简化某些一次性命令：

```typescript
import { $ } from "bun";

// 更简洁的写法
await $`pkill -f chrome-devtools-mcp`.quiet();

// 环境清理
await $`rm -rf ./test-results/*`;

// 获取版本信息
const version = await $`google-chrome --version`.text();

// 条件执行
const chromeExists = await $`which google-chrome`.quiet().exitCode === 0;
```

### 评估

| 优点 | 缺点 |
|-----|-----|
| 代码更简洁直观 | 当前 spawn 实现已很健壮 |
| 类似 Shell 的链式操作 | 不支持复杂的流处理 |
| 内置错误处理 | 主要适用于一次性命令 |

### 结论

当前 `spawn` 实现支持流式输出、超时控制、进程管理等高级功能，`Bun.$` 主要简化简单命令，**优化收益有限**。

---

## 3. `bun build --compile` — 🔴 **高优化潜力**

### 当前状态

用户使用本项目需要：

1. 安装 Bun 运行时
2. 克隆代码仓库
3. 运行 `bun install` 安装依赖
4. 使用 `./e2e` 命令执行

这对于非开发人员（如 QA 测试人员）存在较高门槛。

### 优化方案

#### 添加构建脚本

**修改 `package.json`**:

```json
{
  "scripts": {
    "build": "bun run build:linux && bun run build:macos && bun run build:windows",
    "build:linux": "bun build --compile --target=bun-linux-x64 ./e2e.ts --outfile dist/e2e-linux",
    "build:linux-arm": "bun build --compile --target=bun-linux-arm64 ./e2e.ts --outfile dist/e2e-linux-arm64",
    "build:macos": "bun build --compile --target=bun-darwin-arm64 ./e2e.ts --outfile dist/e2e-macos",
    "build:macos-x64": "bun build --compile --target=bun-darwin-x64 ./e2e.ts --outfile dist/e2e-macos-x64",
    "build:windows": "bun build --compile --target=bun-windows-x64 ./e2e.ts --outfile dist/e2e.exe"
  }
}
```

#### GitHub Actions 自动发布

```yaml
# .github/workflows/release.yml
name: Build and Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: ubuntu-latest
            target: bun-linux-x64
            artifact: e2e-linux
          - os: macos-latest
            target: bun-darwin-arm64
            artifact: e2e-macos
          - os: windows-latest
            target: bun-windows-x64
            artifact: e2e.exe

    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun build --compile --target=${{ matrix.target }} ./e2e.ts --outfile dist/${{ matrix.artifact }}
      - uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.artifact }}
          path: dist/${{ matrix.artifact }}
```

### 预期收益

| 收益 | 描述 |
|-----|-----|
| **零依赖分发** | 用户下载即用，无需安装 Bun/Node.js |
| **企业友好** | 便于内部工具推广 |
| **版本管理** | 通过 GitHub Releases 分发稳定版本 |
| **跨平台** | 支持 Linux/macOS/Windows |

### 注意事项

- 可执行文件大小约 50-100MB（包含 Bun 运行时）
- 需要确保所有依赖都能被正确打包
- 动态导入可能需要特殊处理

---

## 4. 原生 WebSocket 支持 — 🔴 **高优化潜力**

### 当前状态

Web UI 通过 HTTP 轮询获取日志和状态：

- `GET /api/jobs/:id/logs` — 前端需要定时轮询
- `GET /api/jobs/:id` — 获取任务状态需要轮询
- 无法实时看到 Agent 的"思考过程"

### 优化方案

#### 修改服务器入口

**文件**: `src/server/index.ts`

```typescript
import type { ServerWebSocket } from "bun";

interface WebSocketData {
  jobId: string;
  type: "logs" | "status";
}

const server = Bun.serve<WebSocketData>({
  port: config.PORT,
  hostname: config.HOST,
  fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket 升级处理
    if (url.pathname === "/ws/jobs") {
      const jobId = url.searchParams.get("jobId");
      const type = url.searchParams.get("type") as "logs" | "status";

      const success = server.upgrade(req, {
        data: { jobId, type }
      });

      if (success) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // 其他 HTTP 请求处理
    return requestHandler(req);
  },
  websocket: {
    open(ws) {
      const { jobId, type } = ws.data;
      ws.subscribe(`job:${jobId}:${type}`);
      logger.info(`WebSocket connected: job=${jobId}, type=${type}`);
    },
    message(ws, message) {
      // 处理客户端消息（如心跳）
      if (message === "ping") {
        ws.send("pong");
      }
    },
    close(ws) {
      const { jobId, type } = ws.data;
      ws.unsubscribe(`job:${jobId}:${type}`);
      logger.info(`WebSocket disconnected: job=${jobId}`);
    }
  }
});

// 导出 server 实例供其他模块使用
export { server };
```

#### 添加日志广播服务

**新建文件**: `src/server/services/LogBroadcaster.ts`

```typescript
import { server } from "../index.ts";

export class LogBroadcaster {
  /**
   * 广播日志行到所有订阅的客户端
   */
  static broadcastLog(jobId: string, logLine: string): void {
    server.publish(`job:${jobId}:logs`, JSON.stringify({
      type: "log",
      timestamp: new Date().toISOString(),
      content: logLine
    }));
  }

  /**
   * 广播状态更新
   */
  static broadcastStatus(jobId: string, status: string, progress?: object): void {
    server.publish(`job:${jobId}:status`, JSON.stringify({
      type: "status",
      timestamp: new Date().toISOString(),
      status,
      progress
    }));
  }
}
```

#### 前端连接示例

```javascript
// 前端 JavaScript
const ws = new WebSocket(`ws://${location.host}/ws/jobs?jobId=${jobId}&type=logs`);

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === "log") {
    appendLog(data.content);
  } else if (data.type === "status") {
    updateStatus(data.status);
  }
};

ws.onclose = () => {
  // 自动重连逻辑
  setTimeout(() => reconnect(), 3000);
};
```

### 预期收益

| 收益 | 描述 |
|-----|-----|
| **实时日志流** | 无延迟看到执行日志 |
| **实时状态更新** | queued → running → completed 即时反馈 |
| **Agent 思维链展示** | 实时展示 AI 的推理过程 |
| **降低服务器压力** | 不再需要高频轮询 |
| **更好的用户体验** | 类似 CI/CD 工具的实时日志体验 |

### 兼容性考虑

建议保留现有 HTTP API 作为 fallback：

```typescript
// 检测 WebSocket 支持
if ("WebSocket" in window) {
  useWebSocket();
} else {
  usePolling(); // 降级到轮询
}
```

---

## 5. `Bun.file()` 惰性 I/O — 🟡 中等优化潜力

### 当前状态

#### 已使用 `Bun.file()` 的位置

| 文件 | 用途 |
|-----|-----|
| `src/server/routes/api.ts:252` | 返回截图文件 |
| `src/server/routes/api.ts:309` | 返回 HTML 报告 |
| `src/server/routes/api.ts:356` | 返回 ZIP 下载 |
| `src/server/routes/api.ts:465` | 返回模板文件 |
| `src/server/routes/static.ts:128` | 返回静态模板 |
| `src/server/routes/static.ts:169` | 返回静态文件 |

#### 仍使用 Node.js fs 的位置

| 文件 | fs 调用次数 | 主要用途 |
|-----|-----------|---------|
| `src/cli/services/job.ts` | ~15 | 读取 test spec、统计信息 |
| `src/cli/services/executor.ts` | ~10 | 日志流写入、文件检查 |
| `src/server/services/ResultService.ts` | ~20 | 读取 JSON 配置、日志 |
| `src/agent/services/*.ts` | ~30 | 各种配置读写 |

### 优化方案

#### 可优化：JSON 文件读取

**当前代码** (`src/server/services/ResultService.ts:168`):

```typescript
import { readFileSync } from "node:fs";

const content = readFileSync(statsPath, "utf-8");
const data = JSON.parse(content);
```

**优化后**:

```typescript
const file = Bun.file(statsPath);
const data = await file.json();
```

#### 可优化：文件存在检查

**当前代码**:

```typescript
import { existsSync } from "node:fs";

if (existsSync(statsPath)) {
  // ...
}
```

**优化后**:

```typescript
const file = Bun.file(statsPath);
if (await file.exists()) {
  // ...
}
```

#### 可优化：文件写入

**当前代码**:

```typescript
import { writeFileSync } from "node:fs";

writeFileSync(testSpecFile, testSpecContent, "utf-8");
```

**优化后**:

```typescript
await Bun.write(testSpecFile, testSpecContent);
```

### 不可直接优化的场景

| 场景 | 原因 |
|-----|-----|
| `createWriteStream` | 日志流式写入需要 Node.js Stream API |
| 同步文件操作 | 部分代码依赖同步行为 |
| `readdirSync` | Bun 没有直接替代 |

### 优化收益评估

| 指标 | 预期改善 |
|-----|---------|
| 内存占用 | 降低（惰性加载） |
| 大文件处理 | 提升（零拷贝传输） |
| 代码简洁度 | 提升（更少的样板代码） |

---

## 优化建议优先级

| 优先级 | 优化项 | 预期收益 | 实施难度 | 建议时间 |
|-------|-------|---------|---------|---------|
| **P0** | WebSocket 实时日志 | 用户体验大幅提升 | 中等 | 2-3 天 |
| **P1** | 单文件可执行程序打包 | 分发体验大幅提升 | 低 | 1 天 |
| **P2** | `Bun.file()` JSON 读取 | 性能微提升、代码简化 | 低 | 1 天 |
| **P3** | `Bun.$` 简化命令 | 代码简洁度 | 低 | 0.5 天 |

---

## 实施建议

### 阶段一：快速收益（1-2 天）

1. 添加 `bun build --compile` 脚本
2. 配置 GitHub Actions 自动构建发布
3. 更新 README 添加下载链接

### 阶段二：用户体验提升（2-3 天）

1. 实现 WebSocket 服务端支持
2. 添加日志广播服务
3. 更新前端使用 WebSocket
4. 保留 HTTP API 作为 fallback

### 阶段三：代码优化（1-2 天）

1. 将 `readFileSync` + `JSON.parse` 替换为 `Bun.file().json()`
2. 将 `writeFileSync` 替换为 `Bun.write()`
3. 将部分 `existsSync` 替换为异步检查
4. 简化部分 shell 命令为 `Bun.$`

### 测试覆盖

项目已有完善的测试套件（`src/**/__tests__/`），优化时应确保：

- 所有现有测试通过
- 为新增的 WebSocket 功能添加测试
- 测试打包后的可执行文件

---

## 附录：相关文件清单

### 需要修改的核心文件

```
src/server/index.ts              # 添加 WebSocket 支持
src/server/services/             # 添加 LogBroadcaster
src/cli/services/executor.ts     # 集成日志广播
package.json                     # 添加构建脚本
.github/workflows/release.yml    # 新增自动发布流程
```

### 可优化的文件 I/O

```
src/server/services/ResultService.ts
src/cli/services/job.ts
src/agent/services/token-usage.ts
src/agent/services/pricing.ts
src/agent/services/session-state.ts
```

---

## 参考资料

- [Bun SQLite Documentation](https://bun.sh/docs/api/sqlite)
- [Bun Shell ($) Documentation](https://bun.sh/docs/runtime/shell)
- [Bun Single-file Executable](https://bun.sh/docs/bundler/executables)
- [Bun WebSocket Server](https://bun.sh/docs/api/websockets)
- [Bun File I/O](https://bun.sh/docs/api/file-io)
