/** @jsxImportSource @opentui/solid */
import { Plugin, usePlugin } from "@opencode/plugin/tui"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createMemo, createSignal, For, onCleanup, Show } from "solid-js"

interface SkillInfo {
  id: string
  name: string
  description?: string
  autoinvoke?: boolean
  path?: string
}

// — Pure picker logic ——————————————————————————————————————————————
// Exported so the behavior rules below are testable without a terminal.

// Space belongs to the search query exactly while a query is being typed:
// the list is showing, no keycap row has focus, and the query is already
// non-empty ("cold email"). In every other state space activates.
export function spaceTypesIntoQuery(
  screen: "list" | "details",
  focusedAction: number | undefined,
  hasQuery: boolean,
): boolean {
  return screen === "list" && focusedAction === undefined && hasQuery
}

// Case-insensitive substring match over name and description, so multi-word
// queries ("cold email") reach skills whose name only holds the hyphen form.
export function filterSkills<T extends { name: string; description?: string }>(
  skills: readonly T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...skills]
  return skills.filter(
    (skill) =>
      skill.name.toLowerCase().includes(needle) ||
      (skill.description ?? "").toLowerCase().includes(needle),
  )
}

// Sorts actives first, then used skills lead within each group, most
// recent first. Stable: the catalog order survives everywhere else.
export function sortByUsage<T extends { id: string }>(
  catalog: readonly T[],
  active: ReadonlySet<string>,
  usage: Readonly<Record<string, SkillUsage>>,
): T[] {
  return [...catalog].sort((a, b) => {
    const group = Number(active.has(b.id)) - Number(active.has(a.id))
    if (group !== 0) return group
    const first = usage[a.id]
    const second = usage[b.id]
    if (!first && !second) return 0
    if (!first) return 1
    if (!second) return -1
    return second.usedAt - first.usedAt
  })
}

// — Model usage tracking —————————————————————————————————————————
// The model loads skills through the builtin `skill` tool, which stores
// the skill text as a tool result inside its own message. That path never
// creates a skill message, so the active set above can never see it. The
// scan below recovers it: every completed `skill` tool call in recent
// assistant messages counts as one use of that skill id.
//
// Limits: only the scanned window counts (see fetchUsage), failed calls
// never count, and autoinvoke skills never produce tool calls at all.

export interface SkillUsage {
  count: number
  usedAt: number
}

// Minimal structural view of an assistant message: only the fields the
// scan reads, so tests and future schema shifts stay decoupled.
export interface UsageMessagePart {
  type?: string
  name?: string
  id?: string
  state?: {
    status?: string
    input?: { id?: unknown }
    metadata?: { name?: unknown }
  }
  time?: { created?: unknown; ran?: unknown; completed?: unknown }
}
export interface UsageMessage {
  time?: { created?: unknown }
  content?: UsageMessagePart[]
}

function toMs(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime()
  if (typeof value === "string" && value) {
    const ms = Date.parse(value)
    if (!Number.isNaN(ms)) return ms
  }
  return undefined
}

export function scanSkillUsage(
  messages: readonly UsageMessage[],
  now: number = Date.now(),
): Record<string, SkillUsage> {
  const usage: Record<string, SkillUsage> = {}
  for (const message of messages) {
    if (!message || !Array.isArray(message.content)) continue
    for (const part of message.content) {
      if (!part || part.type !== "tool" || part.name !== "skill") continue
      if (part.state?.status !== "completed") continue
      const input = part.state?.input
      const id =
        typeof input?.id === "string" && input.id
          ? input.id
          : typeof part.state?.metadata?.name === "string" && part.state.metadata.name
            ? part.state.metadata.name
            : undefined
      if (!id) continue
      const at =
        toMs(part.time?.completed) ??
        toMs(part.time?.ran) ??
        toMs(part.time?.created) ??
        toMs(message.time?.created) ??
        now
      const seen = usage[id]
      usage[id] = seen
        ? { count: seen.count + 1, usedAt: Math.max(seen.usedAt, at) }
        : { count: 1, usedAt: at }
    }
  }
  return usage
}

// The count in plain words: "once" | "twice" | "3 times".
export function formatUses(count: number): string {
  if (count <= 1) return "once"
  if (count === 2) return "twice"
  return `${count} times`
}

