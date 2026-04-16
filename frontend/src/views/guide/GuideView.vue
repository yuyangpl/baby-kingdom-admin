<template>
  <div class="guide-view">
    <h1 class="page-title">{{ $t('nav.guide') }}</h1>

    <div class="guide-content">
      <!-- 系统概述 -->
      <el-card shadow="never" class="guide-section">
        <template #header><h2>系统概述</h2></template>
        <p>BK Admin 是 Baby Kingdom 论坛的自动化内容运营后台。系统自动扫描论坛帖子，使用 Gemini AI 生成回复或新帖，经审核后发布到论坛。</p>
        <div class="guide-flow">
          <el-tag type="info">采集/生成</el-tag>
          <span class="guide-arrow">→</span>
          <el-tag type="warning">待审队列</el-tag>
          <span class="guide-arrow">→</span>
          <el-tag>审核/编辑</el-tag>
          <span class="guide-arrow">→</span>
          <el-tag type="success">发布到论坛</el-tag>
        </div>
      </el-card>

      <!-- 两种生成方式 -->
      <el-card shadow="never" class="guide-section">
        <template #header><h2>内容生成方式</h2></template>

        <h3>1. BK 论坛扫描 → 回帖</h3>
        <p>Scanner 自动扫描 BK 论坛的低回复帖子，AI 评估后生成回复内容。扫描时还会尝试匹配 Google Trends 热搜，如果帖子话题命中热搜，会将热搜数据注入 AI 提示词，让回复更具时效性。</p>
        <div class="guide-flow">
          <el-tag size="small" effect="plain">论坛帖子</el-tag>
          <span class="guide-arrow">→</span>
          <el-tag size="small" effect="plain">7 层过滤</el-tag>
          <span class="guide-arrow">→</span>
          <el-tag size="small" effect="plain">AI 评估</el-tag>
          <span class="guide-arrow">→</span>
          <el-tag size="small" effect="plain">人设选择</el-tag>
          <span class="guide-arrow">→</span>
          <el-tag size="small" type="success" effect="plain">匹配 Google Trends</el-tag>
          <span class="guide-arrow">→</span>
          <el-tag size="small" effect="plain">AI 生成回复</el-tag>
          <span class="guide-arrow">→</span>
          <el-tag size="small" type="warning">待审</el-tag>
        </div>

        <h3>2. 趋势话题 → 新帖（MediaLens）</h3>
        <p>从 MediaLens 拉取热门话题，AI 生成完整帖子（标题 + 正文）。也支持手动输入主题生成。</p>
        <div class="guide-flow">
          <el-tag size="small" effect="plain">MediaLens 热门话题</el-tag>
          <span class="guide-arrow">→</span>
          <el-tag size="small" effect="plain">人设选择</el-tag>
          <span class="guide-arrow">→</span>
          <el-tag size="small" effect="plain">AI 生成标题+正文</el-tag>
          <span class="guide-arrow">→</span>
          <el-tag size="small" type="warning">待审</el-tag>
        </div>

        <h3>3. Google Trends → 增强回复</h3>
        <p>Google Trends 数据不直接生成 Feed，而是在 Scanner 扫描时作为增强信息参与。</p>
        <ul>
          <li>系统定期拉取 Google 香港热搜（默认 Top 10）</li>
          <li>Scanner 扫描每个帖子时，将帖子标题与近 1 小时的热搜做词重叠比对</li>
          <li>重叠率 ≥ 60% 视为匹配，匹配后：
            <ul>
              <li>Feed 来源标记为 <code>['scanner', 'trends']</code></li>
              <li>AI 提示词中注入「Google 热点」模块（热搜标题 + 热度）</li>
            </ul>
          </li>
        </ul>
      </el-card>

      <!-- AI 生成详细流程 -->
      <el-card shadow="never" class="guide-section">
        <template #header><h2>AI 生成详细流程</h2></template>
        <p>当系统决定为一条帖子或话题生成内容时，会依次执行以下步骤：</p>

        <h3>Step 1：匹配话题规则</h3>
        <p>将帖子标题与<strong>话题规则</strong>中的关键词做匹配（子串匹配，不区分大小写）。</p>
        <ul>
          <li>命中多条规则时，取敏感度（Tier）最高的一条</li>
          <li>无命中时，使用版块配置的默认规则</li>
          <li>规则决定：<strong>敏感度等级</strong>（Tier 1/2/3）和<strong>额外写作提示</strong>（geminiPromptHint）</li>
        </ul>

        <h3>Step 2：选择人设</h3>
        <ul>
          <li>如果规则指定了<strong>优先人设</strong>（priorityAccountIds），优先使用</li>
          <li>否则从版块绑定的人设中随机选择，或从所有活跃人设中选</li>
          <li>过滤条件：<strong>今日发帖未超限</strong>、<strong>话题不在黑名单中</strong></li>
        </ul>

        <h3>Step 3：决定语气</h3>
        <p>按优先级从高到低选择语气模式：</p>
        <ol>
          <li>Tier 3 → 强制使用共情语气（EMPATHISE）</li>
          <li>情绪分 ≤ 45 → 自动切换为共情</li>
          <li>AI 评估建议的语气</li>
          <li>人设的<strong>主要语气</strong>（primaryToneMode）</li>
          <li>默认 INFO_SHARE</li>
        </ol>

        <h3>Step 4：拼装 AI 提示词（Prompt）</h3>
        <p>Gemini 的提示词由 6 个模块拼接而成，每个模块的数据来源不同：</p>
        <el-table :data="promptBlocks" border stripe size="small" style="margin-top: 12px;">
          <el-table-column prop="block" label="模块" width="140" />
          <el-table-column prop="source" label="数据来源" width="160" />
          <el-table-column prop="content" label="写入内容" />
        </el-table>

        <h3>Step 5：调用 Gemini 生成</h3>
        <ul>
          <li>将拼装好的提示词发送给 Gemini AI</li>
          <li>回帖：直接返回回复文本</li>
          <li>新帖：返回「标题：xxx」+「正文：xxx」格式，系统自动解析</li>
        </ul>

        <h3>Step 6：质量检查</h3>
        <ul>
          <li>检查内容长度（30~600 字）</li>
          <li>检查是否包含 AI 特征词（如"作为一个AI"）</li>
          <li>检查与同一人设近 24 小时内容的相似度（≥85% 标记为重复）</li>
          <li>检查是否包含人设的常用语（未包含则警告）</li>
        </ul>
      </el-card>

      <!-- 审核流程 -->
      <el-card shadow="never" class="guide-section">
        <template #header><h2>审核流程</h2></template>

        <h3>工作台模式（审阅者）</h3>
        <ol>
          <li><strong>开始审核</strong> — 点击后从待审池批量认领 10 条，进入聚焦审核模式</li>
          <li><strong>逐条审核</strong> — 一次显示一条，可以编辑、重新生成、发布、拒绝或跳过</li>
          <li><strong>键盘快捷键</strong> — <kbd>J</kbd> 发布 / <kbd>K</kbd> 拒绝 / <kbd>S</kbd> 跳过 / <kbd>O</kbd> 查看原帖</li>
          <li><strong>批次完成</strong> — 处理完后可继续抽取下一批</li>
          <li><strong>结束审核</strong> — 未处理的内容自动释放回待审池</li>
        </ol>

        <h3>状态流转</h3>
        <div class="guide-status-flow">
          <div class="guide-status-item">
            <el-tag type="warning">待审 pending</el-tag>
            <div class="guide-status-actions">
              <span>→ 发布 → <el-tag type="success" size="small">已发布 posted</el-tag></span>
              <span>→ 发布失败 → <el-tag type="danger" size="small">失败 failed</el-tag></span>
              <span>→ 拒绝 → <el-tag type="info" size="small">已拒绝 rejected</el-tag></span>
            </div>
          </div>
          <div class="guide-status-item">
            <el-tag type="danger">失败 failed</el-tag>
            <span>→ 撤回待审 → <el-tag type="warning" size="small">待审 pending</el-tag></span>
          </div>
          <div class="guide-status-item">
            <el-tag type="info">已拒绝 rejected</el-tag>
            <span>→ 撤回待审 → <el-tag type="warning" size="small">待审 pending</el-tag></span>
          </div>
        </div>
      </el-card>

      <!-- 敏感度分级 -->
      <el-card shadow="never" class="guide-section">
        <template #header><h2>敏感度分级（Tier）</h2></template>
        <p>系统根据话题内容自动判断敏感度，影响 AI 生成时的语气策略：</p>
        <el-table :data="tierData" border stripe size="small" style="margin-top: 12px;">
          <el-table-column prop="tier" label="等级" width="100" />
          <el-table-column prop="level" label="级别" width="80" />
          <el-table-column prop="desc" label="含义" />
          <el-table-column prop="effect" label="对生成的影响" />
        </el-table>
      </el-card>

      <!-- 语气模式 -->
      <el-card shadow="never" class="guide-section">
        <template #header><h2>语气模式</h2></template>
        <p>AI 生成内容时会根据优先级链选择语气：</p>
        <ol>
          <li><strong>Tier 3 强制</strong> — 敏感话题一律使用共情语气（EMPATHISE）</li>
          <li><strong>负面情绪</strong> — 情绪分 ≤ 45 自动切换为共情</li>
          <li><strong>评估建议</strong> — AI 评估时推荐的语气</li>
          <li><strong>人设主语气</strong> — 人设配置的默认语气</li>
          <li><strong>系统默认</strong> — INFO_SHARE（资讯分享）</li>
        </ol>
        <el-table :data="toneData" border stripe size="small" style="margin-top: 12px;">
          <el-table-column prop="id" label="ID" width="120" />
          <el-table-column prop="name" label="名称" width="100" />
          <el-table-column prop="scene" label="适用场景" />
        </el-table>
      </el-card>

      <!-- 人设管理 -->
      <el-card shadow="never" class="guide-section">
        <template #header><h2>人设管理</h2></template>
        <p>每个人设代表一个 BK 论坛账号身份，影响 AI 生成的风格：</p>
        <el-table :data="personaFields" border stripe size="small" style="margin-top: 12px;">
          <el-table-column prop="field" label="字段" width="140" />
          <el-table-column prop="desc" label="说明" />
        </el-table>
      </el-card>

      <!-- 话题规则 -->
      <el-card shadow="never" class="guide-section">
        <template #header><h2>话题规则</h2></template>
        <p>话题规则用于匹配特定话题并应用特殊策略：</p>
        <ul>
          <li><strong>关键词匹配</strong> — 帖子标题与规则关键词做子串匹配（不区分大小写）</li>
          <li><strong>敏感度</strong> — 命中规则时使用规则的 Tier 等级</li>
          <li><strong>额外提示</strong> — 规则的 geminiPromptHint 会注入到 AI Prompt 中</li>
          <li><strong>优先人设</strong> — 趋势生成时优先选用规则指定的人设</li>
        </ul>
      </el-card>

      <!-- 角色权限 -->
      <el-card v-if="auth.isAdmin" shadow="never" class="guide-section">
        <template #header><h2>角色权限</h2></template>
        <el-table :data="roleData" border stripe size="small" style="margin-top: 12px;">
          <el-table-column prop="feature" label="功能" width="160" />
          <el-table-column prop="admin" label="管理员" width="100" align="center" />
          <el-table-column prop="approver" label="审阅者" width="100" align="center" />
          <el-table-column prop="viewer" label="检视者" width="100" align="center" />
        </el-table>
      </el-card>

      <!-- Cloud Scheduler 调度配置 -->
      <el-card v-if="auth.isAdmin" shadow="never" class="guide-section">
        <template #header><h2>Cloud Scheduler 定时调度</h2></template>
        <p>系统通过 Google Cloud Scheduler 定时触发后端任务接口，所有接口均为 <code>POST</code> 方法，无需认证（内网调用）。</p>

        <h3>调度任务列表</h3>
        <el-table :data="schedulerData" border stripe size="small" style="margin-top: 12px;">
          <el-table-column prop="name" label="任务名" width="140" />
          <el-table-column prop="endpoint" label="接口地址" width="200">
            <template #default="{ row }">
              <code>{{ row.endpoint }}</code>
            </template>
          </el-table-column>
          <el-table-column prop="schedule" label="建议频率" width="120" />
          <el-table-column prop="pause" label="暂停开关" width="180">
            <template #default="{ row }">
              <code>{{ row.pause }}</code>
            </template>
          </el-table-column>
          <el-table-column prop="desc" label="说明" />
        </el-table>

        <h3>Poster 自动发帖流程</h3>
        <p>Poster 定时任务会遍历所有待审 Feed，根据 AI 评估的 <code>relevanceScore</code> 与阈值 <code>AUTO_POST_THRESHOLD</code>（默认 80）比较：</p>
        <ol>
          <li><strong>首次扫到</strong>（autoPostAttempts=0）— 评分达标直接发帖，不达标标记 +1 留待下次</li>
          <li><strong>再次扫到</strong>（autoPostAttempts≥1）— 先重新生成内容，再看新评分是否达标</li>
          <li><strong>发帖失败</strong> — 不重试，标记为 failed</li>
          <li><strong>安全检查</strong> — 回帖需 board.enableAutoReply=true，人设需 isActive 且未超日限额</li>
        </ol>

        <h3>Cloud Scheduler 配置示例（GCP Console）</h3>
        <el-table :data="schedulerConfigData" border stripe size="small" style="margin-top: 12px;">
          <el-table-column prop="field" label="配置项" width="140" />
          <el-table-column prop="value" label="参考值" />
        </el-table>

        <h3>相关系统配置项</h3>
        <el-table :data="schedulerRelatedConfigs" border stripe size="small" style="margin-top: 12px;">
          <el-table-column prop="key" label="配置 Key" width="220">
            <template #default="{ row }">
              <code>{{ row.key }}</code>
            </template>
          </el-table-column>
          <el-table-column prop="category" label="分类" width="120" />
          <el-table-column prop="desc" label="说明" />
        </el-table>
      </el-card>

      <!-- 快捷键 -->
      <el-card shadow="never" class="guide-section">
        <template #header><h2>键盘快捷键（工作台）</h2></template>
        <el-table :data="shortcutData" border stripe size="small" style="margin-top: 12px;">
          <el-table-column prop="key" label="按键" width="100" />
          <el-table-column prop="action" label="操作" />
        </el-table>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuthStore } from '../../stores/auth'

