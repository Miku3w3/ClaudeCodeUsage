/**
 * Multi-provider pricing for Claude Code Token Monitor v1.0.0.
 *
 * Supports: DeepSeek (CNY), Anthropic (USD), OpenAI (USD), plus user custom models.
 * All prices stored in the provider's native currency, converted on display.
 *
 * Sources (2025-2026 official pricing pages):
 *   DeepSeek: https://api-docs.deepseek.com/quick_start/pricing
 *   Anthropic: https://www.anthropic.com/pricing
 *   OpenAI:    https://openai.com/api/pricing/
 */
import type { ModelPricing, ResolvedPricing, ProviderMeta, Currency, CustomModelConfig } from './types';

// ═══════════════════════════════════════════════════════════════
// Built-in pricing table (native currency)
// ═══════════════════════════════════════════════════════════════

const PROVIDERS: ProviderMeta[] = [
  // ── DeepSeek ──────────────────────────────────────────────
  {
    name: 'DeepSeek',
    nativeCurrency: 'CNY',
    models: {
      'deepseek-v4-pro':    { cacheHit: 0.025, cacheMiss: 3.0,  output: 6.0 },
      'deepseek-v4-flash':  { cacheHit: 0.02,  cacheMiss: 1.0,  output: 2.0 },
      'deepseek-v3':        { cacheHit: 0,     cacheMiss: 2.0,  output: 8.0 },
      'deepseek-r1':        { cacheHit: 0,     cacheMiss: 4.0,  output: 16.0 },
    },
    matchPattern: /deepseek/i,
  },
  // ── Anthropic ─────────────────────────────────────────────
  {
    name: 'Anthropic',
    nativeCurrency: 'USD',
    models: {
      'claude-opus-4-8':    { cacheHit: 1.50, cacheMiss: 15.00, output: 75.00 },
      'claude-sonnet-4-6':  { cacheHit: 0.60, cacheMiss: 6.00,  output: 30.00 },
      'claude-haiku-4-5':   { cacheHit: 0.15, cacheMiss: 1.50,  output: 7.50 },
      'claude-fable-5':     { cacheHit: 0.30, cacheMiss: 3.00,  output: 15.00 },
    },
    matchPattern: /claude/i,
  },
  // ── OpenAI ────────────────────────────────────────────────
  {
    name: 'OpenAI',
    nativeCurrency: 'USD',
    models: {
      'gpt-4o':             { cacheHit: 1.25,  cacheMiss: 2.50,  output: 10.00 },
      'gpt-4o-mini':        { cacheHit: 0.075, cacheMiss: 0.15,  output: 0.60 },
      'gpt-4.1':            { cacheHit: 1.25,  cacheMiss: 2.50,  output: 10.00 },
      'o1':                 { cacheHit: 0,     cacheMiss: 15.00, output: 60.00 },
      'o3-mini':            { cacheHit: 0,     cacheMiss: 1.10,  output: 4.40 },
      'o4-mini':            { cacheHit: 0.15,  cacheMiss: 1.10,  output: 4.40 },
    },
    matchPattern: /gpt|o1|o3|o4|openai/i,
  },
  // ── Google Gemini ─────────────────────────────────────────
  {
    name: 'Google',
    nativeCurrency: 'USD',
    models: {
      'gemini-2.5-pro':     { cacheHit: 0,     cacheMiss: 1.25,  output: 10.00 },
      'gemini-2.5-flash':   { cacheHit: 0,     cacheMiss: 0.15,  output: 0.60 },
    },
    matchPattern: /gemini/i,
  },
  // ── Alibaba Qwen (通义千问) ───────────────────────────────
  {
    name: 'Alibaba Qwen',
    nativeCurrency: 'CNY',
    models: {
      'qwen3.5-plus':       { cacheHit: 0,     cacheMiss: 0.80,  output: 4.80 },
      'qwen-long':          { cacheHit: 0,     cacheMiss: 0.50,  output: 2.00 },
    },
    matchPattern: /qwen/i,
  },
  // ── Moonshot Kimi ─────────────────────────────────────────
  {
    name: 'Moonshot Kimi',
    nativeCurrency: 'USD',
    models: {
      'kimi-k2.5':          { cacheHit: 0.10,  cacheMiss: 0.60,  output: 3.00 },
      'kimi-k2.6':          { cacheHit: 0.16,  cacheMiss: 0.95,  output: 4.00 },
    },
    matchPattern: /kimi/i,
  },
  // ── Zhipu GLM (智谱) ─────────────────────────────────────
  {
    name: 'Zhipu GLM',
    nativeCurrency: 'CNY',
    models: {
      'glm-4.7':            { cacheHit: 0,     cacheMiss: 2.00,  output: 16.00 },
      'glm-5':              { cacheHit: 0,     cacheMiss: 4.00,  output: 18.00 },
    },
    matchPattern: /glm/i,
  },
  // ── ByteDance Doubao (字节豆包) ───────────────────────────
  {
    name: 'ByteDance Doubao',
    nativeCurrency: 'CNY',
    models: {
      'doubao-seed-1.8':    { cacheHit: 0,     cacheMiss: 0.80,  output: 2.00 },
      'doubao-seed-2.0-pro':{ cacheHit: 0,     cacheMiss: 3.20,  output: 16.00 },
    },
    matchPattern: /doubao/i,
  },
  // ── Baidu Ernie (百度文心) ────────────────────────────────
  {
    name: 'Baidu Ernie',
    nativeCurrency: 'CNY',
    models: {
      'ernie-4.5-turbo':    { cacheHit: 0.20,  cacheMiss: 0.80,  output: 3.20 },
      'ernie-5.1':          { cacheHit: 0,     cacheMiss: 4.00,  output: 18.00 },
    },
    matchPattern: /ernie/i,
  },
  // ── xAI Grok ──────────────────────────────────────────────
  {
    name: 'xAI Grok',
    nativeCurrency: 'USD',
    models: {
      'grok-4':             { cacheHit: 0,     cacheMiss: 2.00,  output: 8.00 },
    },
    matchPattern: /grok/i,
  },
  // ── Mistral ───────────────────────────────────────────────
  {
    name: 'Mistral',
    nativeCurrency: 'USD',
    models: {
      'mistral-large':      { cacheHit: 0,     cacheMiss: 2.00,  output: 6.00 },
      'mistral-small':      { cacheHit: 0,     cacheMiss: 0.20,  output: 0.60 },
    },
    matchPattern: /mistral/i,
  },
];

