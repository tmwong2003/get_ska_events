function test_getCurrentWeekSubjectSameMonth(timezone) {
  // Careful with that en dash, Eugene.
  const expected = "This week's events: 1–7 September 2025"

  // Start at noon to avoid issues (one hopes) with UTC vs. NorCal timezone.
  const start = new Date("2025-09-01 12:00")
  const end = new Date("2025-09-07 12:00")

  const observed = getCurrentWeekSubject(start, end, timezone)

  Logger.log(`Expected ${expected}, got ${observed}`)
  return expected == observed
}

function test_getCurrentWeekSubjectDifferentMonth(timezone) {
  const expected = "This week's events: 29 September–5 October 2025"

  const start = new Date("2025-09-29 12:00")
  const end = new Date("2025-10-05 12:00")

  const observed = getCurrentWeekSubject(start, end, timezone)

  Logger.log(`Expected ${expected}, got ${observed}`)
  return expected == observed
}

function test_getCurrentWeekSubjectDifferentYear(timezone) {
  const expected = "This week's events: 29 December 2025–4 January 2026"

  const start = new Date("2025-12-29 12:00")
  const end = new Date("2026-01-04 12:00")

  const observed = getCurrentWeekSubject(start, end, timezone)

  Logger.log(`Expected ${expected}, got ${observed}`)
  return expected == observed
}

/**
 * Manually verify October 2026 retrieval from the Apps Script editor.
 * Requires authorization, SYLLABUS_SERVICE_URL, and a private Cloud Run
 * deployment configured with the script audience and the user's Invoker grant.
 * Contacts SKA through the service; logs no syllabus content or tokens.
 * Kept out of TESTS so runTests does not invoke the live service.
 * @returns {boolean} True if the requested month and training rows match.
 * @throws {Error} If retrieval fails or the returned syllabus is unexpected.
 */
function test_getSyllabus() {
  const syllabus = getSyllabus(2026, 10)
  if (
    syllabus === null ||
    syllabus.year !== 2026 ||
    syllabus.month !== 10 ||
    !Array.isArray(syllabus.training) ||
    syllabus.training.length !== 3 ||
    syllabus.training.some(
      (row, index) =>
        row === null ||
        row.training !== ["KATA", "KIHON", "KUMITE"][index] ||
        typeof row.junior !== "string" ||
        typeof row.senior !== "string",
    )
  ) {
    throw Error("Live syllabus test failed: unexpected October 2026 syllabus.")
  }
  Logger.log(
    `Retrieved ${syllabus.year}-${syllabus.month}: ${syllabus.training.length} training categories`,
  )
  return true
}

const TESTS = [
  test_getCurrentWeekSubjectSameMonth,
  test_getCurrentWeekSubjectDifferentMonth,
  test_getCurrentWeekSubjectDifferentYear,
]

/**
 * Run all tests that do not require a live deployment.
 */
function runTests() {
  const calendar = CalendarApp.getOwnedCalendarById(
    getRequiredScriptProperty("NORCAL_CALENDAR_ID"),
  )
  const timezone = calendar.getTimeZone()

  for (const test of TESTS) {
    if (test(timezone)) {
      Logger.log("Test " + test.name + " passed.")
    } else {
      Logger.log("WARNING: Test " + test.name + " failed.")
    }
  }
}
