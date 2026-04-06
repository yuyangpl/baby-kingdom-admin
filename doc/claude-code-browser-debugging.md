# 让 Claude Code 通过浏览器页面进行调试

## 核心原理

Claude Code 本身无法"看到"浏览器，但可以通过以下方式获取浏览器信息：

```
浏览器页面 → 中间桥梁 → Claude Code 分析 → 修改代码 → 浏览器热更新
```

---

## 方法一：Playwright MCP Server（推荐）

让 Claude Code 直接控制浏览器，实现自动化浏览、截图、交互和调试。

### 1. 安装

```bash
npm install -g @anthropic-ai/mcp-server-playwright
```

### 2. 配置 MCP

在项目根目录创建或编辑 `.claude/settings.json`：

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@anthropic-ai/mcp-server-playwright"]
    }
  }
}
```

### 3. 使用方式

```bash
# 打开页面并截图
> 用浏览器打开 http://localhost:3000，截图给我看看页面效果

# 交互调试
> 打开 http://localhost:3000/login，输入用户名 admin，密码 123456，点击登录，截图看结果

# 检查页面问题
> 浏览 http://localhost:3000/dashboard，检查是否有 console 错误，截图当前页面状态

# 逐页检查
> 依次打开以下页面并截图，列出所有视觉问题：
> - /dashboard
> - /users
> - /settings
```

### 4. Claude Code 能做什么

| 能力 | 说明 |
|------|------|
| 打开 URL | 导航到指定页面 |
| 截图 | 获取页面截图并分析 |
| 点击/输入 | 模拟用户操作 |
| 读取 DOM | 获取元素内容和结构 |
| 执行 JS | 在页面中运行 JavaScript |
| Console 日志 | 捕获浏览器控制台输出 |
| 网络请求 | 监控 API 调用和响应 |

---

## 方法二：Chrome DevTools MCP

通过 Chrome DevTools Protocol 连接正在运行的 Chrome 浏览器。

### 1. 启动 Chrome（开启调试端口）

```bash
# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

# 或使用已有 Chrome，在终端启动
open -a "Google Chrome" --args --remote-debugging-port=9222
```

### 2. 安装 MCP Server

```bash
npm install -g chrome-devtools-mcp-server
```

### 3. 配置

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["chrome-devtools-mcp-server"],
      "env": {
        "CDP_URL": "http://localhost:9222"
      }
    }
  }
}
```

### 4. 使用方式

```bash
# 获取当前页面信息
> 连接到 Chrome，获取当前打开页面的 DOM 结构和 console 日志

# 实时调试
> 检查当前页面的网络请求，找出失败的 API 调用

# 性能分析
> 分析当前页面的性能指标，找出渲染瓶颈
```

**优势**：可以调试你正在手动操作的浏览器页面，而不是另开一个。

---

## 方法三：截图 + 粘贴给 Claude Code

最简单直接的方式，不需要任何配置。

### 使用方式

```bash
# 1. 手动截图保存到文件
# macOS: Cmd+Shift+4 截取区域，保存到桌面

# 2. 让 Claude Code 读取截图
> 看一下这个截图 /Users/yourname/Desktop/screenshot.png，页面有什么问题？

# 3. 或者直接拖拽图片到终端（部分终端支持）
```

### 配合浏览器 DevTools 导出

```bash
# 1. 在 Chrome DevTools 中右键 Console → Save as → console-output.log
# 2. 让 Claude Code 分析
> 分析这个浏览器控制台日志 ./console-output.log，找出错误原因

# 1. 在 Network 面板导出 HAR 文件
# 2. 让 Claude Code 分析
> 分析这个 HAR 文件 ./network.har，找出失败的请求
```

---

## 方法四：Browsertools MCP

专为 Claude Code 调试设计的浏览器工具。

### 1. 安装

```bash
npm install -g @anthropic-ai/mcp-server-browsertools
```

### 2. 安装 Chrome 扩展

安装配套的 Chrome 扩展（BrowserTools Connector），用于桥接 Chrome 和 MCP Server。

### 3. 配置

```json
{
  "mcpServers": {
    "browsertools": {
      "command": "npx",
      "args": ["@anthropic-ai/mcp-server-browsertools"]
    }
  }
}
```

