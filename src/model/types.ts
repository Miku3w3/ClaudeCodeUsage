/**
 * Type definitions for the Claude Code Token Monitor extension v1.0.0.
 */

// ═══════════════════════════════════════════════════════════════
// Configuration types
// ═══════════════════════════════════════════════════════════════

export type Currency = 'CNY' | 'USD' | 'EUR' | 'JPY' | 'KRW' | 'GBP';

export interface CustomModelConfig {
  name: string;
  matchPattern: string;
  cacheHit: number;
  cacheMiss: number;
  output: number;
  currency?: string;
}

export interface ExtensionConfig {
  language: string;
  resolvedLanguage: string;
  currency: string;
  resolvedCurrency: Currency;
  exchangeRates: Record<string, number>;
  customModels: CustomModelConfig[];
  showThinkingTime: boolean;
  showModelName: boolean;
  compactMode: boolean;
  budgetWarning: number;
  pollIntervalMs: number;
  pricingUpdateUrl: string;
}

/** Raw usage data from an assistant message in the JSONL transcript */
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  server_tool_use?: {
    web_search_requests: number;
    web_fetch_requests: number;
  };
  service_tier?: string;
  cache_creation?: {
    ephemeral_1h_input_tokens: number;
    ephemeral_5m_input_tokens: number;
  };
  inference_geo?: string;
  iterations?: any[];
  speed?: string;
}

/** Parsed single line from JSONL transcript */
export interface ParsedEvent {
  type: 'user' | 'assistant' | 'ai-title' | 'other';
  timestamp: string;
  uuid: string;
  sessionId: string;
  /** True if this is a real user message (not a tool_result) */
  isRealUserMessage: boolean;
  /** For assistant events: the token usage */
  usage?: TokenUsage;
  /** For assistant events: the model name */
  model?: string;
  /** For ai-title events: the conversation title */
  title?: string;
}

/** Per-message statistics (computed from ParsedEvent) */
export interface PerMessageStats {
  uuid: string;
  timestamp: string;
  isUserMessage: boolean;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  model: string;
  costCNY: number;
  /** Thinking time in ms — only meaningful for first assistant after a user message */
  thinkingTimeMs: number | null;
}

/** Aggregated session state held in TokenStore */
export interface SessionState {
  sessionId: string;
  cwd: string;
  startedAt: number;
  pid: number;
  title: string;
  model: string;
  messages: PerMessageStats[];
  cumulativeInputTokens: number;
  cumulativeOutputTokens: number;
  cumulativeCacheReadTokens: number;
  cumulativeCacheCreationTokens: number;
  cumulativeCostCNY: number;
  totalTokens: number;
  messageCount: number;
  lastLineCount: number;
  isActive: boolean;
  transcriptPath: string;
  lastUpdatedAt: string;
}

/** Content of session PID file: ~/.claude/sessions/{PID}.json */
export interface SessionPidFile {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
  procStart?: string;
  version?: string;
  peerProtocol?: number;
  kind?: string;
  entrypoint?: string;
}

/** Content of IDE lock file: ~/.claude/ide/{PID}.lock */
export interface IDELockFile {
  pid: number;
  workspaceFolders?: string[];
  ideName?: string;
  transport?: string;
  runningInWindows?: boolean;
  authToken?: string;
}

/** Content written to current-session.json for Claude to read */
export interface ClaudeReadableData {
  sessionId: string;
  title: string;
  model: string;
  active: boolean;
  cumulative: {
    inputTokens: number;
    cacheReadTokens: number;
    outputTokens: number;
    messageCount: number;
    totalCostCNY: number;
    totalTokens: number;
  };
  lastMessage: {
    uuid: string;
    timestamp: string;
    type: string;
    model: string;
    inputTokens: number;
    cacheReadTokens: number;
    outputTokens: number;
    costCNY: number;
    thinkingTimeMs: number | null;
  } | null;
  lastUserMessage: {
    uuid: string;
    timestamp: string;
    thinkingTimeMs: number | null;
  } | null;
  updatedAt: string;
}

/** Pricing per 1M tokens in a given currency */
export interface ModelPricing {
  cacheHit: number;
  cacheMiss: number;
  output: number;
}

/** Pricing resolved for the current model, including currency info */
export interface ResolvedPricing extends ModelPricing {
  currency: Currency;
  providerName: string;
}

/** Pricing provider metadata */
export interface ProviderMeta {
  name: string;
  nativeCurrency: Currency;
  models: Record<string, ModelPricing>;
  matchPattern: RegExp;
}
