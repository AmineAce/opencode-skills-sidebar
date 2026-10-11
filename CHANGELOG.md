# Changelog

## Unreleased

- Model usage tracking: skills the model loads through the `skill` tool now
  show on the sidebar (`● ponytail ×1 3m`) and in the picker
  (`Active · used twice · 3 minutes ago`). Skills read by the model but
  never attached render as hollow-dot rows in the same inline list, which
  sorts by usage (most recent first) under the row cap. Initial state comes
  from a transcript scan; live updates arrive on `session.tool.success`.
- Sidebar rows drop the `Active` word: the filled dot carries that meaning,
  freeing the cells for the usage badge on long names.

## 0.1.0

Initial release.

- Sidebar widget listing the session's active skills, capped at 10 inline rows
  with the overflow folded into the `More skills (N idle · X active)` row.
- Status-bar taskbar chip with the live active count, click to open the picker.
- Skill picker dialog: search (letters and spaces), hover highlight, details
  view with description and path, keyboard scrolling, one-key activation
  (`session.skill` with `resume: false` — the model is never resumed).
- Theme-reactive colors, dynamic from the active OpenCode theme.