### 4. 能力

- 实时获取 Console 日志（errors、warnings、info）
- 读取 Network 面板请求/响应
- 获取页面截图
- 读取选中元素的 CSS 样式
- 获取页面可访问性树（Accessibility Tree）
- 执行 JavaScript 代码

---

## 方法五：开发服务器日志 + 错误监控

不依赖浏览器连接，通过服务端日志辅助调试。

### 1. 在终端中运行开发服务器

```bash
# 在 Claude Code 中直接运行
> 运行 npm run dev，保持服务器开启
```

### 2. 添加前端错误上报

让 Claude Code 在项目中添加简单的错误收集：

```javascript
// src/utils/error-reporter.js
window.onerror = function(msg, url, line, col, error) {
  fetch('/api/debug/error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msg, url, line, col, stack: error?.stack })
  })
}
```

### 3. 后端接收并写入日志文件

```javascript
// 开发环境调试接口
app.post('/api/debug/error', (req, res) => {
  const fs = require('fs')
  fs.appendFileSync('debug-errors.log', JSON.stringify(req.body) + '\n')
  res.sendStatus(200)
})
```

### 4. Claude Code 读取日志调试

```bash
> 读取 debug-errors.log，分析前端报错并修复
```

---

## 推荐工作流（本项目适用）

针对 Baby Kingdom Admin 后台项目，推荐组合使用：

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  ┌─────────────┐    ┌──────────────┐                │
│  │ Playwright   │    │ 手动截图      │                │
│  │ MCP Server   │    │ 粘贴分析      │                │
│  │ (自动化调试)  │    │ (快速反馈)    │                │
│  └──────┬──────┘    └──────┬───────┘                │
│         │                  │                         │
│         ▼                  ▼                         │
│  ┌─────────────────────────────────┐                │
│  │      Claude Code 分析问题       │                │
│  └──────────────┬──────────────────┘                │
│                 │                                    │
│                 ▼                                    │
│  ┌─────────────────────────────────┐                │
│  │    修改代码 → 热更新 → 验证     │                │
│  └─────────────────────────────────┘                │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 典型调试场景

```bash
# 场景 1：页面样式问题
> 用浏览器打开 http://localhost:3000/dashboard，截图。
> 侧边栏的宽度不对，应该是 240px，帮我修复。

# 场景 2：接口报错
> 打开 http://localhost:3000/users，点击"新增用户"按钮，
> 填写表单并提交，查看网络请求是否成功，截图结果。

# 场景 3：批量页面检查
> 依次打开以下页面，截图并列出所有问题：
> 1. /login - 检查表单布局
> 2. /dashboard - 检查数据卡片
> 3. /users - 检查表格分页
> 4. /settings - 检查表单验证

# 场景 4：响应式检查
> 分别用 1920x1080 和 768x1024 的视口打开 /dashboard，
> 截图对比，找出响应式布局问题。

# 场景 5：持续调试循环
> 打开 http://localhost:3000/users，
> 当前表格没有加载数据，查看 console 和 network，
> 找出问题并修复，修复后刷新页面再次截图确认。
```

---

## 各方案对比

| 方案 | 配置难度 | 自动化程度 | 适用场景 |
|------|---------|-----------|---------|
| **Playwright MCP** | 中 | 高 | 自动化测试、批量页面检查 |
| **Chrome DevTools MCP** | 中 | 高 | 调试正在手动操作的页面 |
| **截图粘贴** | 无 | 低 | 快速反馈、偶尔调试 |
| **Browsertools MCP** | 中 | 高 | 全方位浏览器调试 |
| **日志监控** | 低 | 中 | 后端配合的错误追踪 |

---

## 快速开始（最小配置）

如果只想最快跑起来，按以下步骤：

### 1. 安装 Playwright MCP（一行命令）

```bash
npx claude mcp add playwright -- npx @anthropic-ai/mcp-server-playwright
```

### 2. 重启 Claude Code

```bash
# 退出并重新进入 Claude Code
claude
```

### 3. 开始调试

```bash
> 启动项目开发服务器，然后用浏览器打开首页截图给我看
```

完成。现在 Claude Code 可以看到你的页面并帮你调试了。
