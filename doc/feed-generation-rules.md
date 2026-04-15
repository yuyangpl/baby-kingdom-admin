# Feed 生成规则与策略

**文档版本：** 2026-04-15
**范围：** Scanner（BK 论坛回帖）、Trends（新帖）、Custom（手动生成）三条生成路径

---

## 1. 两种生成场景

### 1.1 BK 论坛扫描 → 回帖（Scanner）

从 Baby Kingdom 论坛拉取帖子，AI 评估后生成回复。

```
BK 论坛帖子列表 → 7 层过滤 → Gemini 评估（JSON）→ 人设选择 → Gemini 生成回复 → Feed (type=reply)
```

**生成的 Feed 字段：**
| 字段 | 值 |
|------|-----|
| type | `reply` |
| postType | `reply` |
| source | `['scanner']` 或 `['scanner', 'trends']`（命中 Google Trends 时） |
| threadTid | BK 帖子 tid |
| threadFid | 版块 fid |
| threadSubject | 原帖标题 |
| threadContent | 原帖内容（前 500 字） |
| draftContent | Gemini 生成的回复文本 |

### 1.2 趋势/自定义 → 新帖（Trends / Custom）

从 MediaLens 拉取热门话题，或管理员手动输入主题，AI 生成完整帖子（标题 + 正文）。

```
MediaLens 热门话题 → 人设选择 → Gemini 生成（标题+正文）→ Feed (type=thread)
```

**生成的 Feed 字段：**
| 字段 | 值 |
|------|-----|
| type | `thread` |
| postType | `new-post` |
| source | `['trends']` 或 `['custom']` |
| threadFid | 配置的默认版块（DEFAULT_TREND_FID，默认 162） |
| subject | Gemini 生成的标题（最多 80 字） |
| threadSubject | 同 subject |
| draftContent | Gemini 生成的正文 |
| trendSource | `medialens` / `lihkg` / `facebook` / 无 |
| trendTopic | 趋势话题标签 |
| trendSummary | 趋势摘要 |

---

## 2. Scanner 7 层过滤 + 2 熔断

Scanner 是最复杂的路径，带 7 层逐步过滤和 2 个熔断机制。

### 过滤层

| 层 | 名称 | 逻辑 | 消耗 Token |
|----|------|------|-----------|
| 1 | 队列容量 | `pending 数量 >= MAX_PENDING_QUEUE（100）` → 跳过整个板块 | 否 |
| 2 | 回复数过滤 | `thread.replies < min 或 > max`（版块配置） → 跳过 | 否 |
| 3 | 重复检查 | 同一 tid + scanner 来源已有 Feed → 跳过 | 否 |
| 4 | 内容获取 | 无法取得帖子内容 → 跳过 | 否 |
| 5 | **Gemini 评估** | `relevanceScore < SCANNER_RELEVANCE_THRESHOLD（35）` → 跳过 | **是（低成本）** |
| 6 | 值得回复 | `worthReplying === false` → 跳过 | 否 |
| 7 | 人设选择 | 无可用人设（配额用完/黑名单） → 跳过 | 否 |

### 熔断机制

| 熔断 | 条件 | 效果 |
|------|------|------|
| 超时 | 运行超过 `SCANNER_TIMEOUT_MINUTES（5 分钟）` | 中断扫描，标记 interrupted |
| 队列满 | `pending + 本次新增 >= MAX_PENDING_QUEUE` | 中断扫描 |

### 两步 Gemini 调用

Scanner 使用两次 Gemini 调用，节省约 93% Token：

**第一步：评估（低成本）**
- 用途：判断帖子是否值得回复
- 输入：帖子标题 + 内容前 500 字
- 输出：JSON（relevanceScore, worthReplying, topic, tier, toneMode, sentimentScore）
- 只有通过评估的帖子才进入第二步

**第二步：生成（高成本）**
- 用途：生成回复内容
- 输入：6 个 Prompt Block（见下文）
- 输出：回复文本

---

## 3. Gemini 使用方式

