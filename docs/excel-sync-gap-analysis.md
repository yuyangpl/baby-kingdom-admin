# Excel ↔ 项目同步差异分析与修正计划

> 对比文档: `BK Seeding Operations.xlsx` vs `baby-kingdom-new` 项目
> 生成日期: 2026-04-08

---

## 一、总体验证结果

| 模块 | 状态 | 严重度 | 说明 |
|------|------|--------|------|
| Tone Modes (5个) | ⚠️ 内容偏差 | 中 | Schema完整，但种子数据内容被简化，与Excel原文有显著差异 |
| Personas (30个) | ❌ 严重缺失 | 高 | 仅10/30完整，BK011-BK030为桩数据，20个人设缺少7个关键字段；bkUid全部缺失；多个username不匹配 |
| Topic Rules (22条) | ❌ 缺少10条 | 高 | 仅12/22条存在，RULE-013到RULE-022完全缺失；已有12条内容被简化 |
| Config (46项) | ✅ 完整 | — | 23个Excel配置项全部已含 |
| Feed Model | ⚠️ 缺字段 | 中 | 缺少 trendTopic, trendSummary 两个字段 |
| Prompt Builder | ✅ 8层完整 | 低 | {post_type}/{length}占位符未替换；emotionalRegister/exampleOpening未用于prompt |

---

## 二、逐项差异详细对比

### 2.1 Tone Modes — 内容差异

**所有5个Tone ID均已存在，但具体内容与Excel原文不同：**

| 字段 | INFO_SHARE 当前 | INFO_SHARE Excel原文 |
|------|----------------|---------------------|
| openingStyle | 開門見山切入主題。可用【標題】格式。列點清晰。 | 開門見山切入主題。可用【標題】格式。列點清晰，每點一行。 |
| sentenceStructure | 多用列點或分段。句子簡短有力。 | 多用列點或分段。句子簡短有力。可用數字排序增加可信度。避免長段落。 |
| whatToAvoid | 不要太學術化；避免命令式語氣 | 不要太學術化；避免命令式語氣（「你應該…」「你要…」）；唔好給人高高在上嘅感覺；唔好over-claim效果 |

| 字段 | EMPATHISE 当前 | EMPATHISE Excel原文 |
|------|----------------|---------------------|
| openingStyle | 先回應對方感受再展開。用「明白」「理解」開頭。 | 第一句必須acknowledge感受，唔好jump to advice。用「我明白…」「我完全理解…」「聽到你咁講，我都好心疼」開頭。 |
| sentenceStructure | 短句。留白。少用句號多用省略號。 | 短句。換行多。唔好長段落——沉重話題用白空間讓人喘氣。結尾用鼓勵句，唔好問題句。 |
| whatToAvoid | 唔好說教；唔好比較；唔好淡化感受 | 絕對唔好評判對方選擇；唔好話「你咁做係錯嘅」；唔好即刻positive spin（「但係正面諗…」）；唔好給未要求嘅建議；唔好話「我明白但係…」——「但係」會cancel前面所有empathy |

**其余3个Tone同样有类似简化情况（ASK_ENGAGE、SHARE_EXP、CASUAL）。**

**overridePriority 值差异：**
| Tone | 当前 | Excel |
|------|------|-------|
| EMPATHISE | 1 | 1 ✅ |
| ASK_ENGAGE | 2 | 5 ❌ |
| INFO_SHARE | 3 | 3 ✅ |
| SHARE_EXP | 4 | 4 ✅ |
| CASUAL | 5 | 6 ❌ |

---

### 2.2 Personas — 缺失汇总

#### A. BK001-BK010: 存在但内容与Excel不同

