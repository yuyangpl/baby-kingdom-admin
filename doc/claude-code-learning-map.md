# Claude Code 学习图谱与最佳实践（2026）

## 学习路线图

```
Level 1 基础入门          Level 2 效率提升          Level 3 高级玩法           Level 4 团队/企业级
─────────────────       ─────────────────       ─────────────────        ─────────────────
• 安装与基本使用           • CLAUDE.md 配置         • Hooks 系统              • Agent Teams 多人协作
• 对话式编程              • 自定义 Slash Commands   • Git Worktree 并行开发    • Auto Mode 权限管理
• 文件读写/搜索           • MCP Server 集成        • Claude Agent SDK        • Headless/CI-CD 集成
• Git 操作               • Memory 记忆系统         • 多 Agent 并行工作流      • 企业权限与沙箱
• 截图/PDF 分析           • 快捷键自定义            • 自定义 Skills 开发       • 远程触发与调度
```

---

## 一、核心能力一览

| 能力 | 说明 | 学习优先级 |
|------|------|-----------|
| 对话式编码 | 自然语言描述需求，Claude 直接写代码 | ★★★★★ |
| CLAUDE.md | 项目级指令文件，每次会话自动加载 | ★★★★★ |
| MCP Server | 扩展 Claude 能力的插件系统 | ★★★★★ |
| Hooks 系统 | 12 个生命周期事件的自动化钩子 | ★★★★☆ |
| 自定义命令 | `/slash-command` 可复用工作流 | ★★★★☆ |
| Memory 系统 | 跨会话记忆，自动学习你的偏好 | ★★★☆☆ |
| Agent SDK | 编程式调用，构建自定义 Agent | ★★★☆☆ |
| Git Worktree | 隔离分支并行开发 | ★★★☆☆ |
| Headless 模式 | 无交互运行，用于 CI/CD | ★★☆☆☆ |

---

## 二、MCP Server 生态（前沿插件）

### 官方 MCP Server

```bash
# 一键安装命令
claude mcp add <name> -- npx -y <package>
```

| Server | 安装命令 | 用途 |
|--------|---------|------|
| **GitHub** | `claude mcp add github -e GITHUB_TOKEN=xxx -- npx -y @modelcontextprotocol/server-github` | Issue/PR/仓库操作 |
| **PostgreSQL** | `claude mcp add postgres -- npx -y @modelcontextprotocol/server-postgres <conn>` | 数据库查询 |
| **SQLite** | `claude mcp add sqlite -- npx -y @modelcontextprotocol/server-sqlite <path>` | 轻量数据库 |
| **Puppeteer** | `claude mcp add puppeteer -- npx -y @modelcontextprotocol/server-puppeteer` | 浏览器自动化 |
| **Brave Search** | `claude mcp add brave -e BRAVE_API_KEY=xxx -- npx -y @modelcontextprotocol/server-brave-search` | 网络搜索 |
| **Fetch** | `claude mcp add fetch -- npx -y @modelcontextprotocol/server-fetch` | HTTP 请求/网页抓取 |
| **Memory** | `claude mcp add memory -- npx -y @modelcontextprotocol/server-memory` | 持久化知识图谱 |
| **Slack** | `claude mcp add slack -e SLACK_TOKEN=xxx -- npx -y @modelcontextprotocol/server-slack` | Slack 消息读写 |
| **Google Maps** | `claude mcp add maps -e GOOGLE_MAPS_KEY=xxx -- npx -y @modelcontextprotocol/server-google-maps` | 地图服务 |
| **Sequential Thinking** | `claude mcp add thinking -- npx -y @modelcontextprotocol/server-sequential-thinking` | 分步推理增强 |

### 社区热门 MCP Server

#### 浏览器与调试
| Server | 用途 | 推荐指数 |
|--------|------|---------|
| **Playwright MCP** | 浏览器自动化测试与截图 | ★★★★★ |
| **Browsertools MCP** | Chrome DevTools 桥接（Console/Network/DOM） | ★★★★★ |
| **Firecrawl MCP** | 网页爬虫与结构化数据提取 | ★★★★☆ |
| **Browserbase MCP** | 云端浏览器会话 | ★★★☆☆ |

#### 数据库
| Server | 用途 | 推荐指数 |
|--------|------|---------|
| **MongoDB MCP** | MongoDB 操作 | ★★★★★ |
| **Redis MCP** | Redis 缓存操作 | ★★★★☆ |
| **Supabase MCP** | Supabase 全栈（Postgres + Auth + Storage） | ★★★★☆ |
| **BigQuery MCP** | Google BigQuery 数据分析 | ★★★☆☆ |

