import { describe, expect, test } from "bun:test"
import { activeFirst, filterSkills, spaceTypesIntoQuery, statusLabel } from "../src/tui"

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
})

describe("activeFirst", () => {
  test("actives lead and idle order is preserved", () => {
    const catalog = [{ id: "x" }, { id: "a" }, { id: "y" }, { id: "b" }]
    expect(activeFirst(catalog, new Set(["a", "b"])).map((skill) => skill.id)).toEqual([
      "a",
      "b",
      "x",
      "y",
    ])
  })

  test("does not mutate the catalog", () => {
    const catalog = [{ id: "x" }, { id: "a" }]
    activeFirst(catalog, new Set(["a"]))
    expect(catalog.map((skill) => skill.id)).toEqual(["x", "a"])
  })
})
