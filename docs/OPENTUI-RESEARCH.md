# OpenTUI research report — exact component/prop API for an OpenCode V2 sidebar widget

Sources: https://opentui.com/docs (official docs), GitHub `anomalyco/opentui` (the repo is now under
**anomalyco**, formerly `sst/opentui` — `github.com/sst/opentui` redirects), npm registry metadata, and the
published `.d.ts`/bundled JS of `@opentui/solid@0.5.17` and `@opentui/core@0.5.17` (downloaded and read
directly, so prop lists below are quoted from the shipped type declarations, not paraphrased).

Research date: 2026-10-09.

---

## 0. Version / environment facts (important for the plugin's peer deps)

- Latest published versions: `@opentui/core@0.5.17`, `@opentui/solid@0.5.17` (npm registry, 2026-10-09).
- `@opentui/solid@0.5.17` package.json: `"peerDependencies": { "solid-js": "1.9.12" }`.
  Docs: *"**`@opentui/solid` requires `solid-js` 1.9.12 exactly**."*
  ⚠️ Our stated peer range `solid-js >=1.9.0` does **not** match OpenTUI's exact-pin requirement. Any
  solid-js other than 1.9.12 is unsupported by the current binding (1.9.12 is also what it is built/tested
  against: `devDependencies.solid-js: 1.9.12`, `babel-preset-solid: 1.9.12`).
- TypeScript JSX config (docs, "Solid bindings > Setup"):

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "@opentui/solid"
  }
}
```

Bun preload (`bunfig.toml`): `preload = ["@opentui/solid/preload"]`.
A per-file pragma also works and is what real plugins use: `/** @jsxImportSource @opentui/solid */` (first
line of `opencode-footprint/.opencode/plugins/co2-sidebar.tsx`, verbatim).
- In Solid, **multi-word intrinsic names are snake_case**: `<tab_select>`, `<ascii_font>`, `<line_number>`,
  `<qr_code>` (React uses kebab-case). Quote (docs): *"Multi-word intrinsic names use snake_case, such as
  `<ascii_font>` and `<tab_select>`."*
- `@opentui/solid` exports components at `@opentui/solid/components`; other entry points:
  `./preload`, `./bun-plugin`, `./jsx-runtime`, `./runtime-plugin-support`.

---

## 1. Built-in JSX elements and full prop lists

### 1.1 Element inventory (verbatim from `packages/solid/jsx-runtime.d.ts`)

```ts
export declare namespace JSX {
  type Element = SolidJSX.Element

  interface IntrinsicElements extends ExtendedIntrinsicElements<OpenTUIComponents> {
    box: BoxProps
    text: TextProps
    span: SpanProps
    input: InputProps
    select: SelectProps
    ascii_font: AsciiFontProps
    tab_select: TabSelectProps
    scrollbox: ScrollBoxProps
    code: CodeProps
    textarea: TextareaProps
    markdown: MarkdownProps
    image: ImageProps