// ═══════════════════════════════════════════════════════════════
// Exchange rates: 1 USD = X units of target currency
// ═══════════════════════════════════════════════════════════════

const DEFAULT_RATES: Record<string, number> = {
  USD: 1.0,
  CNY: 7.25,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 157.0,
  KRW: 1380.0,
};

// ═══════════════════════════════════════════════════════════════
// Currency auto-detect
// ═══════════════════════════════════════════════════════════════

export function resolveCurrency(currencySetting: string, language: string): Currency {
  if (currencySetting !== 'auto') return currencySetting as Currency;
  if (language.startsWith('zh')) return 'CNY';
  if (language.startsWith('ja')) return 'JPY';
  if (language.startsWith('ko')) return 'KRW';
  if (language === 'es' || language === 'de' || language === 'fr' || language === 'pt') return 'EUR';
  if (language === 'en') return 'USD';
  if (language === 'ar' || language === 'ru') return 'USD';
  return 'USD';
}

// ═══════════════════════════════════════════════════════════════
// Model name normalization (handles [1m], -free, whitespace, etc.)
// ═══════════════════════════════════════════════════════════════

export function normalizeModelName(raw: string): string {
  return raw
    .replace(/\[.*?\]/g, '')   // Remove [1m] and similar
    .replace(/-free$/, '')      // Remove -free suffix
    .trim();
}

// ═══════════════════════════════════════════════════════════════
// Pricing resolution
// ═══════════════════════════════════════════════════════════════

export function autoDetectProvider(modelName: string): ProviderMeta | null {
  const normalized = normalizeModelName(modelName).toLowerCase();
  for (const p of PROVIDERS) {
    if (p.matchPattern.test(normalized)) return p;
  }
  return null;
}

/**
 * Resolve pricing for a model. Checks:
 * 1. User custom models (exact match on matchPattern)
 * 2. Built-in provider tables (exact match on normalized name, case-insensitive)
 * 3. Fallback: auto-detect provider by name pattern, return default pricing
 * 4. Ultimate fallback: Anthropic Opus pricing (conservative)
 */
