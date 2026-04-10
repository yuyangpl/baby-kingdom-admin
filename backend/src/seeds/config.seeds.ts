/**
 * All preset config items from the design spec.
 * Seeded on first startup if not already present.
 */

interface ConfigPreset {
  key: string;
  value: string;
  category: string;
  description: string;
  isSecret?: boolean;
}

export const CONFIG_PRESETS: ConfigPreset[] = [
  // -- BK Forum API --
  { key: 'BK_APP', value: 'android', category: 'bk-forum', description: 'BK platform param' },
  { key: 'BK_BASE_URL', value: 'https://bapi.baby-kingdom.com/index.php', category: 'bk-forum', description: 'BK Forum API base URL' },
  { key: 'BK_MAX_POSTS_PER_ACCOUNT_DAY', value: '4', category: 'bk-forum', description: 'Max posts+replies per account/day' },
  { key: 'BK_POST_INTERVAL_SEC', value: '35', category: 'bk-forum', description: 'Post interval seconds' },
  { key: 'BK_RATE_LIMIT_SECONDS', value: '35', category: 'bk-forum', description: 'Min seconds between write ops' },
  { key: 'BK_VER', value: '3.11.11', category: 'bk-forum', description: 'BK version param' },

  // --- Email ---
  { key: 'SMTP_FROM', value: 'BK Admin <yu.yang@mintinglabs.com>', category: 'email', description: 'Sender address for alert emails' },
  { key: 'SMTP_HOST', value: 'smtp.gmail.com', category: 'email', description: 'SMTP server hostname' },
  { key: 'SMTP_PASS', value: '', category: 'email', description: 'SMTP authentication password', isSecret: true },
  { key: 'SMTP_PORT', value: '587', category: 'email', description: 'SMTP server port' },
  { key: 'SMTP_USER', value: 'yu.yang@mintinglabs.com', category: 'email', description: 'SMTP authentication username' },

  // -- Gemini AI --
  { key: 'CONTENT_LANGUAGE', value: '繁體中文', category: 'gemini', description: 'Output language' },
  { key: 'GCP_PROJECT_ID', value: 'gen-lang-client-0660918391', category: 'gemini', description: 'GCP project ID' },
  { key: 'GEMINI_API_KEY', value: '', category: 'gemini', description: 'Gemini API key', isSecret: true },
  { key: 'GEMINI_GCP_PROJECT_ID', value: 'gen-lang-client-0660918391', category: 'gemini', description: 'Gemini GCP project ID' },
  { key: 'GEMINI_MAX_OUTPUT_TOKENS', value: '2048', category: 'gemini', description: 'Max output tokens' },
  { key: 'GEMINI_MODEL', value: 'gemini-2.5-flash', category: 'gemini', description: 'Gemini model name' },
  { key: 'GEMINI_SYSTEM_PROMPT', value: '你係一個香港親子論壇嘅真實用戶，用繁體中文書寫。你嘅文字要自然、真實，有個人感受，唔係廣告。', category: 'gemini', description: 'Gemini system prompt' },
  { key: 'GEMINI_TASK_TEMPLATE', value: '請用以上角色嘅口吻，寫一篇{post_type}（{length}長度，最多{max_chars}字）。只輸出帖文內容，唔好有前言或解釋。', category: 'gemini', description: 'Gemini task template' },
  { key: 'GEMINI_TEMPERATURE', value: '0.85', category: 'gemini', description: 'Generation temperature' },
  { key: 'GEMINI_VERTEX_REGION', value: 'asia-east1', category: 'gemini', description: 'Vertex AI region' },
  { key: 'LONG_POST_MAX_CHARS', value: '600', category: 'gemini', description: 'Long post character limit' },
  { key: 'MEDIUM_POST_MAX_CHARS', value: '300', category: 'gemini', description: 'Medium post character limit' },
  { key: 'SENTIMENT_NEGATIVE_THRESHOLD', value: '45', category: 'gemini', description: 'Auto-override to EMPATHISE below this sentiment' },
  { key: 'SHORT_POST_MAX_CHARS', value: '150', category: 'gemini', description: 'Short post character limit' },
  { key: 'TONE_OVERRIDE_ON_TIER3', value: 'EMPATHISE', category: 'gemini', description: 'Force this tone for Tier 3 topics' },

  // -- General --
  { key: 'ADMIN_EMAILS', value: 'yu.yang@mintinglabs.com', category: 'general', description: 'Admin email addresses' },
  { key: 'LOG_RETENTION_DAYS', value: '90', category: 'general', description: 'Audit log retention days' },
  { key: 'MAX_POSTS_PER_DAY', value: '3', category: 'general', description: 'Global max posts per day' },
  { key: 'TIMEZONE', value: 'Asia/Hong_Kong', category: 'general', description: 'System timezone' },

  // -- Google Trends --
  { key: 'GOOGLE_TRENDS_API_KEY', value: '', category: 'google-trends', description: 'Google Trends self-hosted API key', isSecret: true },
  { key: 'GOOGLE_TRENDS_BASE_URL', value: 'https://seo-hk-mac.rankwriteai.com', category: 'google-trends', description: 'Google Trends API base URL' },
  { key: 'GOOGLE_TRENDS_ENABLED', value: 'true', category: 'google-trends', description: 'Enable Google Trends matching' },
  { key: 'GOOGLE_TRENDS_MATCH_THRESHOLD', value: '0.6', category: 'google-trends', description: 'Keyword match threshold' },
  { key: 'GOOGLE_TRENDS_PULL_INTERVAL', value: '30', category: 'google-trends', description: 'Pull interval in minutes' },
  { key: 'GOOGLE_TRENDS_REGION', value: 'HK', category: 'google-trends', description: 'Trends region' },
  { key: 'GTRENDS_GEO', value: 'HK', category: 'google-trends', description: 'Google Trends geo' },
  { key: 'GTRENDS_LOOKBACK_HOURS', value: '24', category: 'google-trends', description: 'Trends lookback hours' },
  { key: 'GTRENDS_TOP_N', value: '10', category: 'google-trends', description: 'Top N trends' },

  // -- MediaLens API --
  { key: 'DEFAULT_TREND_FID', value: '162', category: 'medialens', description: 'Default board FID for trend-generated threads (自由講場)' },
  { key: 'ENABLE_FB_VIRAL', value: 'false', category: 'medialens', description: 'Include FB viral posts' },
  { key: 'ENABLE_LIHKG', value: 'false', category: 'medialens', description: 'Include LIHKG in trend pulls' },
  { key: 'FEEDS_PER_TREND_PULL', value: '5', category: 'medialens', description: 'Max new drafts per hourly run' },
  { key: 'MAX_PENDING_QUEUE', value: '100', category: 'medialens', description: 'Pause generation above this' },
  { key: 'MEDIALENS_AUTH_EMAIL', value: 'yu.yang@mintinglabs.com', category: 'medialens', description: 'MediaLens OTP auth email' },
  { key: 'MEDIALENS_BASE_URL', value: 'https://medialens-skills-api-1012814233357.asia-east1.run.app/api/v1', category: 'medialens', description: 'MediaLens API base URL' },
  { key: 'MEDIALENS_COUNTRY', value: 'HK', category: 'medialens', description: 'MediaLens country filter' },
  { key: 'MEDIALENS_JWT_TOKEN', value: '', category: 'medialens', description: 'MediaLens JWT token (auto-cached)', isSecret: true },
  { key: 'MEDIALENS_JWT_TOKEN_EXPIRY', value: '', category: 'medialens', description: 'JWT expiry time (auto-set on OTP verify)' },
  { key: 'TREND_LOOKBACK_DAYS', value: '1', category: 'medialens', description: 'Trend lookback days' },
  { key: 'TREND_PULL_INTERVAL_MIN', value: '60', category: 'medialens', description: 'Trend pull interval (minutes)' },

  // -- Scanner --
  { key: 'SCANNER_RELEVANCE_THRESHOLD', value: '35', category: 'scanner', description: 'Gemini relevance score threshold' },
  { key: 'SCANNER_TIMEOUT_MINUTES', value: '15', category: 'scanner', description: 'Scanner timeout minutes' },
];