### 3.1 模型配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| GEMINI_MODEL | `gemini-2.5-flash` | 模型 ID |
| GEMINI_TEMPERATURE | `0.85` | 创造性（0-1） |
| GEMINI_MAX_OUTPUT_TOKENS | `800` | 最大输出 Token |
| GEMINI_API_KEY | — | 必填，无则使用 Mock |

### 3.2 调用方式

```typescript
const genModel = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  systemInstruction: systemPrompt,    // 系统指令（角色定义 + 语气 + 规则）
  generationConfig: {
    temperature: 0.85,
    maxOutputTokens: 800,
    responseMimeType: 'text/plain',   // 评估时用 'application/json'
  },
});
const result = await genModel.generateContent(userPrompt);
```

### 3.3 评估 Prompt（Scanner 第一步）

**System Prompt：**
```
你系一个香港亲子论坛内容分析师。评估以下帖子是否值得用亲子角色回复。以JSON格式回复。
```

**User Prompt：**
```
帖子标题：{subject}
内容：{content 前 500 字}

请评估并回复JSON: {
  relevanceScore (0-100),
  worthReplying (boolean),
  topic (string),
  tier (string "Tier 1 — Safe" / "Tier 2 — Moderate" / "Tier 3 — Sensitive"),
  toneMode (只能选: "INFO_SHARE" / "SHARE_EXP" / "EMPATHISE" / "ASK_ENGAGE" / "CASUAL"),
  sentimentScore (0-100),
  reasoning (string)
}
```

**回应范例：**
```json
{
  "relevanceScore": 82,
  "worthReplying": true,
  "topic": "小朋友早餐习惯",
  "tier": "Tier 1 — Safe",
  "toneMode": "SHARE_EXP",
  "sentimentScore": 65,
  "reasoning": "亲子相关话题，适合分享经验"
}
```

### 3.4 生成 Prompt（6 个 Block）

System Prompt 由 6 个 Block 拼装而成：

#### Block 1：角色设定（Persona）
```
【角色设定】
帐号：happymom_hk
类型：first-time-mom
说话特点：爱用emoji；语气温柔亲切
口头禅：真系㗎；好紧张呀
```

#### Block 2：语气指引（Tone Mode）

**普通情况：**
```
【今日发文语气：分享经验 SHARE_EXP】
情感基调：温暖回忆式，带少少感慨
开头方式：以「我之前都试过…」或「讲起呢个我都有啲经验…」开头
句式风格：先描述自己嘅经历，再带出感受同建议
必须避免：说教式口吻、过度正面鸡汤
开头示例：「我之前都试过咁嘅情况，嗰时真系好彷徨…」
```

**Tier 3 敏感话题（强制覆盖）：**
```
【语气指引（敏感话题）】
{persona.tier3Script 的完整脚本}
```

#### Block 3：话题/趋势
```
【今日热话】
话题：小朋友唔食早餐
摘要：调查显示六成中学生不吃早餐
情绪分：65
敏感度：Tier 1
```

#### Block 4：话题规则提示
```
【额外写作指引】
{rule.geminiPromptHint}
```
> 只在命中话题规则时出现

#### Block 5：Google 热点
```
【Google 热点】
热搜标题：香港小学生早餐调查
热度：50,000+
```
> 只在 Google Trends 匹配时出现

#### Block 6：任务模板
```
请用以上角色嘅口吻，写一篇回复（最多300字）。只输出帖文内容，唔好有前言或解释。
```

**新帖时额外追加：**
```
请同时写一个帖子标题（20字以内，自然口语化，唔好用括号或标签）。
格式：
标题：xxx
正文：xxx
```

### 3.5 完整 Prompt 拼装范例

**场景：Scanner 扫描到一个关于小朋友早餐的帖子，分配给 happymom_hk，语气为 SHARE_EXP**