// Compact age for the narrow sidebar: "now" | "3m" | "2h" | "5d".
export function ageShort(usedAt: number, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - usedAt) / 60000))
  if (minutes < 1) return "now"
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

// Full age for the wide picker: "just now" | "3 minutes ago" | similar.
export function ageLong(usedAt: number, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - usedAt) / 60000))
  if (minutes < 1) return "just now"
  if (minutes === 1) return "1 minute ago"
  if (minutes < 60) return `${minutes} minutes ago`
  const hours = Math.floor(minutes / 60)
  if (hours === 1) return "1 hour ago"
  if (hours < 24) return `${hours} hours ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? "1 day ago" : `${days} days ago`
}

// Sidebar badge: "×1 3m". Short because the sidebar is narrow.
export function usageBadge(use: SkillUsage, now: number = Date.now()): string {
  return `×${use.count} ${ageShort(use.usedAt, now)}`
}

// Picker status: "Active · used twice · 3 minutes ago" for attached
// skills, "used twice · 3 minutes ago" for used-only ones. The hollow
// picker dot already marks the not-attached state, so the idle word drops
// out wherever usage text exists.
export function usageStatusText(
  use: SkillUsage,
  isActive: boolean,
  now: number = Date.now(),
): string {
  const text = `used ${formatUses(use.count)} · ${ageLong(use.usedAt, now)}`
  return isActive ? `Active · ${text}` : text
}

// Row status label: usage text wins when the model has read the skill,
// then active, then the manual-only marker.
export function statusLabel(
  skill: { id: string; autoinvoke?: boolean },
  active: ReadonlySet<string>,
  usage?: SkillUsage,
  now: number = Date.now(),
): string {
  if (usage) return usageStatusText(usage, active.has(skill.id), now)
  return active.has(skill.id) ? "Active" : skill.autoinvoke === false ? "idle · manual" : "idle"
}

// Skills carry no author field, so derive provenance from install location.
// The sidebar lists attached skills plus used-only ones (read by the
// model but never attached), so this row takes both states. Filled dot:
// attached to the session. Hollow dot: used-only. The hollow dot also
// works without color.
function SkillRow(props: { skill: SkillInfo; attached: boolean; usage?: SkillUsage }) {
  const context = usePlugin()
  // Re-read the theme on every access: the plugin context exposes it as a
  // live getter, so a frozen snapshot would go stale on a theme switch.
  const theme = () => context.theme
  const dot = () => (props.attached ? "●" : "○")
  const dotColor = () =>
    props.attached
      ? theme().text.feedback.success.base
      : theme().hue.accent[context.themeMode === "light" ? 300 : 200]

  return (
    <box flexDirection="row" gap={1} minWidth={0}>
      <text flexShrink={0} fg={dotColor()}>
        {dot()}
      </text>
      <text fg={theme().text.base} wrapMode="none" truncate flexGrow={1} flexShrink={1} minWidth={0}>
        <b>{props.skill.name}</b>
      </text>
      {/* No Active word: the filled dot already says attached, and its
          cells now fit the usage badge even on the longest names. */}
      <Show when={props.usage}>
        {(use) => (
          <text fg={theme().text.muted} wrapMode="none" flexShrink={0}>
            {usageBadge(use(), Date.now())}
          </text>
        )}
      </Show>
    </box>
  )
}

// Mouse-wheel feel parity with opencode's own command boxes (/btw): they
// default to a linear scroll speed of 3 (config.scroll.speed, default 3),
// while opentui's bare default is 1, which reads sluggish next to them. The
// plugin context exposes no user config, so match the documented default.
const wheelScroll = { tick: () => 3, reset: () => {} }

// The sidebar renders active skills inline with no scrollbox, so an
// over-active session (100+ skills) would push every other sidebar section
// off screen. Cap the visible rows and fold the true active total into the
// "More skills" row instead, which already opens the full picker.
const MAX_ACTIVE_ROWS = 10

// A keycap chip + label for the footer action rows. The chip uses the active
// theme's accent hue — resolved fresh on every render — so it always matches
// whichever theme the user has selected instead of a frozen default color.
function Keycap(props: { k: string; label: string; focused?: boolean }) {
  const context = usePlugin()
  const theme = () => context.theme
  return (
    <text fg={props.focused ? theme().text.base : theme().text.muted}>
      <span
        style={{
          bg: theme().hue.accent[context.themeMode === "light" ? 300 : 200],
          fg: theme().background.raised.base,
          bold: true,
        }}
      >
        {` ${props.k} `}
      </span>
      {` ${props.label}`}
    </text>
  )
}

export default Plugin.define({
  id: "opencode.skills.sidebar",
  setup(context) {
    const theme = () => context.theme
    const [view, updateView] = context.storage.store("view", {
      initial: { open: true },
    })

    const setOpen = (value: boolean) => {
      void updateView((draft) => {
        draft.open = value
      }).catch((error) => console.error("Failed to persist skills sidebar state", error))
    }

    const locationOf = (sessionID: string) =>
      context.data.session.get(sessionID)?.location ?? context.data.location.default()

    const catalogAt = (sessionID: string) =>
      (context.data.location.skill.list(locationOf(sessionID)) ?? []) as unknown as SkillInfo[]

    // Skill activations live beyond the 20-message store page, so query
    // skill messages directly instead of trusting the paginated cache.
    const fetchActive = async (sessionID: string) => {
      const response = await context.client.message.list({
        sessionID,
        type: "skill",
        limit: 200,
        order: "desc",
      })
      const items = response.data as Array<{ skill?: string }>
      return new Set(items.map((item) => item.skill).filter((id): id is string => !!id))
    }

    // Model usage lives in assistant messages, not skill messages: scan
    // the recent window for completed `skill` tool calls. The window
    // bounds the payload: full-session content grows without bound.
    const fetchUsage = async (sessionID: string) => {
      const response = await context.client.message.list({
        sessionID,
        type: "assistant",
        limit: 100,
        order: "desc",
      })
      return scanSkillUsage(response.data as UsageMessage[])
    }

    // resume:false appends the skill to context only. The server resumes
    // execution on any other value, which would start the model unasked.
    const inject = async (sessionID: string, skill: SkillInfo) => {
      try {
        await context.client.session.skill({ sessionID, id: skill.id, resume: false })
        context.ui.toast.show({ message: `${skill.name} added to session`, variant: "success" })
      } catch {
        context.ui.toast.show({ message: `Could not add ${skill.name}`, variant: "error" })
      }
    }

    // The open picker's handlers, referenced by the shared keymap layer
    // below. Undefined while the picker is closed.
    let picker:
      | {
          screen: () => "list" | "details"
          move: (delta: number) => void
          moveTo: (index: number) => void
          last: () => void
          focusAction: (delta: 1 | -1) => void
          focusedAction: () => number | undefined
          hasQuery: () => boolean
          submit: () => void
          goBack: () => void
          close: () => void
          showDetails: () => void
          scrollDetails: (delta: number) => void
          scrollDetailsPage: (direction: -1 | 1) => void
          scrollDetailsTo: (where: "top" | "bottom") => void
        }
      | undefined
    const [pickerOpen, setPickerOpen] = createSignal(false)

    // One layer for the lifetime of the plugin, gated on the picker being
    // open. Registering it per-open would stack duplicates.
    context.keymap.layer(() => ({
      mode: "modal",
      priority: 1,
      enabled: () => pickerOpen(),
      commands: [
        {
          bind: "up",
          title: "Previous",
          group: "Skills",
          run: () => (picker?.screen() === "list" ? picker.move(-1) : picker?.scrollDetails(-1)),
        },
        {
          bind: "down",
          title: "Next",
          group: "Skills",
          run: () => (picker?.screen() === "list" ? picker.move(1) : picker?.scrollDetails(1)),
        },
        {
          bind: "pageup",
          title: "Page up",
          group: "Skills",
          run: () => {
            if (picker?.screen() === "list") picker.move(-10)
            else picker?.scrollDetailsPage(-1)
          },
        },
        {
          bind: "pagedown",
          title: "Page down",
          group: "Skills",
          run: () => {
            if (picker?.screen() === "list") picker.move(10)
            else picker?.scrollDetailsPage(1)
          },
        },
        {
          bind: "home",
          title: "First skill",
          group: "Skills",
          run: () => {
            if (picker?.screen() === "list") picker.moveTo(0)
            else picker?.scrollDetailsTo("top")
          },
        },
        {
          bind: "end",
          title: "Last skill",
          group: "Skills",
          run: () => {
            if (picker?.screen() === "list") picker.last()
            else picker?.scrollDetailsTo("bottom")
          },
        },
        // /btw-style scrolling for the details view, which has no input.
        // In the list these letters belong to the search box: returning
        // false lets the key flow on to the focused input, the same
        // mechanism space uses, so "javascript" stays typeable.
        {
          bind: "k",
          title: "Scroll up",
          group: "Skills",
          run: () => {
            if (picker?.screen() === "details") picker.scrollDetails(-1)
            else return false
          },
        },
        {
          bind: "j",
          title: "Scroll down",
          group: "Skills",
          run: () => {
            if (picker?.screen() === "details") picker.scrollDetails(1)
            else return false
          },
        },
        {
          bind: "tab",
          title: "Next action",
          group: "Skills",
          run: () => {
            if (picker?.screen() === "list") picker.focusAction(1)
          },
        },
        {
          bind: "shift+tab",
          title: "Previous action",
          group: "Skills",
          run: () => {
            if (picker?.screen() === "list") picker.focusAction(-1)
          },
        },
        {
          bind: "return",
          title: "Select",
          group: "Skills",
          run: () => {
            if (picker?.screen() === "list") picker.submit()
          },
        },
        {
          bind: "space",
          title: "Activate skill",
          group: "Skills",
          run: () => {
            if (!picker) return
            // Space activates — except while a search is being typed (see
            // spaceTypesIntoQuery): returning false lets the key flow on to
            // the focused input instead of activating.
            if (spaceTypesIntoQuery(picker.screen(), picker.focusedAction(), picker.hasQuery()))
              return false
            picker.submit()
          },
        },
        {
          bind: "f5",
          title: "Skill details",
          group: "Skills",
          run: () => {
            if (picker?.screen() === "list") picker.showDetails()
          },
        },
        {
          bind: "escape",
          title: "Back",
          group: "Skills",
          run: () => (picker?.screen() === "details" ? picker.goBack() : picker?.close()),
        },
      ],
    }))

    // One dialog owns the list AND the details view. "Back" is a view switch
    // inside that dialog, so search text, selection and scroll position all
    // survive the round trip. All picker state lives in this closure, never
    // inside the dialog render callback: the callback is re-invoked when the
    // dialog provider re-renders, and state kept inside it would reset
    // mid-interaction (the details view would flash and be replaced by a
    // fresh list). The details shortcut is `f5`, not a letter: the keymap
    // consumes a bound key before the focused input sees it, so a `d` bind
    // would make that letter untypeable in search ("durable-objects" would
    // be unsearchable), and a command can't reliably tell "typing d" from
    // "pressing d for details". `ctrl+d` and `alt+d` are both taken by
    // builtins (app.exit, input.delete, input.delete.word.forward), and
    // binding ctrl+d in a plugin layer proved unstable — the details view
    // opened on its own. `f5` is unclaimed and can't collide with typing.
    // The action also lives on a clickable, tab-focusable action row.
    const openPicker = async (sessionID: string) => {
      if (pickerOpen()) return
      const catalog = catalogAt(sessionID)
      if (catalog.length === 0) {
        context.ui.toast.show({ message: "No skills available" })
        return
      }
      const initial = await fetchActive(sessionID).catch(() => new Set<string>())
      const initialUsage = await fetchUsage(sessionID).catch((): Record<string, SkillUsage> => ({}))
      // Actives first, then used skills lead within each group, most
      // recent first. Preselect the first idle skill: activating something
      // new is the picker's main job.
      const ordered = sortByUsage(catalog, initial, initialUsage)
      const firstIdle = Math.max(0, ordered.findIndex((skill) => !initial.has(skill.id)))

      const [active, setActive] = createSignal<ReadonlySet<string>>(new Set(initial))
      const [query, setQuery] = createSignal("")
      const [selected, setSelected] = createSignal(firstIdle)
      const [focusedAction, setFocusedAction] = createSignal<number | undefined>(undefined)
      const [screen, setScreen] = createSignal<"list" | "details">("list")
      const [detailsFor, setDetailsFor] = createSignal<SkillInfo | undefined>()

      const filtered = createMemo(() => filterSkills(ordered, query()))

      // Reset the selection when the query changes.
      let lastQuery = query()
      const typeQuery = (value: string) => {
        setQuery(value)
        if (value === lastQuery) return
        lastQuery = value
        setSelected(0)
        setFocusedAction(undefined)
      }

      let list: ScrollBoxRenderable | undefined
      let details: ScrollBoxRenderable | undefined
      let restoreScroll: number | undefined

      // Usage is a snapshot at picker open: the model never runs while
      // the user browses, so no live subscription is needed here.
      const statusOf = (skill: SkillInfo) => statusLabel(skill, active(), initialUsage[skill.id])

      const activate = (skill: SkillInfo | undefined) => {
        if (!skill || active().has(skill.id)) return
        setActive(new Set(active()).add(skill.id))
        void inject(sessionID, skill)
      }

      const close = () => context.ui.dialog.clear()

      const scrollToSelection = (index: number) => {
        if (!list) return
        const target = list.getChildren()[index]
        if (!target) return
        const y = target.y - list.y
        if (y >= list.height) list.scrollBy(y - list.height + 1)
        if (y < 0) list.scrollBy(y)
      }

      const moveTo = (next: number) => {
        const count = filtered().length
        if (count === 0) return
        const index = Math.max(0, Math.min(count - 1, next))
        if (index === selected()) return
        setSelected(index)
        setFocusedAction(undefined)
        scrollToSelection(index)
      }

      const focusAction = (delta: 1 | -1) => {
        setFocusedAction((index) => {
          if (index === undefined) return delta === 1 ? 0 : ACTIONS.length - 1
          const next = index + delta
          return next < 0 || next >= ACTIONS.length ? undefined : next
        })
      }

      const showDetails = () => {
        const skill = filtered()[selected()]
        if (!skill) return
        // scrollTop is the scroll offset; `.y` here would be the scrollbox's
        // layout position and would restore the wrong row on return.
        restoreScroll = list?.scrollTop ?? 0
        setDetailsFor(skill)
        setFocusedAction(undefined)
        setScreen("details")
      }

      // True back: the list view remounts with the exact query, selection
      // and scroll position it had before details opened.
      const goBack = () => {
        setScreen("list")
        setDetailsFor(undefined)
      }

      const activateSelected = () => {
        const skill = filtered()[selected()]
        if (!skill) return
        activate(skill)
        close()
      }

      const submit = () => {
        const index = focusedAction()
        if (index !== undefined) {
          ACTIONS[index].run()
          return
        }
        activateSelected()
      }

      // Clicking a row — or pressing space/enter — IS the activate. Details
      // and close are the remaining footer actions. All three render as
      // clickable keycaps; none of them resume the model (activate only
      // appends the skill to the session context).
      const ACTIONS = [
        { title: "activate", bind: "space", run: activateSelected },
        { title: "details", bind: "f5", run: showDetails },
        { title: "close", bind: "esc", run: close },
      ]

      picker = {
        screen,
        move: (delta) => moveTo(selected() + delta),
        moveTo,
        last: () => moveTo(filtered().length - 1),
        focusAction,
        focusedAction,
        hasQuery: () => query().length > 0,
        submit,
        goBack,
        close,
        showDetails: () => showDetails(),
        scrollDetails: (delta) => details?.scrollBy(delta),
        // Half a viewport, matching ScrollBar's own pageup/pagedown.
        scrollDetailsPage: (direction) => details?.scrollBy(direction * 0.5, "viewport"),
        scrollDetailsTo: (where) =>
          details?.scrollTo(where === "top" ? 0 : details.scrollHeight),
      }
      setPickerOpen(true)

      context.ui.dialog.show(
        () => {
          const dims = useTerminalDimensions()
          return (
            <Show
              when={screen() === "list"}
              fallback={
                <Show when={detailsFor()}>
                  {(skill) => {
                    const description = skill().description ?? "No description"
                    // The scrollbox hugs the wrapped text and only caps at
                    // half the terminal: the wrap width is whatever the dialog
                    // actually renders at, with no width guesswork that could
                    // disagree with reality at other terminal sizes.
                    const rows = Math.max(3, Math.floor(dims().height / 2) - 6)
                    return (
                      <box
                        gap={1}
                        paddingBottom={1}
                        paddingLeft={4}
                        paddingRight={4}
                        width="100%"
                        alignItems="stretch"
                      >
                        <box flexDirection="row" justifyContent="space-between">
                          <box flexDirection="row" gap={1}>
                            <text fg={theme().text.base}>
                              <b>{skill().name}</b>
                            </text>
                            <text
                              fg={
                                active().has(skill().id)
                                  ? theme().text.feedback.success.base
                                  : theme().text.muted
                              }
                            >
                              {active().has(skill().id) ? "Active" : "idle"}
                            </text>
                          </box>
                          <box onMouseUp={goBack} paddingLeft={1} paddingRight={1}>
                            <text fg={theme().text.base}>back</text>
                          </box>
                        </box>
                        <scrollbox
                          maxHeight={rows}
                          scrollbarOptions={{ visible: false }}
                          scrollAcceleration={wheelScroll}
                          ref={(r: ScrollBoxRenderable) => (details = r)}
                        >
                          <text fg={theme().text.muted}>{description}</text>
                        </scrollbox>
                        <text fg={theme().text.muted} wrapMode="none" truncate>
                          {skill().path ?? ""}
                        </text>
                        <box flexDirection="row" alignItems="center" gap={3}>
                          <box flexDirection="row" onMouseUp={activateSelected}>
                            <Keycap k="space" label="activate" />
                          </box>
                          <box flexDirection="row" onMouseUp={goBack}>
                            <Keycap k="esc" label="back" />
                          </box>
                          {/* /btw-style scroll hint, plain text: j/k and the
                              arrows scroll here because this view has no input. */}
                          <text fg={theme().text.muted}>j/k ↑/↓ scroll</text>
                        </box>
                      </box>
                    )
                  }}
                </Show>
              }
            >
              <box
                gap={1}
                paddingBottom={1}
                flexGrow={1}
                width="100%"
                alignItems="stretch"
              >
                <box paddingLeft={4} paddingRight={4}>
                  <box flexDirection="row" justifyContent="space-between">
                    <text fg={theme().text.base}>
                      <b>Skills</b>
                    </text>
                    <text fg={theme().text.muted}>esc</text>
                  </box>
                  <box paddingTop={1}>
                    <input
                      onInput={(value) => typeQuery(value)}
                      focusedBackgroundColor={theme().background.formfield.focused}
                      cursorColor={theme().text.formfield.focused}
                      focusedTextColor={theme().text.formfield.focused}
                      placeholder="Search skills"
                      placeholderColor={theme().text.muted}
                      ref={(r) => {
                        // Re-seed on remount so a provider re-render or a
                        // return from details restores the query text.
                        r.value = query()
                        setTimeout(() => {
                          if (!r.isDestroyed) r.focus()
                        }, 1)
                      }}
                    />
                  </box>
                </box>
                <Show
                  when={filtered().length > 0}
                  fallback={
                    <box paddingLeft={4}>
                      <text fg={theme().text.muted}>
                        {query() ? "No results found" : "No skills available"}
                      </text>
                    </box>
                  }
                >
                  <scrollbox
                    paddingLeft={1}
                    // The hidden bar reclaims its column, so the right padding
                    // grows 2→3 to keep the status text flush-aligned with the
                    // "esc" header exactly as before, never touching the edge.
                    paddingRight={3}
                    maxHeight={Math.min(filtered().length, Math.max(3, Math.floor(dims().height / 2) - 6))}
                    scrollbarOptions={{ visible: false }}
                    scrollAcceleration={wheelScroll}
                    ref={(r: ScrollBoxRenderable) => {
                      list = r
                      if (restoreScroll !== undefined) {
                        const y = restoreScroll
                        restoreScroll = undefined
                        setTimeout(() => {
                          if (!r.isDestroyed) r.scrollTo(y)
                        }, 1)
                      }
                    }}
                  >
                    <For each={filtered()}>
                      {(skill, index) => {
                        const isActive = () => active().has(skill.id)
                        const isSelected = () => index() === selected()
                        return (
                          <box
                            flexDirection="row"
                            gap={1}
                            paddingLeft={3}
                            paddingRight={1}
                            minWidth={0}
                            backgroundColor={isSelected() ? theme().background.action.primary.focused : undefined}
                            onMouseMove={() => moveTo(index())}
                            onMouseUp={() => {
                              moveTo(index())
                              submit()
                            }}
                          >
                            <text
                              flexShrink={0}
                              fg={isActive() ? theme().text.feedback.success.base : theme().text.muted}
                            >
                              {isActive() ? "●" : "○"}
                            </text>
                            <text
                              fg={
                                isSelected()
                                  ? theme().text.action.primary.focused
                                  : theme().text.muted
                              }
                              wrapMode="none"
                              truncate
                              flexGrow={1}
                              flexShrink={1}
                              minWidth={0}
                            >
                              {skill.name}
                            </text>
                            <text
                              flexShrink={0}
                              fg={
                                isSelected()
                                  ? theme().text.action.primary.focused
                                  : isActive()
                                    ? theme().text.feedback.success.base
                                    : theme().text.muted
                              }
                            >
                              {statusOf(skill)}
                            </text>
                          </box>
                        )
                      }}
                    </For>
                  </scrollbox>
                </Show>
                <box flexDirection="row" alignItems="center" paddingLeft={4} gap={3}>
                  <For each={ACTIONS}>
                    {(action, index) => {
                      const focused = () => focusedAction() === index()
                      return (
                        <box
                          flexDirection="row"
                          backgroundColor={focused() ? theme().background.action.primary.focused : undefined}
                          onMouseMove={() => setFocusedAction(index())}
                          onMouseUp={() => action.run()}
                        >
                          <Keycap k={action.bind} label={action.title} focused={focused()} />
                        </box>
                      )
                    }}
                  </For>
                </box>
              </box>
            </Show>
          )
        },
        () => {
          picker = undefined
          setPickerOpen(false)
        },
      )
      // Medium is a fixed 60 columns; large (88) gives the list, the status
      // column and the details text room to breathe, and the dialog clamps
      // itself to the terminal width when the terminal is smaller.
      context.ui.dialog.set({ size: "large" })
    }

    // One tracking instance per rendered surface. Refreshes on the native
    // skill activation event and after our own dialog injects.
    const trackActive = (sessionID: string) => {
      const [ids, setIds] = createSignal<ReadonlySet<string>>(new Set())
      const refresh = () => {
        fetchActive(sessionID)
          .then(setIds)
          .catch((error) => console.error("Failed to load active skills", error))
      }
      refresh()
      const stop = context.data.listen(({ details }) => {
        if (details.type === "session.skill.activated") refresh()
      })
      onCleanup(stop)
      return ids
    }

    // Usage tracking per rendered surface. Initial state comes from the
    // transcript scan; live increments arrive on session.tool.success.
    // The tool events carry no tool name (verified against the protocol
    // schema), so each event resolves its finished call through the
    // reactive message cache and counts only `skill` calls. Anything
    // unresolvable falls back to a full rescan.
    const trackUsage = (sessionID: string) => {
      const [usage, setUsage] = createSignal<Record<string, SkillUsage>>({})
      const refresh = () => {
        fetchUsage(sessionID)
          .then(setUsage)
          .catch((error) => console.error("Failed to load skill usage", error))
      }
      refresh()
      const stop = context.data.listen(({ details }) => {
        if (details.type !== "session.tool.success") return
        const data = details.data as
          | { sessionID?: unknown; assistantMessageID?: unknown; id?: unknown }
          | undefined
        if (!data || data.sessionID !== sessionID) return
        if (typeof data.assistantMessageID !== "string" || typeof data.id !== "string") {
          refresh()
          return
        }
        const message = context.data.session.message?.get?.(
          sessionID,
          data.assistantMessageID,
        ) as UsageMessage | undefined
        const part = message?.content?.find((entry) => entry?.id === data.id)
        if (!message || !part) {
          refresh()
          return
        }
        if (part.type !== "tool" || part.name !== "skill") return
        const input = part.state?.input
        const id =
          typeof input?.id === "string" && input.id
            ? input.id
            : typeof part.state?.metadata?.name === "string" && part.state.metadata.name
              ? part.state.metadata.name
              : undefined
        if (!id) return
        const at = Date.now()
        setUsage((prev) => {
          const seen = prev[id]
          return {
            ...prev,
            [id]: seen
              ? { count: seen.count + 1, usedAt: Math.max(seen.usedAt, at) }
              : { count: 1, usedAt: at },
          }
        })
      })
      onCleanup(stop)
      return usage
    }

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "skills.search",
          title: "Search skills",
          group: "Skills",
          bind: "ctrl+alt+s",
          palette: true,
          run: () => {
            const route = context.ui.router.current()
            if (route.type !== "session") {
              context.ui.toast.show({ message: "Open a session to use skills" })
              return
            }
            void openPicker(route.sessionID)
          },
        },
      ],
    }))

    // Persistent green active-count by the prompt, visible even with the
    // sidebar collapsed. Clicking it opens the picker.
    context.ui.slot({
      append: "prompt.footer.status",
      render: (slot) => {
        if (!slot.sessionID) return null
        const sessionID = slot.sessionID
        const active = trackActive(sessionID)
        return (
          <box onMouseUp={() => void openPicker(sessionID)}>
            <Show
              when={active().size > 0}
              fallback={<text fg={theme().text.muted}>no skills active</text>}
            >
              <text fg={theme().text.feedback.success.base}>{active().size} skills active</text>
            </Show>
          </box>
        )
      },
    })

    context.ui.slot({
      append: "sidebar.content",
      render: (slot) => {
        const sessionID = slot.sessionID
        const session = createMemo(() => context.data.session.get(sessionID))
        const location = () => session()?.location ?? context.data.location.default()

        const catalog = createMemo(
          () => (context.data.location.skill.list(location()) ?? []) as unknown as SkillInfo[],
        )
        const ids = trackActive(sessionID)
        const usage = trackUsage(sessionID)

        const activeSkills = createMemo(() => catalog().filter((skill) => ids().has(skill.id)))
        // One inline pool: attached plus used-only, sorted by usage. Used
        // skills lead, most recent first. Unused skills keep catalog order.
        // The empty group set means no group split: pure usage order. The
        // list moves every time the model reads a skill.
        const inlinePool = createMemo(() => {
          const seen = usage()
          return sortByUsage(
            catalog().filter((skill) => ids().has(skill.id) || seen[skill.id]),
            new Set<string>(),
            seen,
          )
        })
        // Inline used-only rows are shown, so they leave the idle count.
        const idleCount = createMemo(
          () => catalog().filter((skill) => !ids().has(skill.id) && !usage()[skill.id]).length,
        )
        // The cap covers the whole pool: fresh reads push stale rows past
        // it, and the "More skills" row keeps the true totals.
        // One row model per inline row, read inside a single memo so a
        // usage update recomputes every badge in one pass.
        const inlineRows = createMemo(() => {
          const seen = usage()
          return inlinePool()
            .slice(0, MAX_ACTIVE_ROWS)
            .map((skill) => ({ skill, attached: ids().has(skill.id), usage: seen[skill.id] }))
        })
        const overflowCount = createMemo(() => Math.max(0, inlinePool().length - MAX_ACTIVE_ROWS))
        // The active total joins only when attached rows fold past the cap.
        const attachedShown = createMemo(() => inlineRows().filter((row) => row.attached).length)
        const showActiveTotal = createMemo(() => activeSkills().length > attachedShown())

        return (
          <Show when={catalog().length > 0}>
            <box>
              <box flexDirection="row" gap={1} onMouseDown={() => setOpen(!view.open)}>
                <text fg={theme().text.base}>{view.open ? "▼" : "▶"}</text>
                <text fg={theme().text.base}>
                  <b>Skills</b>
                  <Show when={!view.open}>
                    <span style={{ fg: theme().text.muted }}>
                      {" "}
                      ({activeSkills().length} active · {idleCount()} idle)
                    </span>
                  </Show>
                </text>
              </box>
              <Show when={view.open}>
                <For each={inlineRows()}>
                  {(row) => <SkillRow skill={row.skill} attached={row.attached} usage={row.usage} />}
                </For>
                {/* Idle count stays as terse as ever; the active total joins
                    it only when rows are hidden past the cap, so the common
                    case renders exactly as before. */}
                <box flexDirection="row" gap={1} onMouseUp={() => void openPicker(sessionID)}>
                  <text fg={theme().text.muted}>More skills</text>
                  <Show when={idleCount() > 0 || overflowCount() > 0}>
                    <text fg={theme().text.muted}>
                      ({idleCount()} idle
                      <Show when={showActiveTotal()}> · {activeSkills().length} active</Show>)
                    </text>
                  </Show>
                </box>
              </Show>
            </box>
          </Show>
        )
      },
    })
  },
})
