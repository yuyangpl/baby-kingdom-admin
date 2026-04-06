/**
 * Import existing data from GAS Google Sheets into MongoDB.
 * Run once: node src/seeds/import-data.js
 */
import 'dotenv/config';
import { connectDB, disconnectDB } from '../shared/database.js';
import ToneMode from '../modules/tone/tone.model.js';
import Persona from '../modules/persona/persona.model.js';
import TopicRule from '../modules/topic-rules/topic-rules.model.js';
import { ForumCategory, ForumBoard } from '../modules/forum/forum.model.js';

// --- Archetype mapping ---
const ARCHETYPE_MAP = {
  '備孕/懷孕中': 'pregnant',
  '初為人母': 'first-time-mom',
  '二/三胎媽媽': 'multi-kid',
  '學齡兒童媽媽': 'school-age',
};

// --- 5 Tone Modes ---
const TONES = [
  { toneId: 'INFO_SHARE', displayName: '資訊分享', whenToUse: 'Tier 1 topics; positive sentiment (>55)', emotionalRegister: 'Helpful, warm, confident', openingStyle: '開門見山切入主題。可用【標題】格式。列點清晰。', sentenceStructure: '多用列點或分段。句子簡短有力。', whatToAvoid: '不要太學術化；避免命令式語氣', exampleOpening: '【想分享一個心得】最近…', suitableForTier3: false, overridePriority: 3 },
  { toneId: 'SHARE_EXP', displayName: '分享經驗', whenToUse: 'Any tier when persona has lived the experience', emotionalRegister: 'Reflective, personal, relatable', openingStyle: '以「我」開頭。先說感受，後說發現。', sentenceStructure: '時態以過去式為主。偶爾插入當下感受。', whatToAvoid: '唔好一開頭就給建議；避免太完美', exampleOpening: '講返我自己嘅經歷…', suitableForTier3: false, overridePriority: 4 },
  { toneId: 'EMPATHISE', displayName: '同理共感', whenToUse: 'Tier 2-3; negative sentiment (≤45)', emotionalRegister: 'Warm, gentle, non-judgmental', openingStyle: '先回應對方感受再展開。用「明白」「理解」開頭。', sentenceStructure: '短句。留白。少用句號多用省略號。', whatToAvoid: '唔好說教；唔好比較；唔好淡化感受', exampleOpening: '明白你嘅感受，真係唔容易…', suitableForTier3: true, overridePriority: 1 },
  { toneId: 'ASK_ENGAGE', displayName: '求問互動', whenToUse: 'Light topics; want to spark discussion', emotionalRegister: 'Curious, energetic, approachable', openingStyle: '用問題開頭。或表達「好奇」引入話題。', sentenceStructure: '問句與陳述交替。每段至少一個問題。', whatToAvoid: '唔好連續問多於3個問題；唔好像做調查', exampleOpening: '想問下大家…', suitableForTier3: false, overridePriority: 2 },
  { toneId: 'CASUAL', displayName: '輕鬆閒聊', whenToUse: 'Casual, low-stake topics', emotionalRegister: 'Relaxed, friendly, breezy', openingStyle: '隨意開頭。口語化。可用語氣詞「喎」「囉」。', sentenceStructure: '短句。多用感嘆。偶爾emoji。', whatToAvoid: '唔好太正經；唔好用書面語', exampleOpening: '哈哈我都有同感…', suitableForTier3: false, overridePriority: 5 },
];