**System Prompt：**
```
你系一个香港亲子论坛嘅真实用户，用繁体中文书写。你嘅文字要自然、真实，有个人感受，唔系广告。

【角色设定】
帐号：happymom_hk
类型：first-time-mom
说话特点：爱用emoji；语气温柔亲切
口头禅：真系㗎；好紧张呀

【今日发文语气：分享经验 SHARE_EXP】
情感基调：温暖回忆式，带少少感慨
开头方式：以「我之前都试过…」或「讲起呢个我都有啲经验…」开头
句式风格：先描述自己嘅经历，再带出感受同建议
必须避免：说教式口吻、过度正面鸡汤
开头示例：「我之前都试过咁嘅情况，嗰时真系好彷徨…」

【今日热话】
话题：小朋友唔食早餐
摘要：好多后生仔女真系好多都唔食早餐
情绪分：65
敏感度：Tier 1

请用以上角色嘅口吻，写一篇回复（最多300字）。只输出帖文内容，唔好有前言或解释。
```

**User Prompt：**
```
小朋友唔食早餐
```

**Gemini 回应（回帖）：**
```
哈哈系囉！见到依家啲后生仔女真系好多都唔食早餐喎。我谂佢哋系咪唔肚饿呢？

我以前喺英国嗰时，佢哋学校好重视breakfast㗎。好多时会有breakfast club，会提供简单嘢食，确保小朋友有精神上堂。
```

### 3.6 新帖生成范例

**场景：Trends 拉取到「香港亲子游好去处」话题，生成新帖**

**Gemini 回应格式：**
```
标题：有冇人去过大棠烧烤场？带小朋友去真系正！
正文：最近天气咁好，我哋一家人上个礼拜六去咗大棠烧烤场，真系好正呀！

个场地好大，有好多位坐，而且有洗手间同洗手盆，带小朋友去都好方便。我个女（3岁）玩到唔舍得走，不停话要再嚟…
```

**系统解析：**
- 用正则 `标题[：:]\s*(.+)` 提取标题
- 用正则 `正文[：:]\s*([\s\S]+)` 提取正文
- 标题最多 80 字，XSS 过滤
- 正文 XSS 过滤后存入 `draftContent`

---

## 4. Tier 敏感度分级规则

### 什么是 Tier

Tier 是内容敏感度分级，决定 AI 用什么方式回复。分三级：

| Tier | 级别 | 含义 | 对生成的影响 |
|------|------|------|------------|
| **Tier 1** | 安全 | 日常话题，无争议 | 正常语气，自由发挥 |
| **Tier 2** | 中等 | 涉及健康/育儿敏感点 | 语气谨慎，避免绝对化建议 |
| **Tier 3** | 敏感 | 涉及心理健康/家庭危机 | **强制覆盖语气为 EMPATHISE**，使用人设的 tier3Script |

### Tier 如何确定

**优先级：话题规则 > 关键词自动判断 > Gemini 评估**

1. **话题规则命中**：规则的 `sensitivityTier` 字段直接决定
2. **关键词自动判断**（无规则命中时）：
   - Tier 3 关键词：抑郁、崩溃、离婚、单亲、婆媳、ADHD、特殊教育、自杀、产后抑郁
   - Tier 2 关键词：分娩、母乳、奶粉、VBAC、高龄、情绪、湿疹、过敏
   - 其余全部为 Tier 1
3. **Gemini 评估返回**（Scanner 路径）：评估 JSON 中的 `tier` 字段

### Tier 3 的特殊处理

当 Tier = 3 时，两件事被强制覆盖：
1. **语气强制切换**：无论人设配了什么语气，一律使用 `TONE_OVERRIDE_ON_TIER3`（默认 EMPATHISE）
2. **Prompt 使用 tier3Script**：如果人设配了 `tier3Script`，直接替换掉语气设定的整个 Block，用人设自定义的敏感话题脚本

---

## 5. 语气模式优先级链

语气选择遵循严格的优先级，高优先级覆盖低优先级：

```
优先级 1（最高）：Tier 3 强制 → TONE_OVERRIDE_ON_TIER3（默认 EMPATHISE）
    ↓ 不满足
优先级 2：负面情感 → sentimentScore ≤ 45 → 自动 EMPATHISE
    ↓ 不满足
优先级 3：规则/请求指定 → requestedToneMode（非 auto）
    ↓ 不满足
优先级 4：人设主语气 → persona.primaryToneMode
    ↓ 不满足
优先级 5（最低）：默认 → INFO_SHARE
```

