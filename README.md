# Claude Code Token Monitor

[English](#english) | [中文](#中文)

---

## 中文

一款 VSCode 扩展，在状态栏实时显示 Claude Code 对话的 token 用量、费用和思考时间。

### 功能

- **实时监控** — 状态栏显示当前会话标题、上条消息 token/费用、累计用量，悬停查看完整分解（总输入 / 缓存命中 / 未命中 / 输出 / 命中率 / 思考时间）
- **时间范围筛选** — 当前会话 / 每天 / 每周 / 每月 / 每年 / 全部，聚合查看历史用量
- **会话选择器** — 浏览所有过往会话，点击查看完整消息记录和分模型统计
- **按模型分组** — 一键切换，按 AI 模型拆分费用和 token 统计
- **多供应商定价** — 内置 11 家供应商 28+ 模型：DeepSeek · Anthropic · OpenAI · Gemini · Qwen · Kimi · GLM · Doubao · Ernie · Grok · Mistral
- **自动更新定价与汇率** — 汇率每日从 open.er-api.com 获取（免费，无需 key），模型定价每月通过 GitHub Actions 自动抓取更新
- **11 种语言** — en / zh-CN / zh-TW / ja / ko / es / ar / pt / de / fr / ru，切换语言时 webview 按钮实时更新无需重载
- **7 种货币** — CNY / USD / EUR / JPY / KRW / GBP + 自动检测
- **预算告警** — 累计费用超过阈值自动提示
- **自定义模型** — 命令面板引导添加，无需手写 JSON
- **零依赖，纯本地** — 不上传任何数据，除可选定价更新外完全离线

### 设置

Ctrl+, → 搜索 `claudeTokenMonitor`：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| language | UI 语言 | auto |
| currency | 显示货币 | auto |
| pollIntervalMs | 检测间隔（毫秒） | 2000 |
| customModels | 自定义模型定价 | [] |
| statusBar.compactMode | 紧凑模式 | false |
| budgetWarning | 预算告警阈值（0=关闭） | 0 |

### 前提

- VSCode ≥ 1.90
- Claude Code 已安装

---

## English

A VSCode extension that displays real-time token usage, cost, and thinking time for Claude Code sessions.

### Features

- **Real-time monitoring** — status bar shows session title, latest message cost, cumulative total. Hover tooltip with full breakdown: total input, cache hit/miss, output, hit rate, think time
- **Time range filters** — Current / Daily / Weekly / Monthly / Yearly / All with cross-session aggregation
- **Session selector** — browse all past sessions with full message history and per-model stats
- **By-model grouping** — toggle to see costs split by AI model
- **Multi-provider pricing** — 28+ models across 11 providers: DeepSeek · Anthropic · OpenAI · Gemini · Qwen · Kimi · GLM · Doubao · Ernie · Grok · Mistral
- **Auto-updating pricing & rates** — exchange rates refreshed daily from open.er-api.com (free, no API key). Model pricing updated monthly via GitHub Actions
- **11 languages** — en / zh-CN / zh-TW / ja / ko / es / ar / pt / de / fr / ru. Webview labels update instantly on language change
- **7 currencies** — CNY / USD / EUR / JPY / KRW / GBP + auto-detect
- **Budget warning** — alerts when cumulative cost exceeds threshold
- **Custom models** — guided quick-add via command palette
- **Zero dependencies, fully local** — no telemetry, no data uploads, offline except optional pricing updates

### Settings

Ctrl+, → search `claudeTokenMonitor`:

| Setting | Description | Default |
|---------|-------------|---------|
| language | UI language | auto |
| currency | Display currency | auto |
| pollIntervalMs | Poll interval (ms) | 2000 |
| customModels | Custom model pricing | [] |
| statusBar.compactMode | Compact mode | false |
| budgetWarning | Budget alert threshold (0=off) | 0 |

### Prerequisites

- VSCode ≥ 1.90
- Claude Code installed

---

MIT