const auth = useAuthStore()

onMounted(() => {
  document.querySelector('.main-content')?.scrollTo(0, 0)
})

const tierData = [
  { tier: 'Tier 1', level: '安全', desc: '日常话题，无争议', effect: '正常语气，自由发挥' },
  { tier: 'Tier 2', level: '中等', desc: '涉及健康/育儿敏感点', effect: '语气谨慎，避免绝对化建议' },
  { tier: 'Tier 3', level: '敏感', desc: '涉及心理健康/家庭危机', effect: '强制共情语气，使用 tier3Script' },
]

const toneData = [
  { id: 'INFO_SHARE', name: '资讯分享', scene: '一般话题，分享知识' },
  { id: 'SHARE_EXP', name: '经验分享', scene: '个人经历相关话题' },
  { id: 'EMPATHISE', name: '共情', scene: '负面情绪、敏感话题' },
  { id: 'ASK_ENGAGE', name: '提问互动', scene: '轻松话题，引发讨论' },
  { id: 'CASUAL', name: '随意闲聊', scene: '日常轻松话题' },
]

const personaFields = [
  { field: '角色类型', desc: '如 pregnant（孕期）、first-time-mom（新手妈妈）、multi-kid（多孩）、school-age（学龄）' },
  { field: '语气提示', desc: '说话特点，如"爱用 emoji"、"语气温柔亲切"' },
  { field: '常用语', desc: '口头禅，如"真系㗎"、"好紧张呀"' },
  { field: '主要语气', desc: '默认使用的语气模式（优先级第4）' },
  { field: 'Tier3 脚本', desc: '遇到敏感话题时的特殊回复脚本，会覆盖语气设定' },
  { field: '话题黑名单', desc: '该人设不参与的话题关键词' },
  { field: '每日上限', desc: '每天最多发帖数量' },
]

