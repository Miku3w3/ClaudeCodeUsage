# Claude Code Token Monitor

[English](#english) | [中文](#中文)

---

## 中文

一款 VSCode 扩展，在状态栏实时显示 Claude Code 对话的 token 用量、费用和思考时间。

### 功能

- **实时状态栏监控** — 显示会话标题、本轮 AI 耗时、本轮 token/费用、累计用量。悬停 Tooltip 查看完整分解：总输入 / 缓存命中 / 未命中 / 输出 / 命中率 / 思考时间
- **本轮 AI 耗时** — 统计当前对话轮次中 AI 实际工作的总时间，自动排除等待工具授权和用户输入的空闲时间
- **时间范围筛选** — 当前会话 / 每天 / 每周 / 每月 / 每年 / 全部，按逐条消息时间戳精确聚合
- **会话选择器** — 浏览所有过往会话，点击查看完整消息记录和分模型统计
- **按模型分组** — 一键切换，按 AI 模型拆分费用和 token 统计
- **多供应商定价** — 内置 11 家供应商 28+ 模型：DeepSeek · Anthropic · OpenAI · Gemini · Qwen · Kimi · GLM · Doubao · Ernie · Grok · Mistral
- **自动更新定价与汇率** — 汇率每日从 open.er-api.com 获取（免费，无需 key），模型定价每月通过 GitHub Actions 自动抓取更新
- **11 种语言** — en / zh-CN / zh-TW / ja / ko / es / ar / pt / de / fr / ru，切换语言时 webview 按钮实时更新无需重载
- **7 种货币** — CNY / USD / EUR / JPY / KRW / GBP + 自动检测
- **预算告警** — 累计费用超过阈值自动提示
- **自定义模型** — 命令面板引导添加，无需手写 JSON
- **零依赖，纯本地** — 不上传任何数据，除可选定价更新外完全离线

### 状态栏格式

| 模式 | 示例 |
|------|------|
| 完整 | `📊 标题… \| AI耗时 3.2s \| 85K ¥0.012 \| 累计 1.2M ¥0.19` |
| 完整+模型 | `📊 标题… \| deepseek-v4-pro \| AI耗时 3.2s \| 85K ¥0.012 \| 累计 1.2M ¥0.19` |
| 紧凑 | `📊 标题… \| 1.2M ¥0.19` |

### 设置

Ctrl+, → 搜索 `claudeTokenMonitor`：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `language` | UI 语言 | auto |
| `currency` | 显示货币 | auto |
| `pollIntervalMs` | 检测间隔（毫秒） | 2000 |
| `statusBar.showModelName` | 在状态栏显示模型名称 | false |
| `statusBar.compactMode` | 紧凑模式 | false |
| `budgetWarning` | 预算告警阈值（0=关闭） | 0 |
| `customModels` | 自定义模型定价 | [] |
| `pricing.autoUpdate` | 自动更新定价和汇率 | true |

### 命令

| 命令 | 说明 |
|------|------|
| `Show Token Usage Detail` | 打开 Token 监控详情面板 |
| `Show Last Message Cost` | 显示上一条消息的费用 |
| `Open Token Monitor Settings` | 打开设置 |
| `Refresh Token Data` | 手动刷新数据 |
| `Add Custom Model Pricing` | 添加自定义模型定价 |
| `Manage Custom Models` | 管理自定义模型 |
| `Force Refresh Pricing Data` | 强制刷新定价数据 |

### 前提

- VSCode ≥ 1.90
- Claude Code 已安装

---

## English

A VSCode extension that displays real-time token usage, cost, and thinking time for Claude Code sessions in the status bar.

### Features

- **Real-time status bar** — session title, turn AI time, per-turn tokens/cost, cumulative total. Hover tooltip with full breakdown: total input, cache hit/miss, output, hit rate, think time
- **Turn AI time** — tracks total AI working time within the current conversation turn, excluding idle time waiting for tool approvals or user input
- **Time range filters** — Current / Daily / Weekly / Monthly / Yearly / All, aggregated by per-message timestamps for accurate period stats
- **Session selector** — browse all past sessions with full message history and per-model stats
- **By-model grouping** — toggle to see costs split by AI model
- **Multi-provider pricing** — 28+ models across 11 providers: DeepSeek · Anthropic · OpenAI · Gemini · Qwen · Kimi · GLM · Doubao · Ernie · Grok · Mistral
- **Auto-updating pricing & rates** — exchange rates refreshed daily from open.er-api.com (free, no API key). Model pricing updated monthly via GitHub Actions
- **11 languages** — en / zh-CN / zh-TW / ja / ko / es / ar / pt / de / fr / ru. Webview labels update instantly on language change without reload
- **7 currencies** — CNY / USD / EUR / JPY / KRW / GBP + auto-detect
- **Budget warning** — alerts when cumulative cost exceeds threshold
- **Custom models** — guided quick-add via command palette, no manual JSON required
- **Zero dependencies, fully local** — no telemetry, no data uploads, offline except optional pricing updates

### Status Bar

| Mode | Example |
|------|---------|
| Full | `📊 Title… \| AI time 3.2s \| 85K ¥0.012 \| Cumulative 1.2M ¥0.19` |
| Full + Model | `📊 Title… \| deepseek-v4-pro \| AI time 3.2s \| 85K ¥0.012 \| Cumulative 1.2M ¥0.19` |
| Compact | `📊 Title… \| 1.2M ¥0.19` |

### Settings

Ctrl+, → search `claudeTokenMonitor`:

| Setting | Description | Default |
|---------|-------------|---------|
| `language` | UI language | auto |
| `currency` | Display currency | auto |
| `pollIntervalMs` | Poll interval (ms) | 2000 |
| `statusBar.showModelName` | Show model name in status bar | false |
| `statusBar.compactMode` | Compact mode | false |
| `budgetWarning` | Budget alert threshold (0=off) | 0 |
| `customModels` | Custom model pricing | [] |
| `pricing.autoUpdate` | Auto-update pricing & rates | true |

### Commands

| Command | Description |
|---------|-------------|
| `Show Token Usage Detail` | Open token monitoring detail panel |
| `Show Last Message Cost` | Show cost of the last message |
| `Open Token Monitor Settings` | Open extension settings |
| `Refresh Token Data` | Manually refresh token data |
| `Add Custom Model Pricing` | Add custom model pricing |
| `Manage Custom Models` | Manage custom model entries |
| `Force Refresh Pricing Data` | Force refresh pricing data from remote |

### Prerequisites

- VSCode ≥ 1.90
- Claude Code installed

---

MIT