**5 种可用语气：**
| ID | 名称 | 适用场景 |
|----|------|---------|
| INFO_SHARE | 资讯分享 | 一般话题，分享知识 |
| SHARE_EXP | 经验分享 | 个人经历相关话题 |
| EMPATHISE | 共情 | 负面情绪、敏感话题 |
| ASK_ENGAGE | 提问互动 | 轻松话题，引发讨论 |
| CASUAL | 随意闲聊 | 日常轻松话题 |

---

## 6. 人设、语气、规则如何协作生成 Prompt

### 三套配置的职责

| 配置 | 存储位置 | 核心字段 | 职责 |
|------|---------|---------|------|
| **人设管理（Persona）** | personas 表 | username, archetype, voiceCues, catchphrases, primaryToneMode, secondaryToneMode, avoidedToneMode, tier3Script, topicBlacklist | 定义"谁在说话"——角色身份、说话习惯、禁忌话题 |
| **语气模式（ToneMode）** | tone_modes 表 | displayName, emotionalRegister, openingStyle, sentenceStructure, whatToAvoid, exampleOpening, whenToUse | 定义"怎么说"——情感基调、句式结构、开场风格 |
| **话题规则（TopicRule）** | topic_rules 表 | topicKeywords, sensitivityTier, geminiPromptHint, priorityAccountIds | 定义"遇到什么话题时的特殊策略"——敏感度、额外提示、优先人设 |

### 协作流程（以 Scanner 回帖为例）

```
输入：BK 论坛帖子（标题 + 内容）

第一步：评估（Gemini JSON 模式）
├─ 输入：帖子标题 + 内容前500字
├─ 输出：relevanceScore, topic, tier, toneMode, sentimentScore
└─ 决定：这帖子值不值得回复

第二步：选人设
├─ 检查版块绑定的人设（board.personaBindings）
├─ 过滤：isActive=true, postsToday < maxPostsPerDay
├─ 排除：topic 命中 persona.topicBlacklist 的人设
└─ 随机选一个

第三步：匹配话题规则
├─ 帖子标题与 rule.topicKeywords 做子串匹配
├─ 命中多条时取 sensitivityTier 最高的
├─ 无命中则用版块 defaultRuleIds
└─ 确定 sensitivityTier 和 geminiPromptHint

第四步：决定语气
├─ Tier 3？→ 强制 EMPATHISE（不管人设配了什么）
├─ sentimentScore ≤ 45？→ 强制 EMPATHISE（情绪低落自动共情）
├─ 评估返回了具体语气？→ 使用评估建议的语气
├─ 人设有 primaryToneMode？→ 使用人设主语气
└─ 以上都没有 → 默认 INFO_SHARE

第五步：拼装 Prompt → 调用 Gemini → 获得回复文本
```

### 每个人设字段如何进入 Prompt

| 人设字段 | 进入 Prompt 的方式 | 在 Prompt 中的位置 |
|---------|-------------------|------------------|
| `username` | `帐号：{username}` | Block 1 角色设定 |
| `archetype` | `类型：{archetype}` | Block 1 角色设定 |
| `voiceCues[]` | `说话特点：{用分号连接}` | Block 1 角色设定 |
| `catchphrases[]` | `口头禅：{用分号连接}` | Block 1 角色设定 |
| `primaryToneMode` | 作为语气选择的第4优先级 | 间接影响 Block 2 |
| `secondaryToneMode` | **当前未使用**（预留字段） | 无 |
| `avoidedToneMode` | **当前未使用**（预留字段） | 无 |
| `tier3Script` | 当 Tier=3 时替换整个 Block 2 | Block 2 语气指引 |
| `topicBlacklist[]` | 不进入 Prompt，在人设选择阶段过滤 | 选择阶段 |

### 每个语气字段如何进入 Prompt