const roleData = [
  { feature: '仪表盘', admin: '✓', approver: '—', viewer: '—' },
  { feature: '我的工作台', admin: '—', approver: '✓', viewer: '✓' },
  { feature: '发布队列（查看）', admin: '✓', approver: '✓（自己的）', viewer: '✓' },
  { feature: '审核/发布/拒绝', admin: '✓', approver: '✓', viewer: '—' },
  { feature: '编辑/重新生成', admin: '✓', approver: '✓', viewer: '—' },
  { feature: '人设/语气/规则（查看）', admin: '✓', approver: '✓', viewer: '—' },
  { feature: '人设/语气/规则（增删）', admin: '✓', approver: '—', viewer: '—' },
  { feature: '系统配置', admin: '✓', approver: '—', viewer: '—' },
  { feature: '采集源管理', admin: '✓', approver: '—', viewer: '—' },
  { feature: '用户管理', admin: '✓', approver: '—', viewer: '—' },
]

const promptBlocks = [
  { block: '角色设定', source: '人设管理', content: '账号名、角色类型（孕期/新手妈妈等）、语气提示（说话特点）、常用语（口头禅）' },
  { block: '语气指引', source: '语气模式 / 人设 Tier3 脚本', content: '情感基调、开场风格、句式提示、避免事项、示例开场。Tier 3 时使用人设的 tier3Script 覆盖' },
  { block: '话题信息', source: '帖子标题 / 趋势话题', content: '话题名称、摘要、情绪分、敏感度等级' },
  { block: '额外写作指引', source: '话题规则', content: '规则中的 geminiPromptHint（仅命中规则时出现）' },
  { block: 'Google 热点', source: 'Google Trends', content: '热搜标题、热度（仅匹配时出现）' },
  { block: '任务模板', source: '系统配置', content: '字数限制、输出格式要求。新帖时额外要求生成标题' },
]

