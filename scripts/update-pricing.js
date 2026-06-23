/**
 * AI-powered model pricing updater — all 11 major providers.
 *
 * Run manually:  node scripts/update-pricing.js [--dry-run]
 * Or via GitHub Actions (monthly cron).
 *
 * Requires one of: DEEPSEEK_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY
 * (DeepSeek is cheapest — recommended)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ─── AI backend selection ──────────────────────────────────────

function getAIConfig() {
  const key = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error(
    'Missing API key. Set one of:\n' +
    '  DEEPSEEK_API_KEY  (recommended, cheapest)\n' +
    '  OPENAI_API_KEY\n' +
    '  ANTHROPIC_API_KEY'
  );

  if (process.env.DEEPSEEK_API_KEY) {
    return {
      name: 'deepseek',
      key: process.env.DEEPSEEK_API_KEY,
      hostname: 'api.deepseek.com',
      path: '/v1/chat/completions',
      model: 'deepseek-chat',
      buildBody: (msg) => JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'system', content: 'You are a precise data extraction tool. Return ONLY valid JSON, no markdown, no explanation.' }, { role: 'user', content: msg }],
        max_tokens: 4096,
        temperature: 0,
      }),
      parseResponse: (data) => {
        const text = JSON.parse(data).choices[0]?.message?.content || '';
        const m = text.match(/\{[\s\S]*\}/);
        return m ? JSON.parse(m[0]) : null;
      },
    };
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      name: 'openai',
      key: process.env.OPENAI_API_KEY,
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      model: 'gpt-4o-mini',
      buildBody: (msg) => JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: 'You are a precise data extraction tool. Return ONLY valid JSON, no markdown, no explanation.' }, { role: 'user', content: msg }],
        max_tokens: 4096,
        temperature: 0,
      }),
      parseResponse: (data) => {
        const text = JSON.parse(data).choices[0]?.message?.content || '';
        const m = text.match(/\{[\s\S]*\}/);
        return m ? JSON.parse(m[0]) : null;
      },
    };
  }

  // Anthropic fallback
  return {
    name: 'anthropic',
    key: process.env.ANTHROPIC_API_KEY,
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    model: 'claude-sonnet-4-6',
    buildBody: (msg) => JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: 'You are a precise data extraction tool. Return ONLY valid JSON, no markdown, no explanation.',
      messages: [{ role: 'user', content: msg }],
    }),
    parseResponse: (data) => {
      const text = JSON.parse(data).content[0]?.text || '';
      const m = text.match(/\{[\s\S]*\}/);
      return m ? JSON.parse(m[0]) : null;
    },
    headers: { 'anthropic-version': '2023-06-01' },
  };
}

const ALL_PROVIDERS = [
  {
    name: 'DeepSeek',
    currency: 'CNY',
    url: 'https://api-docs.deepseek.com/quick_start/pricing',
    prompt: 'Extract ALL model pricing from this page as JSON. Keys are lowercase model names. Use CNY per 1M tokens. cacheHit=0 if no cache discount.',
  },
  {
    name: 'Anthropic',
    currency: 'USD',
    url: 'https://www.anthropic.com/pricing',
    prompt: 'Extract ALL Claude model pricing from this page as JSON. Keys are lowercase model names. Use USD per 1M tokens.',
  },
  {
    name: 'OpenAI',
    currency: 'USD',
    url: 'https://openai.com/api/pricing/',
    prompt: 'Extract ALL GPT/o-series model pricing from this page as JSON. Keys are lowercase model names. Use USD per 1M tokens. cacheHit=0 for o1.',
  },
  {
    name: 'Google',
    currency: 'USD',
    urls: ['https://ai.google.dev/pricing', 'https://cloud.google.com/vertex-ai/generative-ai/pricing'],
    prompt: 'Extract ALL Gemini model pricing from this page as JSON. Keys are lowercase model names. Use USD per 1M tokens. cacheHit=0 if no cache discount.',
  },
  {
    name: 'Alibaba Qwen',
    currency: 'CNY',
    urls: ['https://help.aliyun.com/zh/model-studio/getting-started/pricing'],
    prompt: 'Extract ALL Qwen model pricing from this page as JSON. Keys are lowercase model names (e.g. qwen3.5-plus, qwen-long). Use CNY per 1M tokens.',
  },
  {
    name: 'Moonshot Kimi',
    currency: 'USD',
    urls: ['https://platform.moonshot.cn/docs/pricing', 'https://platform.moonshot.cn/pricing'],
    prompt: 'Extract ALL Kimi model pricing from this page as JSON. Keys are lowercase model names. Use USD per 1M tokens.',
  },
  {
    name: 'Zhipu GLM',
    currency: 'CNY',
    urls: ['https://open.bigmodel.cn/dev/api/normal-model/glm-4'],
    prompt: 'Extract ALL GLM model pricing from this page as JSON. Keys are lowercase model names. Use CNY per 1M tokens.',
  },
  {
    name: 'ByteDance Doubao',
    currency: 'CNY',
    urls: ['https://www.volcengine.com/docs/82379/1099320', 'https://www.volcengine.com/docs/82379/1396986'],
    prompt: 'Extract ALL Doubao model pricing from this page as JSON. Keys are lowercase model names. Use CNY per 1M tokens.',
  },
  {
    name: 'Baidu Ernie',
    currency: 'CNY',
    urls: ['https://cloud.baidu.com/doc/WENXINWORKSHOP/s/hlrk4akp7'],
    prompt: 'Extract ALL Ernie model pricing from this page as JSON. Keys are lowercase model names. Use CNY per 1M tokens.',
  },
  {
    name: 'xAI Grok',
    currency: 'USD',
    urls: ['https://x.ai/about/pricing', 'https://docs.x.ai/docs/pricing'],
    prompt: 'Extract ALL Grok model pricing from this page as JSON. Keys are lowercase model names. Use USD per 1M tokens.',
  },
  {
    name: 'Mistral',
    currency: 'USD',
    urls: ['https://mistral.ai/products/la-plateforme#pricing', 'https://docs.mistral.ai/deployment/pricing/'],
    prompt: 'Extract ALL Mistral model pricing from this page as JSON. Keys are lowercase model names. Use USD per 1M tokens.',
  },
];

const RATE_API_URL = 'https://open.er-api.com/v6/latest/USD';

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 15000, headers: { 'User-Agent': 'CCTM-PricingUpdater/1.0' } }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        return fetchPage(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function callAI(userMessage) {
  const ai = getAIConfig();
  console.log(`  Using AI backend: ${ai.name} (${ai.model})`);

  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ai.key}`, ...(ai.headers || {}) };
    const req = https.request({
      hostname: ai.hostname, path: ai.path, method: 'POST', timeout: 30000, headers,
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`API ${res.statusCode}: ${data.slice(0, 200)}`));
        try {
          const result = ai.parseResponse(data);
          if (result) resolve(result);
          else reject(new Error('Failed to parse JSON from response'));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(ai.buildBody(userMessage));
    req.end();
  });
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const pricingPath = path.join(__dirname, '..', 'pricing.json');
  const existing = JSON.parse(fs.readFileSync(pricingPath, 'utf-8'));
  const providers = [];

  // 1. Exchange rates
  console.log('[1/2] Fetching exchange rates...');
  let rates = null;
  try {
    const data = await fetchPage(RATE_API_URL);
    const parsed = JSON.parse(data);
    if (parsed?.result === 'success') rates = parsed.rates;
    console.log('  OK —', Object.keys(rates || {}).length, 'currencies');
  } catch (e) {
    console.log('  FAIL — keeping existing rates');
    rates = existing.rates;
  }

  // 2. Model pricing — all 11 providers
  console.log('[2/2] Fetching model pricing from', ALL_PROVIDERS.length, 'providers...');
  for (const src of ALL_PROVIDERS) {
    console.log(`  ${src.name}...`);
    try {
      // Support both single url (string) and multiple urls (array)
      const urls = src.urls || [src.url];
      let html = null;
      for (const url of urls) {
        try { html = await fetchPage(url); if (html) break; } catch { /* try next URL */ }
      }
      if (!html) throw new Error('All URLs failed');
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 30000);
      const json = await callAI(`${src.prompt}\n\nWEB PAGE:\n${text}`);
      if (json && Object.keys(json).length > 0) {
        providers.push({ name: src.name, currency: src.currency, models: json });
        console.log(`    OK — ${Object.keys(json).length} models:`, Object.keys(json).join(', '));
      } else {
        console.log('    FAIL — keeping existing');
        const ex = existing.providers?.find(p => p.name === src.name);
        if (ex) providers.push(ex);
      }
    } catch (e) {
      console.log(`    FAIL — ${e.message}, keeping existing`);
      const ex = existing.providers?.find(p => p.name === src.name);
      if (ex) providers.push(ex);
    }
  }

  // 3. Write
  const output = { version: (existing.version || 1) + 1, updatedAt: new Date().toISOString().split('T')[0], rates, providers };
  if (dryRun) {
    console.log('\n--- DRY RUN ---');
    console.log(JSON.stringify(output, null, 2));
  } else {
    fs.writeFileSync(pricingPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
    console.log(`\nDone — v${output.version}, ${providers.length} providers, ${Object.keys(output.rates).length} currencies`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