#### 设计工具
| Server | 用途 | 推荐指数 |
|--------|------|---------|
| **Figma MCP** | 读取/创建 Figma 设计 | ★★★★★ |
| **Framelink Figma MCP** | Figma 设计转代码 | ★★★★☆ |

#### DevOps & 云服务
| Server | 用途 | 推荐指数 |
|--------|------|---------|
| **Docker MCP** | 容器管理 | ★★★★☆ |
| **Kubernetes MCP** | K8s 集群操作 | ★★★☆☆ |
| **AWS MCP** | AWS 服务集成 | ★★★☆☆ |
| **Vercel MCP** | Vercel 部署管理 | ★★★★☆ |
| **Cloudflare MCP** | Workers/DNS/Pages | ★★★☆☆ |
| **Terraform MCP** | 基础设施即代码 | ★★★☆☆ |

#### 项目管理 & 协作
| Server | 用途 | 推荐指数 |
|--------|------|---------|
| **Linear MCP** | Linear 项目管理 | ★★★★☆ |
| **Notion MCP** | Notion 文档与数据库 | ★★★★☆ |
| **Confluence MCP** | Confluence 知识库 | ★★★☆☆ |
| **Sentry MCP** | 错误监控与追踪 | ★★★★★ |

#### AI 与知识
| Server | 用途 | 推荐指数 |
|--------|------|---------|
| **Context7 MCP** | 库文档实时查询 | ★★★★★ |
| **Exa MCP** | AI 驱动的语义搜索 | ★★★★☆ |
| **RAG MCP** | 本地文档 RAG 检索 | ★★★★☆ |
| **HuggingFace MCP** | 模型与数据集 | ★★★☆☆ |

### MCP 发现平台

| 平台 | 地址 | 说明 |
|------|------|------|
| **官方仓库** | github.com/modelcontextprotocol/servers | Anthropic 官方维护 |
| **Smithery** | smithery.ai | MCP 市场，可一键安装 |
| **mcp.run** | mcp.run | MCP 发现与运行平台 |
| **Glama** | glama.ai/mcp/servers | MCP 目录与评分 |
| **Awesome MCP** | github.com/punkpeye/awesome-mcp-servers | 社区精选列表 |
| **Awesome Claude Code** | github.com/hesreallyhim/awesome-claude-code | Claude Code 资源合集 |

---

## 三、CLAUDE.md 最佳实践

### 核心原则

- 控制在 **200 行以内**，过长会被忽略
- 写「Claude 不知道会犯错」的内容，不写代码里能推断的
- 用于指导，不用于强制（强制用 Hooks）

### 推荐结构

```markdown
# CLAUDE.md

## 项目概述
一句话描述项目是什么。

## 技术栈
- 前端: Vue 3 + Ant Design Vue
- 后端: Node.js + Express
- 数据库: MongoDB

## 常用命令
- `npm run dev` — 启动开发服务器
- `npm run test` — 运行测试
- `npm run lint` — 代码检查
- `npm run build` — 构建生产版本

## 代码规范
- 使用 TypeScript，严格模式
- 组件用 PascalCase，工具函数用 camelCase
- API 路由用 kebab-case
- 测试文件放在 __tests__ 目录

## 架构要点
- src/api/ — 后端路由
- src/components/ — 前端组件
- src/store/ — 状态管理
- src/utils/ — 工具函数

## 注意事项
- 不要修改 src/config/production.ts，部署用
- 数据库迁移必须向后兼容
- API 响应格式统一用 { code, data, message }
```

### 多级 CLAUDE.md 策略

```
project/
├── CLAUDE.md              # 全局规范
├── frontend/
│   └── CLAUDE.md          # 前端特定规范
├── backend/
│   └── CLAUDE.md          # 后端特定规范
└── infra/
    └── CLAUDE.md          # 基础设施规范
```

---

## 四、Hooks 系统（12 个生命周期事件）

### 事件总览

```
SessionStart → UserPromptSubmit → PreToolUse → [工具执行] → PostToolUse → Stop → SessionEnd
                                      ↓ (失败)
                                 PostToolUseFailure
```

