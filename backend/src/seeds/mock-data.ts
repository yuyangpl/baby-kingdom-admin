/**
 * Generate realistic mock data for demo/development.
 * Idempotent: skips collections that already have data.
 *
 * Run: cd backend && npx tsx src/seeds/mock-data.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../shared/database.js';
import Feed from '../modules/feed/feed.model.js';
import Trend from '../modules/trends/trends.model.js';
import GoogleTrend from '../modules/google-trends/google-trends.model.js';
import AuditLog from '../modules/audit/audit.model.js';
import DailyStats from '../modules/dashboard/dashboard.model.js';
import QueueJob from '../modules/queue/queue.model.js';
import User from '../modules/auth/auth.model.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number, decimals = 2): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(randInt(0, 23), randInt(0, 59), randInt(0, 59), 0);
  return d;
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 3600_000 + randInt(0, 3600_000));
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Data pools
// ---------------------------------------------------------------------------

const THREAD_SUBJECTS = [
  '有冇媽媽試過BB半夜唔肯瞓？',
  '幼稚園面試準備攻略分享',
  '湊B好累，有冇人同感？',
  '邊間奶粉比較好？求推薦',
  '產後抑鬱點算好？',
  '請問幾時開始食副食品？',
  'BB濕疹反覆發作，有冇好方法？',
  '想問下大家幾時戒夜奶？',
  '揀幼稚園好頭痕，有冇建議？',
  '二胎媽媽壓力好大，有冇同路人？',
  '母乳餵到幾時先好？',
  '老公唔幫手湊B，點算？',
  '有冇人試過BLW加固？',
  'BB成日唔肯食飯，好煩惱',
  '陪月姐姐邊個好？求介紹',
  '坐月子要注意啲乜？',
  '剖腹產後幾耐可以做運動？',
  '小朋友幾歲開始學游水好？',
  'BB發燒38度使唔使去急症？',
  '有冇媽媽用開邊款BB車？',
  '全職媽媽好定返工好？',
  '點樣幫BB建立睡眠routine？',
  '懷孕初期食咩好？有冇禁忌？',
  'K1面試問咩問題？',
  '有冇人試過請菲傭湊BB？',
  '產後脫髮好嚴重，幾時先停？',
  '小朋友成日病，點樣增強抵抗力？',
  'BB幾個月開始出牙？',
  '點揀BB奶樽？邊隻牌子好用？',
  '大肚期間可唔可以食雪糕？',
];

const DRAFT_REPLIES = [
  '我都有同感呀！我BB之前都係咁，後來我試咗調整佢嘅作息時間，慢慢就好咗。你可以試下，加油呀～',
  '明白你嘅感受，真係唔容易。我嗰時都覺得好辛苦，但慢慢就會適應㗎。有咩需要傾可以搵我呀。',
  '分享下我嘅經驗：我BB大概六個月開始加固，一開始都唔肯食，後來發現佢鍾意甜薯同南瓜泥，你可以試下。',
  '呢個問題我都研究咗好耐！最後我揀咗XX牌，性價比幾高，BB飲咗之後消化都幾好。不過每個BB唔同，建議你問下兒科醫生。',
  '我係過來人，真係好理解你嘅心情。產後嗰段時間係最辛苦嘅，記住唔好咩都自己硬撐，有需要就搵人幫手。',
  '我嗰陣都好擔心呢個問題！後來問咗健康院姑娘，佢話係正常嘅，只要BB精神好、食得好就唔使太擔心。',
  '我都有類似經歷，真係好辛苦。不過每個小朋友都唔同，慢慢嚟就得㗎。你已經做得好好，唔好太大壓力。',
  '哈哈我都係咁諗！最後我揀咗折衷方案，返part-time，又可以陪BB又有自己空間，你可以考慮下。',
  '作為IVF姐妹，我好明白呢條路有幾辛苦。但係一定唔好放棄，相信自己，我哋一齊加油！',
  '我BB之前都有呢個問題，後來我用咗一個方法就好咗好多。你可以試下瞓之前沖暖水涼同按摩，幫助佢放鬆。',
  '其實每個BB發展進度唔同，唔好同人比較。我BB都係遲咗少少，但兒科醫生話完全正常，放心。',
  '好明白你嘅焦慮！我嗰時都係咁，後來發現其實唔使太緊張，小朋友適應力好強㗎。面試嗰日保持輕鬆就好。',
  '我用緊XX牌BB車，推咗成年幾，好順滑又輕便。不過要睇你嘅需要，如果成日搭港鐵就要揀摺得細嘅。',
  '湊B真係好攰，但你唔係一個人㗎！建議你同老公傾清楚分工，大家一齊分擔會好好多。',
  '我都有同樣煩惱呀，後來我報咗個playgroup，BB又開心我又可以識到其他媽媽傾下偈，推薦你試下！',
  '明白㗎，呢個決定真係唔容易。不過無論點揀，最重要係你同BB都開心健康。支持你！',
  '你好勇敢分享出嚟！我之前都有類似經歷，後來睇咗輔導，慢慢好返。記住求助唔係軟弱，係愛自己嘅表現。',
  '講返我自己嘅經歷，大概四個月就開始出牙，嗰陣成日流口水同咬嘢，用凍牙膠會舒服啲。',
  '我都有研究過，最後揀咗玻璃奶樽，易清潔又耐用。不過塑膠嘅出街帶就方便啲，可以兩款都備住。',
  '唉，我都有同感…懷孕嗰陣好多嘢唔食得，其實偶爾食少少雪糕係冇問題嘅，唔好太大壓力呀。',
  '分享下我嘅心得：戒夜奶大概10個月開始，一開始用減量方法，大概兩個星期BB就適應咗。每個BB唔同，慢慢嚟～',
  '我係二胎媽媽，完全理解你嘅壓力！大嘅要湊、細嘅要餵，真係分身不暇。建議你搵屋企人幫手，自己都要休息下。',
  '呢個我有經驗！剖腹產後大概6-8個星期可以開始輕量運動，但一定要先問番醫生。我嗰時行下路開始，慢慢加強。',
  '我小朋友3歲開始學游水，一開始好驚水，但教練好有耐心，大概學咗半年就好叻。建議揀經驗豐富嘅教練。',
  '38度可以先用退燒貼同飲多啲水觀察下，如果超過38.5或者精神好差就要即刻去睇醫生。唔好太擔心，小朋友發燒好常見㗎。',
  '我之前用過兩個菲傭湊BB，經驗各有不同。建議搵有湊BB經驗嘅，面試時問清楚佢識唔識沖奶換片。有咩想知可以私訊我。',
  '產後脫髮我都有！大概3-6個月最嚴重，之後慢慢會停。我嗰時食多啲蛋白質同黑芝麻，感覺有幫助。',
  '我小朋友之前都成日病，後來我每日帶佢去公園玩、做多啲戶外活動，抵抗力真係好咗好多。飲食方面都要均衡。',
  '母乳餵到幾時真係因人而異，WHO建議兩歲，但好多媽媽一歲左右就轉奶粉。最重要係你同BB都舒服，唔好畀壓力自己。',
  '我之前坐月子注意保暖、飲多啲湯水、少食生冷嘢。最重要係瞓夠！有人幫手就盡量休息，呢段時間恢復好重要。',
];

const REJECTION_NOTES = [
  '語氣唔夠自然，太似AI生成',
  '內容與帖子主題唔相關',
  '建議修改開頭，太直接',
  '敏感話題需要更溫和嘅語氣',
];

const FAIL_REASONS = [
  'BK API timeout after 3 retries',
  'Rate limit exceeded, retry in 35s failed',
  'Thread already closed by OP',
];

const PERSONA_IDS = ['BK001', 'BK002', 'BK003', 'BK004', 'BK005', 'BK006', 'BK007', 'BK008', 'BK009', 'BK010'];
const USERNAMES: Record<string, string> = {
  BK001: 'ttc_journey_ling',
  BK002: 'pregnant_first_yuki',
  BK003: 'ivf_hope_mandy',
  BK004: 'second_trimester_sam',
  BK005: 'due_date_anxious_hk',
  BK006: 'ttc_long_road_fay',
  BK007: 'morning_sick_joyce',
  BK008: 'newborn_chaos_mei',
  BK009: 'sleepless_mama_grace',
  BK010: 'breastfeed_warrior_iris',
};
const ARCHETYPES = ['pregnant', 'first-time-mom', 'multi-kid', 'school-age'];
const TONE_MODES = ['CASUAL', 'INFO_SHARE', 'SHARE_EXP', 'EMPATHISE', 'ASK_ENGAGE'];
const SENSITIVITY_TIERS = ['Tier 1', 'Tier 2', 'Tier 3'];
const SOURCES: Array<'scanner' | 'trends' | 'custom'> = ['scanner', 'trends', 'custom'];

// ---------------------------------------------------------------------------
// Seed: Feeds
// ---------------------------------------------------------------------------

async function seedFeeds(adminId: string): Promise<string[]> {
  if ((await Feed.countDocuments()) > 0) {
    console.log('Feeds: already has data, skipping');
    return (await Feed.find({}, 'feedId').lean()).map((f) => f.feedId);
  }

  const now = Date.now();
  const feeds: Record<string, unknown>[] = [];
  const feedIds: string[] = [];

  // Status distribution: 10 pending, 8 approved, 5 posted, 4 rejected, 3 failed
  const statuses: Array<'pending' | 'approved' | 'rejected' | 'posted' | 'failed'> = [
    ...Array(10).fill('pending') as 'pending'[],
    ...Array(8).fill('approved') as 'approved'[],
    ...Array(5).fill('posted') as 'posted'[],
    ...Array(4).fill('rejected') as 'rejected'[],
    ...Array(3).fill('failed') as 'failed'[],
  ];

  for (let i = 0; i < 30; i++) {
    const status = statuses[i];
    const feedId = `FQ-${now - i * 100000}-${randInt(1000, 9999)}`;
    feedIds.push(feedId);
    const personaId = pick(PERSONA_IDS);
    const draftContent = DRAFT_REPLIES[i];
    const createdAt = daysAgo(randInt(0, 6));

    const feed: Record<string, unknown> = {
      feedId,
      type: 'reply',
      status,
      source: pick(SOURCES),
      threadTid: randInt(10000000, 19999999),
      threadFid: pick([162, 15, 14, 118, 93, 27, 28, 116]),
      threadSubject: THREAD_SUBJECTS[i],
      personaId,
      bkUsername: USERNAMES[personaId],
      archetype: pick(ARCHETYPES),
      toneMode: pick(TONE_MODES),
      sensitivityTier: pick(SENSITIVITY_TIERS),
      postType: 'reply',
      draftContent,
      charCount: draftContent.length,
      relevanceScore: randInt(40, 95),
      worthReplying: true,
      qualityWarnings: [],
      isDuplicate: false,
      adminEdit: false,
      createdAt,
      updatedAt: createdAt,
    };

    if (status === 'approved' || status === 'posted' || status === 'rejected') {
      feed.reviewedBy = new mongoose.Types.ObjectId(adminId);
      feed.reviewedAt = new Date(createdAt.getTime() + randInt(60_000, 600_000));
    }

    if (status === 'approved') {
      feed.finalContent = draftContent;
    }

    if (status === 'posted') {
      feed.finalContent = draftContent;
      feed.postedAt = new Date((feed.reviewedAt as Date).getTime() + randInt(30_000, 300_000));
      feed.postId = `mock_${randInt(100000, 999999)}`;
      feed.postUrl = `https://www.baby-kingdom.com/forum.php?mod=viewthread&tid=${feed.threadTid}&page=1#lastpost`;
    }

    if (status === 'rejected') {
      feed.adminNotes = pick(REJECTION_NOTES);
    }

    if (status === 'failed') {
      feed.finalContent = draftContent;
      feed.failReason = pick(FAIL_REASONS);
      feed.reviewedBy = new mongoose.Types.ObjectId(adminId);
      feed.reviewedAt = new Date(createdAt.getTime() + randInt(60_000, 300_000));
    }

    feeds.push(feed);
  }

  await Feed.insertMany(feeds);
  console.log(`Feeds: created ${feeds.length} (10 pending, 8 approved, 5 posted, 4 rejected, 3 failed)`);
  return feedIds;
}

// ---------------------------------------------------------------------------
// Seed: Trends
// ---------------------------------------------------------------------------

const TREND_TOPICS = [
  { label: '港媽壓力指數爆燈', summary: '調查指超過7成港媽感到育兒壓力偏高' },
  { label: 'N班報名攻略', summary: '多間熱門幼稚園N班報名日期公佈' },
  { label: 'BB食物敏感潮', summary: '本港兒科醫生指食物敏感個案增加三成' },
  { label: '全職媽媽vs在職媽媽', summary: 'LIHKG熱議全職媽媽價值' },
  { label: '兒童濕疹新療法', summary: '本地大學研發新型濕疹藥膏進入臨床測試' },
  { label: '暑假親子好去處2026', summary: '多個暑假親子活動率先睇' },
  { label: '小一統一派位放榜', summary: '統一派位結果即將公佈，家長關注度急升' },
  { label: '母乳vs奶粉爭論再起', summary: '網民熱議母乳餵哺壓力' },
  { label: '兒童心理健康關注', summary: '疫後兒童情緒問題個案大幅上升' },
  { label: '港孩過度保護問題', summary: '教育學者呼籲培養兒童自理能力' },
  { label: '陪月服務供不應求', summary: '陪月價格持續上升，預約排到三個月後' },
  { label: '產假延長建議', summary: '立法會議員建議延長法定產假至16周' },
  { label: 'SEN學生支援不足', summary: '家長團體促請增撥資源支援SEN學生' },
  { label: '嬰兒奶粉價格比較', summary: '消委會最新奶粉測試報告出爐' },
  { label: '親子餐廳推薦', summary: '新開親子餐廳受到家長好評' },
];

async function seedTrends(feedIds: string[]): Promise<void> {
  if ((await Trend.countDocuments()) > 0) {
    console.log('Trends: already has data, skipping');
    return;
  }

  const now = Date.now();
  const trends: Record<string, unknown>[] = [];

  for (let i = 0; i < 15; i++) {
    const t = TREND_TOPICS[i];
    const isUsed = i < 6;
    trends.push({
      pullId: `TP-${now - i * 50000}`,
      source: pick(['medialens', 'lihkg'] as const),
      rank: i + 1,
      topicLabel: t.label,
      summary: t.summary,
      engagements: randInt(100, 50000),
      postCount: randInt(10, 500),
      sensitivityTier: pick([1, 2, 3] as const),
      sentimentScore: randInt(20, 80),
      sentimentLabel: pick(['positive', 'negative', 'neutral'] as const),
      toneMode: pick(['CASUAL', 'INFO_SHARE']),
      isUsed,
      usedAt: isUsed ? hoursAgo(randInt(1, 20)) : undefined,
      feedIds: isUsed ? [feedIds[randInt(0, feedIds.length - 1)]] : [],
      createdAt: hoursAgo(randInt(0, 23)),
    });
  }

  await Trend.insertMany(trends);
  console.log(`Trends: created ${trends.length}`);
}

// ---------------------------------------------------------------------------
// Seed: Google Trends
// ---------------------------------------------------------------------------

const GOOGLE_TREND_DATA = [
  { query: '嬰兒濕疹', categories: ['健康', '親子'], breakdown: ['嬰兒濕疹食療', '嬰兒濕疹藥膏', '濕疹戒口'], news: '兒科醫生拆解嬰兒濕疹護理迷思' },
  { query: '幼稚園排名', categories: ['教育', '親子'], breakdown: ['幼稚園排名2026', '私立幼稚園', 'N班面試'], news: '2026年全港幼稚園排名出爐' },
  { query: '母乳餵哺', categories: ['健康', '親子'], breakdown: ['母乳不足', '追奶方法', '母乳保存'], news: '衛生署推廣母乳餵哺新計劃' },
  { query: '產後修復', categories: ['健康'], breakdown: ['產後收肚', '產後運動', '坐月食療'], news: '產後修復黃金期你要知' },
  { query: 'BB副食品', categories: ['親子', '健康'], breakdown: ['BLW加固', '副食品時間表', '敏感食物'], news: '營養師教你BB加固攻略' },
  { query: '小一入學', categories: ['教育'], breakdown: ['小一自行分配', '統一派位', '叩門攻略'], news: '2026小一統一派位即將放榜' },
  { query: '兒童保險', categories: ['理財', '親子'], breakdown: ['兒童醫療保險', '教育基金', '危疾保障'], news: '消委會比較兒童保險計劃' },
  { query: '親子旅遊日本', categories: ['旅遊', '親子'], breakdown: ['東京親子遊', '大阪樂園', '親子酒店'], news: '暑假日本親子旅遊攻略' },
  { query: 'ADHD兒童', categories: ['健康', '教育'], breakdown: ['ADHD評估', 'ADHD治療', 'SEN支援'], news: '本港ADHD兒童確診個案趨增' },
  { query: '孕婦飲食禁忌', categories: ['健康', '親子'], breakdown: ['孕婦忌食', '懷孕營養', '葉酸補充'], news: '婦產科醫生拆解孕婦飲食迷思' },
];

async function seedGoogleTrends(): Promise<void> {
  if ((await GoogleTrend.countDocuments()) > 0) {
    console.log('GoogleTrends: already has data, skipping');
    return;
  }

  const now = Date.now();
  const items: Record<string, unknown>[] = [];

  for (let i = 0; i < 10; i++) {
    const g = GOOGLE_TREND_DATA[i];
    const relevance = pick(['high', 'medium', 'low'] as const);
    items.push({
      query: g.query,
      score: randInt(50, 100),
      peakVolume: randInt(1000, 500000),
      durationHours: randInt(12, 72),
      categories: g.categories,
      trendBreakdown: g.breakdown,
      news: [{ headline: g.news, url: `https://news.example.com/article/${i + 1}` }],
      analysis: {
        summary: `${g.query}成為近期熱門搜尋，與親子育兒相關討論度持續上升。`,
        parentingRelevance: relevance,
        suggestedAngle: `從媽媽實際經驗出發分享${g.query}相關心得`,
        safeToMention: relevance !== 'low',
      },
      pullId: `GP-mock-${now - i * 60000}`,
      pulledAt: hoursAgo(randInt(1, 48)),
      geo: 'HK',
    });
  }

  await GoogleTrend.insertMany(items);
  console.log(`GoogleTrends: created ${items.length}`);
}

// ---------------------------------------------------------------------------
// Seed: Audit Logs
// ---------------------------------------------------------------------------

const AUDIT_EVENTS: Array<{ eventType: string; module: string; session: string }> = [
  { eventType: 'FEED_APPROVED', module: 'feed', session: 'admin' },
  { eventType: 'FEED_APPROVED', module: 'feed', session: 'admin' },
  { eventType: 'FEED_REJECTED', module: 'feed', session: 'admin' },
  { eventType: 'FEED_POSTED', module: 'poster', session: 'worker' },
  { eventType: 'FEED_POSTED', module: 'poster', session: 'worker' },
  { eventType: 'SCAN_COMPLETE', module: 'scanner', session: 'worker' },
  { eventType: 'SCAN_COMPLETE', module: 'scanner', session: 'worker' },
  { eventType: 'CONFIG_UPDATED', module: 'config', session: 'admin' },
  { eventType: 'PERSONA_UPDATED', module: 'persona', session: 'admin' },
  { eventType: 'BK_POST_SUCCESS', module: 'poster', session: 'worker' },
  { eventType: 'BK_POST_FAILED', module: 'poster', session: 'worker' },
];

async function seedAuditLogs(adminId: string): Promise<void> {
  if ((await AuditLog.countDocuments()) > 0) {
    console.log('AuditLogs: already has data, skipping');
    return;
  }

  const logs: Record<string, unknown>[] = [];

  for (let i = 0; i < 50; i++) {
    const evt = pick(AUDIT_EVENTS);
    const isWorker = evt.session === 'worker';
    logs.push({
      operator: isWorker ? 'system' : adminId,
      eventType: evt.eventType,
      module: evt.module,
      feedId: evt.module === 'feed' || evt.module === 'poster' ? `FQ-mock-${i}` : undefined,
      targetId: `target-${randInt(1000, 9999)}`,
      actionDetail: `${evt.eventType} operation completed`,
      ip: isWorker ? '127.0.0.1' : '192.168.1.' + randInt(2, 254),
      session: evt.session,
      createdAt: daysAgo(randInt(0, 6)),
    });
  }

  await AuditLog.insertMany(logs);
  console.log(`AuditLogs: created ${logs.length}`);
}

// ---------------------------------------------------------------------------
// Seed: Daily Stats
// ---------------------------------------------------------------------------

async function seedDailyStats(): Promise<void> {
  if ((await DailyStats.countDocuments()) > 0) {
    console.log('DailyStats: already has data, skipping');
    return;
  }

  const items: Record<string, unknown>[] = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = formatDate(d);

    const generated = randInt(15, 30);
    const approved = randInt(10, Math.min(20, generated));
    const rejected = randInt(3, Math.min(8, generated - approved));
    const posted = randInt(8, Math.min(15, approved));
    const failed = randInt(0, 2);
    const trendsPulled = randInt(10, 20);
    const trendsUsed = randInt(3, Math.min(8, trendsPulled));
    const scanned = randInt(80, 200);
    const hit = randInt(generated, Math.min(generated + 10, scanned));

    items.push({
      date,
      scanner: {
        totalScanned: scanned,
        totalHit: hit,
        hitRate: parseFloat((hit / scanned).toFixed(3)),
      },
      feeds: { generated, approved, rejected, posted, failed },
      trends: { pulled: trendsPulled, used: trendsUsed },
      posts: { threads: randInt(0, 3), replies: posted },
      byBoard: [
        { fid: 162, name: '自由講場', scanned: randInt(30, 80), hit: randInt(5, 15), posted: randInt(3, 10) },
        { fid: 15, name: '懷孕前後', scanned: randInt(10, 30), hit: randInt(2, 8), posted: randInt(1, 5) },
        { fid: 14, name: '想生BB', scanned: randInt(5, 20), hit: randInt(1, 5), posted: randInt(0, 3) },
      ],
      byPersona: [
        { personaId: 'BK001', username: 'ttc_journey_ling', posted: randInt(0, 3), dailyLimit: 3, rejectedCount: randInt(0, 1) },
        { personaId: 'BK008', username: 'newborn_chaos_mei', posted: randInt(0, 3), dailyLimit: 3, rejectedCount: randInt(0, 1) },
        { personaId: 'BK010', username: 'breastfeed_warrior_iris', posted: randInt(0, 3), dailyLimit: 3, rejectedCount: randInt(0, 2) },
      ],
      gemini: {
        calls: randInt(20, 60),
        inputTokens: randInt(30000, 80000),
        outputTokens: randInt(15000, 40000),
        estimatedCost: randFloat(0.02, 0.15),
      },
      quality: {
        approvalRate: randFloat(0.65, 0.85),
        avgReviewTime: randInt(180, 600),
        duplicateCount: randInt(0, 3),
      },
    });
  }

  await DailyStats.insertMany(items);
  console.log(`DailyStats: created ${items.length} (7 days)`);
}

// ---------------------------------------------------------------------------
// Seed: Queue Jobs
// ---------------------------------------------------------------------------

async function seedQueueJobs(): Promise<void> {
  if ((await QueueJob.countDocuments()) > 0) {
    console.log('QueueJobs: already has data, skipping');
    return;
  }

  const queues: Array<'scanner' | 'trends' | 'poster' | 'daily-reset' | 'stats-aggregator'> = [
    'scanner', 'scanner', 'scanner', 'scanner', 'scanner',
    'trends', 'trends', 'trends',
    'poster', 'poster', 'poster', 'poster', 'poster', 'poster',
    'daily-reset', 'daily-reset',
    'stats-aggregator', 'stats-aggregator', 'stats-aggregator', 'stats-aggregator',
  ];

  const jobs: Record<string, unknown>[] = [];

  for (let i = 0; i < 20; i++) {
    const queueName = queues[i];
    const isFailed = i === 4 || i === 12; // 2 failed jobs
    const startedAt = hoursAgo(randInt(1, 168));
    const duration = queueName === 'poster' ? randInt(35000, 70000) : randInt(2000, 30000);
    const completedAt = new Date(startedAt.getTime() + duration);

    const resultMap: Record<string, unknown> = {
      scanner: { threadsScanned: randInt(20, 80), hits: randInt(3, 15), feedsCreated: randInt(2, 10) },
      trends: { trendsPulled: randInt(5, 20), newTopics: randInt(1, 8) },
      poster: { feedId: `FQ-mock-post-${i}`, threadTid: randInt(10000000, 19999999), success: !isFailed },
      'daily-reset': { personasReset: 30 },
      'stats-aggregator': { date: formatDate(startedAt), aggregated: true },
    };

    jobs.push({
      queueName,
      jobId: `job-${Date.now() - i * 100000}-${randInt(100, 999)}`,
      status: isFailed ? 'failed' : 'completed',
      startedAt,
      completedAt,
      duration,
      result: isFailed ? undefined : resultMap[queueName],
      error: isFailed ? 'Connection timeout to BK API' : undefined,
      triggeredBy: queueName === 'poster' ? pick(['cron', 'manual'] as const) : 'cron',
      createdAt: startedAt,
    });
  }

  await QueueJob.insertMany(jobs);
  console.log(`QueueJobs: created ${jobs.length}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function seed() {
  await connectDB();
  console.log('Connected to MongoDB\n');

  // Get admin user ID
  const admin = await User.findOne({ role: 'admin' });
  const adminId = admin?._id?.toString() || '000000000000000000000000';
  console.log(`Admin user: ${admin?.email || 'not found (using placeholder ID)'}\n`);

  // Seed each collection
  const feedIds = await seedFeeds(adminId);
  await seedTrends(feedIds);
  await seedGoogleTrends();
  await seedAuditLogs(adminId);
  await seedDailyStats();
  await seedQueueJobs();

  // Print summary
  console.log('\n--- Collection Counts ---');
  const counts = await Promise.all([
    Feed.countDocuments(),
    Trend.countDocuments(),
    GoogleTrend.countDocuments(),
    AuditLog.countDocuments(),
    DailyStats.countDocuments(),
    QueueJob.countDocuments(),
  ]);
  const names = ['feeds', 'trends', 'googletrends', 'auditlogs', 'dailystats', 'queuejobs'];
  names.forEach((name, i) => console.log(`  ${name}: ${counts[i]}`));

  await disconnectDB();
  console.log('\nDone!');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