export function resolvePricing(
  modelName: string,
  customModels: CustomModelConfig[] = [],
): ResolvedPricing {
  const normalized = normalizeModelName(modelName);
  const normalizedLower = normalized.toLowerCase();

  // 1. Check user custom models
  for (const cm of customModels) {
    try {
      const re = new RegExp(cm.matchPattern, 'i');
      if (re.test(normalizedLower)) {
        return {
          cacheHit: cm.cacheHit,
          cacheMiss: cm.cacheMiss,
          output: cm.output,
          currency: (cm.currency || 'USD') as Currency,
          providerName: cm.name || 'Custom',
        };
      }
    } catch { /* invalid regex — skip */ }
  }

  // 2. Built-in exact match
  for (const p of PROVIDERS) {
    const model = p.models[normalizedLower] || p.models[normalized];
    if (model) {
      return { ...model, currency: p.nativeCurrency, providerName: p.name };
    }
  }

  // 3. Auto-detect provider by pattern
  const provider = autoDetectProvider(normalized);
  if (provider) {
    // Return a conservative fallback for unknown models from known providers
    // Use the most expensive model's pricing as default
    const models = Object.values(provider.models);
    const fallback = models.reduce((a, b) =>
      a.output > b.output ? a : b
    );
    return { ...fallback, currency: provider.nativeCurrency, providerName: provider.name };
  }

  // 4. Ultimate fallback: Anthropic Opus 4.8 pricing (most conservative USD)
  return {
    cacheHit: 1.50, cacheMiss: 15.00, output: 75.00,
    currency: 'USD', providerName: 'Unknown',
  };
}

// ═══════════════════════════════════════════════════════════════
// Currency conversion
// ═══════════════════════════════════════════════════════════════

let customRates: Record<string, number> = {};
let ratesUpdatedAt = 0;
export function setCustomRates(rates: Record<string, number>, updatedAt?: number): void {
  customRates = rates || {};
  if (updatedAt) ratesUpdatedAt = updatedAt;
}
export function getRatesUpdatedAt(): number { return ratesUpdatedAt; }

function getRate(code: string): number {
  if (customRates[code] !== undefined) return customRates[code];
  return DEFAULT_RATES[code] || 1.0;
}

/**
 * Convert an amount from one currency to another.
 * Same currency → no conversion (zero precision loss).
 */
export function convertCurrency(amount: number, from: Currency, to: Currency): number {
  if (from === to) return amount;
  // Convert "from" currency → USD → "to" currency
  const usd = amount / getRate(from);
  return usd * getRate(to);
}

// ═══════════════════════════════════════════════════════════════
// Cost calculation
// ═══════════════════════════════════════════════════════════════

export function calculateCost(
  model: string,
  inputTokens: number,
  cacheReadTokens: number,
  outputTokens: number,
): number {
  const pricing = resolvePricing(model);
  const cacheMissCost = (inputTokens / 1_000_000) * pricing.cacheMiss;
  const cacheHitCost  = (cacheReadTokens / 1_000_000) * pricing.cacheHit;
  const outputCost    = (outputTokens / 1_000_000) * pricing.output;
  return cacheMissCost + cacheHitCost + outputCost;
}

// ═══════════════════════════════════════════════════════════════
// Formatting
// ═══════════════════════════════════════════════════════════════

const CURRENCY_SYMBOLS: Record<string, string> = {
  CNY: '¥', USD: '$', EUR: '€', JPY: '¥', KRW: '₩', GBP: '£',
};

export function formatCost(cost: number, currency: string = 'CNY'): string {
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  if (cost >= 100)  return `${symbol}${cost.toFixed(2)}`;
  if (cost >= 1)    return `${symbol}${cost.toFixed(3)}`;
  if (cost >= 0.01) return `${symbol}${cost.toFixed(4)}`;
  return `${symbol}${cost.toFixed(5)}`;
}

export function abbreviateTokens(count: number): string {
  if (count < 1000) return String(count);
  if (count < 1_000_000) {
    const k = count / 1000;
    return k >= 100 ? `${Math.round(k)}K` : `${k.toFixed(1)}K`;
  }
  const m = count / 1_000_000;
  return m >= 100 ? `${Math.round(m)}M` : `${m.toFixed(1)}M`;
}
