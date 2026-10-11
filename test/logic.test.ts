import { describe, expect, test } from "bun:test"
import {
  ageLong,
  ageShort,
  filterSkills,
  formatUses,
  scanSkillUsage,
  sortByUsage,
  spaceTypesIntoQuery,
  statusLabel,
  usageBadge,
  usageStatusText,
} from "../src/tui"

describe("spaceTypesIntoQuery", () => {
  test("types into an in-progress search", () => {
    expect(spaceTypesIntoQuery("list", undefined, true)).toBe(true)
  })

  test("activates when the query is empty", () => {
    expect(spaceTypesIntoQuery("list", undefined, false)).toBe(false)
  })

  test("activates while a keycap row has focus", () => {
    expect(spaceTypesIntoQuery("list", 1, true)).toBe(false)
  })

  test("activates in the details view", () => {
    expect(spaceTypesIntoQuery("details", undefined, true)).toBe(false)
  })
})

describe("filterSkills", () => {
  const skills = [
    { name: "cold-email", description: "Write B2B cold emails that get replies." },
    { name: "accessibility", description: "Audit web accessibility." },
    { name: "docs", description: undefined },
  ]

  test("multi-word query reaches the hyphenated name through the description", () => {
    expect(filterSkills(skills, "cold email").map((skill) => skill.name)).toEqual(["cold-email"])
  })

  test("matches the name directly, case-insensitively", () => {
    expect(filterSkills(skills, "ACCESS").map((skill) => skill.name)).toEqual(["accessibility"])
  })

  test("a blank query returns every skill", () => {
    expect(filterSkills(skills, "   ")).toHaveLength(3)
  })

  test("no match returns nothing", () => {
    expect(filterSkills(skills, "zzz")).toEqual([])
  })
})

describe("statusLabel", () => {
  test("active wins over everything", () => {
    expect(statusLabel({ id: "a", autoinvoke: false }, new Set(["a"]))).toBe("Active")
  })

  test("manual-only skills carry the marker", () => {
    expect(statusLabel({ id: "b", autoinvoke: false }, new Set())).toBe("idle · manual")
  })

  test("plain idle", () => {
    expect(statusLabel({ id: "b" }, new Set())).toBe("idle")
  })

  test("usage text wins over active", () => {
    expect(
      statusLabel({ id: "a" }, new Set(["a"]), { count: 2, usedAt: 0 }, 3 * 60000),
    ).toBe("Active · used twice · 3 minutes ago")
  })

  test("used-only skills lose the idle word", () => {
    expect(statusLabel({ id: "b" }, new Set(), { count: 1, usedAt: 0 }, 3 * 60000)).toBe(
      "used once · 3 minutes ago",
    )
  })
})

describe("sortByUsage", () => {
  test("actives lead and idle order is preserved", () => {
    const catalog = [{ id: "x" }, { id: "a" }, { id: "y" }, { id: "b" }]
    expect(sortByUsage(catalog, new Set(["a", "b"]), {}).map((skill) => skill.id)).toEqual([
      "a",
      "b",
      "x",
      "y",
    ])
  })

  test("does not mutate the catalog", () => {
    const catalog = [{ id: "x" }, { id: "a" }]
    sortByUsage(catalog, new Set(["a"]), {})
    expect(catalog.map((skill) => skill.id)).toEqual(["x", "a"])
  })

  test("used skills lead within their group, most recent first", () => {
    const catalog = [{ id: "x" }, { id: "a" }, { id: "y" }]
    const usage = { x: { count: 1, usedAt: 100 }, y: { count: 3, usedAt: 300 } }
    expect(sortByUsage(catalog, new Set(), usage).map((skill) => skill.id)).toEqual([
      "y",
      "x",
      "a",
    ])
  })

  test("an idle used skill never jumps an active one", () => {
    const catalog = [{ id: "used" }, { id: "plain" }]
    const usage = { used: { count: 9, usedAt: 999 } }
    expect(sortByUsage(catalog, new Set(["plain"]), usage).map((skill) => skill.id)).toEqual([
      "plain",
      "used",
    ])
  })
})

describe("scanSkillUsage", () => {
  const skillPart = (id: string, status = "completed") => ({
    type: "tool",
    id: `call_${id}`,
    name: "skill",
    state: { status, input: { id } },
    time: { created: 1000 },
  })

  test("counts completed skill calls with the latest time", () => {
    const messages = [
      { time: { created: 500 }, content: [skillPart("ponytail")] },
      { time: { created: 900 }, content: [skillPart("ponytail")] },
    ]
    expect(scanSkillUsage(messages, 2000)).toEqual({ ponytail: { count: 2, usedAt: 1000 } })
  })

  test("ignores other tools, failed calls, and non-tool parts", () => {
    const messages = [
      {
        time: { created: 700 },
        content: [
          { type: "tool", id: "c1", name: "shell", state: { status: "completed" } },
          { ...skillPart("ponytail", "error"), id: "c2" },
          { type: "text", text: "mentioning skill ponytail in prose" },
        ],
      },
    ]
    expect(scanSkillUsage(messages, 2000)).toEqual({})
  })

  test("falls back to metadata name and message time", () => {
    const messages = [
      {
        time: { created: 1500 },
        content: [
          {
            type: "tool",
            id: "c1",
            name: "skill",
            state: { status: "completed", input: {}, metadata: { name: "brainstorming" } },
          },
        ],
      },
    ]
    expect(scanSkillUsage(messages, 2000)).toEqual({ brainstorming: { count: 1, usedAt: 1500 } })
  })

  test("skips calls without an id and messages without content", () => {
    const messages = [
      {
        time: { created: 1500 },
        content: [
          { type: "tool", id: "c1", name: "skill", state: { status: "completed", input: {} } },
        ],
      },
      { time: { created: 1500 } },
    ]
    expect(scanSkillUsage(messages, 2000)).toEqual({})
  })
})

describe("usage wording", () => {
  test("formatUses speaks plain words", () => {
    expect(formatUses(1)).toBe("once")
    expect(formatUses(2)).toBe("twice")
    expect(formatUses(5)).toBe("5 times")
  })

  test("ageShort stays compact", () => {
    const now = 10 * 3600000
    expect(ageShort(now - 30000, now)).toBe("now")
    expect(ageShort(now - 3 * 60000, now)).toBe("3m")
    expect(ageShort(now - 2 * 3600000, now)).toBe("2h")
    expect(ageShort(now - 5 * 86400000, now)).toBe("5d")
  })

  test("ageLong speaks full words", () => {
    const now = 10 * 86400000
    expect(ageLong(now - 30000, now)).toBe("just now")
    expect(ageLong(now - 60000, now)).toBe("1 minute ago")
    expect(ageLong(now - 3 * 60000, now)).toBe("3 minutes ago")
    expect(ageLong(now - 3600000, now)).toBe("1 hour ago")
    expect(ageLong(now - 2 * 3600000, now)).toBe("2 hours ago")
    expect(ageLong(now - 86400000, now)).toBe("1 day ago")
    expect(ageLong(now - 4 * 86400000, now)).toBe("4 days ago")
  })

  test("badges and statuses compose the parts", () => {
    const use = { count: 2, usedAt: 0 }
    expect(usageBadge(use, 3 * 60000)).toBe("×2 3m")
    expect(usageStatusText(use, true, 3 * 60000)).toBe("Active · used twice · 3 minutes ago")
    expect(usageStatusText(use, false, 3 * 60000)).toBe("used twice · 3 minutes ago")
  })
})
