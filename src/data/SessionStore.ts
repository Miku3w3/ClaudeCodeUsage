/**
 * SessionStore — Persistent session index for cross-session aggregation.
 * v0.12.1 — auto-invalidates stale index from older versions.
 *
 * Maintains a lightweight index of all Claude Code sessions at
 * ~/.claude/token-tracker/sessions.json, updated incrementally
 * during polling and rebuilt on startup.
 */

import * as fs from 'fs';
import * as path from 'path';
import { claudeDir, tokenTrackerDir } from '../utils/paths';
import type { SessionIndex, SessionIndexEntry } from '../model/types';
import { calculateCost, normalizeModelName as normalizeModelNameFull } from '../model/CostCalculator';

// ─── Public API ─────────────────────────────────────────────────

/** Bump this when the index schema changes or old data needs invalidation. */
const CURRENT_INDEX_VERSION = 3;

let index: SessionIndex | null = null;

/** Load the index from disk. Returns empty index if file missing, corrupted, or stale version. */
export function loadIndex(): SessionIndex {
  const cached = index;
  if (cached) return cached;
  try {
    const raw = fs.readFileSync(indexPath(), 'utf-8');
    const parsed: SessionIndex = JSON.parse(raw);
    // Validate shape and version — discard if from an older, buggy version
    if (parsed && parsed.version >= CURRENT_INDEX_VERSION && typeof parsed.updatedAt === 'number' && parsed.sessions !== undefined) {
      index = parsed;
      return parsed;
    }
    // Old version detected — will rebuild below
    console.log('[TokenMonitor] Stale index detected (v' + (parsed?.version || 0) + '), rebuilding...');
  } catch { /* file missing or corrupted — rebuild */ }
  const fresh: SessionIndex = { version: CURRENT_INDEX_VERSION, updatedAt: 0, sessions: {} };
  index = fresh;
  return fresh;
}

/** Save the index to disk. Creates directory if missing. */
export function saveIndex(): void {
  if (!index) return;
  try { fs.mkdirSync(tokenTrackerDir(), { recursive: true }); } catch { /* */ }
  index.updatedAt = Date.now();
  try {
    fs.writeFileSync(indexPath(), JSON.stringify(index, null, 2), 'utf-8');
  } catch (err) {
    console.error('[TokenMonitor] Failed to save session index:', err);
  }
}

/**
 * Scan all JSONL transcripts under ~/.claude/projects/ and rebuild the index.
 * — Files that haven't changed since last `scanAndIndex` are kept as-is.
 * — New or modified files are fully parsed.
 *
 * Returns the updated index.
 */
export function scanAndIndex(): SessionIndex {
  const idx = loadIndex();
  const projectsDir = path.join(claudeDir(), 'projects');
  const existingIds = new Set<string>();

  let cwdDirs: fs.Dirent[];
  try { cwdDirs = fs.readdirSync(projectsDir, { withFileTypes: true }); } catch { return idx; }

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
      existingIds.add(sessionId);

      const fp = path.join(cwdPath, f.name);
      let mtimeMs = 0;
      try { mtimeMs = fs.statSync(fp).mtimeMs; } catch { continue; }

      const existing = idx.sessions[sessionId];
      // Skip if already indexed and file hasn't changed — BUT re-index if cost=0 (stale pre-v0.12.0 entry)
      const needsReparse = existing && existing.totalCostCNY === 0 && existing.messageCount > 0;
      if (existing && existing.lastUpdatedAt >= mtimeMs && !needsReparse) continue;

      // Parse file
      const entry = parseTranscriptFile(fp, sessionId, cwd);
      if (entry) {
        idx.sessions[sessionId] = entry;
      }
    }
  }

  // Clean up sessions whose transcript files no longer exist
  for (const sid of Object.keys(idx.sessions)) {
    if (!existingIds.has(sid)) {
      delete idx.sessions[sid];
    }
  }

  index = idx;
  saveIndex();
  return index;
}

/** Update or create a single session in the index. */
export function upsertSession(
  sessionId: string,
  entry: Omit<SessionIndexEntry, 'lastUpdatedAt'> & { lastUpdatedAt?: number }
): void {
  const idx = loadIndex();
  idx.sessions[sessionId] = {
    ...entry,
    lastUpdatedAt: entry.lastUpdatedAt ?? Date.now(),
  };
  index = idx;
  saveIndex();
}

/** Return all sessions whose time range overlaps [startMs, endMs]. */
export function getSessionsInRange(startMs: number, endMs: number): SessionIndexEntry[] {
  const idx = loadIndex();
  return Object.values(idx.sessions).filter(s => s.lastUpdatedAt >= startMs && s.startedAt <= endMs);
}

