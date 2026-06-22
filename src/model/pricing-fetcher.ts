/**
 * Pricing auto-update fetcher.
 * Downloads pricing.json from GitHub (or custom URL), caches locally,
 * falls back to built-in pricing on any failure.
 *
 * The remote pricing.json format:
 * {
 *   "version": 1,
 *   "updatedAt": "2026-07-01",
 *   "rates": { "CNY": 7.25, "EUR": 0.92, ... },
 *   "providers": [ { "name":"...", "currency":"...", "models":{...} } ]
 * }
 */
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { tokenMonitorDir } from '../utils/paths';
import { setCustomRates } from './pricing';

/** Default URL for remote pricing data */
const DEFAULT_UPDATE_URL = 'https://raw.githubusercontent.com/Miku3w3/ClaudeCodeUsage/main/pricing.json';
/** Cache TTL: 24 hours in ms */
const CACHE_TTL = 24 * 60 * 60 * 1000;
/** Fetch timeout: 5 seconds */
const FETCH_TIMEOUT = 5000;

function cachePath(): string {
  return path.join(tokenMonitorDir(), 'pricing-cache.json');
}

export interface RemotePricing {
  version: number;
  updatedAt: string;
  rates?: Record<string, number>;
  providers?: Array<{
    name: string;
    currency: string;
    models: Record<string, { cacheHit: number; cacheMiss: number; output: number }>;
  }>;
}

/**
 * Fetch remote pricing.json. Returns null on any failure.
 */
function fetchRemote(url: string): Promise<RemotePricing | null> {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: FETCH_TIMEOUT }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return resolve(null); }
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

/**
 * Check for pricing updates. Called once on extension activation.
 * Does NOT block — updates happen asynchronously.
 */
export async function checkForUpdates(updateUrl?: string): Promise<void> {
  const url = updateUrl || DEFAULT_UPDATE_URL;
  const cacheFile = cachePath();

  // Check if cache is still fresh
  try {
    const stat = fs.statSync(cacheFile);
    if (Date.now() - stat.mtimeMs < CACHE_TTL) {
      // Cache fresh — load rates from cache
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      if (cached?.rates) {
        setCustomRates(cached.rates, stat.mtimeMs);
      }
      return;
    }
  } catch { /* no cache yet */ }

  // Fetch remote
  const remote = await fetchRemote(url);
  if (remote) {
    // Write cache
    try {
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify(remote, null, 2), 'utf-8');
    } catch { /* */ }
    // Update rates
    if (remote.rates) {
      setCustomRates(remote.rates, Date.now());
    }
  } else {
    // Fetch failed — try loading expired cache as fallback
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      if (cached?.rates) {
        const stat = fs.statSync(cacheFile);
        setCustomRates(cached.rates, stat.mtimeMs);
      }
    } catch { /* no cache at all */ }
  }
}
