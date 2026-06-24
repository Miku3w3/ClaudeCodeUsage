// Claude Code Token Monitor - VSCode Extension v1.0.0 (Universal Edition)
// Architecture: v0.8.0 event-driven tab switching + mtime-based session tracking,
// with multi-provider pricing, i18n UI, and full VSCode configuration support.
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { parseLine } from './parsers/TranscriptParser';
import {
  calculateCost, normalizeModelName, formatCost, abbreviateTokens,
  resolvePricing, convertCurrency,
} from './model/CostCalculator';
import { claudeDir, tokenMonitorDir, tokenTrackerDir, transcriptPath as getTranscriptPath } from './utils/paths';
import type { PerMessageStats, SessionPidFile, ClaudeReadableData, TimeRange, AggregatedData, SessionIndexEntry, ModelStatEntry } from './model/types';
import { DetailPanel } from './ui/DetailPanel';
import type { PanelData } from './ui/DetailPanel';
import { t, initI18n, isRTL } from './i18n/index';
import { getConfig } from './config/settings';
import { checkForUpdates } from './model/pricing-fetcher';
import { getRatesUpdatedAt } from './model/pricing';
import type { ExtensionConfig } from './model/types';
import * as SessionStore from './data/SessionStore';

// ─── Globals ──────────────────────────────────────────────────
let statusBarItem: vscode.StatusBarItem;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let detailPanel: DetailPanel;

// Transcript parse cache — keyed by file path, invalidated on mtime change
const transcriptCache = new Map<string, { mtimeMs: number; messages: PerMessageStats[] }>();

// Extension ID (set during activation)
let extensionId = 'local.claude-code-token-monitor';

// Current session state
let currentSessionId = '';
let currentTitle = '';
let currentModel = 'unknown';
let cumulativeInput = 0, cumulativeOutput = 0, cumulativeCacheRead = 0, cumulativeCost = 0;
let messageCount = 0;
let messages: PerMessageStats[] = [];
let lastFileSize = 0;
let lastTranscriptPath = '';
const seenMessageIds = new Set<string>();
let pendingUserTs: number | null = null;
let turnAiAccumulatorMs = 0;
let turnTokens = 0;
let turnCost = 0;

// Tab-switching state (v0.3.0 mechanism)
let activeSessionOverride: { sessionId: string; cwd: string } | null = null;
const sessionTitleCache = new Map<string, string>();
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let idleByUserChoice = false;
let idleKnownSessions: Set<string> = new Set(); // sessions known when idle was set; new ones trigger auto-switch
let cachedTranscripts: Array<{ sessionId: string; cwd: string }> | null = null;
let transcriptCacheTime = 0;

// Configuration snapshot (refreshed on change)
let currentConfig: ExtensionConfig = {} as ExtensionConfig;
// Budget warning: only show once per threshold exceed
let budgetWarned = false;

// ─── Path encoding (v0.6.0 fix: no dash collapsing) ─────────────
function encodeProjectPath(cwd: string): string {
  return cwd
    .replace(/:\\/g, '--')
    .replace(/:\//g, '--')
    .replace(/\\/g, '-')
    .replace(/\//g, '-');
}

// ─── Session scanning (v0.6.0 fix: transcript existence instead of PID) ──
function scanSessions(): Array<{ pid: number; sessionId: string; cwd: string; startedAt: number }> {
  const sessionsDir = path.join(claudeDir(), 'sessions');
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(sessionsDir, { withFileTypes: true }); } catch { return []; }

  const result: Array<{ pid: number; sessionId: string; cwd: string; startedAt: number }> = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const pid = parseInt(entry.name.replace('.json', ''), 10);
    if (isNaN(pid)) continue;

    const filePath = path.join(sessionsDir, entry.name);
    let data: SessionPidFile;
    try { data = JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch { continue; }

    const tp = path.join(claudeDir(), 'projects', encodeProjectPath(data.cwd), data.sessionId + '.jsonl');
    if (!fs.existsSync(tp)) continue;

    result.push({ pid, sessionId: data.sessionId, cwd: data.cwd, startedAt: data.startedAt });
  }
  return result;
}

// ─── Scan all transcripts (including cold/closed sessions) ──
function scanAllTranscripts(): Array<{ sessionId: string; cwd: string }> {
  const projectsDir = path.join(claudeDir(), 'projects');
  const result: Array<{ sessionId: string; cwd: string }> = [];
  let cwdDirs: fs.Dirent[];
  try { cwdDirs = fs.readdirSync(projectsDir, { withFileTypes: true }); } catch { return []; }

  const seen = new Set<string>();

  for (const dir of cwdDirs) {
    if (!dir.isDirectory()) continue;
    const encoded = dir.name;
    const cwd = decodeProjectPath(encoded);
    const cwdPath = path.join(projectsDir, encoded);

    let files: fs.Dirent[];
    try { files = fs.readdirSync(cwdPath, { withFileTypes: true }); } catch { continue; }

    for (const f of files) {
      if (!f.isFile() || !f.name.endsWith('.jsonl')) continue;
      const sessionId = f.name.replace('.jsonl', '');
      if (seen.has(sessionId)) continue;
      seen.add(sessionId);
      result.push({ sessionId, cwd });
    }
  }
  return result;
}

// Cached wrapper — rescan at most every 30 seconds
function getCachedTranscripts(): Array<{ sessionId: string; cwd: string }> {
  const now = Date.now();
  if (cachedTranscripts && (now - transcriptCacheTime) < 30000) {
    return cachedTranscripts;
  }
  cachedTranscripts = scanAllTranscripts();
  transcriptCacheTime = now;
  return cachedTranscripts;
}

// ─── Decode project path back to cwd ──
function decodeProjectPath(encoded: string): string {
  const idx = encoded.indexOf('--');
  if (idx >= 0) {
    const drive = encoded.slice(0, idx) + ':\\';
    const rest = encoded.slice(idx + 2).replace(/-/g, '\\');
    return drive + rest;
  }
  return '/' + encoded.replace(/-/g, '/');
}

// ─── Title extraction ──────────────────────────────────────
function getSessionTitle(s: { cwd: string; sessionId: string }): string {
  const cached = sessionTitleCache.get(s.sessionId);
  if (cached) return cached;

  try {
    const encoded = encodeProjectPath(s.cwd);
    const tp = path.join(claudeDir(), 'projects', encoded, s.sessionId + '.jsonl');
    const stat = fs.statSync(tp);

    // Search backwards in 16KB chunks for ai-title
    let offset = stat.size;
    while (offset > 0) {
      const start = Math.max(0, offset - 16384);
      const len = offset - start;
      const buf = Buffer.alloc(len);
      const fd = fs.openSync(tp, 'r');
      fs.readSync(fd, buf, 0, len, start);
      fs.closeSync(fd);
      const lines = buf.toString('utf-8').split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const obj = JSON.parse(lines[i]);
          if (obj.type === 'ai-title' && obj.aiTitle) {
            sessionTitleCache.set(s.sessionId, obj.aiTitle);
            return obj.aiTitle;
          }
        } catch { /* skip */ }
      }
      if (start === 0) break;
      offset = start;
    }

    // No ai-title — fall back to first user message text
    const headBuf = Buffer.alloc(Math.min(8192, stat.size));
    const fd2 = fs.openSync(tp, 'r');
    fs.readSync(fd2, headBuf, 0, headBuf.length, 0);
    fs.closeSync(fd2);
    for (const line of headBuf.toString('utf-8').split('\n')) {
      try {
        const obj = JSON.parse(line);
        if (obj.type === 'user' && obj.message?.role === 'user') {
          const content = obj.message.content;
          if (typeof content === 'string' && content.trim()) {
            const title = content.trim().slice(0, 40);
            sessionTitleCache.set(s.sessionId, title);
            return title;
          }
          if (Array.isArray(content)) {
            for (const c of content) {
              if (c.type === 'text' && c.text && !c.tool_use_id) {
                const title = c.text.slice(0, 40);
                sessionTitleCache.set(s.sessionId, title);
                return title;
              }
            }
          }
        }
      } catch { /* skip */ }
    }
  } catch { /* file not found */ }
  return '';
}