| AccountID | 当前username | Excel username | username匹配 |
|-----------|-------------|----------------|-------------|
| BK001 | ttc_journey_ling | ttc_journey_ling | ✅ |
| BK002 | pregnant_first_yuki | pregnant_first_yuki | ✅ |
| BK003 | ivf_hope_mandy | ivf_hope_mandy | ✅ |
| BK004 | second_trimester_sam | second_trimester_sam | ✅ |
| BK005 | due_date_anxious_hk | late_pregnancy_venus | ❌ |
| BK006 | ttc_long_road_fay | pcos_ttc_chloe | ❌ |
| BK007 | morning_sick_joyce | twin_pregnancy_fiona | ❌ |
| BK008 | newborn_chaos_mei | newborn_mum_grace | ❌ |
| BK009 | sleepless_mama_grace | breastfeed_struggle_ann | ❌ |
| BK010 | breastfeed_warrior_iris | first_mum_research_kelly | ❌ |

**BK005-BK010 的 username、voiceCues、catchphrases、tier3Script、topicBlacklist 全部与Excel不匹配。**

#### B. BK011-BK030: 仅有桩数据

| 字段 | 当前状态 | Excel要求 |
|------|---------|-----------|
| username | `user_011`~`user_030` 占位符 | 30个真实BK论坛用户名 |
| secondaryToneMode | 空 | 每人各有指定 |
| avoidedToneMode | 空 | 每人各有指定 |
| voiceCues | 空数组 | 每人3-5条详细说话特点 |
| catchphrases | 空数组 | 每人3-4条口头禅 |
| tier3Script | 空 | 每人独特的Tier3敏感话题处理脚本 |
| topicBlacklist | 空数组 | 每人2-3个回避话题 |

#### C. 全部30人缺失 bkUid

Excel提供了30个BK论坛UID（如 BK001=3459486, BK002=3460893 等），当前种子数据未包含。

#### D. BK论坛真实用户名映射（Excel Account Credentials sheet）

| AccountID | BK Username | BK UID |
|-----------|-------------|--------|
| BK001 | hahabubu | 3459486 |
| BK002 | intothelight | 3460893 |
| BK003 | EmmaU | 3461600 |
| BK004 | Thewmom | 3462315 |
| BK005 | 1628Marcy | 3464083 |
| BK006 | bbcomela | 3553688 |
| BK007 | chuchubbbu | 3547458 |
| BK008 | danandmei | 3562467 |
| BK009 | evaccch0302 | 3572081 |
| BK010 | fate&destiny | 3572234 |
| BK011 | giana715 | 3575192 |
| BK012 | happypandababy | 3577977 |
| BK013 | irenemumu | 3579308 |
| BK014 | juliafa | 3580111 |
| BK015 | kurorokuroro | 3581715 |
| BK016 | LORAFA | 3582611 |
| BK017 | minimine | 3583331 |
| BK018 | nanabuy | 3583927 |
| BK019 | okayicy | 3584214 |
| BK020 | paksum507 | 3585009 |
| BK021 | qqday | 3585843 |
| BK022 | raniceci | 3586230 |
| BK023 | sueming | 3586650 |
| BK024 | tinchingho | 3587207 |
| BK025 | ulovemebabe | 3587365 |
| BK026 | 88FATTAT | 3588095 |
| BK027 | VIVIANCN | 3588660 |
| BK028 | WinWinWon | 3589242 |
| BK029 | xo_8198 | 3589619 |
| BK030 | yauyauyee | 3590000 |

> 注：Persona model 中的 `username` 字段是人设名（如 ttc_journey_ling），而 `bkUsername` 是BK论坛真实用户名（如 hahabubu）。这两者在Feed model中分别对应 displayName 和 bkUsername。

---

### 2.3 Topic Rules — 缺失10条

**当前存在 (12条):** RULE-001 ~ RULE-012
**完全缺失 (10条):** RULE-013 ~ RULE-022

缺失的规则及Excel完整定义：

