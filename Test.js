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

const TESTS = [
  test_getCurrentWeekSubjectSameMonth,
  test_getCurrentWeekSubjectDifferentMonth,
  test_getCurrentWeekSubjectDifferentYear,
]

/**
 * Run all tests.
 */
function runTests() {
  const calendar = CalendarApp.getOwnedCalendarById(NORCAL_CALENDAR_ID)
  const timezone = calendar.getTimeZone()

  for (const test of TESTS) {
    if (test(timezone)) {
      Logger.log("Test " + test.name + " passed.")
    } else {
      Logger.log("WARNING: Test " + test.name + " failed.")
    }
  }
}
