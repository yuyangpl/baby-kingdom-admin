# 在 Claude Code 中根据项目需求生成 Figma 设计

## 整体思路

Claude Code 无法直接操作 Figma 界面，但可以通过以下路径实现从需求到 Figma 设计的转化：

```
需求文档 → Claude Code 生成设计规范 → Figma Dev Mode / 插件 → Figma 设计稿
```

---

## 方法一：通过 Figma MCP Server（推荐）

### 1. 安装 Figma MCP Server

在 Claude Code 的 MCP 配置中添加 Figma 服务：

```json
// ~/.claude/settings.json 或项目 .claude/settings.json
{
  "mcpServers": {
    "figma": {
      "command": "npx",
      "args": ["-y", "figma-developer-mcp", "--figma-api-key=YOUR_API_KEY"]
    }
  }
}
```

### 2. 获取 Figma API Key

1. 登录 [Figma](https://www.figma.com)
2. 进入 Settings → Account → Personal Access Tokens
3. 生成一个新 Token

### 3. 在 Claude Code 中使用

```bash
# 让 Claude Code 读取需求文档并生成设计
> 根据 requirements.md 中的需求，在 Figma 中创建后台管理系统的页面设计
```

Claude Code 可以通过 MCP 调用 Figma API：
- 创建/读取 Figma 文件
- 创建 Frame、组件、文本等元素
- 设置颜色、字体、间距等样式
- 组织页面结构

---

## 方法二：生成设计规范 + 手动导入 Figma

### Step 1：用 Claude Code 生成 UI 设计规范

在项目中运行：

```bash
> 根据 requirements.md 生成完整的 UI 设计规范，包括：
> - 设计系统（颜色、字体、间距、圆角）
> - 页面列表和布局结构
> - 组件清单
> - 交互说明
```

Claude Code 会输出一份结构化的设计规范文档（如 `ui-spec.md`）。

### Step 2：生成 Figma 兼容的设计 Token

让 Claude Code 生成 Design Token JSON：

```bash
> 将设计规范转换为 Figma Design Token 格式（JSON）
```

输出示例：

```json
{
  "colors": {
    "primary": { "value": "#1677FF", "type": "color" },
    "success": { "value": "#52C41A", "type": "color" },
    "warning": { "value": "#FAAD14", "type": "color" },
    "error": { "value": "#FF4D4F", "type": "color" },
    "background": { "value": "#F5F5F5", "type": "color" }
  },
  "spacing": {
    "xs": { "value": "4", "type": "spacing" },
    "sm": { "value": "8", "type": "spacing" },
    "md": { "value": "16", "type": "spacing" },
    "lg": { "value": "24", "type": "spacing" },
    "xl": { "value": "32", "type": "spacing" }
  },
  "typography": {
    "heading1": { "value": { "fontSize": 24, "fontWeight": 600, "lineHeight": 32 } },
    "heading2": { "value": { "fontSize": 20, "fontWeight": 600, "lineHeight": 28 } },
    "body": { "value": { "fontSize": 14, "fontWeight": 400, "lineHeight": 22 } }
  },
  "borderRadius": {
    "sm": { "value": "4", "type": "borderRadius" },
    "md": { "value": "8", "type": "borderRadius" },
    "lg": { "value": "12", "type": "borderRadius" }
  }
}
```

### Step 3：在 Figma 中导入

1. 安装 Figma 插件 **Tokens Studio**（原 Figma Tokens）
2. 将 JSON 文件导入插件
3. 自动生成对应的 Figma 样式和变量

---

## 方法三：生成前端代码 → Figma Dev Mode 反推

### Step 1：用 Claude Code 直接生成页面代码

```bash
> 根据需求文档，用 Vue.js + Ant Design Vue 生成后台管理系统的页面组件代码
```

### Step 2：运行项目预览

```bash
npm run dev
```

### Step 3：使用工具将页面转为 Figma

- **html.to.design**：Figma 插件，粘贴 URL 自动将网页转为 Figma 设计
- **Locofy**：将前端代码/页面转换为 Figma 组件

---

## 方法四：生成 SVG/HTML 线框图 → 导入 Figma

### Step 1：让 Claude Code 生成线框图

```bash
> 为后台管理系统的仪表盘页面生成 SVG 线框图
```

Claude Code 可以输出 SVG 文件，包含基本的页面布局和组件位置。

### Step 2：导入 Figma

直接将 SVG 文件拖入 Figma，即可编辑所有元素。

---

## 推荐工作流（结合本项目）

针对 Baby Kingdom Admin 后台管理系统，建议采用以下流程：

```
┌─────────────────────────────────────────────────┐
│  1. Claude Code 分析 requirements.md            │
│     ↓                                           │
│  2. 生成 UI 设计规范 (ui-spec.md)               │
│     ↓                                           │
│  3. 生成 Design Tokens (JSON)                   │
│     ↓                                           │
│  4. 生成各页面的线框图描述 / SVG                 │
│     ↓                                           │
│  5. 导入 Figma + 应用 Design Tokens             │
│     ↓                                           │
│  6. 在 Figma 中精调视觉细节                     │
│     ↓                                           │
│  7. Claude Code 根据 Figma 设计实现前端代码      │
└─────────────────────────────────────────────────┘
```

### 具体命令示例

```bash
# 1. 分析需求，生成页面清单
> 分析 requirements.md，列出所有需要设计的页面和核心组件

# 2. 生成设计系统
> 为 Baby Kingdom Admin 生成完整的设计系统规范，参考 Ant Design 风格

# 3. 生成 Design Tokens
> 将设计系统转换为 Figma Tokens Studio 兼容的 JSON 格式，保存到 design-tokens.json

# 4. 逐页生成线框图
> 为仪表盘页面生成详细的 SVG 线框图，包含数据卡片、图表区域、最近活动列表

# 5. 生成组件规范
> 为每个核心组件（表格、表单、导航栏、侧边栏）生成 Figma 组件规范
```

---

## 常用 Figma 插件配合

| 插件 | 用途 |
|------|------|
| **Tokens Studio** | 导入 Claude Code 生成的 Design Tokens |
| **html.to.design** | 将运行中的页面转为 Figma 设计 |
| **Ant Design for Figma** | 直接使用 Ant Design 组件库 |
| **Content Reel** | 填充真实数据内容 |
| **Autoflow** | 自动生成页面流程连线 |

---

## 注意事项

1. **MCP 方式最直接**，但 Figma API 对复杂设计的支持有限，适合生成基础框架
2. **Design Tokens 方式最实用**，确保代码和设计使用同一套变量
3. **代码反推方式最快速**，适合已有组件库（如 Ant Design）的项目
4. Claude Code 生成的设计是"骨架"，视觉精调仍需设计师在 Figma 中完成
5. 保持 Design Tokens 作为单一数据源（Single Source of Truth），代码和设计同步更新
