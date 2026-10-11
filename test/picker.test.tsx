import { expect, test } from "bun:test"
import { defaultSkills, mountPlugin, type Fixture } from "./fixture"

const timeout = 20000

async function openPicker(fx: Fixture) {
  fx.run("ctrl+alt+s")
  await fx.app.waitForFrame((frame) => frame.includes("cold-email"))
}

test("sidebar lists active skills, an idle count, and the live active total", async () => {
  const fx = await mountPlugin({ active: ["ads"] })
  await fx.app.waitForFrame((frame) => frame.includes("More skills"))
  const frame = fx.app.captureCharFrame()
  expect(frame).toContain("Skills")
  expect(frame).toContain("ads")
  expect(frame).toContain("More skills")
  expect(frame).toContain("(3 idle)")
  expect(frame).toContain("1 skills active")
}, timeout)

// The sidebar renders active skills inline with no scrollbox, so the row
// list is capped; overflow folds into the "More skills" row instead.
const manySkills = Array.from({ length: 14 }, (_, i) => ({
  id: `skill-${String(i + 1).padStart(2, "0")}`,
  name: `skill-${String(i + 1).padStart(2, "0")}`,
  description: `Skill number ${i + 1}.`,
}))

test("sidebar caps active rows at 10 and folds the true active total into More skills", async () => {
  const fx = await mountPlugin({ skills: manySkills, active: manySkills.map((s) => s.id) })
  await fx.app.waitForFrame((frame) => frame.includes("More skills"))
  const frame = fx.app.captureCharFrame()
  // 14 active > cap: the first 10 render inline, the rest do not.
  expect(frame).toContain("skill-01")
  expect(frame).toContain("skill-10")
  expect(frame).not.toContain("skill-11")
  expect(frame).not.toContain("skill-14")
  // The row carries the idle count plus the true active total.
  expect(frame).toContain("More skills")
  expect(frame).toContain("(0 idle · 14 active)")
  // The header count stays the full total, not the capped one.
  expect(frame).toContain("14 skills active")
}, timeout)

test("sidebar under the cap stays terse with no active count in More skills", async () => {
  const fx = await mountPlugin({ skills: manySkills, active: ["skill-01", "skill-02"] })
  await fx.app.waitForFrame((frame) => frame.includes("More skills"))
  const frame = fx.app.captureCharFrame()
  expect(frame).toContain("skill-01")
  expect(frame).toContain("skill-02")
  expect(frame).toContain("(12 idle)")
  expect(frame).not.toContain("active)")
  expect(frame).toContain("2 skills active")
}, timeout)

test("picker opens showing active skills before idle ones and the keycap footer", async () => {
  const fx = await mountPlugin({ active: ["ads"] })
  await openPicker(fx)
  const frame = fx.app.captureCharFrame()
  expect(frame).toContain("Search skills")
  expect(frame).toContain("Active")
  // Footer keycaps.
  expect(frame).toContain("space")
  expect(frame).toContain("f5")
}, timeout)

test("space activates the selected idle skill without resuming the model", async () => {
  const fx = await mountPlugin({ active: ["ads"] })
  await openPicker(fx)
  fx.run("space")
  await fx.app.waitFor(() => fx.injects.length === 1)
  expect(fx.injects[0]).toEqual({ sessionID: "ses_test", id: "cold-email", resume: false })
  expect(fx.toasts.some((toast) => toast.message.includes("cold-email added"))).toBe(true)
  // The server would broadcast activation; the status count follows it.
  fx.active.push(fx.injects[0].id)
  fx.emitActivation()
  await fx.app.waitForFrame((frame) => frame.includes("2 skills active"))
}, timeout)

test("space types into a non-empty query instead of activating", async () => {
  const fx = await mountPlugin({ active: ["ads"] })
  await openPicker(fx)
  fx.focusInput()
  await fx.app.mockInput.typeText("cold ")
  const result = fx.run("space")
  expect(result).toBe(false)
  expect(fx.injects).toHaveLength(0)
  expect(fx.toasts.filter((toast) => toast.message.includes("added"))).toHaveLength(0)
}, timeout)