| 事件 | 触发时机 | 能否阻止 | 典型用途 |
|------|---------|---------|---------|
| `SessionStart` | 会话开始 | 否 | 加载上下文、初始化环境 |
| `UserPromptSubmit` | 用户提交消息 | 否 | 输入校验、日志记录 |
| `PreToolUse` | 工具执行前 | **是 (exit 2)** | 权限控制、代码格式化检查 |
| `PostToolUse` | 工具执行成功后 | 否 | 自动格式化、通知、日志 |
| `PostToolUseFailure` | 工具执行失败后 | 否 | 错误报告 |
| `Stop` | Claude 完成响应 | 否 | 结果校验、自动提交 |
| `Notification` | 通知发送时 | 否 | 转发到 Slack/邮件 |
| `SubagentStart` | 子 Agent 启动 | 否 | 监控、资源分配 |
| `SubagentStop` | 子 Agent 完成 | 否 | 结果收集 |
| `PreCompact` | 上下文压缩前 | 否 | 保存关键信息 |
| `PermissionRequest` | 请求权限时 | 否 | 自定义权限策略 |

### 实用 Hook 配置示例

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "npx prettier --write \"$CLAUDE_TOOL_INPUT_FILE_PATH\" 2>/dev/null || true"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "echo \"$CLAUDE_TOOL_INPUT\" | grep -qE 'rm -rf|drop table|git push --force' && exit 2 || exit 0"
          }
        ]
      }
    ]
  }
}
```

---

## 五、自定义 Slash Commands / Skills

### 创建方式

```bash
# 项目级命令
mkdir -p .claude/commands
echo '根据 git diff 生成中文 commit message' > .claude/commands/cn-commit.md

# 全局命令
mkdir -p ~/.claude/commands
echo '检查代码安全漏洞' > ~/.claude/commands/security-check.md
```

### 使用

```bash
# 在 Claude Code 中输入
> /cn-commit
> /security-check
```

### 进阶：带参数的 Skill

```markdown
---
name: review
description: 代码审查，检查常见问题
---

# 代码审查 Skill

请对当前改动进行审查，重点检查：
1. 安全漏洞（注入、XSS、敏感信息泄露）
2. 性能问题（N+1 查询、内存泄漏）
3. 错误处理（边界情况、异常捕获）
4. 代码风格（命名、结构、可读性）

输出格式：
- 🔴 严重问题
- 🟡 建议改进
- 🟢 做得好的地方
```

---

## 六、Memory 记忆系统

### 三层架构

```
┌─────────────────────────────┐
│  Layer 1: CLAUDE.md         │  你手动写的项目规范（每次加载）
├─────────────────────────────┤
│  Layer 2: Auto Memory       │  Claude 自动学习你的偏好和习惯
├─────────────────────────────┤
│  Layer 3: AutoDream         │  会话结束后自动整理和优化记忆
└─────────────────────────────┘
```

### Auto Memory 会记住什么

- 你的编码风格偏好
- 常用的调试方法
- 项目架构决策
- 你纠正过的错误做法
- 你确认过的好做法

### 手动管理

```bash
# 让 Claude 记住某件事
> 记住：这个项目的 API 文档在 Notion 的 "API Spec" 页面

# 让 Claude 忘记某件事
> 忘记关于 API 文档位置的记忆

# 查看记忆
> 你记得关于这个项目的哪些信息？
```

---

## 七、Agent SDK（编程式使用）

### 安装

```bash
# Python
pip install claude-agent-sdk

# TypeScript
npm install @anthropic-ai/agent-sdk
```

### 基本用法（Python）

```python
from claude_agent_sdk import Agent

agent = Agent()
result = agent.run("分析 src/ 目录下的代码结构")
print(result)
```

### 自定义工具

```python
from claude_agent_sdk import Agent, tool

@tool("query_users", "查询用户列表", {"status": str})
async def query_users(status: str):
    # 你的业务逻辑
    return [{"name": "Alice", "status": status}]

agent = Agent(tools=[query_users])
result = agent.run("查询所有活跃用户")
```

### 典型应用场景

- 自动化代码审查 Pipeline
- 批量代码迁移/重构
- 自定义 CI/CD 检查
- 构建领域专用 AI 助手

---

## 八、Git Worktree 并行开发

### 原理

```
main repo (你的工作目录)
├── worktree-1 (Agent A: 开发功能 A)
├── worktree-2 (Agent B: 修复 Bug B)
└── worktree-3 (Agent C: 写测试)
```

每个 Worktree 是独立的工作目录，共享同一个 Git 历史，互不干扰。

### 使用方式

```bash
# 在 Claude Code 中
> 用 3 个并行 agent 分别完成：
> 1. 实现用户列表页面
> 2. 实现用户详情页面
> 3. 编写用户模块的单元测试
> 每个 agent 使用独立的 worktree
```

---

## 九、Headless 模式（CI/CD 集成）

### 基本用法

```bash
# 非交互运行
claude -p "检查代码中的安全漏洞并输出报告"

# 从文件读取提示
claude -p "$(cat prompt.md)"

