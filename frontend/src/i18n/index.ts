import { createI18n } from 'vue-i18n';
import zhHK from '../locales/zh-HK/index';
import en from '../locales/en/index';

const savedLang = localStorage.getItem('bk-admin-lang') || 'zh-HK';

const i18n = createI18n({
  legacy: false,
  locale: savedLang,
  fallbackLocale: 'en',
  messages: {
    'zh-HK': zhHK,
    en,
  },
});

export default i18n;