| 语气字段 | 进入 Prompt 的方式 | 作用 |
|---------|-------------------|------|
| `displayName` | `今日发文语气：{displayName}` | 告诉 Gemini 当前语气名称 |
| `emotionalRegister` | `情感基调：{value}` | 定义情感倾向（温暖/理性/轻松） |
| `openingStyle` | `开头方式：{value}` | 指导如何开始回复 |
| `sentenceStructure` | `句式风格：{value}` | 指导句子结构 |
| `whatToAvoid` | `必须避免：{value}` | 禁止的表达方式 |
| `exampleOpening` | `开头示例：{value}` | 给 Gemini 一个具体开场范例 |
| `whenToUse` | **不进入 Prompt**（仅供管理员参考） | 无 |
| `suitableForTier3` | **不进入 Prompt**（预留标记） | 无 |

### 每个规则字段如何进入 Prompt

| 规则字段 | 进入 Prompt 的方式 | 作用 |
|---------|-------------------|------|
| `topicKeywords[]` | 不进入 Prompt，用于匹配阶段 | 匹配话题 |
| `sensitivityTier` | 间接影响 Block 2（Tier 3 覆盖语气） + Block 3（敏感度标签） | 决定语气策略 |
| `geminiPromptHint` | `额外写作指引：{value}` | Block 4，直接注入 Prompt |
| `priorityAccountIds[]` | 不进入 Prompt，Trends 生成时优先选用的人设 | 人设选择阶段 |
| `assignToneMode` | **当前未使用** | 无 |
| `sentimentTrigger` | **当前未使用** | 无 |
| `avoidIf` | **当前未使用** | 无 |

### 完整 Prompt 拼装示意

```
┌─ System Prompt ────────────────────────────────────────────────┐
│ "你系一个香港亲子论坛的真实用户..."（全局配置 GEMINI_SYSTEM_PROMPT）│
└───────────────────────────────────────────────────────────────┘

┌─ User Prompt（由 6 个 Block 拼接，用空行分隔）─────────────────┐
│                                                                │
│ Block 1 ← 人设管理                                              │
│ 【角色设定】                                                     │
│ 帐号：happymom_hk            ← persona.username                │
│ 类型：first-time-mom         ← persona.archetype               │
│ 说话特点：爱用emoji；温柔亲切  ← persona.voiceCues.join('；')     │
│ 口头禅：真系㗎；好紧张呀       ← persona.catchphrases.join('；')  │
│                                                                │
│ Block 2 ← 语气模式（或 Tier3 脚本）                               │
│ ┌─ 普通情况（Tier 1/2）：                                        │
│ │ 【今日发文语气：分享经验 SHARE_EXP】                             │
│ │ 情感基调：温暖回忆式        ← toneMode.emotionalRegister       │
│ │ 开头方式：以「我之前都...」  ← toneMode.openingStyle           │
│ │ 句式风格：先描述经历再建议   ← toneMode.sentenceStructure      │
│ │ 必须避免：说教式口吻         ← toneMode.whatToAvoid            │
│ │ 开头示例：「我之前都试过...」 ← toneMode.exampleOpening        │
│ └─                                                             │
│ ┌─ Tier 3 强制覆盖：                                            │
│ │ 【语气指引（敏感话题）】                                         │
│ │ {persona.tier3Script 的完整脚本}                               │
│ └─                                                             │
│                                                                │
│ Block 3 ← 话题信息                                              │
│ 【今日热话】                                                     │
│ 话题：小朋友唔食早餐          ← topic（帖子标题或趋势话题）        │
│ 摘要：调查显示...             ← summary                         │
│ 情绪分：65                   ← sentimentScore（Gemini 评估）    │
│ 敏感度：Tier 1               ← sensitivityTier                 │
│                                                                │
│ Block 4 ← 话题规则（仅命中规则时出现）                             │
│ 【额外写作指引】                                                  │
│ {rule.geminiPromptHint}      ← 规则的自定义 Gemini 提示          │
│                                                                │
│ Block 5 ← Google Trends（仅匹配时出现）                           │
│ 【Google 热点】                                                  │
│ 热搜标题：...                ← googleTrends.trendTitle          │
│ 热度：50,000+                ← googleTrends.trendTraffic        │
│                                                                │
│ Block 6 ← 任务模板                                              │
│ 请用以上角色的口吻，写一篇回复（最多300字）。                        │
│ 只输出帖文内容，唔好有前言或解释。                                   │
│ ┌─ 新帖时额外追加：                                              │
│ │ 请同时写一个帖子标题（20字以内）。                                │
│ │ 格式：                                                        │
│ │ 标题：xxx                                                     │
│ │ 正文：xxx                                                     │
│ └─                                                             │
└───────────────────────────────────────────────────────────────┘
```