test("a multi-word query narrows the list to the matching skill", async () => {
  const fx = await mountPlugin({ active: ["ads"] })
  await openPicker(fx)
  fx.focusInput()
  await fx.app.mockInput.typeText("cold email")
  await fx.app.waitForFrame(
    (frame) => frame.includes("cold-email") && !frame.includes("accessibility"),
  )
}, timeout)

test("f5 opens details and escape returns to the list with the query intact", async () => {
  const fx = await mountPlugin({ active: ["ads"] })
  await openPicker(fx)
  fx.focusInput()
  await fx.app.mockInput.typeText("cold email")
  fx.run("f5")
  await fx.app.waitForFrame((frame) => frame.includes("follow-up sequences"))
  const details = fx.app.captureCharFrame()
  expect(details).toContain("/skills/cold-email/SKILL.md")
  expect(details).toContain("idle")
  fx.run("escape")
  await fx.app.waitForFrame(
    (frame) => frame.includes("cold email") && !frame.includes("follow-up sequences"),
  )
}, timeout)

test("escape closes the list dialog and the picker can open again", async () => {
  const fx = await mountPlugin({ active: ["ads"] })
  await openPicker(fx)
  fx.run("escape")
  await fx.app.waitForFrame((frame) => !frame.includes("Search skills"))
  fx.run("ctrl+alt+s")
  await fx.app.waitForFrame((frame) => frame.includes("Search skills"))
}, timeout)

test("the native activation event refreshes the active count", async () => {
  const fx = await mountPlugin({ active: ["ads"] })
  await fx.app.waitForFrame((frame) => frame.includes("1 skills active"))
  fx.active.push("ponytail")
  fx.emitActivation()
  await fx.app.waitForFrame((frame) => frame.includes("2 skills active"))
}, timeout)

test("j and k pass through to the search input in the list", async () => {
  const fx = await mountPlugin({ active: ["ads"] })
  await openPicker(fx)
  // Returning false is the host's contract for "keep going": the letter
  // flows on to the focused input, so "javascript" stays typeable.
  expect(fx.run("j")).toBe(false)
  expect(fx.run("k")).toBe(false)
  expect(fx.injects).toHaveLength(0)
}, timeout)

test("j and k scroll the details view like the /btw command box", async () => {
  const long = {
    id: "long-skill",
    name: "long-skill",
    description: "lorem ipsum dolor sit amet ".repeat(200),
    path: "/skills/long-skill/SKILL.md",
  }
  const fx = await mountPlugin({ active: ["ads"], skills: [...defaultSkills, long] })
  await openPicker(fx)
  fx.run("end") // preselect the last skill: the long one
  fx.run("f5")
  await fx.app.waitForFrame((frame) => frame.includes("lorem ipsum"))
  const [box] = fx.scrollboxes()
  expect(box).toBeDefined()
  // The description must overflow the capped box, or scrolling is a no-op.
  expect(box.scrollHeight).toBeGreaterThan(box.viewport.height)

  fx.run("j")
  expect(box.scrollTop).toBe(1)
  fx.run("j")
  expect(box.scrollTop).toBe(2)
  fx.run("k")
  expect(box.scrollTop).toBe(1)
  fx.run("k")
  expect(box.scrollTop).toBe(0)
  // Page keys scroll half a viewport; home/end jump to the edges.
  fx.run("pagedown")
  expect(box.scrollTop).toBeGreaterThan(0)
  fx.run("pageup")
  expect(box.scrollTop).toBe(0)
  fx.run("end")
  expect(box.scrollTop).toBe(box.scrollHeight - box.viewport.height)
  fx.run("home")
  expect(box.scrollTop).toBe(0)
}, timeout)