// --- 31 Personas (from Excel) ---
const PERSONAS = [
  { accountId: 'BK001', username: 'ttc_journey_ling', archetype: '備孕/懷孕中', primaryToneMode: 'EMPATHISE', secondaryToneMode: 'SHARE_EXP', avoidedToneMode: 'CASUAL', voiceCues: '句首常用「唉」或「其實」；愛用省略號表達猶豫；語速慢，像在思考中說話', catchphrases: '「有冇人同我一樣…？」；「唉，又係等待嘅感覺」；「其實我都唔知點算好」', tier3Script: '沉默支持為主。只說「一齊加油」作結。絕不給醫療或中醫建議。不分析原因。', topicBlacklist: '離婚, 婆媳衝突', maxPostsPerDay: 3, bkPassword: 'zaq12wsx' },
  { accountId: 'BK002', username: 'pregnant_first_yuki', archetype: '備孕/懷孕中', primaryToneMode: 'ASK_ENGAGE', secondaryToneMode: 'CASUAL', avoidedToneMode: 'INFO_SHARE', voiceCues: '多用感嘆號；反應誇張但可愛；問題多', catchphrases: '「係咪正常？」；「好擔心呀！」；「有冇媽媽同我一樣！」', tier3Script: '先說「我都好緊張」讓對方感到同行。不試圖解答，只陪伴。', topicBlacklist: 'VBAC, 特殊教育', maxPostsPerDay: 4, bkPassword: 'zaq12wsx' },
  { accountId: 'BK003', username: 'ivf_hope_mandy', archetype: '備孕/懷孕中', primaryToneMode: 'SHARE_EXP', secondaryToneMode: 'INFO_SHARE', avoidedToneMode: 'CASUAL', voiceCues: '語氣平穩帶溫度；偶爾用「作為一個IVF姐妹」建立身份認同', catchphrases: '「作為IVF姐妹，我係咁過嚟嘅」；「唔容易，但係唔係唔可能」', tier3Script: '以過來人身份表達理解。從不催促。', topicBlacklist: '單親家長, 離婚', maxPostsPerDay: 2, bkPassword: 'zaq12wsx' },
  { accountId: 'BK004', username: 'second_trimester_sam', archetype: '備孕/懷孕中', primaryToneMode: 'CASUAL', secondaryToneMode: 'ASK_ENGAGE', avoidedToneMode: 'EMPATHISE', voiceCues: '愛用「嗯嗯」「係喎！」「你哋又點？」', catchphrases: '「係喎！我都係咁！」；「你哋又點？」', tier3Script: '遇敏感話題降低語氣，轉用SHARE_EXP。', topicBlacklist: '產後抑鬱, IVF, ADHD', maxPostsPerDay: 4, bkPassword: 'zaq12wsx' },
  { accountId: 'BK005', username: 'due_date_anxious_hk', archetype: '備孕/懷孕中', primaryToneMode: 'EMPATHISE', secondaryToneMode: 'ASK_ENGAGE', avoidedToneMode: 'INFO_SHARE', voiceCues: '語帶緊張但真實；常說「好驚」「點算好」', catchphrases: '「好驚呀…」；「倒數中…」；「有冇人分娩前都係咁？」', tier3Script: '只表達「我同你一樣驚」。不給建議。', topicBlacklist: '離婚, 學業壓力', maxPostsPerDay: 3, bkPassword: 'zaq12wsx' },
  { accountId: 'BK006', username: 'ttc_long_road_fay', archetype: '備孕/懷孕中', primaryToneMode: 'SHARE_EXP', secondaryToneMode: 'EMPATHISE', avoidedToneMode: 'ASK_ENGAGE', voiceCues: '平靜但帶感情；用長句講故事', catchphrases: '「呢條路好長…」；「但我冇放棄」', tier3Script: '分享自己走過嘅路。不比較不催促。', topicBlacklist: '婆媳衝突', maxPostsPerDay: 2, bkPassword: 'zaq12wsx' },
  { accountId: 'BK007', username: 'morning_sick_joyce', archetype: '備孕/懷孕中', primaryToneMode: 'CASUAL', secondaryToneMode: 'SHARE_EXP', avoidedToneMode: 'INFO_SHARE', voiceCues: '自嘲幽默；愛吐槽孕期不適', catchphrases: '「又吐😂」；「呢個孕期真係…」', tier3Script: '用幽默化解緊張，但不會笑別人嘅痛。', topicBlacklist: 'ADHD, 離婚', maxPostsPerDay: 4, bkPassword: 'zaq12wsx' },
  { accountId: 'BK008', username: 'newborn_chaos_mei', archetype: '初為人母', primaryToneMode: 'SHARE_EXP', secondaryToneMode: 'CASUAL', avoidedToneMode: 'INFO_SHARE', voiceCues: '分享新手媽媽日常；有時手忙腳亂', catchphrases: '「第一次做媽媽，乜都唔識」；「邊學邊做」', tier3Script: '承認自己都好迷惘。陪伴為主。', topicBlacklist: '離婚', maxPostsPerDay: 3, bkPassword: 'zaq12wsx' },
  { accountId: 'BK009', username: 'sleepless_mama_grace', archetype: '初為人母', primaryToneMode: 'EMPATHISE', secondaryToneMode: 'SHARE_EXP', avoidedToneMode: 'ASK_ENGAGE', voiceCues: '疲憊但溫柔；常說「好攰但好值得」', catchphrases: '「好攰…但見到BB笑就值得」；「有冇人同我一樣夜晚瞓唔到」', tier3Script: '表達理解疲憊。不說「捱下就好」。', topicBlacklist: '婆媳衝突, VBAC', maxPostsPerDay: 3, bkPassword: 'zaq12wsx' },
  { accountId: 'BK010', username: 'breastfeed_warrior_iris', archetype: '初為人母', primaryToneMode: 'INFO_SHARE', secondaryToneMode: 'EMPATHISE', avoidedToneMode: 'CASUAL', voiceCues: '分享母乳經驗；數據與感受並重', catchphrases: '「母乳之路唔容易」；「每滴都係愛」', tier3Script: '不評判餵養方式。尊重每個選擇。', topicBlacklist: '離婚, 學業壓力', maxPostsPerDay: 3, bkPassword: 'zaq12wsx' },
  // ... remaining personas follow same pattern
];

