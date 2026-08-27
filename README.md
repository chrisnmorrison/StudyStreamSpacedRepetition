# StudyStream SR

Beta spaced repetition built into Obsidian desktop. Review your notes on a schedule using SM-2 and optionally generate AI quizzes from note content. Notes stay untouched: scheduling data lives in the plugin's internal `.obsidian/plugins/studystream/data.json`.

**Beta notice:** StudyStream SR `0.1.0` is a beta release. Errors may occur, especially with large vaults, sync conflicts, unusual Markdown, or AI provider responses. Back up your vault before relying on it for important review history. Please report bugs on [GitHub Issues](https://github.com/chrisnmorrison/studystream/issues), ideally with diagnostics from **StudyStream SR: Copy diagnostics**.

## Installation

The plugin isn't on the community list yet. Install via BRAT or manually.

**BRAT**

1. Install the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat)
2. In BRAT settings, add this repository's URL

**Manual**

1. Download `main.js`, `styles.css`, and `manifest.json` from the latest release
2. Create `.obsidian/plugins/studystream/` in your vault
3. Drop the three files in, reload Obsidian, and enable the plugin

## Usage

### Starting a session

Right-click any folder in the file explorer and choose **Start review session** or **Start AI quiz session**. You can also click the graduation-cap ribbon icon to start a session in your configured default folder, or use the command palette.

### Navigate mode

Notes open one at a time in reading mode (so keyboard shortcuts don't accidentally type into your content). A bar at the bottom shows your progress and the current note name.

Rate each note after reading it:

| Key | Rating                                    |
| --- | ----------------------------------------- |
| 1   | Again - forgotten, reschedule to tomorrow |
| 2   | Hard                                      |
| 3   | Good                                      |
| 4   | Easy                                      |
| u   | Undo last rating                          |

Notes without an internal review record are treated as new. Each session includes due cards up to your daily due review limit plus up to your configured new-card limit.

### AI quiz mode

Same as navigate mode, but after each note opens, a modal generates questions from the note's content. Rate the note directly from the modal once you're done. Requires an API key in settings (see below).

The first time you use AI quiz mode, StudyStream SR asks you to confirm plaintext key storage and note-excerpt sharing. It also asks you to confirm the destination host. Non-local API URLs must use HTTPS. HTTP is allowed only for localhost-style development endpoints such as local Ollama.

### Status bar and statistics

The status bar shows how many notes are due and new in your default folder. Run **StudyStream SR: Show statistics** from the command palette to see today's reviewed count.

## Settings

| Setting                | Description                                                 |
| ---------------------- | ----------------------------------------------------------- |
| Default folder         | Folder used by the ribbon icon and status bar               |
| Review order           | Due-date first or random                                    |
| Daily due review limit | Max due cards per session (0 = no limit)                    |
| New cards per session  | Max unseen notes introduced per session                     |
| Leech threshold        | Notes that fail this many times trigger a warning (0 = off) |
| API key                | Your OpenAI-compatible key                                  |
| API base URL           | Chat completions endpoint                                   |
| Model                  | Model name sent to the API                                  |
| Custom quiz prompt     | Replaces the default quiz instructions                      |

StudyStream SR v1 is desktop-only. Mobile support needs separate QA for the review HUD, modals, and provider networking before it should be enabled.

## Review data and backups

Review history is stored in `.obsidian/plugins/studystream/data.json`, keyed by each note's vault-relative path. Include that file in vault syncs and backups if you want scheduling history preserved.

This also means review history does not travel with a single Markdown note. If you copy one note to another vault, its content moves but its spaced repetition state does not.

If you review on multiple devices while offline, whichever synced `data.json` wins last may overwrite the other device's recent scheduling changes. Sync that file carefully if you review from more than one machine.

If you used an older version that stored review fields in YAML frontmatter, run **StudyStream SR: Import legacy frontmatter review data** from the command palette once. The importer copies existing review state into `data.json` and does not edit your notes.

After importing, you can run **StudyStream SR: Remove legacy frontmatter review data** to strip `sr-due`, `sr-interval`, `sr-ease`, and `sr-lapses` from notes. This command asks for confirmation before editing files.

Renaming files or folders while the plugin is enabled updates internal review records. Deleting files does not immediately delete review history; this avoids permanent data loss from transient sync deletes. Use **StudyStream SR: Show orphaned review records** to inspect stale records and **StudyStream SR: Prune orphaned review records** to remove them from `data.json`.

## API key security

Keys are stored in plaintext at `.obsidian/plugins/studystream/data.json`. This is how Obsidian plugin storage works - there's no encrypted keychain. A few things to keep in mind:

- Set a spending cap on the key you use here
- If your vault syncs to a shared location or cloud storage, be aware that `data.json` goes with it
- The key, model name, quiz prompt, and note excerpts are sent only to the endpoint you configure and confirm
- Changing the endpoint clears the trust confirmation and asks again before sending data
- AI quiz output is displayed as inert text after HTML, embeds, Markdown links, and wiki links are stripped

The plugin uses Obsidian's built-in `requestUrl` for API calls, which means requests go directly from your machine to your endpoint with no intermediary.

Run **StudyStream SR: Copy diagnostics** when reporting an issue. It copies plugin/app versions, non-secret settings, review-record counts, and default-folder scan counts. It never includes your API key or note content.

## Contributing

Bug reports and pull requests are welcome. Please report beta issues at [github.com/chrisnmorrison/studystream/issues](https://github.com/chrisnmorrison/studystream/issues). The source is plain TypeScript with no runtime dependencies beyond the Obsidian API.

```bash
npm install
npm run dev     # watch mode, rebuilds on save
npm run build   # type-check + production build
npm run lint
```

Copy `main.js`, `styles.css`, and `manifest.json` into your vault's plugin folder to test. After each rebuild, use **Reload app without saving** in Obsidian to pick up changes.

## License

0-BSD
