/** @jsxImportSource @opentui/solid */
import { InputRenderable, ScrollBoxRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/solid"
import { Plugin, PluginContextProvider } from "@opencode/plugin/tui"
import type { JSX } from "@opentui/solid"
import { createSignal, For } from "solid-js"
import plugin from "../index"

export interface SkillFixture {
  id: string
  name: string
  description?: string
  autoinvoke?: boolean
  path?: string
}

export const defaultSkills: SkillFixture[] = [
  {
    id: "cold-email",
    name: "cold-email",
    description: "Write B2B cold emails and follow-up sequences that get replies.",
    path: "/skills/cold-email/SKILL.md",
  },
  {
    id: "accessibility",
    name: "accessibility",
    description: "Audit web accessibility following WCAG 2.2 guidelines.",
    path: "/skills/accessibility/SKILL.md",
  },
  {
    id: "ads",
    name: "ads",
    description: "Paid advertising campaigns on Google Ads and Meta.",
    autoinvoke: false,
    path: "/skills/ads/SKILL.md",
  },
  {
    id: "ponytail",
    name: "ponytail",
    description: "The laziest solution that actually works.",
    path: "/skills/ponytail/SKILL.md",
  },
]

// Every token path the plugin reads. Undefined values are safe (the prop is
// simply unset); missing paths are not (a lookup would throw mid-render).
const mockTheme = {
  text: {
    base: "#e8ebee",
    muted: "#a4acb6",
    action: { primary: { focused: "#0c0e11" } },
    feedback: { success: { base: "#33b36b" } },
    formfield: { focused: "#e8ebee" },
  },
  background: {
    action: { primary: { focused: "#8fadc4" } },
    raised: { base: "#1a1e24" },
    formfield: { focused: "#262b33" },
  },
  hue: { accent: { 200: "#8fadc4", 300: "#7d9cb1" } },
}

interface FixtureCommand {
  bind?: string
  run: () => unknown
}
interface FixtureLayer {
  mode?: string
  commands?: FixtureCommand[]
}

export interface Fixture {
  app: TestRendererSetup
  /** Find a registered keymap command by its binding, as the host would dispatch it. */
  command: (bind: string) => FixtureCommand | undefined
  /** Dispatch a registered keymap command by binding; returns what run() returned. */
  run: (bind: string) => unknown
  /** Focus the dialog's search input so typeText reaches it. */
  focusInput: () => boolean
  /** Every mounted scrollbox in render order (list and/or details). */
  scrollboxes: () => ScrollBoxRenderable[]
  injects: Array<{ sessionID: string; id: string; resume?: boolean }>
  toasts: Array<{ message: string; variant?: string }>
  skills: SkillFixture[]
  active: string[]
  /** Emit the native session.skill.activated event to all data.listen handlers. */
  emitActivation: () => void
  /** Seed the reactive message cache so a tool event can resolve its part. */
  seedToolMessage: (messageID: string, message: unknown) => void
  /** Emit a native session.tool.success event to all data.listen handlers. */
  emitToolSuccess: (data: unknown) => void
}

export interface UsageFixture {
  id: string
  count: number
  usedAt: number
}

export async function mountPlugin(
  options: {
    skills?: SkillFixture[]
    active?: string[]
    usage?: UsageFixture[]
    width?: number
    height?: number
  } = {},
): Promise<Fixture> {
  const sessionID = "ses_test"
  const skills = options.skills ?? defaultSkills
  const active = [...(options.active ?? ["ads"])]
  // Synthesized assistant messages: each use is one completed `skill`
  // tool call, shaped like the real transcript rows the scan reads.
  const assistant = (options.usage ?? []).map((use, index) => ({
    id: `msg_usage_${index}`,
    time: { created: use.usedAt },
    content: Array.from({ length: use.count }, (_, call) => ({
      type: "tool",
      id: `call_${use.id}_${call}`,
      name: "skill",
      state: { status: "completed", input: { id: use.id } },
      time: { created: use.usedAt },
    })),
  }))
  // Seeded message cache for live tool events to resolve their part.
  const toolMessages: Record<string, unknown> = {}

  const injects: Fixture["injects"] = []
  const toasts: Fixture["toasts"] = []
  const layerFactories: Array<() => FixtureLayer> = []
  const slotClaims: Array<{ append?: string; render: (input: never) => JSX.Element }> = []
  const listeners: Array<(event: { details: { type: string; data?: unknown } }) => void> = []

  const [dialogRender, setDialogRender] = createSignal<(() => JSX.Element) | undefined>()
  const [dialogSize, setDialogSize] = createSignal<string | undefined>()
  let dialogOnClose: (() => void) | undefined

  const context = {
    theme: mockTheme,
    themeMode: "dark",
    storage: {
      store: (_key: string, options: { initial: object }) => {
        const value = structuredClone(options.initial) as Record<string, unknown>
        return [value, async (mutation: (draft: Record<string, unknown>) => void) => mutation(value)]
      },
      memory: (_key: string, options: { initial: object }) => {
        const value = structuredClone(options.initial) as Record<string, unknown>
        return [value, (mutation: (draft: Record<string, unknown>) => void) => mutation(value)]
      },
    },
    data: {
      listen: (handler: (event: { details: { type: string } }) => void) => {
        listeners.push(handler)
        return () => {}
      },
      session: {
        get: () => undefined,
        message: {
          list: () => [],
          get: (_sessionID: string, messageID: string) => toolMessages[messageID],
        },
      },
      location: {
        default: () => "/skills",
        skill: { list: () => skills },
      },
    },
    client: {
      message: {
        list: async (input?: { type?: string }) =>
          input?.type === "assistant"
            ? { data: assistant }
            : { data: active.map((id) => ({ skill: id })) },
      },
      session: {
        skill: async (input: { sessionID: string; id: string; resume?: boolean }) => {
          injects.push(input)
        },
      },
    },
    keymap: {
      layer: (factory: () => FixtureLayer) => {
        layerFactories.push(factory)
      },
    },
    ui: {
      dialog: {
        show: (render: () => JSX.Element, onClose?: () => void) => {
          dialogOnClose = onClose
          setDialogRender(() => render)
        },
        set: (options: { size?: string }) => setDialogSize(options.size),
        clear: () => {
          dialogOnClose?.()
          dialogOnClose = undefined
          setDialogRender(undefined)
        },
        alert: async () => undefined,
        confirm: async () => undefined,
        prompt: async () => undefined,
        select: async () => undefined,
      },
      router: { current: () => ({ type: "session", sessionID }) },
      slot: (claim: { append?: string; render: (input: never) => JSX.Element }) => {
        slotClaims.push(claim)
        return () => {}
      },
      toast: {
        show: (toast: { message: string; variant?: string }) => {
          toasts.push(toast)
        },
      },
    },
  }
  const typedContext = context as unknown as Plugin.Context

  await plugin.setup(typedContext)

  const sidebarSlots = () => slotClaims.filter((claim) => claim.append === "sidebar.content")
  const statusSlots = () => slotClaims.filter((claim) => claim.append === "prompt.footer.status")

  const app = await testRender(
    () => (
      <PluginContextProvider value={typedContext}>
        <box flexDirection="column" width="100%" height="100%">
          <box flexDirection="row" gap={4}>
            <For each={sidebarSlots()}>{(claim) => claim.render({ sessionID } as never)}</For>
          </box>
          {dialogRender() && (
            <box width={dialogSize() === "large" ? 88 : 60} flexDirection="column">
              {dialogRender()!()}
            </box>
          )}
          <For each={statusSlots()}>{(claim) => claim.render({ sessionID } as never)}</For>
        </box>
      </PluginContextProvider>
    ),
    { width: options.width ?? 120, height: options.height ?? 40, kittyKeyboard: true },
  )
  app.renderer.start()

  const commands = () => layerFactories.flatMap((factory) => factory().commands ?? [])

  return {
    app,
    command: (bind) => commands().find((entry) => entry.bind === bind),
    run: (bind) => commands().find((entry) => entry.bind === bind)?.run(),
    focusInput: () => {
      const queue: unknown[] = [app.renderer.root]
      while (queue.length > 0) {
        const node = queue.shift() as {
          getChildren?: () => unknown[]
          focus?: () => void
        } | null
        if (!node) continue
        if (node instanceof InputRenderable) {
          node.focus()
          return true
        }
        if (node.getChildren) queue.push(...node.getChildren())
      }
      return false
    },
    scrollboxes: () => {
      // Walk the whole tree (not just a scrollbox's own getChildren, which
      // returns its content children) so nested boxes are traversed too.
      const found: ScrollBoxRenderable[] = []
      const queue: unknown[] = [app.renderer.root]
      while (queue.length > 0) {
        const node = queue.shift() as { getChildren?: () => unknown[] } | null
        if (!node) continue
        if (node instanceof ScrollBoxRenderable) found.push(node)
        if (node.getChildren) queue.push(...node.getChildren())
      }
      return found
    },
    injects,
    toasts,
    skills,
    active,
    emitActivation: () => {
      for (const handler of listeners) handler({ details: { type: "session.skill.activated" } })
    },
    seedToolMessage: (messageID, message) => {
      toolMessages[messageID] = message
    },
    emitToolSuccess: (data) => {
      for (const handler of listeners)
        handler({ details: { type: "session.tool.success", data } })
    },
  }
}