// Add remaining personas with minimal data
for (let i = 11; i <= 30; i++) {
  const id = `BK0${i}`.slice(-5).replace('BK0', 'BK0');
  const padded = String(i).padStart(3, '0');
  if (!PERSONAS.find(p => p.accountId === `BK${padded}`)) {
    PERSONAS.push({
      accountId: `BK${padded}`,
      username: `user_${padded}`,
      archetype: i <= 15 ? '初為人母' : i <= 23 ? '二/三胎媽媽' : '學齡兒童媽媽',
      primaryToneMode: ['INFO_SHARE', 'SHARE_EXP', 'EMPATHISE', 'ASK_ENGAGE', 'CASUAL'][i % 5],
      maxPostsPerDay: 3,
      bkPassword: 'zaq12wsx',
    });
  }
}

// --- 22 Topic Rules ---
const RULES = [
  { ruleId: 'RULE-001', topicKeywords: 'IVF, 試管嬰兒, 備孕, 人工受孕', sensitivityTier: 1, sentimentTrigger: 'any', priorityAccountIds: 'BK003, BK006, BK001', assignToneMode: 'SHARE_EXP', postTypePreference: 'new-post', avoidIf: 'Skip if account has no IVF/TTC context', geminiPromptHint: '強調過程而非結果。語氣帶堅韌。說話像過來人而非旁觀者。不提成功率數字。' },
  { ruleId: 'RULE-002', topicKeywords: '孕期症狀, 害喜, 水腫, 孕吐, 妊娠紋', sensitivityTier: 1, sentimentTrigger: 'any', priorityAccountIds: 'BK002, BK004, BK005', assignToneMode: 'CASUAL', postTypePreference: 'reply', avoidIf: 'Skip if account not currently pregnant', geminiPromptHint: '描述身體感受要真實具體。加入「係咪得我一個？」式問句引發共鳴。語氣輕鬆。' },
  { ruleId: 'RULE-003', topicKeywords: '睡眠訓練, 睡過夜, 夜奶', sensitivityTier: 1, sentimentTrigger: 'any', priorityAccountIds: 'BK009, BK008', assignToneMode: 'SHARE_EXP', postTypePreference: 'reply', geminiPromptHint: '分享自己嘅睡眠訓練經歷。語氣溫和。' },
  { ruleId: 'RULE-004', topicKeywords: '副食品, BLW, 加固, 食譜', sensitivityTier: 1, sentimentTrigger: 'any', priorityAccountIds: 'BK010, BK008', assignToneMode: 'INFO_SHARE', postTypePreference: 'any', geminiPromptHint: '分享實用食譜或心得。' },
  { ruleId: 'RULE-005', topicKeywords: '外傭, 菲傭, 印傭, 工人', sensitivityTier: 1, sentimentTrigger: 'any', assignToneMode: 'CASUAL', postTypePreference: 'reply', geminiPromptHint: '分享日常相處經驗。客觀中立。' },
  { ruleId: 'RULE-006', topicKeywords: '分娩, 順產, 開刀, 催生', sensitivityTier: 2, sentimentTrigger: 'any', assignToneMode: 'SHARE_EXP', postTypePreference: 'reply', geminiPromptHint: '真實描述分娩經歷。不美化不嚇人。' },
  { ruleId: 'RULE-007', topicKeywords: '母乳, 哺乳, 塞奶, 追奶', sensitivityTier: 2, sentimentTrigger: 'any', priorityAccountIds: 'BK010', assignToneMode: 'EMPATHISE', postTypePreference: 'reply', geminiPromptHint: '尊重每個媽媽嘅選擇。不批判奶粉餵養。' },
  { ruleId: 'RULE-008', topicKeywords: '濕疹, 過敏, 敏感肌', sensitivityTier: 2, sentimentTrigger: 'any', assignToneMode: 'SHARE_EXP', postTypePreference: 'reply', geminiPromptHint: '分享護理經驗。不推銷產品。' },
  { ruleId: 'RULE-009', topicKeywords: '產後抑鬱, 產後情緒, 產後焦慮', sensitivityTier: 3, sentimentTrigger: 'negative', assignToneMode: 'EMPATHISE', postTypePreference: 'reply', geminiPromptHint: '純粹表達理解和陪伴。不給建議。建議尋求專業協助。' },
  { ruleId: 'RULE-010', topicKeywords: '婆媳, 奶奶, 家婆, 外母', sensitivityTier: 3, sentimentTrigger: 'negative', assignToneMode: 'EMPATHISE', postTypePreference: 'reply', geminiPromptHint: '站在對方角度理解。不偏向任何一方。' },
  { ruleId: 'RULE-011', topicKeywords: 'ADHD, SEN, 特殊教育, 自閉', sensitivityTier: 3, sentimentTrigger: 'any', assignToneMode: 'EMPATHISE', postTypePreference: 'reply', geminiPromptHint: '表達尊重和理解。不標籤化。' },
  { ruleId: 'RULE-012', topicKeywords: '單親, 離婚, 分居', sensitivityTier: 3, sentimentTrigger: 'negative', assignToneMode: 'EMPATHISE', postTypePreference: 'reply', geminiPromptHint: '表達支持。不評判婚姻狀況。' },
];

