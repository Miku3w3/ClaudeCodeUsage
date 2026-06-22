# Changelog

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