# 继续之前的会话
claude -p "继续修复剩余问题" --resume
```

### GitHub Actions 集成

```yaml
name: Code Review
on: [pull_request]
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Claude Code Review
        run: |
          npx claude -p "审查这个 PR 的改动，检查安全和性能问题"
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

---

## 十、权限管理

### 6 种权限模式

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| **default** | 危险操作需确认 | 日常开发 |
| **plan** | 只读，不做任何修改 | 代码分析、学习 |
| **auto** | AI 自动分类安全/危险 | 高级用户（需 Team 计划） |
| **dontAsk** | 只执行明确允许的工具 | CI/CD |
| **bypassPermissions** | 关闭所有检查 | 隔离容器/VM |

### 权限规则配置

```json
{
  "permissions": {
    "allow": [
      "Read",
      "Glob",
      "Grep",
      "Bash(npm run *)",
      "Bash(node *)"
    ],
    "deny": [
      "Bash(rm -rf *)",
      "Bash(git push --force *)"
    ]
  }
}
```

---

## 十一、最佳实践方案

### 日常开发黄金配置

```json
// .claude/settings.json — 推荐每个项目都配
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@anthropic-ai/mcp-server-playwright"]
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-server-context7"]
    }
  },
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "npx prettier --write \"$CLAUDE_TOOL_INPUT_FILE_PATH\" 2>/dev/null || true"
          }
        ]
      }
    ]
  }
}
```

### 按项目类型推荐的 MCP 组合

#### 全栈 Web 项目（如本项目 Baby Kingdom Admin）

```bash
claude mcp add playwright -- npx @anthropic-ai/mcp-server-playwright     # 浏览器调试
claude mcp add context7 -- npx -y @anthropic-ai/mcp-server-context7      # 文档查询
claude mcp add mongo -- npx -y mcp-server-mongo                          # MongoDB
claude mcp add figma -e FIGMA_TOKEN=xxx -- npx -y mcp-server-figma       # 设计稿
```

#### 前端项目

```bash
claude mcp add playwright    # 浏览器调试与截图
claude mcp add figma         # 设计稿参考
claude mcp add context7      # 框架文档查询
```

#### 后端 API 项目

```bash
claude mcp add postgres/mongo/sqlite   # 数据库
claude mcp add sentry                  # 错误监控
claude mcp add fetch                   # API 测试
```

#### DevOps 项目

```bash
claude mcp add docker        # 容器管理
claude mcp add kubernetes    # K8s 操作
claude mcp add terraform     # IaC
claude mcp add cloudflare    # 云服务
```

### Token 节省技巧

| 技巧 | 节省效果 | 说明 |
|------|---------|------|
| 精简 CLAUDE.md | 20-30% | 过长的 CLAUDE.md 每次会话都消耗 token |
| 避免不必要的截图 | 30-50% | 一张图 = 1000-3000 tokens，优先用文本 |
| 用 Grep/Glob 代替全文读取 | 10-20% | 精准搜索而非读整个文件 |
| 拆分大任务为小任务 | 15-25% | 避免上下文过长导致重复传输 |
| 善用 `/compact` | 10-15% | 主动压缩上下文 |
| Headless 模式跳过交互 | 5-10% | 减少来回确认的 token |

---

## 十二、学习资源

| 资源 | 地址 | 说明 |
|------|------|------|
| 官方文档 | code.claude.com/docs | 最权威的参考 |
| API 文档 | platform.claude.com/docs | Agent SDK 与 API |
| 官方 GitHub | github.com/anthropics/claude-code | 源码与 Issue |
| MCP 协议规范 | modelcontextprotocol.io | MCP 协议详解 |
| MCP 官方仓库 | github.com/modelcontextprotocol/servers | 官方 Server 列表 |
| Awesome Claude Code | github.com/hesreallyhim/awesome-claude-code | 社区资源合集 |
| Awesome MCP | github.com/punkpeye/awesome-mcp-servers | MCP Server 大全 |
| Smithery | smithery.ai | MCP 插件市场 |
| Glama | glama.ai/mcp/servers | MCP 目录与评分 |
| Changelog | code.claude.com/docs/en/changelog | 版本更新记录 |

---

## 快速上手检查清单

```
□ 安装 Claude Code
□ 在项目根目录创建 CLAUDE.md
□ 安装 1-2 个核心 MCP Server（推荐 Playwright + Context7）
□ 创建 2-3 个常用的自定义命令（/review, /commit 等）
□ 配置 PostToolUse Hook 自动格式化代码
□ 学会用 Memory 让 Claude 记住你的偏好
□ 尝试 Headless 模式集成到 CI/CD
□ 探索 Agent SDK 构建自定义工具
```
