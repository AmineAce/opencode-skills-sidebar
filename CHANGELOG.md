# Changelog

## 0.1.0

Initial release.

- Sidebar widget listing the session's active skills, capped at 10 inline rows
  with the overflow folded into the `More skills (N idle · X active)` row.
- Status-bar taskbar chip with the live active count, click to open the picker.
- Skill picker dialog: search (letters and spaces), hover highlight, details
  view with description and path, keyboard scrolling, one-key activation
  (`session.skill` with `resume: false` — the model is never resumed).
- Theme-reactive colors, dynamic from the active OpenCode theme.