### 数据流向总结

```
                    人设管理                 语气模式                话题规则
                      │                       │                      │
                      │                       │                      │
          ┌───────────┴──────────┐    ┌───────┴───────┐    ┌────────┴────────┐
          │ username             │    │ displayName   │    │ topicKeywords   │ → 匹配阶段
          │ archetype            │    │ emotionalReg  │    │ sensitivityTier │ → 决定 Tier
          │ voiceCues      ─────────→ Block 1        │    │ geminiPromptHint│ → Block 4
          │ catchphrases         │    │ openingStyle  │    │ priorityAccIds  │ → 人设选择
          │                      │    │ sentenceStr   │    └─────────────────┘
          │ primaryToneMode ─────────→ 语气优先级#4   │
          │ tier3Script    ─────────→ Block 2(Tier3) │
          │ topicBlacklist ─────────→ 人设选择过滤    │
          └──────────────────────┘    │ whatToAvoid   │
                                      │ exampleOpen ──→ Block 2
                                      └───────────────┘
                                             │
                                             ▼
                                      Gemini API 调用
                                             │
                                             ▼
                                    生成回复 / 标题+正文
                                             │
                                             ▼
                                    质量检查 + 相似度检查
                                             │
                                             ▼
                                    写入 Feed（draftContent）
```

---

## 7. 话题规则匹配

### 匹配算法

```
1. 载入所有 isActive=true 的规则
2. 排除版块配置的 excludeRuleIds
3. 关键词匹配（大小写不敏感子串搜索）：
   - topic 与 rule.topicKeywords 逐一比对
   - 命中多条时，按 sensitivityTier 降序排，取最高
4. 无命中时，使用版块 defaultRuleIds 中的规则
5. 都无命中 → 返回 null
```

### 规则影响

| 规则字段 | 如何影响生成 |
|----------|------------|
| sensitivityTier | 决定 Tier 等级（1/2/3），影响语气选择 |
| geminiPromptHint | 注入 Prompt Block 4，额外写作指引 |
| priorityAccountIds | Trends 生成时优先选用的人设 |
| assignToneMode | 预留字段（目前未使用） |

---

## 8. 人设选择策略

### Scanner（回帖）

```
1. 优先使用版块绑定的人设（board.personaBindings）
2. 过滤条件：isActive=true AND postsToday < maxPostsPerDay
3. 无版块绑定时，使用所有活跃人设
4. 排除话题黑名单（persona.topicBlacklist，子串匹配）
5. 从候选中随机选择一个
```

### Trends（新帖）

```
1. 候选：所有活跃人设，postsToday < maxPostsPerDay
2. 排除话题黑名单
3. 如果规则有 priorityAccountIds：
   - 按优先顺序检查，第一个在候选中的即选用
4. 否则随机选择
```

### Custom（手动）

```
- 指定了 personaAccountId → 直接使用
- 未指定 → 使用第一个活跃人设
```

---

## 9. 质量把控

### 内容质量检查（checkQuality）

| 检查项 | 规则 | 结果 |
|--------|------|------|
| 空内容 | 空字串或无效 | 阻断（passed=false） |
| 全标点 | 只有标点符号 | 阻断 |
| 过短 | < 30 字 | 警告 |
| 过长 | > 600 字 | 警告 |
| AI 特征 | 包含「作为一个AI」等模式 | 阻断 |
| 口头禅 | 未包含人设口头禅 | 警告（不阻断） |

### 相似度检查（checkSimilarity）

- 比对同一人设 24 小时内的生成内容
- 使用字符集 Jaccard 相似度
- 阈值：0.85（≥85% 相似判定为重复）
- 重复内容标记 `isDuplicate=true`，添加警告

### AI 特征黑名单