    b: SpanProps
    strong: SpanProps
    i: SpanProps
    em: SpanProps
    u: SpanProps
    br: {}
    a: LinkProps
  }
  interface ElementChildrenAttribute { children: {} }
}
```

Runtime catalogue (`src/elements/catalogue.d.ts`, `baseComponents`) additionally registers:
`diff`, `line_number` (docs components table: *"`<diff>` is runtime built in. The Solid binding lacks an
exact props declaration."* — same caveat for `<line_number>`; they typecheck only through the
`OpenTUIComponents` index signature).

Registration sources:
- Automatic (built-in): `box`, `text`, `span`, `b`, `strong`, `i`, `em`, `u`, `br`, `a`, `input`, `textarea`,
  `select`, `tab_select`, `scrollbox`, `code`, `markdown`, `image`, `ascii_font`, `line_number`, `diff`.
- Separate registration: `qr_code` → `import { registerQRCode } from "@opentui/qrcode/solid"`;
  `spinner` → `import "opentui-spinner/solid"` (community pkg).
- Custom: `extend({ my_box: MyRenderable })` + `declare module "@opentui/solid" { interface OpenTUIComponents {...} }`.

Solid-only extra props on every element (`ElementProps`, verbatim):

```ts
export type ElementProps<TRenderable = unknown> = {
    ref?: Ref<TRenderable>;
    [eventName: `on:${string}`]: ((...args: any[]) => void) | undefined;
};
```

Every element also accepts `children` and a `style` object:
`style?: Partial<Omit<TOptions, GetNonStyledProperties<...>>>` (see §1.5 for how `style` behaves at runtime).

### 1.2 `<box>` — props (from `@opentui/core` `BoxOptions` + `RenderableOptions`/`LayoutOptions`, verbatim types)

```ts
export interface BoxOptions<TRenderable extends Renderable = BoxRenderable> extends RenderableOptions<TRenderable> {
    backgroundColor?: string | RGBA;
    borderStyle?: BorderStyle;
    border?: boolean | BorderSides[];
    borderColor?: string | RGBA;
    customBorderChars?: BorderCharacters;
    shouldFill?: boolean;
    title?: string;
    titleColor?: string | RGBA;
    titleAlignment?: "left" | "center" | "right";
    bottomTitle?: string;
    bottomTitleAlignment?: "left" | "center" | "right";
    focusedBorderColor?: ColorInput;
    focusable?: boolean;
    gap?: number | `${number}%`;
    rowGap?: number | `${number}%`;
    columnGap?: number | `${number}%`;
}
```

`BorderStyle = "single" | "double" | "rounded" | "heavy"` (only these four; invalid → console warning +
fallback `"single"`).

`BorderSides = "top" | "right" | "bottom" | "left"` → so `border={["left"]}` renders only the left edge
(used verbatim in the official `session.tsx` example).

`customBorderChars` — full custom glyph set (any unicode, e.g. braille/heavy/box-drawing variants;
the 11 fields, verbatim from `lib/border.d.ts`):

```ts
export interface BorderCharacters {
    topLeft: string;
    topRight: string;
    bottomLeft: string;
    bottomRight: string;
    horizontal: string;
    vertical: string;
    topT: string;
    bottomT: string;
    leftT: string;
    rightT: string;
    cross: string;
}
```

Border glyphs per style (docs, verbatim):
`single ┌─┐│└─┘`, `double ╔═╗║╚═╝`, `rounded ╭─╮│╰─╯`, `heavy ┏━┓┃┗━┛`.

Shared layout props on `<box>` (`LayoutOptions` / `RenderableOptions`, exact accepted values):

| Prop | Type | Default |
| --- | --- | --- |
| `width`, `height` | `number \| "auto" \| \`${number}%\`` | `"auto"` |
| `minWidth`, `minHeight`, `maxWidth`, `maxHeight` | `number \| "auto" \| \`${number}%\`` (runtime ignores `"auto"` for these) | unset |
| `position` | `"relative" \| "absolute"` (`"static"` typed but not implemented) | `"relative"` |
| `top`, `right`, `bottom`, `left` | `number \| "auto" \| \`${number}%\`` | unset |
| `margin`, `marginX`, `marginY`, `marginTop`, `marginRight`, `marginBottom`, `marginLeft` | `number \| "auto" \| \`${number}%\`` | `0` |
| `padding`, `paddingX`, `paddingY`, `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft` | `number \| \`${number}%\`` | `0` |
| `flexGrow` | `number` | `0` |
| `flexShrink` | `number` | `0` for numeric initial dimension, else `1` |
| `flexBasis` | `number \| "auto"` | `"auto"` |
| `flexDirection` | `"column" \| "column-reverse" \| "row" \| "row-reverse"` | `"column"` |
| `flexWrap` | `"no-wrap" \| "wrap" \| "wrap-reverse"` | `"no-wrap"` |
| `alignItems`, `alignSelf` | `"auto" \| "flex-start" \| "center" \| "flex-end" \| "stretch" \| "baseline" \| "space-between" \| "space-around" \| "space-evenly"` | `stretch` / `auto` |
| `justifyContent` | `"flex-start" \| "flex-end" \| "center" \| "space-between" \| "space-around" \| "space-evenly"` (no `"auto"`, `"stretch"`, `"baseline"`) | `"flex-start"` |
| `gap`, `rowGap`, `columnGap` (Box only) | `number \| \`${number}%\`` | `0` |
| `overflow` | `"visible" \| "hidden" \| "scroll"` | `"visible"` |
| `zIndex` | `number` | – |
| `visible` | `boolean` | – |
| `opacity` | `number` | – |
| `id` | `string` | – |

Box-specific extras (docs "Properties" table, verbatim): `border: boolean` default `false`;
`borderStyle` default `"single"`; `borderColor` default `#FFFFFF`; `backgroundColor` default `transparent`;
`title` / `titleColor` (default = borderColor) / `titleAlignment` (default `"left"`);
`bottomTitle` / `bottomTitleAlignment` (default `"left"`); `padding` default `0`; `flexDirection` default
`"column"`; `justifyContent` default `"flex-start"`; `alignItems` default `"stretch"`.

Title alignment renders (docs verbatim):
`titleAlignment: "left" | "center" | "right"` → `┌─ Title ────────┐`, `┌──── Title ─────┐`, `┌────────── Title ┐`.

