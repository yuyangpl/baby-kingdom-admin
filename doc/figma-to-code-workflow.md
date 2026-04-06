# 通过 Figma 设计稿让 Claude Code 生成/调整 UI

## 核心流程

```
Figma 设计稿 → MCP 连接 → Claude Code 读取设计 → 生成前端代码 → 浏览器验证 → 迭代调整
```

---

## 一、连接 Figma 的三种方式

### 方式 A：Figma 官方 MCP Server（推荐）

Figma 官方推出的 MCP Server，支持双向读写，功能最全。

```bash
# 安装（二选一）

# 方法 1：远程 MCP（推荐，无需本地安装）
claude mcp add --transport http figma https://mcp.figma.com/mcp

# 全局生效（所有项目可用）
claude mcp add --scope user --transport http figma https://mcp.figma.com/mcp
```

首次使用时 Claude Code 会引导你在浏览器中授权 Figma 账号。

**16 个可用工具：**

| 工具 | 功能 |
|------|------|
| `get_design_context` | 提取指定图层的布局、样式、组件信息（支持 React/Vue/HTML 等） |
| `get_variable_defs` | 提取设计变量（颜色、间距、字体 Token） |
| `get_screenshot` | 截取选区截图 |
| `get_metadata` | 获取图层结构、位置、尺寸 |
| `search_design_system` | 搜索连接的设计库组件 |
| `get_code_connect_map` | 获取 Figma 节点与代码组件的映射 |
| `add_code_connect_map` | 创建 Figma 节点到代码的映射 |
| `generate_figma_design` | 从代码/描述反向生成 Figma 设计（远程模式） |
| `use_figma` | 通用工具：创建、编辑、检查任何 Figma 对象 |
| `create_design_system_rules` | 生成设计系统规则文件 |
| `get_code_connect_suggestions` | AI 自动建议组件映射 |
| `send_code_connect_mappings` | 确认组件映射 |
| `generate_diagram` | 从 Mermaid 语法生成 FigJam 图 |
| `get_figjam` | 将 FigJam 图转为 XML |
| `create_new_file` | 创建新 Figma 文件 |
| `whoami` | 当前用户信息 |

**注意：** Starter 计划 / View / Collab 席位每月限 6 次调用。Dev 或 Full 席位无此限制。

---

### 方式 B：Framelink MCP（开源免费，14k+ Star）

社区最流行的 Figma MCP，免费无限制。

**1. 获取 Figma API Key**

Figma → Settings → Account → Personal Access Tokens → 生成 Token

**2. 配置**

```json
// .claude/settings.json
{
  "mcpServers": {
    "figma": {
      "command": "npx",
      "args": ["-y", "figma-developer-mcp", "--figma-api-key=YOUR_KEY", "--stdio"]
    }
  }
}
```

**3. 能力**
- 提取布局信息（定位、尺寸、间距）
- 提取样式（颜色、字体、阴影、效果）
- 提取组件层级结构
- 自动简化 Figma API 原始数据，减少 Token 消耗

---

### 方式 C：Figma Console MCP（完整设计系统 API）

适合需要一次性提取整个设计系统的场景。

```bash
# 配置方式参考 github.com/southleft/figma-console-mcp
```

**核心工具：**
- `figma_get_design_system_kit` — 一次调用获取完整设计系统（Token、组件、样式）
- `figma_get_variables` — 提取设计变量
- `figma_get_component` — 获取单个组件数据

**优势：** 支持 Free/Pro 计划（通过 Plugin API），支持导出为 CSS/Tailwind/SCSS/JSON。

---

## 二、核心工作流

### 工作流 1：逐页实现（最常用）