| Rule ID | 话题关键词 | Tier | 情感 | 优先帐号 | 语气 | 帖类型 | Avoid If | Gemini提示 |
|---------|-----------|------|------|---------|------|--------|----------|-----------|
| RULE-013 | 高齡產婦, 35歲以上, 高齡懷孕, 大齡生育 | 2 | Any | BK019, BK003, BK006 | SHARE_EXP | New Post | Never stigmatise age; never quote complication statistics | 正面角度。BK019感性視角。說「年紀係數字，你對家庭嘅愛係最重要嘅事」。 |
| RULE-014 | 幼稚園, K1面試, 升小, 幼稚園選校, 面試技巧 | 1 | Positive | BK025, BK024 | INFO_SHARE | New Post | — | 列攻略。BK025興奮型。BK024分析型。結尾必須說「唔係世界末日，孩子開心健康先係最重要」。 |
| RULE-015 | 小學, 補習, 功課壓力, DSE規劃, 學業壓力 | 2 | Any | BK024, BK026 | INFO_SHARE | New Post | Avoid pressure-inducing framing | BK024分析型。BK026提醒勿過度施壓。平衡academic achievement vs wellbeing。 |
| RULE-016 | ADHD, 專注力, 特殊教育, SEN, 學習困難 | 3 | Negative | BK027 | EMPATHISE | New Post or Reply | NEVER use ADHD as negative label; never compare to neurotypical kids | BK027倡導語氣。「每個孩子都有自己嘅節奏」。提供具體資源如教育局特殊教育支援。 |
| RULE-017 | 慳錢, 二手, 平價, 省錢育兒, 節省 | 1 | Any | BK021, BK013 | SHARE_EXP | New Post or Reply | Avoid high-income personas | 實際platform推介。BK021親切。說「慳到就係賺到，係愛錫家人嘅方式」。 |
| RULE-018 | 政府津貼, 育兒補貼, 托兒政策, 申請期限 | 1 | Positive | BK021, BK025, BK009 | INFO_SHARE | New Post | — | 具體金額及申請期限。提醒截止日期。廣泛觸及所有archetype。 |
| RULE-019 | 精英運動, 游泳, 體育訓練, 才藝班, 興趣班 | 1 | Any | BK028, BK025 | SHARE_EXP | Reply | — | BK028運動視角。BK025才藝視角。不強迫任何選擇。說「找到孩子真正喜歡嘅先係最重要」。 |
| RULE-020 | 單親, 離婚後育兒, 獨力照顧, 爸爸不在 | 3 | Negative | BK029, BK011 | EMPATHISE | Reply only | Never reference absent parent; never suggest reconciliation | BK029親身感受先。說「你一個人照顧孩子係好偉大嘅，孩子係幸運嘅」。提供香港單親家長資源。 |
| RULE-021 | 國際學校, 外國學校, 海外升學, 英國學校 | 1 | Any | BK030, BK022 | INFO_SHARE | New Post | Avoid personas without international context | BK030海歸視角。比較制度優劣但保持中立。不貶低本地學校。 |
| RULE-022 | 中醫, 調理, 坐月, 產後調理, 中西醫 | 1 | Any | BK001, BK003, BK019 | SHARE_EXP | Reply | Never give specific herbal doses or prescriptions | 分享自身中醫師建議。必須說「最好搵信任嘅中醫師根據個人情況診斷」。 |

**已有12条规则内容也被简化：**

例如 RULE-003 当前: `睡眠訓練, 睡過夜, 夜奶`
Excel原文: `嬰兒睡眠, 睡眠訓練, 夜奶, 夜醒` (关键词不同)

例如 RULE-004 当前: `副食品, BLW, 加固, 食譜`
Excel原文: `副食品, 離乳食, 4個月, 6個月, 起步年齡` (关键词完全不同)

---

### 2.4 Feed Model — 缺少2个字段

| 缺失字段 | 类型 | 用途 | Excel对应列 |
|---------|------|------|------------|
| `trendTopic` | String | 趋势话题标题 | Trend Topic (col E) |
| `trendSummary` | String | 趋势摘要 | Trend Summary (col F) |

> `charCount` (当前) = `Chars` (Excel)，功能一致仅命名不同，不需修改。
> `adminEdit` (当前) = `Admin Edit?` (Excel)，已存在 ✅