```
作为一个ai, 作为一个ai, 我是语言模型, 我是语言模型,
as an ai, i am a language model, i cannot
```

---

## 10. 内容生命周期

```
┌─────────────────────────────────────────────────────┐
│  生成阶段                                             │
│  Scanner/Trends/Custom → Gemini → draftContent       │
│  finalContent = null, status = pending               │
├─────────────────────────────────────────────────────┤
│  审核阶段                                             │
│  ├─ 直接通过 → status = approved                      │
│  ├─ 编辑后通过 → finalContent = 编辑内容, approved     │
│  ├─ 重新生成 → draftContent = 新内容, finalContent = null │
│  └─ 拒绝 → status = rejected                         │
├─────────────────────────────────────────────────────┤
│  发布阶段                                             │
│  content = finalContent || draftContent              │
│  → 调用 BK Forum API 发帖/回帖                        │
│  → 成功: status = posted                             │
│  → 失败: status = failed, failReason = 错误信息       │
├─────────────────────────────────────────────────────┤
│  失败处理                                             │
│  └─ 重新通过 → status = approved, failReason = null   │
│  └─ 再次发布 → 重试                                   │
└─────────────────────────────────────────────────────┘
```

---

## 11. Google Trends 整合

Scanner 扫描时会尝试匹配 Google 热搜：

```
1. 从 DB 读取最近 1 小时的 Google Trends 数据
2. 帖子标题与趋势标题做词重叠比对
3. 重叠率 ≥ 0.6 视为匹配
4. 匹配成功：
   - Feed source 加入 'trends'
   - Prompt 注入 Block 5（Google 热点）
   - 记录 googleTrends 元数据
```

---

## 12. 当前未使用但已预留的字段

| 字段 | 所属 | 设计意图 |
|------|------|---------|
| `persona.secondaryToneMode` | 人设 | 备选语气，可用于随机化 |
| `persona.avoidedToneMode` | 人设 | 不使用的语气，可在选择时排除 |
| `rule.assignToneMode` | 规则 | 规则级别强制语气，可加入优先级链 |
| `rule.sentimentTrigger` | 规则 | 按情绪触发规则（positive/negative/any） |
| `rule.avoidIf` | 规则 | 规则排除条件 |
| `tone.suitableForTier3` | 语气 | 标记是否适合 Tier 3 场景 |
| `tone.overridePriority` | 语气 | 语气覆盖权重 |

---

## 13. 配置项速查表

| 配置 Key | 类别 | 默认值 | 影响 |
|---------|------|--------|------|
| GEMINI_MODEL | Gemini | gemini-2.5-flash | 使用的模型 |
| GEMINI_TEMPERATURE | Gemini | 0.85 | 生成创造性 |
| GEMINI_MAX_OUTPUT_TOKENS | Gemini | 800 | 最大输出长度 |
| GEMINI_SYSTEM_PROMPT | Gemini | 香港亲子论坛用户 | 系统角色定义 |
| GEMINI_TASK_TEMPLATE | Gemini | 写回复任务指令 | 任务模板 |
| MEDIUM_POST_MAX_CHARS | Gemini | 300 | 帖文最大字数 |
| TONE_OVERRIDE_ON_TIER3 | Gemini | EMPATHISE | Tier 3 强制语气 |
| SENTIMENT_NEGATIVE_THRESHOLD | Gemini | 45 | 负面情绪阈值 |
| SCANNER_TIMEOUT_MINUTES | Scanner | 5 | 扫描超时 |
| SCANNER_RELEVANCE_THRESHOLD | Scanner | 35 | 相关性阈值 |
| MAX_PENDING_QUEUE | 通用 | 100 | 待审队列上限 |
| FEEDS_PER_TREND_PULL | Trends | 5 | 每次拉取生成数 |
| DEFAULT_TREND_FID | Trends | 162 | 新帖默认版块 |
| GOOGLE_TRENDS_MATCH_THRESHOLD | Google | 0.6 | 匹配阈值 |
| GTRENDS_GEO | Google | HK | 地区 |
| GTRENDS_TOP_N | Google | 10 | 拉取数量 |
