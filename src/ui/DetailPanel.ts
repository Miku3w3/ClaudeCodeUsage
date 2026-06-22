// DetailPanel — VSCode WebviewView provider for the token usage panel.
// v1.0.0: Internationalized. All UI strings come from the i18n engine.
import * as vscode from 'vscode';
import type { PerMessageStats } from '../model/types';

export interface PanelData {
  sessionId: string;
  title: string;
  model: string;
  isActive: boolean;
  cumulativeInputTokens: number;
  cumulativeOutputTokens: number;
  cumulativeCacheReadTokens: number;
  cumulativeCostCNY: number;
  totalTokens: number;
  messageCount: number;
  messages: PerMessageStats[];
  lastUpdatedAt: string;
  thinkingTime: number | null;
  lang?: string;
  currency?: string;
  pollIntervalMs?: number;
}

export type I18nProvider = () => {
  t: (key: string, params?: Record<string, string>) => string;
  lang: string;
  currency: string;
  isRTL: boolean;
};

export class DetailPanel implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | null = null;
  private pendingData: PanelData | null = null;
  private getI18n: I18nProvider;

  constructor(getI18n: I18nProvider) {
    this.getI18n = getI18n;
  }

  /** Called by extension when language changes to rebuild the webview. */
  refreshHtml(): void {
    if (this.view) {
      this.view.webview.html = this.getHtml();
      if (this.pendingData) {
        this.sendToWebview(this.pendingData);
      }
    }
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [],
    };

    webviewView.webview.html = this.getHtml();
    webviewView.webview.onDidReceiveMessage((msg) => {
      if (msg.type === 'ready' && this.pendingData) {
        this.sendToWebview(this.pendingData);
      } else if (msg.type === 'openSettings') {
        vscode.commands.executeCommand('workbench.action.openSettings', '@ext:local.claude-code-token-monitor');
      }
    });

    webviewView.show?.(true);

    if (this.pendingData) {
      this.sendToWebview(this.pendingData);
    }
  }

  reveal(): void {
    if (this.view) {
      this.view.show?.(true);
    }
  }

  pushData(data: PanelData): void {
    this.pendingData = data;
    if (this.view) {
      this.sendToWebview(data);
    }
  }

  private sendToWebview(data: PanelData): void {
    this.view?.webview.postMessage({
      type: 'fullUpdate',
      session: data,
      thinkingTime: data.thinkingTime,
      lang: data.lang || 'en',
      currency: data.currency || 'USD',
    });
  }

  // ─── HTML (generated with current i18n) ─────────────────────

  getHtml(): string {
    const { t, lang, currency, isRTL } = this.getI18n();
    // Build a JS dictionary of all translated strings needed by the frontend
    const STR: Record<string, string> = {
      noSession: t('panel.noSession'),
      noSessionHint: t('panel.noSessionHint'),
      totalTokens: t('panel.totalTokens'),
      totalCost: t('panel.totalCost'),
      inputTokens: t('panel.inputTokens'),
      cacheHits: t('panel.cacheHits'),
      outputTokens: t('panel.outputTokens'),
      lastThinkTime: t('panel.lastThinkTime'),
      messagesCount: t('panel.messagesCount'),
      autoRefresh: t('panel.autoRefresh'),
      type: t('panel.type'),
      user: t('panel.user'),
      ai: t('panel.ai'),
      input: t('panel.input'),
      cache: t('panel.cache'),
      output: t('panel.output'),
      cost: t('panel.cost'),
      thinking: t('panel.thinking'),
      settings: t('panel.settings'),
    };
    const strJson = JSON.stringify(STR);
    const dirAttr = isRTL ? ' dir="rtl"' : '';

    return `<!DOCTYPE html>
<html lang="${lang}"${dirAttr}>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${t('panel.title')}</title>
<style>
  :root {
    --bg: var(--vscode-editor-background, #1e1e1e);
    --fg: var(--vscode-editor-foreground, #d4d4d4);
    --border: var(--vscode-panel-border, #3c3c3c);
    --card-bg: var(--vscode-editor-inactiveSelectionBackground, #3a3d41);
    --accent: var(--vscode-charts-green, #89d185);
    --accent2: var(--vscode-charts-blue, #40a6ff);
    --warn: var(--vscode-charts-yellow, #e2b714);
    --muted: var(--vscode-descriptionForeground, #9d9d9d);
    --font: var(--vscode-font-family, 'Consolas', monospace);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg); color: var(--fg);
    font-family: var(--font); font-size: 12px;
    padding: 12px; line-height: 1.5;
  }
  .header { margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
  .header h2 { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
  .header .meta { color: var(--muted); font-size: 11px; }
  .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
  .stat-card { background: var(--card-bg); border-radius: 6px; padding: 10px 12px; text-align: center; }
  .stat-card .label { font-size: 10px; color: var(--muted); letter-spacing: 0.5px; margin-bottom: 4px; }
  .stat-card .value { font-size: 16px; font-weight: 700; color: var(--accent); }
  .stat-card .value.cost { color: var(--accent2); }
  .table-container { max-height: 400px; overflow-y: auto; border: 1px solid var(--border); border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; }
  thead { position: sticky; top: 0; background: var(--bg); z-index: 1; }
  th { font-size: 10px; font-weight: 600; color: var(--muted); padding: 6px 8px; text-align: right; border-bottom: 2px solid var(--border); }
  th:first-child { text-align: center; width: 30px; } th:nth-child(2) { text-align: left; width: 40px; }
  td { padding: 4px 8px; text-align: right; border-bottom: 1px solid var(--border); font-size: 11px; font-variant-numeric: tabular-nums; }
  td:first-child { text-align: center; color: var(--muted); } td:nth-child(2) { text-align: left; }
  .row-user td { color: var(--muted); }
  .row-assistant td:last-child { color: var(--accent2); }
  .think-time { font-size: 10px; color: var(--warn); }
  .footer { margin-top: 8px; font-size: 10px; color: var(--muted); text-align: center; }
  .idle { text-align: center; padding: 40px; color: var(--muted); font-size: 14px; }
  .settings-btn { position: fixed; top: 14px; right: 24px; background: var(--card-bg); border: 1px solid var(--border); color: var(--fg); padding: 4px 14px; border-radius: 4px; cursor: pointer; font-size: 12px; font-family: var(--font); z-index: 10; }
  .settings-btn:hover { background: var(--accent2); color: #fff; }
</style>
</head>
<body>
<button class="settings-btn" onclick="openSettings()" title="Open extension settings">&#9881; ${t('panel.settings')}</button>
<div id="app">
  <div class="idle">
    <div>${t('panel.noSession')}</div>
    <div style="font-size:11px;margin-top:4px">${t('panel.noSessionHint')}</div>
  </div>
</div>

<script>
const vscode = acquireVsCodeApi();
let sessionData = null;

// i18n strings baked in at generation time
const STR = ${strJson};

const CURRENCY_SYMBOLS = { CNY: '\\u00A5', USD: '$', EUR: '\\u20AC', JPY: '\\u00A5', KRW: '\\u20A9', GBP: '\\u00A3' };

vscode.postMessage({ type: 'ready' });

let currentLang = '${lang}';
let currentCurrency = '${currency}';
let currentPollMs = 2000;

function openSettings() {
  vscode.postMessage({ type: 'openSettings' });
}

window.addEventListener('message', (e) => {
  const msg = e.data;
  if (msg.type === 'fullUpdate' && msg.session) {
    sessionData = msg.session;
    if (msg.lang) currentLang = msg.lang;
    if (msg.currency) currentCurrency = msg.currency;
    if (msg.session.pollIntervalMs) currentPollMs = msg.session.pollIntervalMs;
    renderFull(sessionData, msg.thinkingTime);
  }
});

function fmtCost(c) {
  var sym = CURRENCY_SYMBOLS[currentCurrency] || currentCurrency;
  if (c >= 100) return sym + c.toFixed(2);
  if (c >= 1) return sym + c.toFixed(3);
  if (c >= 0.01) return sym + c.toFixed(4);
  return sym + c.toFixed(5);
}
function fmtTokens(n) {
  if (n < 1000) return String(n);
  if (n < 1000000) { var k = n / 1000; return (k >= 100 ? Math.round(k) : k.toFixed(1)) + 'K'; }
  var m = n / 1000000; return (m >= 100 ? Math.round(m) : m.toFixed(1)) + 'M';
}
function fmtThink(ms) {
  if (ms === null || ms === undefined) return '-';
  if (ms < 1000) return ms + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  return Math.floor(ms/60000) + 'm ' + Math.round((ms%60000)/1000) + 's';
}
function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function fmtTime(ts) {
  try {
    var loc = currentLang === 'zh-CN' ? 'zh-CN' : currentLang === 'ja' ? 'ja-JP' : currentLang === 'ko' ? 'ko-KR' : 'en-US';
    return new Date(ts).toLocaleTimeString(loc, {hour:'2-digit',minute:'2-digit',second:'2-digit'});
  } catch(e) { return new Date(ts).toLocaleTimeString(); }
}

function renderFull(s, thinkingTime) {
  var html =
    '<div class="header">' +
      '<h2>' + esc(s.title) + '</h2>' +
      '<div class="meta">' + esc(s.model) + ' | ' + s.messageCount + ' ' + STR.messagesCount + '</div>' +
    '</div>' +
    '<div class="stats-grid">' +
      '<div class="stat-card"><div class="label">' + STR.totalTokens + '</div><div class="value">' + fmtTokens(s.totalTokens) + '</div></div>' +
      '<div class="stat-card"><div class="label">' + STR.totalCost + '</div><div class="value cost">' + fmtCost(s.cumulativeCostCNY) + '</div></div>' +
      '<div class="stat-card"><div class="label">' + STR.inputTokens + '</div><div class="value">' + fmtTokens(s.cumulativeInputTokens) + '</div></div>' +
      '<div class="stat-card"><div class="label">' + STR.cacheHits + '</div><div class="value">' + fmtTokens(s.cumulativeCacheReadTokens) + '</div></div>' +
      '<div class="stat-card"><div class="label">' + STR.outputTokens + '</div><div class="value">' + fmtTokens(s.cumulativeOutputTokens) + '</div></div>' +
      '<div class="stat-card"><div class="label">' + STR.lastThinkTime + '</div><div class="value">' + fmtThink(thinkingTime) + '</div></div>' +
    '</div>' +
    '<div class="table-container"><table>' +
      '<thead><tr><th>#</th><th>' + STR.type + '</th><th>' + STR.input + '</th><th>' + STR.cache + '</th><th>' + STR.output + '</th><th>' + STR.cost + '</th><th>' + STR.thinking + '</th></tr></thead>' +
      '<tbody>' +
        s.messages.map(function(m, i) {
          var cls = m.isUserMessage ? 'row-user' : 'row-assistant';
          var type = m.isUserMessage ? STR.user : STR.ai;
          var time = fmtTime(m.timestamp);
          return '<tr class="' + cls + '">' +
            '<td>' + (i + 1) + '</td>' +
            '<td>' + type + ' <span style="font-size:9px;color:var(--muted)">' + time + '</span></td>' +
            '<td>' + (m.isUserMessage ? '-' : fmtTokens(m.inputTokens)) + '</td>' +
            '<td>' + (m.isUserMessage ? '-' : (m.cacheReadTokens > 0 ? fmtTokens(m.cacheReadTokens) : '0')) + '</td>' +
            '<td>' + (m.isUserMessage ? '-' : fmtTokens(m.outputTokens)) + '</td>' +
            '<td>' + (m.isUserMessage ? '-' : fmtCost(m.costCNY)) + '</td>' +
            '<td><span class="think-time">' + fmtThink(m.thinkingTimeMs) + '</span></td>' +
          '</tr>';
        }).join('') +
      '</tbody></table></div>' +
    '<div class="footer">' + STR.autoRefresh.replace('{0}', String(Math.round(currentPollMs/1000))) + '</div>';

  document.getElementById('app').innerHTML = html;
  var container = document.querySelector('.table-container');
  if (container) container.scrollTop = container.scrollHeight;
}
</script>
</body>
</html>`;
  }
}