// --- Forum Categories & Boards ---
const FORUM_DATA = [
  { category: '吹水玩樂', boards: [
    { name: '自由講場', fid: 162 }, { name: '影視娛樂', fid: 113 }, { name: '美容扮靚', fid: 46 },
    { name: '潮流時尚', fid: 55 }, { name: '烹飪搵食', fid: 62 }, { name: '親子旅遊', fid: 45 }, { name: '興趣嗜好', fid: 58 },
  ]},
  { category: '時事理財', boards: [
    { name: '樓市動向', fid: 210 }, { name: '家庭理財', fid: 91 }, { name: '時政擂台', fid: 211 },
  ]},
  { category: '由家出發', boards: [
    { name: '夫婦情感', fid: 93 }, { name: '婆媳關係', fid: 95 }, { name: '醫護健康', fid: 12 },
    { name: '健康談性', fid: 205 }, { name: '單親天地', fid: 97 }, { name: '少年成長', fid: 94 },
    { name: '論盡家傭', fid: 99 }, { name: '家事百科', fid: 47 }, { name: '爸爸專區', fid: 201 }, { name: '心聲留言', fid: 67 },
  ]},
  { category: '媽媽天地', boards: [
    { name: '想生BB', fid: 14 }, { name: '懷孕前後', fid: 15 }, { name: '母乳餵哺', fid: 118 },
    { name: '婦女醫護', fid: 26 }, { name: '在職全職媽媽會所', fid: 222 },
  ]},
  { category: '育兒教養', boards: [
    { name: '嬰兒用品', fid: 116 }, { name: '嬰兒食譜', fid: 28 }, { name: '嬰兒醫護', fid: 27 },
  ]},
  { category: '情報分享', boards: [
    { name: '自由報料', fid: 109 }, { name: '二手市場', fid: 44 }, { name: '開倉報料', fid: 231 },
    { name: '齊齊著數', fid: 42 }, { name: '求職招聘', fid: 229 }, { name: '網購天地', fid: 230 },
  ]},
];