```bash
# Step 1: 确保 Figma MCP 已连接
> /mcp

# Step 2: 发送 Figma 页面链接，让 Claude 实现
> 根据这个 Figma 设计实现 Vue 3 组件：
> https://www.figma.com/design/FILE_KEY/page?node-id=XX-YY
> 使用 Ant Design Vue 组件库，Tailwind CSS 样式

# Step 3: Claude 自动执行
#   → get_design_context 提取布局和样式
#   → get_variable_defs 提取设计 Token
#   → get_screenshot 获取视觉参考
#   → 生成 Vue 组件代码

# Step 4: 迭代调整
> 侧边栏的间距不对，重新检查 Figma 设计稿中的 padding 值并修复
```

### 工作流 2：先提取 Token，再批量实现

```bash
# Step 1: 提取设计 Token
> 从 Figma 文件提取所有设计变量（颜色、间距、字体、圆角），
> 保存为 design-tokens.json 和 tailwind 配置

# Step 2: 生成 Tailwind 配置
> 将 design-tokens.json 转换为 tailwind.config.js 中的 theme 配置

# Step 3: 逐页实现
> 使用已配置的设计 Token，实现 Figma 中的仪表盘页面：
> https://www.figma.com/design/...
```

### 工作流 3：组件映射 + 批量生成

```bash
# Step 1: 建立组件映射
> 扫描 Figma 设计系统库，列出所有组件
> 将它们映射到 Ant Design Vue 对应的组件

# Step 2: 生成映射文件
> 创建 component-map.json，记录 Figma 组件名 → 代码组件的对应关系

# Step 3: 批量生成页面
> 根据 component-map.json 的映射关系，实现以下 Figma 页面：
> - Dashboard: https://www.figma.com/design/.../node-id=1-1
> - User List: https://www.figma.com/design/.../node-id=2-1
> - Settings: https://www.figma.com/design/.../node-id=3-1
```

---

## 三、设计 Token 提取

### 方法 1：通过 MCP 直接提取

```bash
# Claude Code 中直接操作
> 提取 Figma 文件中的所有设计变量，输出为以下格式：
> 1. CSS 自定义属性 (variables.css)
> 2. Tailwind 主题配置 (tailwind.config.js)
> 3. JSON Token 文件 (design-tokens.json)
```

### 方法 2：Figtree CLI（独立工具）

```bash
npm install -g figtree-cli

# 交互式使用
figtree
# → 粘贴 Figma URL
# → 选择导出格式: CSS / SCSS / Tailwind / JSON / SwiftUI / Android XML
```

**可提取的 Token：**
- 颜色（纯色 + 渐变）
- 字体（字族、字号、字重、行高）
- 间距
- 圆角
- 阴影和模糊效果
- 布局网格

### 方法 3：Tokens Studio 插件（Figma 内操作）

1. 在 Figma 中安装 **Tokens Studio** 插件
2. 定义或导入 Token
3. 导出为 W3C Design Tokens 标准 JSON
4. 用 Style Dictionary 转换为任意平台格式

---

## 四、Figma 设计转代码的辅助工具

### 插件类（在 Figma 中使用）

| 工具 | 特点 | 支持框架 | 适用场景 |
|------|------|---------|---------|
| **Builder.io Visual Copilot** | AI 驱动，支持组件映射 | React/Vue/Svelte/Angular/HTML | 生产级代码 |
| **Locofy** | 自动标注 + 自动组件化 | React/Vue/Next.js/Flutter/RN | 快速原型 |
| **Anima** | 1.4M 安装量，支持多屏导入 | React/Vue/HTML/Tailwind/shadcn | 前端开发 |
| **html.to.design** | 反向：网页 → Figma | - | 已有页面导入 Figma |

### CLI 类（配合 Claude Code）

| 工具 | 用途 |
|------|------|
| **Figtree CLI** | 提取设计 Token，导出多格式 |
| **Visual Copilot CLI** | 分析代码库，生成匹配的组件代码 |

---

## 五、双向工作流：代码 ↔ Figma

### 代码 → Figma（反向生成设计）

Figma 官方 MCP 支持从代码反向生成 Figma 设计：

