import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en/common.json";
import es from "./locales/es/common.json";
import ptBR from "./locales/pt-BR/common.json";
import de from "./locales/de/common.json";
import fr from "./locales/fr/common.json";
import ja from "./locales/ja/common.json";
import zhCN from "./locales/zh-CN/common.json";
import eo from "./locales/eo/common.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: en },
      es: { common: es },
      "pt-BR": { common: ptBR },
      de: { common: de },
      fr: { common: fr },
      ja: { common: ja },
      "zh-CN": { common: zhCN },
      eo: { common: eo },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "es", "pt-BR", "de", "fr", "ja", "zh-CN", "eo"],
    ns: ["common"],
    defaultNS: "common",
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