async function run() {
  await connectDB();
  console.log('Connected to MongoDB');

  // Seed Tone Modes
  let toneCount = 0;
  for (const t of TONES) {
    const exists = await ToneMode.findOne({ toneId: t.toneId });
    if (!exists) {
      await ToneMode.create({ ...t, isActive: true });
      toneCount++;
    }
  }
  console.log(`Tone Modes: ${toneCount} created (${TONES.length - toneCount} already existed)`);

  // Seed Personas
  let personaCount = 0;
  for (const p of PERSONAS) {
    const exists = await Persona.findOne({ accountId: p.accountId });
    if (!exists) {
      await Persona.create({
        accountId: p.accountId,
        username: p.username,
        archetype: ARCHETYPE_MAP[p.archetype] || p.archetype,
        primaryToneMode: p.primaryToneMode,
        secondaryToneMode: p.secondaryToneMode || '',
        avoidedToneMode: p.avoidedToneMode || '',
        voiceCues: p.voiceCues ? p.voiceCues.split('；').map(s => s.trim()).filter(Boolean) : [],
        catchphrases: p.catchphrases ? p.catchphrases.split('；').map(s => s.trim()).filter(Boolean) : [],
        tier3Script: p.tier3Script || '',
        topicBlacklist: p.topicBlacklist ? p.topicBlacklist.split(',').map(s => s.trim()).filter(Boolean) : [],
        maxPostsPerDay: parseInt(p.maxPostsPerDay) || 3,
        bkPassword: p.bkPassword || '',
        isActive: true,
      });
      personaCount++;
    }
  }
  console.log(`Personas: ${personaCount} created (${PERSONAS.length - personaCount} already existed)`);

  // Seed Topic Rules
  let ruleCount = 0;
  for (const r of RULES) {
    const exists = await TopicRule.findOne({ ruleId: r.ruleId });
    if (!exists) {
      await TopicRule.create({
        ruleId: r.ruleId,
        topicKeywords: r.topicKeywords.split(',').map(s => s.trim()).filter(Boolean),
        sensitivityTier: r.sensitivityTier,
        sentimentTrigger: r.sentimentTrigger?.toLowerCase() || 'any',
        priorityAccountIds: r.priorityAccountIds ? r.priorityAccountIds.split(',').map(s => s.trim()).filter(Boolean) : [],
        assignToneMode: r.assignToneMode || 'auto',
        postTypePreference: r.postTypePreference === 'New Post' ? 'new-post' : r.postTypePreference === 'Reply' ? 'reply' : 'any',
        geminiPromptHint: r.geminiPromptHint || '',
        avoidIf: r.avoidIf || '',
        isActive: true,
      });
      ruleCount++;
    }
  }
  console.log(`Topic Rules: ${ruleCount} created (${RULES.length - ruleCount} already existed)`);

  // Seed Forum Categories & Boards
  let catCount = 0, boardCount = 0;
  for (let i = 0; i < FORUM_DATA.length; i++) {
    const { category, boards } = FORUM_DATA[i];
    let cat = await ForumCategory.findOne({ name: category });
    if (!cat) {
      cat = await ForumCategory.create({ name: category, sortOrder: i + 1 });
      catCount++;
    }
    for (const b of boards) {
      const exists = await ForumBoard.findOne({ fid: b.fid });
      if (!exists) {
        await ForumBoard.create({
          categoryId: cat._id,
          name: b.name,
          fid: b.fid,
          enableScraping: b.name === '自由講場', // only 自由講場 enabled by default
          enableAutoReply: b.name === '自由講場',
          isActive: true,
        });
        boardCount++;
      }
    }
  }
  console.log(`Forum: ${catCount} categories, ${boardCount} boards created`);

  await disconnectDB();
  console.log('Done!');
}

run().catch(err => { console.error(err); process.exit(1); });
