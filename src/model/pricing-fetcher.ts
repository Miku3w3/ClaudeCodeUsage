/**
 * Pricing auto-update fetcher.
 * Downloads pricing.json from CDN / GitHub, caches locally,
 * falls back to built-in pricing on any failure.
 * Supports HTTP CONNECT and SOCKS5 proxy via VSCode http.proxy setting.
 */
import * as https from 'https';
import * as net from 'net';
import * as tls from 'tls';
import * as fs from 'fs';
import * as path from 'path';
import { tokenMonitorDir } from '../utils/paths';
import { setCustomRates, getRatesUpdatedAt, DEFAULT_RATES, setCustomProviders } from './pricing';
import type { Currency, ProviderMeta } from './types';
import * as vscode from 'vscode';

/** Convert remote provider format (name/currency/models) to internal ProviderMeta[]. */
function applyRemoteProviders(remote: Array<{ name: string; currency: string; models: Record<string, { cacheHit: number; cacheMiss: number; output: number }> }>): void {
  const converted: ProviderMeta[] = remote.map(r => ({
    name: r.name,
    nativeCurrency: r.currency as Currency,
    models: r.models,
    matchPattern: new RegExp(r.name.replace(/\s+/g, ''), 'i'),
  }));
  setCustomProviders(converted);
}

const DEFAULT_UPDATE_URLS = [
  'https://cdn.jsdelivr.net/gh/Miku3w3/ClaudeCodeUsage@master/pricing.json',
  'https://raw.githubusercontent.com/Miku3w3/ClaudeCodeUsage/master/pricing.json',
];
const CACHE_TTL = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT = 5000;

function cachePath(): string { return path.join(tokenMonitorDir(), 'pricing-cache.json'); }

export interface RemotePricing {
  version: number; updatedAt: string; rates?: Record<string, number>;
  providers?: Array<{ name: string; currency: string; models: Record<string, { cacheHit: number; cacheMiss: number; output: number }> }>;
}

// SOCKS5 tunnel (for Clash mixed-mode proxies)
function socks5Connect(proxyHost: string, proxyPort: number, targetHost: string, targetPort: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(FETCH_TIMEOUT);
    socket.connect(proxyPort, proxyHost, () => {
      socket.write(Buffer.from([0x05, 0x01, 0x00]));
      socket.once('data', (data: Buffer) => {
        if (data[0] !== 0x05 || data[1] !== 0x00) { socket.destroy(); return reject(new Error('auth')); }
        const hostBytes = Buffer.from(targetHost, 'utf-8');
        const portBuf = Buffer.alloc(2); portBuf.writeUInt16BE(targetPort, 0);
        socket.write(Buffer.concat([Buffer.from([0x05, 0x01, 0x00, 0x03, hostBytes.length]), hostBytes, portBuf]));
        socket.once('data', (resp: Buffer) => {
          if (resp[0] !== 0x05 || resp[1] !== 0x00) { socket.destroy(); return reject(new Error('connect')); }
          socket.setTimeout(0); resolve(socket);
        });
      });
    });
    socket.on('error', reject);
  });
}

function httpConnect(proxyHost: string, proxyPort: number, targetHost: string, targetPort: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(FETCH_TIMEOUT);
    socket.connect(proxyPort, proxyHost, () => {
      socket.write(`CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}\r\n\r\n`);
      socket.once('data', (data: Buffer) => {
        if (!data.toString().includes('200')) { socket.destroy(); return reject(new Error('CONNECT')); }
        socket.setTimeout(0); resolve(socket);
      });
    });
    socket.on('error', reject);
  });
}

function tlsRequest(socket: net.Socket, parsed: URL): Promise<RemotePricing | null> {
  return new Promise((resolve) => {
    const tlsSocket = tls.connect({ socket, host: parsed.hostname, servername: parsed.hostname, rejectUnauthorized: false }, () => {
      tlsSocket.write(`GET ${parsed.pathname}${parsed.search} HTTP/1.1\r\nHost: ${parsed.hostname}\r\nUser-Agent: CCTM/1.0\r\nConnection: close\r\n\r\n`);
      let body = '';
      tlsSocket.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      tlsSocket.on('end', () => { const json = body.split('\r\n\r\n').slice(1).join('\r\n\r\n'); try { resolve(JSON.parse(json)); } catch { resolve(null); } });
      tlsSocket.on('error', () => resolve(null));
    });
    tlsSocket.on('error', () => resolve(null));
    setTimeout(() => { tlsSocket.destroy(); resolve(null); }, FETCH_TIMEOUT);
  });
}

async function fetchWithProxy(urlStr: string, proxyUrl: string): Promise<RemotePricing | null> {
  const parsed = new URL(urlStr);
  const proxy = new URL(proxyUrl);
  const h = proxy.hostname, p = parseInt(proxy.port) || 7890;
  for (const fn of [() => socks5Connect(h, p, parsed.hostname, 443), () => httpConnect(h, p, parsed.hostname, 443)]) {
    try { const s = await fn(); const d = await tlsRequest(s, parsed); if (d) return d; } catch { /* next */ }
  }
  return null;
}

function fetchDirect(urlStr: string): Promise<RemotePricing | null> {
  return new Promise((resolve) => {
    https.get(urlStr, { timeout: FETCH_TIMEOUT }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return resolve(null); }
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    }).on('error', () => resolve(null)).on('timeout', function (this: any) { this.destroy(); resolve(null); });
  });
}

export async function checkForUpdates(customUrl?: string, force = false): Promise<void> {
  const urls = customUrl ? [customUrl] : DEFAULT_UPDATE_URLS;
  const cacheFile = cachePath();

  if (!force) {
    try {
      const stat = fs.statSync(cacheFile);
      if (Date.now() - stat.mtimeMs < CACHE_TTL) {
        const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
        if (cached?.rates) { setCustomRates(cached.rates, stat.mtimeMs); return; }
      }
    } catch { /* */ }
  }

  const proxyUrl = vscode.workspace.getConfiguration('http').get<string>('proxy') || '';
  let remote: RemotePricing | null = null;
  for (const url of urls) {
    if (proxyUrl && proxyUrl.startsWith('http')) { remote = await fetchWithProxy(url, proxyUrl); if (remote) break; }
    remote = await fetchDirect(url);
    if (remote) break;
  }

  if (remote) {
    try { fs.mkdirSync(path.dirname(cacheFile), { recursive: true }); fs.writeFileSync(cacheFile, JSON.stringify(remote, null, 2), 'utf-8'); } catch { /* */ }
    if (remote.rates) { setCustomRates(remote.rates, Date.now()); }
    if (remote.providers) { applyRemoteProviders(remote.providers); }
    if (remote.rates || remote.providers) return;
  }

  // Fallback: cached data
  try {
    const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
    if (cached?.rates) { const stat = fs.statSync(cacheFile); setCustomRates(cached.rates, stat.mtimeMs); }
    if (cached?.providers) { applyRemoteProviders(cached.providers); }
    if (cached?.rates || cached?.providers) return;
  } catch { /* */ }

  // Ultimate fallback: built-in
  if (!getRatesUpdatedAt()) { setCustomRates(DEFAULT_RATES, 1); }
}