// ─── Main poll ────────────────────────────────────────────────
function poll(): void {
  try {
    // 1. Find sessions with live transcripts
    const sessions = scanSessions();
    if (sessions.length === 0 && !activeSessionOverride) {
      if (currentSessionId) resetState();
      updateStatusBar();
      return;
    }

    // 2. Pick the active session
    let active: { sessionId: string; cwd: string } | null = null;

    if (activeSessionOverride) {
      const overrideActive = sessions.find(s => s.sessionId === activeSessionOverride!.sessionId);
      if (overrideActive) {
        active = overrideActive;
      } else {
        const tp = path.join(claudeDir(), 'projects', encodeProjectPath(activeSessionOverride.cwd), activeSessionOverride.sessionId + '.jsonl');
        if (fs.existsSync(tp)) {
          active = activeSessionOverride;
        } else {
          activeSessionOverride = null;
        }
      }
    }

    if (!active) {
      if (sessions.length === 0) {
        updateStatusBar();
        return;
      }
      sessions.sort((a, b) => {
        const aTp = path.join(claudeDir(), 'projects', encodeProjectPath(a.cwd), a.sessionId + '.jsonl');
        const bTp = path.join(claudeDir(), 'projects', encodeProjectPath(b.cwd), b.sessionId + '.jsonl');
        let aMtime = 0, bMtime = 0;
        try { aMtime = fs.statSync(aTp).mtimeMs; } catch { /* */ }
        try { bMtime = fs.statSync(bTp).mtimeMs; } catch { /* */ }
        return bMtime - aMtime;
      });
      active = sessions[0];
    }

    // 3. Build transcript path
    const encoded = encodeProjectPath(active.cwd);
    const tp = path.join(claudeDir(), 'projects', encoded, active.sessionId + '.jsonl');

    // 4. If session changed, reset all state
    if (active.sessionId !== currentSessionId) {
      if (idleByUserChoice) {
        // Auto-clear idle only if a genuinely new session appeared (not one we knew about)
        if (!idleKnownSessions.has(active.sessionId)) {
          idleByUserChoice = false;
          idleKnownSessions.clear();
        } else {
          updateStatusBar();
          return;
        }
      }
      currentSessionId = active.sessionId;
      currentTitle = getSessionTitle(active) || '';
      currentModel = 'unknown';
      cumulativeInput = 0; cumulativeOutput = 0; cumulativeCacheRead = 0; cumulativeCost = 0;
      messageCount = 0;
      messages = [];
      lastFileSize = 0;
      lastTranscriptPath = tp;
      seenMessageIds.clear();
      pendingUserTs = null;
      budgetWarned = false;
    }

    // 5. Read transcript
    let stat: fs.Stats;
    try { stat = fs.statSync(tp); } catch { updateStatusBar(); return; }

    if (stat.size < lastFileSize) { lastFileSize = 0; seenMessageIds.clear(); }

    if (stat.size > lastFileSize) {
      const bytesToRead = stat.size - lastFileSize;
      const buffer = Buffer.alloc(bytesToRead);
      let fd: number | undefined;
      try {
        fd = fs.openSync(tp, 'r');
        fs.readSync(fd, buffer, 0, bytesToRead, lastFileSize);
        lastFileSize = stat.size;
      } catch { return; }
      finally { if (fd !== undefined) fs.closeSync(fd); }

      const newContent = buffer.toString('utf-8');
      const lines = newContent.split('\n').filter(l => l.trim());
      let changed = false;

      for (const line of lines) {
        const event = parseLine(line);
        if (!event || event.sessionId !== active.sessionId) continue;

        if (event.type === 'ai-title' && event.title) {
          currentTitle = event.title;
          sessionTitleCache.set(event.sessionId, event.title);
          changed = true;
          continue;
        }

        if (event.type === 'user') {
          messages.push({
            uuid: event.uuid, timestamp: event.timestamp, isUserMessage: true,
            inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0,
            model: '', costCNY: 0, thinkingTimeMs: null,
          });
          pendingUserTs = new Date(event.timestamp).getTime();
          turnAiAccumulatorMs = 0; // New real user message → reset turn accumulators
          turnTokens = 0;
          turnCost = 0;
          changed = true;
          continue;
        }

        if (event.type === 'tool_result') {
          // Tool result — update reference timestamp for next assistant delta,
          // but do NOT add to messages[] (tool results are not user messages)
          pendingUserTs = new Date(event.timestamp).getTime();
          continue;
        }

        if (event.type === 'assistant' && event.usage) {
          if (seenMessageIds.has(event.uuid)) continue;
          seenMessageIds.add(event.uuid);

          const usage = event.usage;
          currentModel = normalizeModelName(event.model || currentModel);
          const cost = calculateCost(event.model || currentModel, usage.input_tokens, usage.cache_read_input_tokens, usage.output_tokens);

          let thinkTime: number | null = null;
          if (pendingUserTs !== null) {
            thinkTime = new Date(event.timestamp).getTime() - pendingUserTs;
            turnAiAccumulatorMs += thinkTime;
            // Set pendingUserTs to this assistant's timestamp so next assistant
            // in the same turn measures from here (tool_results will refine it)
            pendingUserTs = new Date(event.timestamp).getTime();
          }

          const msg: PerMessageStats = {
            uuid: event.uuid, timestamp: event.timestamp, isUserMessage: false,
            inputTokens: usage.input_tokens, outputTokens: usage.output_tokens,
            cacheReadTokens: usage.cache_read_input_tokens, cacheCreationTokens: usage.cache_creation_input_tokens,
            model: currentModel, costCNY: cost, thinkingTimeMs: thinkTime,
            turnAiTimeMs: turnAiAccumulatorMs,
          };

          messages.push(msg);
          cumulativeInput += usage.input_tokens;
          cumulativeOutput += usage.output_tokens;
          cumulativeCacheRead += usage.cache_read_input_tokens;
          cumulativeCost += cost;
          turnTokens += usage.input_tokens + usage.output_tokens + usage.cache_read_input_tokens;
          turnCost += cost;
          messageCount++;
          changed = true;
        }
      }

      if (changed) {
        updateStatusBar();
        writeClaudeReadable();
        pushToWebview();
        // Persist current session summary to the index
        upsertCurrentToIndex(active.cwd);
      }
    } else {
      updateStatusBar();
    }
  } catch (err) {
    console.error('[TokenMonitor] poll error:', err);
  }
}

