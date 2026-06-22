/**
 * i18n translation engine for the Claude Code Token Monitor extension.
 * Zero-dependency, file-based. Language packs are JSON files loaded at runtime.
 *
 * Supported languages: en, zh-CN, zh-TW, ja, ko, es, ar, pt, de, fr, ru
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export type Language = 'auto' | 'en' | 'zh-CN' | 'zh-TW' | 'ja' | 'ko' | 'es' | 'ar' | 'pt' | 'de' | 'fr' | 'ru';

/** Translation map: key → string (may contain {0}, {1} placeholders) */
type Translations = Record<string, string>;

const PACKS: Record<string, Translations> = {};

let currentLang: string = 'en';
let currentPack: Translations = {};
let packsLoaded = false;

/** Fires when the language changes at runtime */
export const onLanguageChange = new vscode.EventEmitter<string>();

/** All supported language codes */
const ALL_LANGS = ['en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'es', 'ar', 'pt', 'de', 'fr', 'ru'];

/** Languages that use right-to-left text direction */
const RTL_LANGS = new Set(['ar']);

/**
 * Load language packs from disk. Called once with the extension's root path.
 */
function loadPacks(extensionPath: string): void {
  if (packsLoaded) return;
  const i18nDir = path.join(extensionPath, 'out', 'i18n');
  for (const lang of ALL_LANGS) {
    try {
      const raw = fs.readFileSync(path.join(i18nDir, `${lang}.json`), 'utf-8');
      PACKS[lang] = JSON.parse(raw);
    } catch {
      // Fallback: try src/i18n (dev mode)
      try {
        const raw = fs.readFileSync(path.join(extensionPath, 'src', 'i18n', `${lang}.json`), 'utf-8');
        PACKS[lang] = JSON.parse(raw);
      } catch {
        PACKS[lang] = {};
      }
    }
  }
  packsLoaded = true;
}

/**
 * Resolve the effective language from the 'auto' or explicit setting.
 * Matches VSCode's display language to the closest supported language.
 */
export function resolveLanguage(setting: string): string {
  // If user picked an explicit supported language (not 'auto'), use it directly
  if (setting !== 'auto' && PACKS[setting]) return setting;
  if (setting !== 'auto' && ALL_LANGS.includes(setting)) return setting;

  const vsLang = vscode.env.language.toLowerCase();

  // Direct match
  if (ALL_LANGS.includes(vsLang)) return vsLang;

  // Prefix matches (handle region variants like zh-tw, pt-br, es-mx, fr-ca, de-at, etc.)
  if (vsLang.startsWith('zh')) {
    return vsLang.includes('tw') || vsLang.includes('hk') || vsLang.includes('mo') ? 'zh-TW' : 'zh-CN';
  }
  if (vsLang.startsWith('ja')) return 'ja';
  if (vsLang.startsWith('ko')) return 'ko';
  if (vsLang.startsWith('es')) return 'es';
  if (vsLang.startsWith('ar')) return 'ar';
  if (vsLang.startsWith('pt')) return 'pt';
  if (vsLang.startsWith('de')) return 'de';
  if (vsLang.startsWith('fr')) return 'fr';
  if (vsLang.startsWith('ru')) return 'ru';

  return 'en';
}

/** Is the current language right-to-left? */
export function isRTL(): boolean {
  return RTL_LANGS.has(currentLang);
}

/** Initialize (or re-initialize) the translation engine for a given language. */
export function initI18n(lang: string, extensionPath?: string): void {
  if (extensionPath) loadPacks(extensionPath);
  const resolved = resolveLanguage(lang);
  currentLang = resolved;
  currentPack = PACKS[resolved] || PACKS['en'] || {};
}

/** Get the currently active language code. */
export function getCurrentLanguage(): string {
  return currentLang;
}

/**
 * Translate a key, substituting {0}..{N} placeholders with optional params.
 * Returns the key itself (wrapped in ??) if no translation is found.
 */
export function t(key: string, params?: Record<string, string>): string {
  let template: string | undefined = currentPack[key];
  if (template === undefined) {
    // Fallback to English pack for missing keys
    const enPack = PACKS['en'];
    template = enPack ? enPack[key] : undefined;
  }
  if (template === undefined) return `??${key}??`;
  if (!params) return template;
  return template.replace(/\{(\d+)\}/g, (_m, idx) => params[idx] ?? `?${idx}?`);
}
