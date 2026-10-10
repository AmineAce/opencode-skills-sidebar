# opencode-skills-sidebar

[![OpenCode](https://img.shields.io/badge/OpenCode-v2-3E8AC9)](https://opencode.ai)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

Session-aware skills sidebar and skill picker for the OpenCode v2 TUI.

- **Sidebar widget** (`sidebar.content`): lists the session's active skills
  (capped at 10 inline — overflow folds into the `More skills` row's count)
  plus a single `More skills (N idle)` row that opens the picker.
- **Status-bar taskbar chip** (`prompt.footer.status`): shows the live active
  skill count and opens the picker on click.
- **Picker dialog**: search (letters and spaces), hover highlight, details view
  with description and path, and one-key activation.

Activation uses `session.skill` with `resume: false`, so a skill is only
appended to context — the model is never resumed.

## Install

Requires OpenCode v2.

Either let OpenCode install and register it:

```sh
opencode plugin add opencode-skills-sidebar
```

or add it manually to `opencode.json(c)` (note the key is `plugins`):

```json
{
  "plugins": ["opencode-skills-sidebar"]
}
```

No-registry alternative: copy `src/tui.tsx` to
`~/.config/opencode/plugins/skills/tui.tsx` — OpenCode discovers it
automatically.

## Keys (inside the picker)

| Context | Key | Action |
| --- | --- | --- |
| list / details | `space` | Activate selected skill (types into search while a query is being edited) |
| list | `enter` | Activate selected skill |
| list | `f5` | Open details |
| list | `↑` `↓` `pgup` `pgdn` `home` `end` | Move selection |
| details | `↑` `k` / `↓` `j` | Scroll one line |
| details | `pgup` / `pgdn` | Scroll half a viewport |
| details | `home` / `end` | Jump to top / bottom |
| details | `esc` | Back to list |
| list | `esc` | Close picker |
| anywhere | `ctrl+alt+s` | Open picker |

`j` and `k` scroll only in the details view; in the list they type into the
search box, so queries like "javascript" stay typeable. Both scrollbars are
hidden (like the `/btw` command box): scrolling is keyboard, mouse wheel, and
selection movement.

## Development

The plugin is developed against a live OpenCode instance: the source of truth
for local work is `~/.config/opencode/plugins/skills/tui.tsx`, which OpenCode
hot-loads.

```sh
bun run sync     # live plugin file -> src/tui.tsx (for tests/commit)
bun run deploy   # src/tui.tsx -> live plugin file (install edited sources)
bun test         # syncs first, then runs the suite
bun run check    # tsc --noEmit
```

A checkout of this repo can also be loaded directly as a plugin (no publish):

```json
{
  "plugins": ["/path/to/opencode-skills-sidebar"]
}
```

The render tests mount the real plugin through `testRender` with a mocked
plugin context (`test/fixture.tsx`) and assert on rendered frames: sidebar rows
and the overflow cap, search filtering, space-to-activate vs space-to-type,
details/back navigation, and the active-count refresh on
`session.skill.activated`.

## Releasing

Publishing is fully automated via GitHub Actions with npm trusted publishing
(no tokens stored in the repo):

```sh
./scripts/release.sh patch   # or minor / major
git push && git push --tags
```

The workflow type-checks, tests, and publishes to npm when the version in
`package.json` is not yet on the registry.
