import { en, type MessageKey } from "./en";
import { zhCN } from "./zh-CN";
import { translateServerMessage } from "./serverMessages";

export type Lang = "en" | "zh-CN";
export type { MessageKey } from "./en";

// Chinese is the default for everyone, whatever the browser language is.
// Only an explicit choice in the language switcher overrides it.
export const DEFAULT_LANG: Lang = "zh-CN";
export const LANG_STORAGE_KEY = "watchparty-lang";

export const LANG_OPTIONS: { code: Lang; label: string }[] = [
  { code: "zh-CN", label: "简体中文" },
  { code: "en", label: "English" },
];

const TABLES: Record<Lang, Partial<Record<MessageKey, string>>> = {
  "zh-CN": zhCN,
  en,
};

function isLang(value: unknown): value is Lang {
  return value === "en" || value === "zh-CN";
}

function readStoredLang(): Lang | null {
  try {
    const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
    return isLang(stored) ? stored : null;
  } catch {
    // Storage can be blocked (private mode, disabled site data).
    return null;
  }
}

let currentLang: Lang = readStoredLang() ?? DEFAULT_LANG;

function applyDocumentLang(lang: Lang) {
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang;
  }
}
applyDocumentLang(currentLang);

export function getLang(): Lang {
  return currentLang;
}

// Saves the choice for this browser. The caller decides how to refresh the UI
// (the app reloads the page, which re-renders every string).
export function saveLang(lang: Lang): void {
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // Ignore: the choice then lasts only for this page load.
  }
  currentLang = lang;
  applyDocumentLang(lang);
}

// Translate a finished sentence sent by the server; unknown text is returned as-is.
export function tServer(text: string): string {
  return translateServerMessage(text, currentLang);
}

// Translate a key. Lookup order: active language, then English, then the key.
// `{name}` placeholders are replaced from `vars`; unknown placeholders stay as-is.
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const raw = TABLES[currentLang][key] || en[key] || key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}