const schedulerData = [
  { name: 'Scanner', endpoint: 'POST /tasks/scanner', schedule: '每 15–30 分钟', pause: 'SCANNER_PAUSED', desc: '扫描 BK 论坛低回复帖子，AI 评估后生成回复 Feed' },
  { name: 'Trends', endpoint: 'POST /tasks/trends', schedule: '每 60 分钟', pause: 'TRENDS_PAUSED', desc: '从 MediaLens 拉取热门话题，生成新帖 Feed' },
  { name: 'Poster', endpoint: 'POST /tasks/poster', schedule: '每 30–60 分钟', pause: 'POSTER_PAUSED', desc: '遍历待审 Feed，评分达标自动发帖，不达标重新生成' },
  { name: 'Google Trends', endpoint: 'POST /tasks/gtrends', schedule: '每 30 分钟', pause: 'GTRENDS_PAUSED', desc: '拉取 Google 香港热搜，Scanner 扫描时用于增强匹配' },
]

const schedulerConfigData = [
  { field: '目标类型', value: 'HTTP' },
  { field: 'URL', value: 'https://<your-domain>/tasks/scanner（各任务替换路径）' },
  { field: '方法', value: 'POST' },
  { field: '频率 (cron)', value: '*/15 * * * *（Scanner 示例，每 15 分钟）' },
  { field: '时区', value: 'Asia/Hong_Kong' },
  { field: '重试次数', value: '0（不重试，下次调度会自动补偿）' },
  { field: '超时', value: '300s（Scanner/Poster 可能耗时较长）' },
]

