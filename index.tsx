// Package entry. OpenCode's plugin loader resolves a configured package
// directory by its root index file (it does not follow package.json "main"
// or "exports" into subdirectories), so the plugin lives in src/tui.tsx and
// this one line re-exports it.
export { default } from "./src/tui"
