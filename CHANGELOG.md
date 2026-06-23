# Changelog

## [1.0.0] — 2026-06-23
### Added
- Time range filters: Current / Daily / Weekly / Monthly / Yearly / All
- Session selector dropdown with full historical session detail view
- "By Model" toggle — regroup stats cards and summary rows by model
- Auto-updating exchange rates from open.er-api.com (no API key required)
- Auto-updating model pricing from GitHub CDN (11 providers, refreshed monthly via GitHub Actions)
- Dynamic language switching — webview buttons and labels update in real-time without reload
- 11-language UI with complete translation coverage (en, zh-CN, zh-TW, ja, ko, es, ar, pt, de, fr, ru)
- AI-powered pricing update script with multi-engine web search for automated monthly updates

### Changed
- v0.12.2 → v1.0.0: stable release milestone
- Filter bar: event delegation replaces inline onclick handlers for CSP compatibility
- Pricing engine: remote providers override built-in defaults with numeric sanitization
- Webview i18n: dynamic STR updates via message-passing instead of page reload

### Fixed
- NaN cost display caused by unsanitized AI pricing data (non-numeric values like "Free", "N/A")
- Session dropdown reset by auto-refresh (filter bar moved outside `#app`)
- Token double-counting in aggregated views (redundant cache-miss field removed)
- Duplicate session count display ("7 7 个会话" → "7 个会话")
- Privacy: removed development path from JSDoc comments
- 21 stale .vsix files and debug scripts cleaned from repository

## [0.12.1] — 2026-06-23
### Added
- Time range filters: 当前会话 (Current) / 每天 (Daily) / 每周 (Weekly) / 每月 (Monthly) / 每年 (Yearly) / 所有 (All)
- Session selector dropdown — browse and view any past session's full detail
- "By Model" toggle — regroup stats cards and table by model
- Persistent session index at `~/.claude/token-tracker/sessions.json` for cross-session aggregation

### Fixed
- SessionStore now deduplicates by message UUID (same as live poll loop), fixing inflated token/cost counts
- Session index auto-invalidates stale entries from older extension versions
- Filter bar layout: dropdown and checkbox aligned with tab buttons

## [0.12.0] — 2026-06-23
### Added
- Webview filter bar with time range tabs, session selector, and by-model toggle
- Persistent session index for cross-session aggregation
- Monthly time range filter

## [0.11.5] — 2026-06-22
### Added
- 8-card stats dashboard with icons
- Multi-model detail panels (click to expand per-model breakdown)
- Pause/Resume auto-refresh button
- Model column in message table
- Synthetic model filter (`<synthetic>` entries hidden)

### Fixed
- Expanded model panels survive auto-refresh
- New session auto-detection on first message
- Force refresh on currency change

## [0.11.1] — 2026-06-22
### Added
- Webview standalone editor tab (no longer hidden in bottom panel)
- Settings button (⚙) in webview panel
- Redesigned hover tooltip with per-message & cumulative token breakdown
- Cache hit rate display
- Exchange rate display in tooltip
- Add Custom Model Pricing command (guided quick-add)
- Manage Custom Models command (list & delete)
- Force Refresh Pricing Data command
- Auto-updating pricing & exchange rates from GitHub (24h cache)
- 18 new built-in models: Google Gemini, Alibaba Qwen, Moonshot Kimi, Zhipu GLM, ByteDance Doubao, Baidu Ernie, xAI Grok, Mistral, DeepSeek v3/r1, OpenAI gpt-4.1/o4-mini

### Changed
- Status bar click now opens webview (Settings accessible via ⚙ button)
- 11 languages total (+zh-TW, es, ar, pt, de, fr, ru)

### Fixed
- Split-view cross-group tab switching
- Cross-group alternating re-click detection (250ms interval)

## [0.8.0] — 2026-06-22
### Added
- Chinese UI (original version)
- DeepSeek pricing support
- Thinking time tracking
- Per-message token & cost display
- Status bar with session title, think time, latest token, latest cost, cumulative

### Fixed
- Tab switching responsiveness restored (v0.3.0 event-driven architecture)
- Path encoding for Windows drives
- String content format support for older Claude Code versions
- Session title extraction robustness

## [0.1.0 ~ 0.7.2] — 2026-06-21~22
- Initial development through iteration
- v0.3.0: Best tab switching architecture (later restored)
- v0.6.0: Regression (removed event-driven switching — later fixed)
- v0.7.x: Fixes for tab switching, title extraction, cold sessions
