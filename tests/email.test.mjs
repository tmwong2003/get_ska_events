import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { URL } from "node:url"
import vm from "node:vm"

const eventsSource = readFileSync(
  new URL("../apps/script/Events.js", import.meta.url),
  "utf8",
)
const emailSource = readFileSync(
  new URL("../apps/script/Email.js", import.meta.url),
  "utf8",
)

function createEmailContext(
  properties,
  { syllabusTable = "<table>Test syllabus</table>" } = {},
) {
  const messages = []
  const syllabusRequests = []
  const context = vm.createContext({
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (name) => properties[name] ?? null,
      }),
    },
    CalendarApp: {
      getOwnedCalendarById(id) {
        assert.equal(id, properties.NORCAL_CALENDAR_ID)
        return { getTimeZone: () => "America/Los_Angeles" }
      },
    },
    Logger: { log() {} },
    MailApp: { sendEmail: (message) => messages.push(message) },
    Utilities: { formatDate: () => "November 2026" },
  })
  vm.runInContext(eventsSource, context, { filename: "Events.js" })
  vm.runInContext(emailSource, context, { filename: "Email.js" })
  context.getNextMonth = () => [new Date(2026, 10, 1), new Date(2026, 10, 30)]
  context.getSyllabusAsTable = (year, month) => {
    syllabusRequests.push({ year, month })
    return syllabusTable
  }
  vm.runInContext(
    `getEvents = () => [{
      date: "test-date",
      getAsHtml: () => "<p>Test event</p>",
    }]`,
    context,
  )
  return { context, messages, syllabusRequests }
}

test("weekly event email uses the configured recipient and HTML signature", () => {
  const properties = {
    NORCAL_CALENDAR_ID: "example-calendar",
    RECIPIENT: "recipient@example.org",
    SIGNATURE: "<p>Regards,</p>\n<p>Example Dojo</p>\n",
  }
  const { context, messages } = createEmailContext(properties)
  vm.runInContext("sendWeeklyEventsMessage()", context)
  assert.equal(messages.length, 1)
  assert.equal(messages[0].to, properties.RECIPIENT)
  assert.ok(messages[0].htmlBody.includes("<p>Test event</p>"))
  assert.ok(messages[0].htmlBody.endsWith(properties.SIGNATURE))
})

test("monthly event email uses the next-month subject and grouped HTML body", () => {
  const properties = {
    NORCAL_CALENDAR_ID: "example-calendar",
    RECIPIENT: "recipient@example.org",
    SIGNATURE: "<p>Example Dojo</p>",
  }
  const syllabusTable = "<table>Mock syllabus table</table>"
  const { context, messages, syllabusRequests } = createEmailContext(
    properties,
    { syllabusTable },
  )
  vm.runInContext("sendMonthlyEventsMessage()", context)

  assert.equal(messages.length, 1)
  assert.deepEqual(syllabusRequests, [{ year: 2026, month: 11 }])
  assert.equal(messages[0].to, properties.RECIPIENT)
  assert.equal(messages[0].subject, "Next month's events: November 2026")
  assert.ok(messages[0].htmlBody.includes("<h3>Training calendar</h3>"))
  assert.ok(messages[0].htmlBody.includes(syllabusTable))
  assert.ok(messages[0].htmlBody.includes("<h3>test-date</h3>"))
  assert.ok(messages[0].htmlBody.includes("<p>Test event</p>"))
  assert.ok(messages[0].htmlBody.endsWith(properties.SIGNATURE))
})

test("missing or blank event configuration prevents sending email", () => {
  for (const name of ["NORCAL_CALENDAR_ID", "RECIPIENT", "SIGNATURE"]) {
    for (const value of [null, "", " \n "]) {
      for (const expression of [
        "sendWeeklyEventsMessage()",
        "sendMonthlyEventsMessage()",
      ]) {
        const { context, messages } = createEmailContext({
          NORCAL_CALENDAR_ID: "example-calendar",
          RECIPIENT: "recipient@example.org",
          SIGNATURE: "<p>Example Dojo</p>",
          [name]: value,
        })
        assert.throws(
          () => vm.runInContext(expression, context),
          new RegExp(`Set ${name} in Script Properties`),
        )
        assert.equal(messages.length, 0)
      }
    }
  }
})

test("empty date-grouped drafts preserve the existing no-events output", () => {
  const { context } = createEmailContext({})
  assert.equal(
    vm.runInContext("draftMessageBodyByDates([])", context),
    "<p><strong>No events!</strong></p>",
  )
})
