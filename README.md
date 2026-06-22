# Claude Code Token Monitor

[English](#english) | [中文](#中文)

---

## 中文

一款轻量级 VSCode 扩展，在状态栏实时显示 **Claude Code** 对话的 token 用量、费用和思考时间。

### 功能

- **状态栏实时监控**：当前会话标题、token 用量、累计费用一目了然
- **悬停详情面板**：上条消息和会话累计的完整 token 分解（总输入/缓存命中/缓存未命中/输出/命中率）
- **思考时间追踪**：每条消息的等待时间（用户提问 → AI 首次响应）
- **多供应商定价**：内置 DeepSeek、Anthropic、OpenAI、Google Gemini、阿里通义、Kimi、智谱 GLM、字节豆包、百度文心、xAI Grok、Mistral 共 28+ 模型
- **多语言 UI**：支持 11 种语言（英文、简繁中文、日文、韩文、西班牙语、阿拉伯语、葡萄牙语、德语、法语、俄语）
- **7 种货币**：人民币/美元/欧元/日元/韩元/英镑 + 自动检测 + 实时汇率
- **分屏兼容**：VSCode 多窗格标签切换完美支持
- **预算告警**：累计费用超过阈值自动警告
- **自定义模型**：命令面板引导添加，无需手写 JSON
- **自动定价更新**：24 小时从 GitHub 拉取最新定价和汇率
- **零依赖**：53 KB，纯本地运行，不联网（除可选定价更新外），不上传任何数据
- **Webview 详情面板**：独立标签页，带设置快捷入口

### 安装

1. 从 [Releases](https://github.com/ClaudeCodeUsage/ClaudeCodeUsage/releases) 下载最新 `.vsix`
2. VSCode → `Ctrl+Shift+X` → `...` → `Install from VSIX...` → 选择文件
3. `Ctrl+Shift+P` → `Reload Window`

### 设置

点右下角状态栏 → 打开设置，或 `Ctrl+,` 搜索 `claudeTokenMonitor`：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `language` | UI 语言 | auto（跟随 VSCode）|
| `currency` | 显示货币 | auto（跟随语言）|
| `customModels` | 自定义模型定价 | [] |
| `statusBar.compactMode` | 紧凑模式 | false |
| `budgetWarning` | 预算告警阈值（0=关闭）| 0 |
| `pricing.autoUpdate` | 自动更新定价 | true |

### 前提

- VSCode >= 1.90
- [Claude Code](https://code.claude.com/docs/en/overview) 已安装

---

## English

A lightweight VSCode extension that displays real-time **token usage, cost, and thinking time** for Claude Code sessions right in the status bar.

### Features

- **Real-time status bar** — session title, token counts, costs at a glance
- **Hover tooltip breakdown** — per-message & cumulative: total input, cache hit/miss, output, hit rate, think time
- **Thinking time** — measures latency from user message to first AI response
- **Multi-provider pricing** — 28+ models: DeepSeek, Anthropic, OpenAI, Google Gemini, Qwen, Kimi, GLM, Doubao, Ernie, Grok, Mistral
- **11 languages** — EN, ZH-CN, ZH-TW, JA, KO, ES, AR, PT, DE, FR, RU
- **7 currencies** — CNY, USD, EUR, JPY, KRW, GBP + auto-detect
- **Split-view compatible** — works across multiple VSCode editor groups
- **Budget warning** — alerts when cost exceeds threshold
- **Custom models** — guided quick-add via command palette, no JSON editing
- **Auto-updating pricing** — fetches latest pricing + exchange rates from GitHub daily
- **Zero dependencies, fully local** — no API calls, no telemetry, no data uploads
- **Webview panel** — standalone editor tab with Settings shortcut button

### Installation

1. Download the latest `.vsix` from [Releases](https://github.com/ClaudeCodeUsage/ClaudeCodeUsage/releases)
2. VSCode → `Ctrl+Shift+X` → `...` → `Install from VSIX...` → select file
3. `Ctrl+Shift+P` → `Reload Window`

### Settings

Click the status bar item → opens settings. Or `Ctrl+,` → search `claudeTokenMonitor`:

| Setting | Description | Default |
|---------|-------------|---------|
| `language` | UI language | auto (follows VSCode) |
| `currency` | Display currency | auto (follows language) |
| `customModels` | Custom model pricing | [] |
| `statusBar.compactMode` | Compact status bar | false |
| `budgetWarning` | Budget alert threshold (0=off) | 0 |
| `pricing.autoUpdate` | Auto-update pricing | true |

### Prerequisites

- VSCode >= 1.90
- [Claude Code](https://code.claude.com/docs/en/overview) installed

---

## License

MIT