// ─── Status bar ───────────────────────────────────────────────
function updateStatusBar(): void {
  if (!currentSessionId || messageCount === 0) {
    statusBarItem.text = `$(pulse) ${t('statusBar.idle')}`;
    statusBarItem.tooltip = new vscode.MarkdownString(
      `**${t('statusBar.noData')}**\n\n${t('panel.noSessionHint')}`
    );
    statusBarItem.backgroundColor = undefined;
    return;
  }

  const totalTokens = cumulativeInput + cumulativeCacheRead + cumulativeOutput;
  const lastAsst = findLast(messages, m => !m.isUserMessage);
  const shortTitle = currentTitle.length > 8 ? currentTitle.slice(0, 8) + '…' : currentTitle;
  const currency = currentConfig.resolvedCurrency;
  const displayCumulativeCost = costInDisplayCurrency(cumulativeCost, currency);

  // Compact mode: only title + cumulative
  if (currentConfig.compactMode) {
    statusBarItem.text = `$(pulse) ${shortTitle} | ${abbreviateTokens(totalTokens)} ${formatCost(displayCumulativeCost, currency)}`;
  } else {
    const parts: string[] = [shortTitle];
    if (currentConfig.showModelName) {
      parts.push(currentModel);
    }
    parts.push(`${t('statusBar.turnAiTime')}${formatThinkTime(turnAiAccumulatorMs)}`);
    parts.push(`${abbreviateTokens(turnTokens)} ${formatCost(costInDisplayCurrency(turnCost, currency), currency)}`);
    parts.push(`${t('statusBar.cumulative')}${abbreviateTokens(totalTokens)} ${formatCost(displayCumulativeCost, currency)}`);
    statusBarItem.text = `$(pulse) ${parts.join(' | ')}`;
  }

  // Budget warning
  if (currentConfig.budgetWarning > 0 && displayCumulativeCost >= currentConfig.budgetWarning) {
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    if (!budgetWarned) {
      budgetWarned = true;
      vscode.window.showWarningMessage(
        `${t('budget.warningTitle')}: ${t('budget.warningBody', { '0': formatCost(displayCumulativeCost, currency) })}`
      );
    }
  } else {
    statusBarItem.backgroundColor = undefined;
    budgetWarned = false;
  }

  // Tooltip
  const md = new vscode.MarkdownString();
  md.supportHtml = true; md.isTrusted = true;
  md.appendMarkdown(`### \u{1F4CA} ${escapeMd(currentTitle)}\n\n`);
  md.appendMarkdown(`*${t('tooltip.lastModel')}: ${escapeMd(currentModel)}*\n\n`);

  // ── Last message section ──
  if (lastAsst) {
    const displayLastCost = costInDisplayCurrency(lastAsst.costCNY, currency);
    const lastTotalInput = lastAsst.inputTokens + lastAsst.cacheReadTokens;
    const lastHitRate = calcHitRate(lastAsst.cacheReadTokens, lastTotalInput);
    const timeFmt = formatTime(new Date(lastAsst.timestamp).getTime(), currentConfig.resolvedLanguage);

    md.appendMarkdown(`**${t('tooltip.lastMsg')}** \`${timeFmt}\`\n\n`);
    md.appendMarkdown(`${t('tooltip.totalInput')}  \n  **${lastTotalInput.toLocaleString()}**\n\n`);
    md.appendMarkdown(`${t('tooltip.cacheHit')}  \n  ${lastAsst.cacheReadTokens.toLocaleString()} (${lastHitRate})\n\n`);
    md.appendMarkdown(`${t('tooltip.cacheMiss')}  \n  ${lastAsst.inputTokens.toLocaleString()}\n\n`);
    md.appendMarkdown(`${t('tooltip.output')}  \n  ${lastAsst.outputTokens.toLocaleString()}\n\n`);
    md.appendMarkdown(`${t('tooltip.cost')}  \n  ${formatCost(displayLastCost, currency)}\n\n`);
    md.appendMarkdown(`**${t('tooltip.turnAiTime')}**  \n  ${formatThinkTime(turnAiAccumulatorMs)}\n\n`);
  } else {
    md.appendMarkdown(`*${t('tooltip.noMessages')}*\n\n`);
  }

  md.appendMarkdown(`---\n\n**${t('tooltip.sessionTotal')}**\n\n`);
  const cumTotalInput = cumulativeInput + cumulativeCacheRead;
  const cumHitRate = calcHitRate(cumulativeCacheRead, cumTotalInput);
  md.appendMarkdown(`${t('tooltip.totalInput')}  \n  **${cumTotalInput.toLocaleString()}**\n\n`);
  md.appendMarkdown(`${t('tooltip.cacheHit')}  \n  ${cumulativeCacheRead.toLocaleString()} (${cumHitRate})\n\n`);
  md.appendMarkdown(`${t('tooltip.cacheMiss')}  \n  ${cumulativeInput.toLocaleString()}\n\n`);
  md.appendMarkdown(`${t('tooltip.output')}  \n  ${cumulativeOutput.toLocaleString()}\n\n`);
  md.appendMarkdown(`${t('tooltip.cost')}  \n  ${formatCost(displayCumulativeCost, currency)}\n\n`);
  md.appendMarkdown(`${t('tooltip.messages')}  \n  ${messageCount}\n\n`);

  // Exchange rate — only show when display currency differs from model's native currency
  const rateTo = currency;
  const rateFrom = resolvePricing(currentModel, currentConfig.customModels).currency;
  if (rateTo !== rateFrom) {
    const backConvert = convertCurrency(1, rateTo as any, rateFrom as any);
    const rate = (1 / backConvert).toFixed(2);
    md.appendMarkdown(`---\n\n*1 ${rateFrom} ≈ ${rate} ${rateTo} · ${formatRatesAge()}*`);
  }

  statusBarItem.tooltip = md;
}