```bash
# 将已有的 Vue 组件转为 Figma 设计稿
> 读取 src/components/Dashboard.vue，
> 在 Figma 中生成对应的设计图层

# Claude Code 使用 generate_figma_design 工具
# 在 Figma 中创建可编辑的设计图层
```

### Figma → 代码（正向生成）

```bash
# 从 Figma 设计生成代码
> 实现这个 Figma 设计：https://www.figma.com/design/...
> 技术栈：Vue 3 + Ant Design Vue + Tailwind CSS
```

### 完整双向循环

```
┌─────────────────────────────────────────────┐
│                                             │
│   Figma 设计稿                               │
│       │                                     │
│       ▼  get_design_context                 │
│   Claude Code 读取设计                       │
│       │                                     │
│       ▼                                     │
│   生成 Vue 组件代码                           │
│       │                                     │
│       ▼  Playwright MCP                     │
│   浏览器预览 & 截图对比                       │
│       │                                     │
│       ├──→ 不一致 → 修改代码 → 重新预览       │
│       │                                     │
│       ▼  一致                               │
│   完成 ✓                                    │
│       │                                     │
│       ▼  generate_figma_design (可选)        │
│   代码变更同步回 Figma                        │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 六、针对本项目的推荐方案

### Baby Kingdom Admin 后台（Vue 3 + Ant Design Vue + MongoDB）

**推荐配置：**

```json
// .claude/settings.json
{
  "mcpServers": {
    "figma": {
      "type": "http",
      "url": "https://mcp.figma.com/mcp"
    },
    "playwright": {
      "command": "npx",
      "args": ["@anthropic-ai/mcp-server-playwright"]
    }
  }
}
```

**推荐流程：**

```bash
# 1. 在 Figma 中完成设计（或用 Figma Make 生成）

# 2. 提取设计系统
> 从 Figma 提取设计 Token，生成 tailwind.config.js 和 theme.less（Ant Design 主题）

# 3. 逐页实现
> 实现 Figma 中的登录页：https://www.figma.com/design/...
> 使用 Vue 3 + Ant Design Vue，遵循已提取的设计 Token

# 4. 浏览器验证
> 打开 http://localhost:3000/login，截图与 Figma 设计对比，找出差异

# 5. 迭代修复
> Figma 中按钮圆角是 8px，当前代码是 4px，修复所有圆角不一致的地方

# 6. 下一页...重复 3-5
```

---

## 七、Token 消耗对比

| 方式 | Token 消耗 | 说明 |
|------|-----------|------|
| Framelink MCP（纯文本） | ★★☆☆☆ | 只传布局/样式文本数据 |
| Figma Console MCP | ★★☆☆☆ | 文本数据，但一次性量大 |
| 官方 MCP `get_design_context` | ★★★☆☆ | 结构化数据，中等消耗 |
| 官方 MCP `get_screenshot` | ★★★★☆ | 图片消耗大 |
| Builder.io / Locofy 导出代码再调整 | ★☆☆☆☆ | 本地操作，几乎不消耗 |

**省 Token 建议：**
- 先用 `get_design_context` 获取文本数据，只在视觉对比时才用 `get_screenshot`
- 一次性提取 Token 后复用，避免每页重复提取
- 用 Framelink MCP 替代官方 MCP 可减少约 30% Token（数据更精简）

---

## 八、常见问题

**Q: 免费 Figma 计划能用吗？**
A: Framelink MCP 和 Figma Console MCP 均支持免费计划。官方 MCP 的 Starter 计划限 6 次/月。

**Q: 如何获取 Figma 页面的 node-id？**
A: 在 Figma 中选中图层 → URL 栏会显示 `?node-id=XX-YY`，或右键复制链接。

**Q: 生成的代码和设计不一致怎么办？**
A: 配合 Playwright MCP 截图对比，让 Claude Code 逐项修复差异。

**Q: 支持哪些前端框架？**
A: 官方 MCP 的 `get_design_context` 支持 React、Vue、HTML+CSS、iOS 等。Claude Code 本身支持任何框架。