const schedulerRelatedConfigs = [
  { key: 'SCANNER_PAUSED', category: 'General', desc: '暂停 Scanner 扫描任务' },
  { key: 'TRENDS_PAUSED', category: 'General', desc: '暂停 MediaLens 趋势拉取' },
  { key: 'POSTER_PAUSED', category: 'General', desc: '暂停自动发帖任务' },
  { key: 'GTRENDS_PAUSED', category: 'General', desc: '暂停 Google Trends 拉取' },
  { key: 'AUTO_POST_THRESHOLD', category: 'BK Forum', desc: '自动发帖评分阈值（默认 80），relevanceScore ≥ 此值才发帖' },
  { key: 'SCANNER_RELEVANCE_THRESHOLD', category: 'Scanner', desc: 'AI 评估相关性阈值（默认 35），低于此值不生成 Feed' },
  { key: 'MAX_PENDING_QUEUE', category: 'MediaLens', desc: '待审队列上限（默认 300），超过后暂停生成' },
  { key: 'BK_RATE_LIMIT_SECONDS', category: 'BK Forum', desc: '发帖最小间隔秒数（默认 35s）' },
]

const shortcutData = [
  { key: 'J', action: '发布当前内容到论坛' },
  { key: 'K', action: '拒绝（弹出备注框）' },
  { key: 'S', action: '跳过（释放回待审池）' },
  { key: 'O', action: '在新标签页打开原帖' },
]
</script>

<style scoped>
.guide-view {
  max-width: 900px;
}
.guide-view .page-title {
  margin-bottom: 20px;
}
.guide-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.guide-section h2 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}
.guide-section h3 {
  font-size: 14px;
  font-weight: 600;
  margin: 16px 0 8px;
  color: var(--el-text-color-primary);
}
.guide-section p {
  font-size: 14px;
  line-height: 1.7;
  color: var(--el-text-color-regular);
  margin: 8px 0;
}
.guide-section ol, .guide-section ul {
  font-size: 14px;
  line-height: 2;
  padding-left: 20px;
  color: var(--el-text-color-regular);
}
.guide-section kbd {
  background: var(--el-fill-color);
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 12px;
  font-family: 'SF Mono', monospace;
}
.guide-flow {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 12px 0;
}
.guide-arrow {
  color: var(--el-text-color-secondary);
  font-size: 14px;
}
.guide-status-flow {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 0;
}
.guide-status-item {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.guide-status-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
</style>