/** Return all indexed sessions, sorted by lastUpdatedAt descending. */
export function getAllSessions(): SessionIndexEntry[] {
  const idx = loadIndex();
  return Object.values(idx.sessions).sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);
}

/** Return a lightweight list for the webview session dropdown. */
export function getSessionList(): Array<{ sessionId: string; title: string; startedAt: number }> {
  return getAllSessions().map(s => ({
    sessionId: s.sessionId,
    title: s.title || s.sessionId.slice(0, 8) + '...',
    startedAt: s.startedAt,
  }));
}

// ─── Internal helpers ───────────────────────────────────────────

function indexPath(): string {
  return path.join(tokenTrackerDir(), 'sessions.json');
}

/** Decode an encoded project path back to a native filesystem path. */
function decodeProjectPath(encoded: string): string {
  const idx = encoded.indexOf('--');
  if (idx >= 0) {
    const drive = encoded.slice(0, idx) + ':\\';
    const rest = encoded.slice(idx + 2).replace(/-/g, '\\');
    return drive + rest;
  }
  return '/' + encoded.replace(/-/g, '/');
}

/**
 * Fully parse a JSONL transcript file and return a SessionIndexEntry.
 * Extracts the first/last timestamps, accumulates token usage, and identifies
 * the primary model.  Returns null if the file is empty or unreadable.
 */
function parseTranscriptFile(filePath: string, sessionId: string, cwd: string): SessionIndexEntry | null {
  let raw: string;
  try { raw = fs.readFileSync(filePath, 'utf-8'); } catch { return null; }

  const lines = raw.split('\n');
  if (lines.length === 0) return null;

  let startedAt = 0;
  let lastUpdatedAt = 0;
  let messageCount = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheHitTokens = 0;
  let totalCacheMissTokens = 0;
  let totalCostCNY = 0;
  let title = '';
  const modelCounts = new Map<string, number>();

  const seenIds = new Set<string>();

  for (const line of lines) {
    if (!line.trim()) continue;
    let obj: any;
    try { obj = JSON.parse(line); } catch { continue; }

    const ts = obj.timestamp ? new Date(obj.timestamp).getTime() : 0;
    if (ts && !startedAt) startedAt = ts;
    if (ts) lastUpdatedAt = ts;

    // Extract title
    if (!title && obj.type === 'ai-title' && obj.aiTitle) {
      title = obj.aiTitle;
    }

    // Extract UUID for dedup
    const msgId = obj.uuid || '';
    // Count assistant messages with usage (dedup by UUID, same as poll loop)
    if (obj.type === 'assistant' && obj.message?.role === 'assistant' && obj.message?.usage) {
      if (seenIds.has(msgId)) continue;
      seenIds.add(msgId);

      const u = obj.message.usage;
      messageCount++;
      totalInputTokens += u.input_tokens || 0;
      totalOutputTokens += u.output_tokens || 0;
      totalCacheHitTokens += u.cache_read_input_tokens || 0;
      // totalCacheMissTokens stays 0 (redundant with totalInputTokens)

      // Track model
      const model = normalizeModelNameFull(obj.message.model || 'unknown');
      modelCounts.set(model, (modelCounts.get(model) || 0) + 1);

      // Compute cost in model's native currency
      const cost = calculateCost(
        obj.message.model || 'unknown',
        u.input_tokens || 0,
        u.cache_read_input_tokens || 0,
        u.output_tokens || 0
      );
      totalCostCNY += cost;
    }
  }

  // Fallback title: first user message text
  if (!title) {
    for (const line of lines) {
      if (!line.trim()) continue;
      let obj: any;
      try { obj = JSON.parse(line); } catch { continue; }
      if (obj.type === 'user' && obj.message?.role === 'user') {
        const content = obj.message.content;
        if (typeof content === 'string' && content.trim()) {
          title = content.trim().slice(0, 40);
          break;
        }
        if (Array.isArray(content)) {
          for (const c of content) {
            if (c.type === 'text' && c.text && !c.tool_use_id) {
              title = c.text.slice(0, 40);
              break;
            }
          }
          if (title) break;
        }
      }
    }
  }

  // Determine primary model
  let primaryModel = 'unknown';
  let maxCount = 0;
  for (const [model, count] of modelCounts) {
    if (count > maxCount) { maxCount = count; primaryModel = model; }
  }

  return {
    sessionId,
    title: title || sessionId.slice(0, 8) + '...',
    cwd,
    startedAt: startedAt || lastUpdatedAt,
    lastUpdatedAt,
    messageCount,
    totalInputTokens,
    totalOutputTokens,
    totalCacheHitTokens,
    totalCacheMissTokens,
    totalCostCNY,
    primaryModel,
  };
}