---

### 2.5 Prompt Builder — 小问题

| 问题 | 严重度 | 说明 |
|------|--------|------|
| `{post_type}` 未替换 | 低 | GEMINI_TASK_TEMPLATE 中有 `{post_type}` 占位符但代码未替换 |
| `{length}` 未替换 | 低 | 同上 |
| `emotionalRegister` 未进入prompt | 低 | Schema有此字段但未注入Gemini prompt |
| `exampleOpening` 未进入prompt | 低 | 同上，可作为few-shot示例 |

---

## 三、修正计划

### Phase 1: 种子数据同步 (高优先级)

#### Task 1.1: 更新5个Tone Mode为Excel完整内容
**文件:** `backend/src/seeds/import-data.ts`
**改动:**
- 用Excel原文替换所有5个Tone的 openingStyle、sentenceStructure、whatToAvoid、exampleOpening
- 修正 overridePriority: ASK_ENGAGE → 5, CASUAL → 6

#### Task 1.2: 补全30个Persona完整数据
**文件:** `backend/src/seeds/import-data.ts`
**改动:**
- 修正 BK005-BK010 的 username 及所有字段为Excel原文
- 用Excel完整数据替换 BK011-BK030 的桩代码（补全 secondaryToneMode、avoidedToneMode、voiceCues、catchphrases、tier3Script、topicBlacklist、maxPostsPerDay）
- 为所有30个Persona添加 bkUid 字段

#### Task 1.3: 补全22条Topic Rules
**文件:** `backend/src/seeds/import-data.ts`
**改动:**
- 用Excel原文更新 RULE-001 ~ RULE-012 的关键词和提示内容
- 新增 RULE-013 ~ RULE-022 完整定义

#### Task 1.4: 创建数据迁移脚本
**新文件:** `backend/src/seeds/sync-excel-data.ts`
**功能:** 对已有数据库执行 upsert（而非仅在不存在时创建），确保旧数据被更新为Excel最新内容

---

### Phase 2: Schema补全 (中优先级)

#### Task 2.1: Feed Model 添加 trendTopic 和 trendSummary
**文件:** `backend/src/modules/feed/feed.model.ts`
**改动:**
```typescript
// 在 trendSource 后添加:
trendTopic: String,
trendSummary: String,
```

#### Task 2.2: Scanner/Trends 写入新字段
**文件:** `backend/src/modules/scanner/scanner.service.ts`, `backend/src/modules/trends/trends.service.ts`
**改动:** 创建Feed时填充 trendTopic 和 trendSummary

#### Task 2.3: Feed前端展示新字段
**文件:** `frontend/src/views/feed/FeedView.vue`
**改动:** 在Feed详情中展示 trendTopic 和 trendSummary

---

### Phase 3: Prompt Builder优化 (低优先级)

#### Task 3.1: 替换Task Template占位符
**文件:** `backend/src/modules/gemini/prompt.builder.ts`
**改动:** 替换 `{post_type}` 和 `{length}` 占位符

#### Task 3.2: 注入 emotionalRegister 和 exampleOpening
**文件:** `backend/src/modules/gemini/prompt.builder.ts`
**改动:** 在Tone block中加入这两个字段作为上下文

---

## 四、影响评估

| Phase | 涉及文件数 | 风险 | 向后兼容 |
|-------|-----------|------|---------|
| Phase 1 | 1-2 | 低（仅更新种子数据） | ✅ 完全兼容 |
| Phase 2 | 4-5 | 低（新增可选字段） | ✅ 新字段可选，旧数据不受影响 |
| Phase 3 | 1 | 极低（增强prompt质量） | ✅ 完全兼容 |

---

## 五、执行顺序建议

1. **先执行 Phase 1** — 这是数据正确性问题，影响AI生成质量
2. **再执行 Phase 2** — 补全数据模型，确保信息不丢失
3. **最后 Phase 3** — 优化prompt质量