// ─── Helpers ──────────────────────────────────────────────────

/** Convert a cost stored in the model's native currency to the display currency. */
function costInDisplayCurrency(nativeCost: number, targetCurrency: string): number {
  if (!Number.isFinite(nativeCost)) return 0;
  if (!targetCurrency) return nativeCost;
  const pricing = resolvePricing(currentModel, currentConfig.customModels);
  if (!pricing?.currency || pricing.currency === targetCurrency) return nativeCost;
  const converted = convertCurrency(nativeCost, pricing.currency, targetCurrency as any);
  return Number.isFinite(converted) ? converted : nativeCost;
}

/** Save the current in-memory session state to the persistent index. */
function upsertCurrentToIndex(cwd: string): void {
  if (!currentSessionId || messageCount === 0) return;
  const primaryModel = computePrimaryModel();
  SessionStore.upsertSession(currentSessionId, {
    sessionId: currentSessionId,
    title: currentTitle || currentSessionId.slice(0, 8) + '...',
    cwd,
    startedAt: messages.length > 0 ? new Date(messages[0].timestamp).getTime() : Date.now(),
    lastUpdatedAt: Date.now(),
    messageCount,
    totalInputTokens: cumulativeInput,          // cache-miss only, consistent with parseTranscriptFile
    totalOutputTokens: cumulativeOutput,
    totalCacheHitTokens: cumulativeCacheRead,
    totalCacheMissTokens: 0,                    // redundant with totalInputTokens; kept for schema compat
    totalCostCNY: cumulativeCost,
    primaryModel,
  });
}

function computePrimaryModel(): string {
  const counts = new Map<string, number>();
  for (const m of messages) {
    if (!m.isUserMessage && m.model) {
      counts.set(m.model, (counts.get(m.model) || 0) + 1);
    }
  }
  let best = 'unknown';
  let bestCount = 0;
  for (const [model, count] of counts) {
    if (count > bestCount) { bestCount = count; best = model; }
  }
  return best;
}

function resetState(): void {
  // Save old session to index before resetting
  if (currentSessionId && messageCount > 0) {
    const cwd = ''; // We don't have cwd handy here, which is fine — the session
    // is already indexed from the last poll upsert
  }
  currentSessionId = ''; currentTitle = ''; currentModel = 'unknown';
  cumulativeInput = 0; cumulativeOutput = 0; cumulativeCacheRead = 0; cumulativeCost = 0;
  messageCount = 0; messages = []; lastFileSize = 0; lastTranscriptPath = '';
  seenMessageIds.clear(); pendingUserTs = null; activeSessionOverride = null;
  turnAiAccumulatorMs = 0; turnTokens = 0; turnCost = 0;
  budgetWarned = false;
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
}

function findLast<T>(arr: T[], pred: (item: T) => boolean): T | null {
  for (let i = arr.length - 1; i >= 0; i--) { if (pred(arr[i])) return arr[i]; }
  return null;
}

