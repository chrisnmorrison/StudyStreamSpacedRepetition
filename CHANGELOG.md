# Changelog

All notable changes to this project will be documented here.

## [0.1.0] — 2026-05-07

Beta release. Errors may occur; please report issues at https://github.com/chrisnmorrison/vaultrecall/issues for StudyStream SR.

### Added

- Navigate Mode: sequential note review with SM-2 spaced repetition scheduling
- AI Quiz Mode: on-demand question generation via any OpenAI-compatible API (BYOK)
- Floating review HUD with Again / Hard / Good / Easy rating buttons
- Keyboard shortcuts `1`–`4` for rating during sessions
- Notes open in reading mode during review so keyboard shortcuts never type into content
- "Edit note" button in the HUD to switch back to edit mode when needed
- Settings: default folder, review order (due-date first or random), daily review limit
- Internal review persistence in `.obsidian/plugins/vaultrecall/data.json`; legacy frontmatter import and cleanup commands are available
- Right-click context menu on folders to start a review or AI quiz session
- Ribbon icon for one-click access to the default folder session