Mouse/keyboard event props accepted as direct JSX props (they are setters on `Renderable`, so the
reconciler's default branch assigns them):
`onMouse`, `onMouseDown`, `onMouseUp`, `onMouseMove`, `onMouseDrag`, `onMouseDragEnd`, `onMouseDrop`,
`onMouseOver`, `onMouseOut`, `onMouseScroll`, `onPaste`, `onKeyDown`, `onSizeChange`, plus
`on:eventName` (goes through `node.on()/off()`), plus Solid `<box>`-only `focused?: boolean`
(calls `node.focus()` / `node.blur()`).

### 1.3 `<text>` — props (verbatim from `TextOptions` → `TextBufferOptions`)

```ts
export interface TextBufferOptions extends RenderableOptions<TextBufferRenderable> {
    fg?: string | RGBA;
    bg?: string | RGBA;
    selectionBg?: string | RGBA;
    selectionFg?: string | RGBA;
    selectable?: boolean;
    attributes?: number;
    wrapMode?: "none" | "char" | "word";
    textAlign?: "left" | "center" | "right";
    tabIndicator?: string | number;
    tabIndicatorColor?: string | RGBA;
    truncate?: boolean;
}
export interface TextOptions extends TextBufferOptions {
    content?: StyledText | string;
}
```

Defaults (from `_defaultOptions` in `TextBufferRenderable.d.ts` and the docs table):
`fg #FFFFFF`, `bg transparent`, `attributes 0`, `selectable true`, `wrapMode "word"`,
`textAlign "left"`, `truncate false`.

Docs properties table (verbatim rows): `content: string | StyledText` default `""`;
`fg: string | RGBA` default `#FFFFFF`; `bg: string | RGBA` default transparent;
`attributes: TextAttributes` default `0`; `selectable: boolean` default `true`;
`wrapMode: "none" | "char" | "word"` default `"word"`;
`textAlign: "left" | "center" | "right"` default `"left"`;
`position: "relative" | "absolute"`; `left/top/right/bottom: number | "auto" | "{number}%"`.

**Wrap/overflow behavior** (docs, verbatim): *"Wrapping runs first. Then `textAlign` pads each rendered
line."* — `"none"` keeps intrinsic line width; `"char"`/`"word"` can increase measured height under a width
constraint. There is no CSS-style `overflow-wrap`; for single-line labels in a sidebar use
`wrapMode="none"` + `truncate={true}` (truncate is a real shipped prop: it stops the line at the width).
Also `textAlign` only pads inside the text width — *"Alignment has no effect when every line already fills
the text width."*

**Text attributes** (`TextAttributes` const in `@opentui/core`, verbatim):
`NONE, BOLD, DIM, ITALIC, UNDERLINE, BLINK, INVERSE, HIDDEN, STRIKETHROUGH` — combine with bitwise OR:

```ts
attributes: TextAttributes.BOLD | TextAttributes.UNDERLINE
```

or the helper (verbatim signature):
`createTextAttributes({ bold?, italic?, underline?, dim?, blink?, inverse?, reverse?, hidden?, strikethrough? }): number`.

**Inline elements inside `<text>`** (docs, verbatim): *"React and Solid can compose inline `<span>`,
`<b>`, `<strong>`, `<i>`, `<em>`, `<u>`, `<br>`, and `<a href>` elements inside `<text>`. They are
text-only children. They cannot mount directly under a Box or another layout element."*
Attempting to mount a text node under a box throws at runtime (source):
`Orphan text error: "…" must have a <text> as a parent`.

`<span>` props: `SpanProps = ComponentProps<{}, TextNodeRenderable> & { children? }`;
`TextNodeOptions = { fg?, bg?, attributes?, link?: { url: string } }`;
`<a>` adds `href: string` (reconciler maps `href` → `node.link = { url }`, i.e. OSC 8 hyperlink).

⚠️ **Runtime caveat, read from the shipped reconciler (`@opentui/solid/index.js`, 0.5.17).**
For text-node elements (`span`, `b`, `strong`, `i`, `em`, `u`, `a`) `setProperty` only honors two props:

```js
if (isTextNodeRenderable(node)) {
  if (name === "href") { node.link = { url: value }; return; }
  if (name === "style") {
    node.attributes |= createTextAttributes(value);
    node.fg = value.fg ? parseColor(value.fg) : node.fg;
    node.bg = value.bg ? parseColor(value.bg) : node.bg;
    return;
  }
  return;   // every other prop on a text node is silently ignored
}
```

and `createTextAttributes(value)` only reads the **boolean** keys
(`bold, italic, underline, dim, blink, inverse, reverse, hidden, strikethrough`).
Consequences:
- Use `style={{ fg: …, bg: …, bold: true }}` on spans. This is exactly what the official examples do.
- A direct `fg=` / `attributes=` prop on `<span>` is **ignored** (not confirmed as intended; source says so).
- `style={{ attributes: TextAttributes.UNDERLINE }}` on a *span* ORs `0` (no-op) — the official
  `text-style-demo.tsx` writes this, but per source it has no effect on a span. On `<text>` (a real
  Renderable, not a text node) `style.attributes` **does** work because style keys are assigned directly
  (`node[prop] = propVal`). Mark: **behavior confirmed from source, intent not confirmed.**
- Safe alternatives for underline/bold inside one `<text>`: `<u>`, `<b>`, `<strong>` wrappers, or
  `<text style={{…}}>` for whole-text styling.

### 1.4 `<scrollbox>` — props (`ScrollBoxOptions extends BoxOptions`, verbatim)

```ts
rootOptions?: BoxOptions;
wrapperOptions?: BoxOptions;
viewportOptions?: BoxOptions;
contentOptions?: BoxOptions;
scrollbarOptions?: Omit<ScrollBarOptions, "orientation">;
verticalScrollbarOptions?: Omit<ScrollBarOptions, "orientation">;
horizontalScrollbarOptions?: Omit<ScrollBarOptions, "orientation">;
stickyScroll?: boolean;
stickyStart?: "bottom" | "top" | "left" | "right";
scrollX?: boolean;      // default false
scrollY?: boolean;      // default true
scrollAcceleration?: ScrollAcceleration;
viewportCulling?: boolean; // default true
```
Solid adds `focused?`, `stickyScroll?`, `stickyStart?` to `ScrollBoxProps`. Methods (Core):
`scrollBy(delta, unit?)`, `scrollTo(pos)`, `scrollChildIntoView(id)`, `scrollTop`/`scrollLeft` getters.

`ScrollBarOptions` (verbatim): `{ orientation, showArrows?, arrowOptions?, trackOptions?: Partial<SliderOptions>, onChange? }`,
`ArrowOptions` includes `arrowChars?: { up?, down?, left?, right? }` (custom unicode arrows) and
`foregroundColor`/`backgroundColor`/`attributes`.

### 1.5 How props are applied (reconciler, verbatim behavior)

- Every non-special prop is written straight onto the instance: `default: node[name] = value`.
- `style` (on real renderables): iterates keys and assigns `node[prop] = propVal`, skipping unchanged
  keys. **Removed keys are not reset** (except `image`'s `fit`/`protocol`) — `style` is effectively
  additive, so reset colors explicitly if you toggle them.
- `content`/`text`: coerced to string (`typeof value === "string" ? value : Array.isArray(value) ? value.join("") : String(value)`).
- `focused` → `node.focus()` / `node.blur()`; `id`, `onChange`, `onInput`, `onSubmit`, `onSelect` are
  specially wired to Core events (Select/TabSelect/Input).
- Element creation: `new catalogue[tagName](renderer, { id })` — constructor options beyond `id` do **not**
  come from JSX (docs, verbatim: *"A class that reads a value only from its constructor options does not
  get that value from JSX."*). Relevant only for custom `extend()` renderables.

---

## 2. Color handling — exact accepted formats

Type: `export type ColorInput = string | RGBA;` (all `fg`/`bg`/`*Color` props accept it).

Docs, verbatim:

> Hex strings can use `#RGB`, `#RGBA`, `#RRGGBB`, or `#RRGGBBAA`. Alpha is last and defaults to `255`.
> `"transparent"` produces `[0, 0, 0, 0]`.
> Besides `"transparent"`, `parseColor()` accepts only these color names:
> `black`, `white`, `red`, `green`, `blue`, `yellow`, `cyan`, and `magenta`;
> `silver`, `gray`, `grey`, `maroon`, `olive`, `lime`, `aqua`, `teal`, `navy`, `fuchsia`, `purple`, and `orange`;
> `brightBlack`, `brightRed`, `brightGreen`, `brightBlue`, `brightYellow`, `brightCyan`, `brightMagenta`, and `brightWhite`.
> An invalid string logs a warning and returns opaque magenta. `parseColor()` does not support arbitrary CSS color syntax.

Confirmed in shipped source (`chunk-*.js`):

```js
function parseColor2(color) {
  if (typeof color === "string") {
    const lowerColor = color.toLowerCase();
    if (lowerColor === "transparent") return RGBA2.fromValues(0, 0, 0, 0);
    if (CSS_COLOR_NAMES[lowerColor]) return hexToRgb2(CSS_COLOR_NAMES[lowerColor]);
    return hexToRgb2(color);
  }
  return color;
}
// hexToRgb: strips a leading "#", expands 3/4-digit shorthand,
// rejects anything that isn't 6/8 hex digits → console.warn("Invalid hex color: …, defaulting to magenta")
```

So:
- ✅ Raw hex `"#22c55e"` works everywhere (`fg`, `bg`, `borderColor`, `backgroundColor`, `titleColor`, …).
- ✅ Named colors, **case-insensitive** (`"gray"`, `"brightMagenta"`/`"brightmagenta"`).
- ✅ Alpha hex `#RRGGBBAA`.
- ❌ No `"rgb(1,2,3)"`, no `"hsl(…)"`, no `"rebeccapurple"`, no CSS color keywords — invalid input →
  console warning + opaque magenta `(1,0,1,1)`.
- ❌ **No 256-color index string.** For indexed/ANSI palette colors you must build an `RGBA`:
  `RGBA.fromIndex(0..255)` (throws `RangeError` outside 0–255, intent `"indexed"`), or
  `RGBA.defaultForeground()` / `RGBA.defaultBackground()` (intent `"default"` = terminal default).
- Programmatic construction: `RGBA.fromInts(34, 197, 94)`, `RGBA.fromValues(0.13,0.77,0.37,0.5)`,
  `RGBA.fromHex("#22c55e80")`, `parseColor("#22c55e")`.
- Retained colors are **copied on assignment** (docs): re-assign the property to push a mutation —
  `box.backgroundColor = accent` twice even when the object is the same.

Rich-text style helpers exported from `@opentui/core` (`lib/styled-text.d.ts`, verbatim):
`t` (template tag), `bold`, `italic`, `underline`, `strikethrough`, `dim`, `reverse`, `blink`,
`fg(color)`, `bg(color)`, `link(url)`, and named color wrappers `black…white`, `brightBlack…brightWhite`,
`bgBlack…bgWhite`. Usage (docs verbatim):

```ts
content: t`${bold("Important:")} ${fg("#FF0000")(underline("Warning!"))} Normal text`
```

`TextRenderable.content` accepts `StyledText | string`; in Solid JSX you can also just nest inline
elements or use `style` props (the `t` tag is a Core API — you pass its result as `content={t\`…\`}`).

---

## 3. Fancy extras (spinners, gauges, scrollable lists, decorations)

**Confirmed available:**

1. **Borders / decoration**: 4 border styles incl. `rounded` and `heavy`; partial borders
   (`border={["left"]}` = great for dim separators / quote-style rails); `customBorderChars` with 11
   slots for fully custom glyphs (any unicode — including braille box-drawing — is mechanically possible;
   *braille specifically is not documented or demonstrated → not confirmed*).
   Titles with `title`, `titleColor`, `titleAlignment`, `bottomTitle`, `bottomTitleAlignment` give a
   titled card look.
2. **Dim / bold text**: `attributes={TextAttributes.DIM}`, or `style={{ dim: true }}` inside `<span>`,
   or Core's `t\`${dim("…")}\``. (No `dim` boolean prop exists on `<text>` itself — only `attributes`.)
3. **Spinner — third-party package `opentui-spinner`** (community, `github.com/msmps/opentui-spinner`,
   listed on opentui.com/packages). Solid usage, verbatim from its README:

```tsx
import { render } from "@opentui/solid";
import "opentui-spinner/solid";

function App() {
  return (
    <box alignItems="center" flexDirection="row">
      <spinner name="bouncingBall" color="cyan" />
      <text marginLeft={1}>Loading...</text>
    </box>
  );
}

render(() => <App />);
```

SpinnerOptions (README table, verbatim): `name: SpinnerName` default `"dots"`; `frames?: string[]`;
`interval?: number` (16.67–1000 ms, else `RangeError`); `autoplay?: boolean` default `true`;
`color?: ColorInput | ColorGenerator` default `"white"`; `backgroundColor?: ColorInput` default `"transparent"`.
Color generators: `createPulse(["red","orange","yellow"], speed?)` and `createWave(["#ff0000","#00ff00","#0000ff"])`.
Install: `bun add opentui-spinner @opentui/core @opentui/solid solid-js`. 80+ cli-spinners names
(`dots`, `line`, `arc`, `bouncingBar`, `moon`, …). **Not an official OpenTUI package** — it's in the
community "packages" list, MIT0.

4. **Scrollable lists**: `<scrollbox>` with `stickyScroll` + `stickyStart="bottom"` (auto-follow logs),
   `contentOptions={{ gap: 1 }}`, `scrollbarOptions={{ showArrows, trackOptions: { foregroundColor, backgroundColor } }}`,
   `viewportCulling`. Core-only `ScrollBar`/`Slider`/`TextTable`/`FrameBuffer`/`EmbeddedTerminal` are
   **not exposed as Solid JSX elements** (components table: "Unavailable" for React/Solid) — you can still
   `extend()` them (typing via `OpenTUIComponents`).
5. **Big display text**: `<ascii_font>` (`ASCIIFontRenderable`, bundled ASCII-art fonts).
6. **Rich content**: `<code>` (syntax highlighting; bundled grammars JS/JSX/TS/TSX/Markdown/Zig),
   `<markdown>`, `<diff>`, `<line_number>`, `<image>`, `<qr_code>` (needs `@opentui/qrcode/solid`).
7. **Animation**: `useTimeline(options?)` Solid hook → Core `Timeline` (easing functions, engine) for
   animated progress/decorations; `onMount`+`setInterval` is what the official demos actually use.
8. **Overlays**: `<Portal mount={renderer.root}>` for floating panels; `<Dynamic>` for conditional tags.

**Not found / not confirmed:**
- **No built-in gauge/progress-bar renderable.** Grep of `@opentui/core` renderables found only
  `Slider`, `ScrollBar`, `ArrowRenderable` — no `Gauge`/`ProgressBar` class. Progress bars are built by
  sizing a filled `<box>` next to an empty one (standard TUI pattern). *No official example of this found → not confirmed.*
- **No gradient primitive.** Only mentions of "gradient" in core are inside post-processing effect docs
  (scanline effects) and `opentui-spinner`'s `createWave` color generator. Per-cell gradients must be
  computed manually (e.g. `t\`${fg(colorA)(…)}\`` per chunk or per-character spans). *Not confirmed to exist.*
- No documented emoji/icon component (emoji render fine as plain text content — official examples use
  `📨 👤 🤖 ▊` directly inside `<text>`).

---

## 4. Solid reactivity model (`@opentui/solid`)

Quote (opentui.com/packages/opentui-solid, verbatim):

> **Solid components run once. Signals update renderable properties without a virtual DOM.**

Mechanics (docs + shipped reconciler):
- `render(node, rendererOrConfig?)` — `node` is a function returning JSX; resolves after initial mount and
  **returns no disposer**; destroying the renderer disposes the Solid root (runs `onCleanup`).
  `render(() => <App />, renderer)` adopts an existing `CliRenderer` (owner still calls `renderer.destroy()`).
- Component bodies run **once**; per-expression updates go through Solid's `createRenderer` `spread`/`setProp`
  → `setProperty(node, name, value, prev)` → direct instance assignment. That is the whole "re-render":
  a signal change re-runs only the accessor that read it and writes that one property.
- Signals may be read directly in JSX (`<text fg={color()}>{count()}</text>`), in `createMemo`,
  `createEffect`, `<Show>`, `<For>`, `<Dynamic>`, `createStore` — all standard solid-js APIs; the official
  examples use `createSignal`, `createMemo`, `createEffect`, `on`, `onMount`, `onCleanup`, `batch`, `Show`,
  `For`, `createStore`/`produce`.
- Hooks (verbatim list from `src/elements/hooks.d.ts`):
  `useRenderer(): CliRenderer`, `useTerminalDimensions(): Accessor<{width,height}>`,
  `useKeyboard(cb, { release? })`, `useKeyHandler` (deprecated alias), `usePaste(cb)`,
  `onResize(cb)`, `onFocus(cb)`, `onBlur(cb)`, `useSelectionHandler(cb)`, `useTimeline(options?): Timeline`.
- Cleanup: renderer destruction disposes the Solid root → `onCleanup` runs. In slot registries,
  `onCleanup(unregister)` is the documented pattern.

**`createResource`: NOT CONFIRMED in OpenTUI docs.** There is no mention of `createResource`, `Suspense`,
or async-data patterns anywhere in the OpenTUI docs, README, or shipped package source (grep returned
nothing). OpenTUI renders plain Solid, so stock `createResource`/`<Suspense>` from `solid-js` should work —
*mechanism inferred from Solid semantics, not demonstrated by OpenTUI*. Evidence of the idioms OpenTUI
itself demonstrates for async-ish UI: `createSignal` + `setInterval`/`setTimeout` in `session.tsx`,
`<Show when={…} fallback={…}>` for loading/empty states, `createEffect(on([...], …, { defer: false }))` in
`plugin-slots-demo.tsx`. Treat `createResource` as "should work, unverified" — for a sidebar widget,
signals + `createEffect` + `<Show>` are the documented, proven path.

---

## 5. Verbatim real-world examples

### 5.1 Complete OpenCode sidebar plugin (community, real-world) — `opencode-footprint/.opencode/plugins/co2-sidebar.tsx`

This is exactly our shape of project: an OpenCode TUI plugin returning `JSX.Element` for a sidebar slot.

```tsx
/** @jsxImportSource @opentui/solid */
// TUI sidebar panel: session eco grade + CO2/kWh on one line, all-time
// (cross-session) totals on a second line. All the math lives in
// co2-tracker.ts / co2-sidebar-logic.ts (plain, unit-tested .ts modules);
// this file only wires reactive reads to those pure functions and renders
// the resulting strings -- no logic of its own.
import { createEffect, createMemo, Show, untrack } from "solid-js"
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { getGridIntensity, summarizeLifetime, upsertLifetimeSession, type LifetimeSessions } from "./co2-tracker.ts"
import { computeSessionCo2, formatLifetimeLine, formatSessionLine } from "./lib/co2-sidebar-logic.ts"

const KV_KEY = "co2.lifetime.sessions"

function Footer(props: { api: TuiPluginApi; sessionID: string }) {
  const theme = () => props.api.theme.current

  const messages = createMemo(() => props.api.state.session.messages(props.sessionID) as any[])
  const session = createMemo(() => computeSessionCo2(messages(), getGridIntensity()))

  // Persist this session's latest running total into kv as a side effect.
  // The stored map is read `untrack`-ed here so the effect does not subscribe
  // to the very key it writes -- reading it reactively would re-trigger the
  // effect on its own write, looping forever. Overwriting this session's
  // entry (rather than accumulating a delta) keeps repeated re-renders,
  // reconnects, and TUI restarts from ever double-counting it.
  createEffect(() => {
    if (!props.api.kv.ready) return
    // Don't persist a session before it has any assistant messages -- that
    // would write a {grams:0,kwh:0} entry for every session merely opened,
    // inflating the lifetime session count with sessions that never used
    // any tokens.
    if (session().messages === 0) return
    const stored = untrack(() => props.api.kv.get<LifetimeSessions>(KV_KEY, {}))
    props.api.kv.set(
      KV_KEY,
      upsertLifetimeSession(stored, props.sessionID, {
        grams: session().co2Grams,
        kwh: session().energyKwh,
      }),
    )
  })

  // Display value: reads kv reactively (so it updates when the effect above
  // -- or another session's panel -- persists), merging in this session's
  // current total speculatively so the number doesn't lag a tick behind the
  // effect's own write.
  const lifetime = createMemo(() => {
    const stored = props.api.kv.ready ? props.api.kv.get<LifetimeSessions>(KV_KEY, {}) : {}
    const merged = upsertLifetimeSession(stored, props.sessionID, {
      grams: session().co2Grams,
      kwh: session().energyKwh,
    })
    return summarizeLifetime(merged)
  })

  return (
    <Show when={session().messages > 0}>
      <box flexDirection="column">
        <text fg={theme().text}>{formatSessionLine(session())}</text>
        <text fg={theme().textMuted}>{formatLifetimeLine(lifetime())}</text>
      </box>
    </Show>
  )
}

// `sidebar_footer` is a "single_winner" slot: whichever registered plugin
// sorts first by (order asc, then registration order) is the only one
// rendered -- the host's own `internal:sidebar-footer` (order 100, showing
// the getting-started hint / path / OpenCode version) would otherwise win
// and we'd never render. Use a lower order so this panel wins instead; that
// necessarily replaces the built-in footer content while a session is open.
const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 50,
    slots: {
      sidebar_footer(_ctx, props) {
        return <Footer api={api} sessionID={props.session_id} />
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: "opencode-footprint.co2-sidebar",
  tui,
}

export default plugin
```

### 5.2 Official OpenTUI Solid plugin-slot component — `packages/solid/examples/components/plugin-slots-demo.tsx` (verbatim excerpt showing sidebar/statusbar slot markup + plugin authors' JSX)

```tsx
function createClockPlugin(crash: boolean): SolidPlugin<DemoSlots, typeof hostContext> {
  return {
    id: "clock-plugin",
    order: 0,
    slots: {
      statusbar(_ctx, props) {
        if (crash) {
          return <CrashNode pluginId="clock-plugin" />
        }

        return (
          <box
            border
            borderStyle="single"
            borderColor="#2563eb"
            marginLeft={1}
            paddingLeft={1}
            paddingRight={1}
            height={3}
          >
            <ClockStatusText label={props.label} />
          </box>
        )
      },
      sidebar(_ctx, props) {
        return (
          <box
            border
            borderStyle="single"
            borderColor="#0ea5e9"
            flexDirection="column"
            paddingLeft={1}
            paddingRight={1}
          >
            <text fg="#38bdf8">{`Clock Sidebar (${props.section})`}</text>
            <text fg="#e2e8f0">Healthy</text>
          </box>
        )
      },
    },
  }
}
```

Host layout from the same file (verbatim) — note `width`, `flexGrow`, `border`, `padding` usage:

```tsx
  return (
    <box width="100%" height="100%" flexDirection="column" padding={1} backgroundColor="#020617">
      <box
        height={5}
        width="100%"
        border
        borderStyle="single"
        borderColor="#334155"
        alignItems="center"
        flexDirection="row"
        paddingLeft={1}
        marginBottom={1}
      >
        {renderStatusbarSlot()}
      </box>

      <box width="100%" flexGrow={1} flexDirection="row">
        <box
          width={36}
          border
          borderStyle="single"
          borderColor="#334155"
          flexDirection="column"
          padding={1}
          marginRight={1}
        >
          {renderSidebarSlot()}
        </box>

        <box flexGrow={1} border borderStyle="single" borderColor="#334155" flexDirection="column" padding={1}>
          <text fg="#e2e8f0" content={info()} />
        </box>
      </box>
    </box>
  )
```

Slot registry setup + cleanup from the same file (verbatim core, ordered differently in file):

```tsx
export default function PluginSlotsDemo() {
  const renderer = useRenderer()
  const registry = createSolidSlotRegistry<DemoSlots, typeof hostContext>(renderer, hostContext)
  // ...
  onMount(() => {
    renderer.setBackgroundColor("#000000")
  })

  const unsubscribePluginErrors = registry.onPluginError((event) => {
    setErrorLines((current) => [formatPluginError(event), ...current].slice(0, 6))
  })
  onCleanup(unsubscribePluginErrors)
```

Live-text component with interval + cleanup (verbatim):

```tsx
const ClockStatusText = (props: { label: string }) => {
  const [time, setTime] = createSignal(new Date().toLocaleTimeString())

  onMount(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString())
    }, 1000)

    onCleanup(() => {
      clearInterval(timer)
    })
  })

  return <text fg="#93c5fd">{`Clock plugin -> ${props.label} (${time()})`}</text>
}
```

### 5.3 Official full app example — counter (docs "Solid bindings > Example: counter", verbatim)

```tsx
import { render, useKeyboard, useRenderer } from "@opentui/solid"
import { createSignal } from "solid-js"

const App = () => {
  const [count, setCount] = createSignal(0)
  const renderer = useRenderer()

  useKeyboard((key) => {
    if (key.name === "up") setCount((c) => c + 1)
    if (key.name === "down") setCount((c) => c - 1)
    if (key.name === "escape") renderer.destroy()
  })

  return (
    <box border padding={2}>
      <text>Count: {count()}</text>
      <text fg="#888">Up/Down to change, ESC to close</text>
    </box>
  )
}

await render(App)
```

### 5.4 Official list/scroll demo with styled inline spans — `packages/solid/examples/session.tsx` (verbatim key parts)

Full file at `packages/solid/examples/session.tsx` (repo `anomalyco/opentui`). Rendering core:

```tsx
  return (
    <box paddingTop={1} paddingBottom={1} paddingLeft={2} paddingRight={2} flexGrow={1} maxHeight="100%">
      <box paddingBottom={1}>
        <text>
          <span style={{ fg: "#00ff00" }}>📨</span> <span style={{ fg: "#ffffff" }}>Live Message Stream</span>
        </text>
        <text fg="#666666">Messages arrive in chunks - watch them build character by character!</text>
      </box>

      <scrollbox
        scrollbarOptions={{ visible: true }}
        stickyScroll={true}
        stickyStart="bottom"
        paddingTop={1}
        paddingBottom={1}
        contentOptions={{
          flexGrow: 1,
          gap: 1,
        }}
      >
        <For each={messages.data}>{(message) => <MessageItem message={message} />}</For>
      </scrollbox>

      <box paddingTop={1}>
        <text fg="#666666">
          Messages: {messages.data.length} |{" "}
          <Show when={isChunkingActive()} fallback="Waiting for next message...">
            Receiving message...
          </Show>
        </text>
      </box>
    </box>
  )
```

Item card with **partial border** + per-role colors (verbatim) — this is the closest official pattern to a
"polished widget card":

```tsx
function MessageItem(props: { message: Message }) {
  const timeString = createMemo(() =>
    props.message.timestamp.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  )

  return (
    <box
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={2}
      paddingRight={2}
      border={["left"]}
      borderColor={props.message.role === "user" ? "#00ff00" : "#0088ff"}
      backgroundColor={props.message.role === "user" ? "#001100" : "#000022"}
    >
      <box flexDirection="row" paddingBottom={0.5}>
        <text>
          <Show when={props.message.role === "user"} fallback={<span style={{ fg: "#0088ff" }}>🤖 Assistant</span>}>
            <span style={{ fg: "#00ff00" }}>👤 You</span>
          </Show>
        </text>
        <box flexGrow={1} />
        <text fg="#666666">{timeString()}</text>
      </box>

      <text>
        {props.message.content}
        <Show when={!props.message.isComplete} fallback={""}>
          <span style={{ fg: "#ffff00" }}>▊</span>
        </Show>
      </text>

      <Show when={!props.message.isComplete}>
        {() => {
          const progress = createMemo(() =>
            Math.round((props.message.content.length / props.message.fullContent!.length) * 100),
          )
          return (
            <text fg="#666666" paddingTop={0.5}>
              Receiving message... ({progress()}%)
            </text>
          )
        }}
      </Show>
    </box>
  )
}
```

### 5.5 Text styling demo — `packages/solid/examples/components/text-style-demo.tsx` (verbatim body)

```tsx
  return (
    <box>
      <text>Simple text works! {counter()} times</text>
      <text>
        line break
        <br />
        works! {counter()} times
      </text>
      <text style={{ bg: "red", fg: "black" }}>
        Hello {counter()} <span style={{ bg: "yellow", fg: "black" }}>World</span>{" "}
        <span style={{ attributes: TextAttributes.UNDERLINE, bg: "blue", fg: "yellow" }}>{counter()}</span>
      </text>
      <text>
        Toggle{" "}
        <Show when={counter() % 2 === 0}>
          <b>
            <u>text</u>
          </b>
        </Show>
      </text>
      <text>
        Toggle <Show when={counter() % 2 === 0}>text</Show>
      </text>
      <text>
        Hyperlinks:{" "}
        <u>
          <a href="https://opentui.com" style={{ fg: "blue" }}>
            opentui.com
          </a>
        </u>{" "}
        - Click if your terminal supports OSC 8
      </text>
    </box>
  )
```

(See §1.5 caveat: `style.attributes` on a *span* is a no-op per shipped source; `<text style=…>` is fine.)

### 5.6 Slot host API (docs "Solid plugin slots > Basic usage", verbatim)

```tsx
import { createCliRenderer } from "@opentui/core"
import { createSolidSlotRegistry, Slot, render } from "@opentui/solid"

type Slots = {
  statusbar: { user: string }
}

const context = { appName: "solid-app", version: "1.0.0" }
const renderer = await createCliRenderer()

const registry = createSolidSlotRegistry<Slots, typeof context>(renderer, context)

const unregister = registry.register({
  id: "clock-plugin",
  slots: {
    statusbar(ctx, props) {
      return <text>{`${ctx.appName}:${props.user}`}</text>
    },
  },
})

const AppSlot = Slot<Slots, typeof context>

const App = () => (
  <AppSlot registry={registry} name="statusbar" user="sam" mode="replace">
    <text>fallback-statusbar</text>
  </AppSlot>
)

render(() => <App />, renderer)
```

`<Slot>` props (docs table, verbatim): `registry` (required), `name` (required),
`mode: "append" | "replace" | "single_winner"` (default `"append"`),
`pluginFailurePlaceholder?: (failure: PluginErrorEvent) => JSX.Element`, `children` (fallback UI),
plus slot-specific props forwarded to plugin renderers. Cleanup pattern (docs verbatim):
`onCleanup(unregister)`.

---

## 6. Cheat-sheet for the "active skills" widget

```tsx
/** @jsxImportSource @opentui/solid */
import { TextAttributes } from "@opentui/core"
import { createSignal, createMemo, For, Show, onCleanup, onMount } from "solid-js"

const SkillsWidget = (props: { skills: () => string[]; active: () => boolean }) => {
  const [spin, setSpin] = createSignal(0)
  onMount(() => {
    const t = setInterval(() => setSpin((s) => (s + 1) % 4), 140)
    onCleanup(() => clearInterval(t))
  })
  const braille = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
  const frame = createMemo(() => braille[spin() % braille.length])

  return (
    <box
      borderStyle="rounded"          // single | double | rounded | heavy
      borderColor="#334155"
      title="Skills"                  // titleColor / titleAlignment: "left"|"center"|"right"
      titleColor="#22c55e"
      titleAlignment="center"
      flexDirection="column"
      padding={1}
      gap={1}
      backgroundColor="#0b1220"
    >
      <text>
        <span style={{ fg: "#22c55e", bold: true }}>{frame()}</span>{" "}
        <span style={{ fg: "#e2e8f0" }}>{props.skills().length} active</span>
      </text>
      <For each={props.skills()}>
        {(s) => (
          <text fg="#86efac" wrapMode="none" truncate>
            ✓ {s}
          </text>
        )}
      </For>
      <Show when={!props.active()} fallback={<text fg="#475569">idle</text>}>
        <text fg="#facc15" attributes={TextAttributes.DIM}>running…</text>
      </Show>
    </box>
  )
}
```

Everything in this snippet is drawn from confirmed prop names; the only unsupported-by-docs assumption is
nothing — `borderStyle`, `title*`, `padding`, `gap`, `backgroundColor`, `wrapMode`, `truncate`,
`attributes`, `style={{ fg, bold }}` on `<span>` are all verified above.