function escapeMd(text: string): string { return text.replace(/[\\`*_{}[\]()#+\-.!|]/g, '\\$&'); }

function formatThinkTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(0)}s`;
}

/** Format a timestamp for display using the configured language's locale. */
function formatTime(epochMs: number, lang: string): string {
  try {
    const locale = lang === 'zh-CN' ? 'zh-CN' : lang === 'ja' ? 'ja-JP' : lang === 'ko' ? 'ko-KR' : 'en-US';
    return new Date(epochMs).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return new Date(epochMs).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}

/** Calculate cache hit rate as percentage string. */
function calcHitRate(hit: number, total: number): string {
  if (total === 0) return '—';
  return ((hit / total) * 100).toFixed(1) + '%';
}

/** Format exchange rate age for display. */
function formatRatesAge(): string {
  const ts = getRatesUpdatedAt();
  if (!ts) return t('rates.unknown');
  if (ts === 1) return t('rates.builtin'); // Built-in, never fetched from remote
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return mins <= 1 ? t('rates.justNow') : t('rates.minutesAgo', { '0': String(mins) });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('rates.hoursAgo', { '0': String(hours) });
  const days = Math.floor(hours / 24);
  return t('rates.daysAgo', { '0': String(days) });
}

// ─── Claude-readable output ───────────────────────────────────
function writeClaudeReadable(): void {
  try { fs.mkdirSync(tokenMonitorDir(), { recursive: true }); } catch { /* */ }
  const totalTokens = cumulativeInput + cumulativeCacheRead + cumulativeOutput;
  const lastAsst = findLast(messages, m => !m.isUserMessage);
  const lastUser = findLast(messages, m => m.isUserMessage);
  const data: ClaudeReadableData = {
    sessionId: currentSessionId, title: currentTitle, model: currentModel, active: true,
    cumulative: { inputTokens: cumulativeInput, cacheReadTokens: cumulativeCacheRead, outputTokens: cumulativeOutput, messageCount, totalCostCNY: cumulativeCost, totalTokens },
    lastMessage: lastAsst ? { uuid: lastAsst.uuid, timestamp: lastAsst.timestamp, type: 'assistant', model: lastAsst.model, inputTokens: lastAsst.inputTokens, cacheReadTokens: lastAsst.cacheReadTokens, outputTokens: lastAsst.outputTokens, costCNY: lastAsst.costCNY, thinkingTimeMs: lastAsst.thinkingTimeMs } : null,
    lastUserMessage: lastUser ? { uuid: lastUser.uuid, timestamp: lastUser.timestamp, thinkingTimeMs: lastAsst?.thinkingTimeMs ?? null } : null,
    updatedAt: new Date().toISOString(),
  };
  try { fs.writeFileSync(path.join(tokenMonitorDir(), 'current-session.json'), JSON.stringify(data, null, 2), 'utf-8'); } catch { /* */ }
}

// ─── Webview filter handlers (v0.12.0) ─────────────────────────

function handleSetTimeRange(timeRange: TimeRange, postMsg?: (msg: any) => void): void {
  const now = Date.now();
  let startMs = 0;
  const d = new Date();

  switch (timeRange) {
    case 'daily':
      d.setHours(0, 0, 0, 0);
      startMs = d.getTime();
      break;
    case 'weekly': {
      const dayOfWeek = d.getDay();
      const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Monday start
      d.setDate(diff);
      d.setHours(0, 0, 0, 0);
      startMs = d.getTime();
      break;
    }
    case 'monthly':
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      startMs = d.getTime();
      break;
    case 'yearly':
      d.setMonth(0, 1);
      d.setHours(0, 0, 0, 0);
      startMs = d.getTime();
      break;
    case 'all':
      startMs = 0;
      break;
    default:
      // 'current' — handled client-side with existing fullUpdate data
      return;
  }

  const sessions = SessionStore.getSessionsInRange(startMs, now);
  const agg = buildAggregatedData(timeRange, sessions, now, startMs);

  if (postMsg) {
    postMsg({
      type: 'aggregatedData',
      data: agg,
      lang: currentConfig.resolvedLanguage,
      currency: currentConfig.resolvedCurrency,
      i18n: detailPanel.getTranslations(),
    });
  } else {
    detailPanel.pushAggregatedData(agg);
  }
}

function handleSelectSession(sessionId: string, postMsg?: (msg: any) => void): void {
  // Find the session in the index
  const entry = SessionStore.getAllSessions().find(s => s.sessionId === sessionId);
  if (!entry) return;

  // Parse the transcript and build PanelData
  const tp = path.join(claudeDir(), 'projects', encodeProjectPath(entry.cwd), sessionId + '.jsonl');
  if (!fs.existsSync(tp)) return;

  const msgs = parseFullTranscriptCached(tp);
  const totalTokens = msgs.reduce((sum, m) => sum + (m.isUserMessage ? 0 : m.inputTokens + m.outputTokens + m.cacheReadTokens), 0);
  const totalCost = msgs.reduce((sum, m) => sum + (m.isUserMessage ? 0 : m.costCNY), 0);
  const displayCost = costInDisplayCurrency(totalCost, currentConfig.resolvedCurrency);
  const lastAsst = findLast(msgs, m => !m.isUserMessage);
  const modelStats = buildModelStatsFromMessages(msgs);

  const sessionData: PanelData = {
    sessionId,
    title: entry.title,
    model: entry.primaryModel,
    isActive: false,
    cumulativeInputTokens: entry.totalCacheMissTokens + entry.totalInputTokens,
    cumulativeOutputTokens: entry.totalOutputTokens,
    cumulativeCacheReadTokens: entry.totalCacheHitTokens,
    cumulativeCostCNY: displayCost,
    totalTokens,
    messageCount: entry.messageCount,
    messages: msgs.slice(-200),
    lastUpdatedAt: new Date(entry.lastUpdatedAt).toISOString(),
    turnAiTimeMs: lastAsst?.turnAiTimeMs ?? 0,
    lang: currentConfig.resolvedLanguage,
    currency: currentConfig.resolvedCurrency,
    pollIntervalMs: currentConfig.pollIntervalMs,
    modelStats,
  };

  if (postMsg) {
    postMsg({
      type: 'sessionDetail',
      session: sessionData,
      lang: sessionData.lang || 'en',
      currency: sessionData.currency || 'USD',
      i18n: detailPanel.getTranslations(),
    });
  } else {
    detailPanel.pushSessionDetail(sessionData);
  }
}

function handleClearSessionSelection(): void {
  // Return to current session view — just push the latest data
  pushToWebview();
}

/** Build AggregatedData from sessions, filtering messages by timestamp range. */
function buildAggregatedData(timeRange: TimeRange, sessions: SessionIndexEntry[], endMs: number, startMs: number): AggregatedData {
  let totalTokens = 0, totalCostCNY = 0, inputTokens = 0, outputTokens = 0,
    cacheHits = 0, cacheMiss = 0, messageCount = 0;

  const allFilteredMsgs: PerMessageStats[] = [];
  const activeSessions: SessionIndexEntry[] = []; // sessions with ≥1 message in range

  for (const s of sessions) {
    const fp = getTranscriptPath(s.cwd, s.sessionId);
    const msgs = parseFullTranscriptCached(fp);
    if (msgs.length === 0) continue;

    // Filter messages whose timestamp falls within [startMs, endMs]
    const filtered = msgs.filter(m => {
      const ts = new Date(m.timestamp).getTime();
      return ts >= startMs && ts <= endMs;
    });

    const assistantMsgs = filtered.filter(m => !m.isUserMessage);
    if (assistantMsgs.length === 0) continue; // no assistant messages in range → skip session

    activeSessions.push(s);

    for (const m of assistantMsgs) {
      totalTokens += m.inputTokens + m.outputTokens + m.cacheReadTokens;
      totalCostCNY += m.costCNY;
      inputTokens += m.inputTokens + m.cacheReadTokens;
      outputTokens += m.outputTokens;
      cacheHits += m.cacheReadTokens;
      cacheMiss += m.inputTokens;
      messageCount++;
    }

    allFilteredMsgs.push(...assistantMsgs);
  }

  const totalInput = inputTokens;
  const hitRate = totalInput > 0 ? (cacheHits / totalInput * 100) : 0;
  const displayCost = costInDisplayCurrency(totalCostCNY, currentConfig.resolvedCurrency);
  const modelStats = buildModelStatsFromMessages(allFilteredMsgs);

  return {
    timeRange,
    sessions: activeSessions,
    totalTokens,
    totalCost: displayCost,
    totalCostCNY,
    inputTokens,
    outputTokens,
    cacheHits,
    cacheMiss,
    hitRate: Math.round(hitRate * 10) / 10,
    messageCount,
    sessionCount: activeSessions.length,
    modelStats,
  };
}

/** Parse a transcript file with mtime-based caching. */
function parseFullTranscriptCached(filePath: string): PerMessageStats[] {
  let mtimeMs = 0;
  try { mtimeMs = fs.statSync(filePath).mtimeMs; } catch { return []; }

  const cached = transcriptCache.get(filePath);
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.messages;
  }

  const messages = parseFullTranscriptRaw(filePath);
  transcriptCache.set(filePath, { mtimeMs, messages });
  return messages;
}

/** Parse an entire transcript file into PerMessageStats[] (raw, uncached). */
function parseFullTranscriptRaw(filePath: string): PerMessageStats[] {
  const result: PerMessageStats[] = [];
  let raw: string;
  try { raw = fs.readFileSync(filePath, 'utf-8'); } catch { return result; }

  const seenIds = new Set<string>();
  let pendingTs: number | null = null;
  let turnAccumMs = 0;

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const event = parseLine(line);
    if (!event) continue;

    if (event.type === 'user') {
      result.push({
        uuid: event.uuid, timestamp: event.timestamp, isUserMessage: true,
        inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0,
        model: '', costCNY: 0, thinkingTimeMs: null,
      });
      pendingTs = new Date(event.timestamp).getTime();
      turnAccumMs = 0; // New real user message → reset turn accumulator
    }

    if (event.type === 'tool_result') {
      // Tool result — update reference timestamp, don't add to result
      pendingTs = new Date(event.timestamp).getTime();
    }

    if (event.type === 'assistant' && event.usage) {
      if (seenIds.has(event.uuid)) continue;
      seenIds.add(event.uuid);

      const model = normalizeModelName(event.model || 'unknown');
      const cost = calculateCost(event.model || 'unknown', event.usage.input_tokens, event.usage.cache_read_input_tokens, event.usage.output_tokens);

      let thinkTime: number | null = null;
      if (pendingTs !== null) {
        thinkTime = new Date(event.timestamp).getTime() - pendingTs;
        turnAccumMs += thinkTime;
        pendingTs = new Date(event.timestamp).getTime();
      }

      result.push({
        uuid: event.uuid, timestamp: event.timestamp, isUserMessage: false,
        inputTokens: event.usage.input_tokens, outputTokens: event.usage.output_tokens,
        cacheReadTokens: event.usage.cache_read_input_tokens, cacheCreationTokens: event.usage.cache_creation_input_tokens,
        model, costCNY: cost, thinkingTimeMs: thinkTime,
        turnAiTimeMs: turnAccumMs,
      });
    }
  }

  return result;
}

/** Build model stats from a PerMessageStats array (for session detail views). */
function buildModelStatsFromMessages(msgs: PerMessageStats[]): ModelStatEntry[] {
  const map = new Map<string, { cost: number; tokens: number; inputTokens: number; cacheHits: number; cacheMiss: number; outputTokens: number }>();
  for (const m of msgs) {
    if (m.isUserMessage) continue;
    const model = m.model;
    if (!model || model === 'unknown' || model === '<synthetic>' || model.startsWith('<')) continue;
    const entry = map.get(model) || { cost: 0, tokens: 0, inputTokens: 0, cacheHits: 0, cacheMiss: 0, outputTokens: 0 };
    const displayCost = costInDisplayCurrency(m.costCNY, currentConfig.resolvedCurrency);
    entry.cost += displayCost;
    entry.inputTokens += m.inputTokens + m.cacheReadTokens;
    entry.cacheHits += m.cacheReadTokens;
    entry.cacheMiss += m.inputTokens;
    entry.outputTokens += m.outputTokens;
    entry.tokens += m.inputTokens + m.cacheReadTokens + m.outputTokens;
    map.set(model, entry);
  }
  return Array.from(map.entries()).map(([model, v]) => ({ model, ...v }));
}

function buildModelStats(): Array<{ model: string; cost: number; tokens: number; inputTokens: number; cacheHits: number; cacheMiss: number; outputTokens: number }> {
  return buildModelStatsFromMessages(messages);
}

function pushToWebview(): void {
  if (!detailPanel) { console.error('[TokenMonitor] pushToWebview: detailPanel is null'); return; }
  const totalTokens = cumulativeInput + cumulativeCacheRead + cumulativeOutput;
  const currency = currentConfig.resolvedCurrency;
  const displayCumulativeCost = costInDisplayCurrency(cumulativeCost, currency);
  detailPanel.pushData({
    sessionId: currentSessionId,
    title: currentTitle || currentSessionId.slice(0, 8) + '...',
    model: currentModel, isActive: true,
    cumulativeInputTokens: cumulativeInput, cumulativeOutputTokens: cumulativeOutput,
    cumulativeCacheReadTokens: cumulativeCacheRead, cumulativeCostCNY: displayCumulativeCost,
    totalTokens, messageCount,
    messages: messages.slice(-200),
    lastUpdatedAt: new Date().toISOString(),
    turnAiTimeMs: turnAiAccumulatorMs,
    lang: currentConfig.resolvedLanguage,
    currency: currency,
    pollIntervalMs: currentConfig.pollIntervalMs,
    modelStats: buildModelStats(),
    sessionList: SessionStore.getSessionList(),
  } as any);
}

function pushToWebviewPanel(panel: vscode.WebviewPanel): void {
  const totalTokens = cumulativeInput + cumulativeCacheRead + cumulativeOutput;
  const currency = currentConfig.resolvedCurrency;
  const displayCumulativeCost = costInDisplayCurrency(cumulativeCost, currency);
  panel.webview.postMessage({
    type: 'fullUpdate',
    lang: currentConfig.resolvedLanguage,
    currency: currency,
    i18n: detailPanel.getTranslations(),
    session: {
      sessionId: currentSessionId,
      title: currentTitle || currentSessionId.slice(0, 8) + '...',
      model: currentModel, isActive: true,
      cumulativeInputTokens: cumulativeInput, cumulativeOutputTokens: cumulativeOutput,
      cumulativeCacheReadTokens: cumulativeCacheRead, cumulativeCostCNY: displayCumulativeCost,
      totalTokens, messageCount,
      messages: messages.slice(-200),
      lastUpdatedAt: new Date().toISOString(),
      turnAiTimeMs: turnAiAccumulatorMs,
      lang: currentConfig.resolvedLanguage,
      currency: currency,
      pollIntervalMs: currentConfig.pollIntervalMs,
      modelStats: buildModelStats(),
    },
  });
  // Also push session list for the dropdown
  try {
    panel.webview.postMessage({ type: 'sessionList', sessions: SessionStore.getSessionList() });
  } catch { /* */ }
}

// ─── Tab switch handler (v0.3.0 event-driven) ──
function handleTabChange(label: string): void {
  if (!label) return;

  if (label === currentTitle && currentSessionId) return;

  // Case 1: "Claude Code" = new/empty session → show idle
  if (label === 'Claude Code') {
    idleByUserChoice = true;
    // Remember existing sessions so we can detect new ones
    idleKnownSessions = new Set();
    const current = scanSessions();
    for (const s of current) idleKnownSessions.add(s.sessionId);
    resetState();
    updateStatusBar();
    return;
  }

  const activeSessions = scanSessions();
  const coldTranscripts = getCachedTranscripts();
  const seenSids = new Set<string>();
  const allSessions: Array<{ sessionId: string; cwd: string }> = [];

  for (const s of activeSessions) {
    if (!seenSids.has(s.sessionId)) { seenSids.add(s.sessionId); allSessions.push(s); }
  }
  for (const s of coldTranscripts) {
    if (!seenSids.has(s.sessionId)) { seenSids.add(s.sessionId); allSessions.push(s); }
  }

  // Case 2: Exact title match
  for (const s of allSessions) {
    const title = getSessionTitle(s);
    if (title && title === label) {
      if (s.sessionId !== currentSessionId) {
        idleByUserChoice = false;
        activeSessionOverride = s;
        currentTitle = title;
        lastFileSize = 0;
        budgetWarned = false;
        poll();
      }
      return;
    }
  }

  // Case 3: Only one session with empty title → match it
  const emptyTitleSessions = allSessions.filter(s => !getSessionTitle(s));
  if (emptyTitleSessions.length === 1) {
    const s = emptyTitleSessions[0];
    idleByUserChoice = false;
    activeSessionOverride = s;
    currentTitle = label;
    lastFileSize = 0;
    budgetWarned = false;
    poll();
    return;
  }

  // Case 4: Schedule retry
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    cachedTranscripts = null;
    const freshActive = scanSessions();
    const freshCold = getCachedTranscripts();
    const freshSeen = new Set<string>();
    const freshAll: Array<{ sessionId: string; cwd: string }> = [];
    for (const s of freshActive) { if (!freshSeen.has(s.sessionId)) { freshSeen.add(s.sessionId); freshAll.push(s); } }
    for (const s of freshCold) { if (!freshSeen.has(s.sessionId)) { freshSeen.add(s.sessionId); freshAll.push(s); } }

    for (const s of freshAll) {
      const title = getSessionTitle(s);
      if (title && title === label && s.sessionId !== currentSessionId) {
        idleByUserChoice = false;
        activeSessionOverride = s;
        currentTitle = title;
        lastFileSize = 0;
        budgetWarned = false;
        poll();
        return;
      }
    }
    retryTimer = setTimeout(() => {
      cachedTranscripts = null;
      const freshActive2 = scanSessions();
      const freshCold2 = getCachedTranscripts();
      const freshSeen2 = new Set<string>();
      const freshAll2: Array<{ sessionId: string; cwd: string }> = [];
      for (const s of freshActive2) { if (!freshSeen2.has(s.sessionId)) { freshSeen2.add(s.sessionId); freshAll2.push(s); } }
      for (const s of freshCold2) { if (!freshSeen2.has(s.sessionId)) { freshSeen2.add(s.sessionId); freshAll2.push(s); } }

      for (const s of freshAll2) {
        const title = getSessionTitle(s);
        if (title && title === label && s.sessionId !== currentSessionId) {
          idleByUserChoice = false;
          activeSessionOverride = s;
          currentTitle = title;
          lastFileSize = 0;
          budgetWarned = false;
          poll();
          return;
        }
      }
      resetState();
      updateStatusBar();
    }, 2000);
  }, 1000);
}