test("both scrollbars stay hidden even when the content overflows", async () => {
  const many = Array.from({ length: 20 }, (_, index) => ({
    id: `filler-${index}`,
    name: `filler-${index}`,
    description: `Filler skill ${index}.`,
    path: `/skills/filler-${index}/SKILL.md`,
  }))
  const fx = await mountPlugin({ active: ["ads"], skills: [...defaultSkills, ...many] })
  await openPicker(fx)
  const [list] = fx.scrollboxes()
  // Overflow proves the bar would show itself if it were in auto mode.
  expect(list.scrollHeight).toBeGreaterThan(list.viewport.height)
  expect(list.verticalScrollBar.visible).toBe(false)
}, timeout)

// Model usage: the transcript scan feeds the sidebar badges at mount.
test("sidebar shows compact badges and hollow dots for used skills", async () => {
  const now = Date.now()
  const fx = await mountPlugin({
    active: ["ads"],
    usage: [
      { id: "ads", count: 2, usedAt: now - 2 * 3600000 },
      { id: "ponytail", count: 1, usedAt: now - 3 * 60000 },
    ],
  })
  await fx.app.waitForFrame((frame) => frame.includes("×1 3m"))
  const frame = fx.app.captureCharFrame()
  // Attached and used: filled dot plus badge.
  expect(frame).toContain("×2 2h")
  // Idle but used: a hollow-dot row appears, sorted by usage.
  // Ponytail (3m) leads ads (2h): most recent first.
  expect(frame).toContain("ponytail")
  expect(frame).toContain("○")
  expect(frame.indexOf("ponytail")).toBeLessThan(frame.indexOf("ads"))
  // The Active word is gone: the filled dot carries that meaning now.
  expect(frame).not.toContain("Active")
}, timeout)

test("picker shows the full usage words", async () => {
  const now = Date.now()
  const fx = await mountPlugin({
    active: ["ads"],
    usage: [{ id: "ads", count: 2, usedAt: now - 2 * 3600000 }],
  })
  await openPicker(fx)
  await fx.app.waitForFrame((frame) => frame.includes("used twice"))
  const frame = fx.app.captureCharFrame()
  expect(frame).toContain("Active · used twice · 2 hours ago")
}, timeout)

// Live usage: a skill load lands on the sidebar with no rescan.
test("a live skill load adds a used-only row with a badge", async () => {
  const fx = await mountPlugin({ active: ["ads"] })
  await fx.app.waitForFrame((frame) => frame.includes("More skills"))
  expect(fx.app.captureCharFrame()).not.toContain("cold-email")
  fx.seedToolMessage("m1", {
    content: [
      {
        type: "tool",
        id: "c1",
        name: "skill",
        state: { status: "completed", input: { id: "cold-email" } },
        time: { created: Date.now() },
      },
    ],
  })
  fx.emitToolSuccess({ sessionID: "ses_test", assistantMessageID: "m1", id: "c1" })
  await fx.app.waitForFrame((frame) => frame.includes("×1"))
  const frame = fx.app.captureCharFrame()
  expect(frame).toContain("cold-email")
  expect(frame).toContain("○")
}, timeout)

test("non-skill, unknown, and foreign tool events change nothing", async () => {
  const fx = await mountPlugin({ active: ["ads"] })
  await fx.app.waitForFrame((frame) => frame.includes("More skills"))
  // A resolved non-skill call returns early: no refresh, no badge.
  fx.seedToolMessage("m2", {
    content: [{ type: "tool", id: "c9", name: "shell", state: { status: "completed" } }],
  })
  fx.emitToolSuccess({ sessionID: "ses_test", assistantMessageID: "m2", id: "c9" })
  // An unresolvable call falls back to a rescan, which finds no usage.
  fx.emitToolSuccess({ sessionID: "ses_test", assistantMessageID: "missing", id: "c0" })
  // Another session's calls never touch this surface.
  fx.emitToolSuccess({ sessionID: "ses_other", assistantMessageID: "m2", id: "c9" })
  await fx.app.waitFor(() => fx.injects.length === 0)
  expect(fx.app.captureCharFrame()).not.toContain("×")
}, timeout)
