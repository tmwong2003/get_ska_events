import assert from "node:assert/strict"
import console from "node:console"
import { readFileSync } from "node:fs"
import test from "node:test"
import { URL } from "node:url"
import vm from "node:vm"

process.env.TZ = "America/Los_Angeles"

test("Apps Script runTests()", () => {
  const failures = []
  const context = vm.createContext({
    CalendarApp: {
      getOwnedCalendarById: () => ({
        getTimeZone: () => "America/Los_Angeles",
      }),
    },
    Logger: {
      log(message) {
        console.log(message)
        if (message.startsWith("WARNING: Test ")) failures.push(message)
      },
    },
    Utilities: {
      formatDate(date, timeZone, format) {
        if (!["d", "d MMMM", "d MMMM yyyy"].includes(format)) {
          throw new Error(`Unsupported test date format: ${format}`)
        }
        return new Intl.DateTimeFormat("en-GB", {
          timeZone,
          day: "numeric",
          ...(format.includes("MMMM") ? { month: "long" } : {}),
          ...(format.includes("yyyy") ? { year: "numeric" } : {}),
        }).format(date)
      },
    },
  })
  for (const filename of ["Events.js", "Test.js"]) {
    vm.runInContext(
      readFileSync(new URL(`../${filename}`, import.meta.url), "utf8"),
      context,
      { filename },
    )
  }
  vm.runInContext("runTests()", context)
  assert.deepEqual(failures, [], "Apps Script tests reported failures")
})
