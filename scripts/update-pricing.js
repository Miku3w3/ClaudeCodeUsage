/**
 * AI-powered model pricing updater — all major providers.
 *
 * Run manually:  node scripts/update-pricing.js [--dry-run]
 * Or via GitHub Actions (monthly cron).
 *
 * Requires: ANTHROPIC_API_KEY env var
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

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
    url: 'https://ai.google.dev/pricing',
    prompt: 'Extract ALL Gemini model pricing from this page as JSON. Keys are lowercase model names. Use USD per 1M tokens. cacheHit=0 if no cache discount.',
  },
  {
    name: 'Alibaba Qwen',
    currency: 'CNY',
    url: 'https://help.aliyun.com/zh/model-studio/getting-started/pricing',
    prompt: 'Extract ALL Qwen model pricing from this page as JSON. Keys are lowercase model names (e.g. qwen3.5-plus, qwen-long). Use CNY per 1M tokens.',
  },
  {
    name: 'Moonshot Kimi',
    currency: 'USD',
    url: 'https://platform.moonshot.cn/pricing',
    prompt: 'Extract ALL Kimi model pricing from this page as JSON. Keys are lowercase model names. Use USD per 1M tokens.',
  },
  {
    name: 'Zhipu GLM',
    currency: 'CNY',
    url: 'https://open.bigmodel.cn/pricing',
    prompt: 'Extract ALL GLM model pricing from this page as JSON. Keys are lowercase model names. Use CNY per 1M tokens.',
  },
  {
    name: 'ByteDance Doubao',
    currency: 'CNY',
    url: 'https://www.volcengine.com/docs/82379/1099320',
    prompt: 'Extract ALL Doubao model pricing from this page as JSON. Keys are lowercase model names. Use CNY per 1M tokens.',
  },
  {
    name: 'Baidu Ernie',
    currency: 'CNY',
    url: 'https://cloud.baidu.com/doc/WENXINWORKSHOP/s/hlrk4akp7',
    prompt: 'Extract ALL Ernie model pricing from this page as JSON. Keys are lowercase model names. Use CNY per 1M tokens.',
  },
  {
    name: 'xAI Grok',
    currency: 'USD',
    url: 'https://x.ai/api/pricing',
    prompt: 'Extract ALL Grok model pricing from this page as JSON. Keys are lowercase model names. Use USD per 1M tokens.',
  },
  {
    name: 'Mistral',
    currency: 'USD',
    url: 'https://mistral.ai/technology/#pricing',
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

function callClaude(systemPrompt, userMessage) {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY env var');

  const body = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST', timeout: 30000,
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`API ${res.statusCode}: ${data.slice(0, 200)}`));
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : null;
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
      const html = await fetchPage(src.url);
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 30000);
      const response = await callClaude(
        'You are a pricing data extraction tool. The user gives you a web page. Extract ALL model pricing as a JSON object. Keys: lowercase model names. Values: {cacheHit, cacheMiss, output} in the page\'s native currency per 1M tokens. Cache hit = 0 if not mentioned. Return ONLY the JSON object, no markdown, no explanation.',
        `${src.prompt}\n\nWEB PAGE:\n${text}`
      );
      const json = extractJson(response.content[0]?.text || '');
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