// ─── Config refresh ─────────────────────────────────────────
function refreshConfig(): void {
  const oldLang = currentConfig.resolvedLanguage;
  const oldCurrency = currentConfig.resolvedCurrency;
  const oldPollMs = currentConfig.pollIntervalMs;
  currentConfig = getConfig();

  // Language change → rebuild i18n + webview HTML
  if (currentConfig.resolvedLanguage !== oldLang) {
    initI18n(currentConfig.language);
    detailPanel.refreshHtml();
    // Delay push until webview finishes reloading (otherwise ready handler races)
    setTimeout(() => pushToWebview(), 300);
  }

  // Currency change → force re-fetch pricing for fresh rates
  if (currentConfig.resolvedCurrency !== oldCurrency) {
    checkForUpdates(currentConfig.pricingUpdateUrl || undefined, true);
  }

  // Poll interval change → restart timer
  if (currentConfig.pollIntervalMs !== oldPollMs) {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = setInterval(poll, currentConfig.pollIntervalMs);
    }
  }

  // Always refresh display after config change
  updateStatusBar();
  pushToWebview();
}

// ─── Activation ───────────────────────────────────────────────
export function activate(context: vscode.ExtensionContext): void {
  // Store the actual extension ID (publisher.name from package.json)
  extensionId = context.extension.id;

  // Load config + init i18n
  currentConfig = getConfig();
  initI18n(currentConfig.language, context.extensionPath);

  // Async: scan and index existing session transcripts for cross-session views
  setTimeout(() => {
    try {
      // Force clean rebuild: delete any previous index that may have inflated/buggy data
      const indexPath = path.join(tokenTrackerDir(), 'sessions.json');
      try { fs.unlinkSync(indexPath); } catch { /* doesn't exist yet */ }
      SessionStore.scanAndIndex();
      console.log('[TokenMonitor] Session index rebuilt (' + Object.keys(SessionStore.loadIndex().sessions).length + ' sessions)');
    } catch (err) { console.error('[TokenMonitor] scanAndIndex error:', err); }
  }, 800);

  // Async: check for pricing/rates updates (non-blocking)
  checkForUpdates(currentConfig.pricingUpdateUrl || undefined);

  console.log(`[TokenMonitor] v0.12.2 activating (${currentConfig.resolvedLanguage}/${currentConfig.resolvedCurrency})...`);

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.name = 'Claude Code Token Monitor';
  statusBarItem.command = 'claudeCodeTokenMonitor.showDetailPanel';
  statusBarItem.text = `$(pulse) ${t('statusBar.idle')}`;
  statusBarItem.tooltip = new vscode.MarkdownString(`**${t('statusBar.noData')}**`);
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  detailPanel = new DetailPanel(() => ({
    t,
    lang: currentConfig.resolvedLanguage,
    currency: currentConfig.resolvedCurrency,
    isRTL: isRTL(),
  }));
  detailPanel.setFilterMessageHandler((msg) => {
    if (msg.type === 'setTimeRange') handleSetTimeRange(msg.timeRange as TimeRange);
    else if (msg.type === 'selectSession') handleSelectSession(msg.sessionId!);
    else if (msg.type === 'clearSessionSelection') handleClearSessionSelection();
  });
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('claudeCodeTokenMonitor.detailPanel', detailPanel, { webviewOptions: { retainContextWhenHidden: true } })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeCodeTokenMonitor.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', '@ext:' + extensionId);
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('claudeCodeTokenMonitor.showDetailPanel', () => {
      // Open as a standalone editor tab (not buried in the bottom panel)
      const panel = vscode.window.createWebviewPanel(
        'claudeTokenMonitorDetail',
        t('panel.title'),
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      panel.webview.html = detailPanel.getHtml();
      // Listen for ready message and push current data
      panel.webview.onDidReceiveMessage((msg) => {
        if (msg.type === 'ready') {
          pushToWebviewPanel(panel);
          // Push session list for the dropdown
          try {
            panel.webview.postMessage({ type: 'sessionList', sessions: SessionStore.getSessionList() });
          } catch { /* */ }
        } else if (msg.type === 'openSettings') {
          vscode.commands.executeCommand('workbench.action.openSettings', '@ext:' + extensionId);
        } else if (msg.type === 'setTimeRange') {
          handleSetTimeRange(msg.timeRange as TimeRange, panel.webview.postMessage.bind(panel.webview));
        } else if (msg.type === 'selectSession') {
          handleSelectSession(msg.sessionId!, panel.webview.postMessage.bind(panel.webview));
        } else if (msg.type === 'clearSessionSelection') {
          handleClearSessionSelection();
          pushToWebviewPanel(panel);
        }
      });
      // Also push immediately
      pushToWebviewPanel(panel);
      // Keep in sync with poll updates
      const syncInterval = setInterval(() => {
        if (panel.visible) pushToWebviewPanel(panel);
      }, currentConfig.pollIntervalMs);
      panel.onDidDispose(() => clearInterval(syncInterval));
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('claudeCodeTokenMonitor.refresh', () => { lastFileSize = 0; poll(); })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('claudeCodeTokenMonitor.showLastMessageCost', () => {
      const lastAsst = findLast(messages, m => !m.isUserMessage);
      if (!lastAsst) { vscode.window.showInformationMessage(t('command.noMessages')); return; }
      const displayCost = costInDisplayCurrency(lastAsst.costCNY, currentConfig.resolvedCurrency);
      const thinkStr = lastAsst.thinkingTimeMs ? ` | ${t('command.thinkingTime')}: ${formatThinkTime(lastAsst.thinkingTimeMs)}` : '';
      vscode.window.showInformationMessage(
        `${t('command.lastMsg')}: +${lastAsst.inputTokens.toLocaleString()} / +${lastAsst.outputTokens.toLocaleString()} / ${formatCost(displayCost, currentConfig.resolvedCurrency)}${thinkStr}`
      );
    })
  );

  // Add custom model (guided)
  context.subscriptions.push(
    vscode.commands.registerCommand('claudeCodeTokenMonitor.addCustomModel', async () => {
      const name = await vscode.window.showInputBox({ prompt: 'Model name (e.g. "My Custom Model")', placeHolder: 'My Model' });
      if (!name) return;
      const pattern = await vscode.window.showInputBox({ prompt: 'Match pattern (regex to detect model, e.g. "my-model")', placeHolder: 'my-model' });
      if (!pattern) return;
      const currencyPick = await vscode.window.showQuickPick(['USD', 'CNY', 'EUR', 'JPY', 'KRW', 'GBP'], { placeHolder: 'Select currency' });
      if (!currencyPick) return;
      const cacheHitStr = await vscode.window.showInputBox({ prompt: 'Cache hit price per 1M tokens', value: '0' });
      if (cacheHitStr === undefined) return;
      const cacheMissStr = await vscode.window.showInputBox({ prompt: 'Cache miss price per 1M tokens', value: '0' });
      if (cacheMissStr === undefined) return;
      const outputStr = await vscode.window.showInputBox({ prompt: 'Output price per 1M tokens', value: '0' });
      if (outputStr === undefined) return;

      const newModel = { name, matchPattern: pattern, cacheHit: Number(cacheHitStr), cacheMiss: Number(cacheMissStr), output: Number(outputStr), currency: currencyPick };
      const cfg = vscode.workspace.getConfiguration('claudeTokenMonitor');
      const existing = cfg.get<any[]>('customModels') || [];
      existing.push(newModel);
      await cfg.update('customModels', existing, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(`Custom model "${name}" added.`);
    })
  );

  // Manage custom models (list & delete)
  context.subscriptions.push(
    vscode.commands.registerCommand('claudeCodeTokenMonitor.manageCustomModels', async () => {
      const cfg = vscode.workspace.getConfiguration('claudeTokenMonitor');
      const models = cfg.get<any[]>('customModels') || [];
      if (models.length === 0) {
        vscode.window.showInformationMessage('No custom models configured.');
        return;
      }
      const picks = models.map((m, i) => ({ label: `${m.name} (${m.matchPattern})`, description: `${m.currency} · in:${m.cacheMiss}/out:${m.output}`, index: i }));
      const pick = await vscode.window.showQuickPick(picks, { placeHolder: 'Select a model to remove' });
      if (pick === undefined) return;
      models.splice(pick.index, 1);
      await cfg.update('customModels', models, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(`Removed "${pick.label}".`);
    })
  );

  // Force refresh pricing
  context.subscriptions.push(
    vscode.commands.registerCommand('claudeCodeTokenMonitor.forceRefreshPricing', async () => {
      vscode.window.showInformationMessage('Refreshing pricing data...');
      await checkForUpdates(currentConfig.pricingUpdateUrl || undefined, true);
      vscode.window.showInformationMessage('Pricing data refreshed.');
    })
  );

  // Configuration change listener
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('claudeTokenMonitor')) {
        refreshConfig();
      }
    })
  );

  // Tab switching: prefer e.changed (instant), fallback to activeTabGroup (cross-group re-focus)
  context.subscriptions.push(
    vscode.window.tabGroups.onDidChangeTabs((e) => {
      let label = e.changed.find(t => t.isActive)?.label;
      if (!label) {
        label = vscode.window.tabGroups.activeTabGroup?.activeTab?.label;
      }
      if (label) handleTabChange(label);
    })
  );

  // Initial poll
  poll();
  pollTimer = setInterval(poll, currentConfig.pollIntervalMs);

  // Cross-group tab focus detection (1s interval — catches alternating re-clicks
  // that onDidChangeTabs may miss when the target tab was already active in its group)
  const focusCheckTimer = setInterval(() => {
    if (idleByUserChoice || !currentSessionId) return;
    const label = vscode.window.tabGroups.activeTabGroup?.activeTab?.label;
    if (label && label !== 'Claude Code' && label !== currentTitle) {
      handleTabChange(label);
    }
  }, 250);
  context.subscriptions.push({ dispose: () => clearInterval(focusCheckTimer) });

  console.log('[TokenMonitor] Activated.');
}

export function deactivate(): void {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  console.log('[TokenMonitor] Deactivated.');
}
