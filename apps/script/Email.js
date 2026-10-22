/**
 * Get a draft of an event announcement e-mail body,
 * with each event listed starting by title.
 * @param {Array<Event>} An array of events.
 * @returns {string} a message body formatted as HTML.
 */
function draftMessageBodyByEvents(events) {
  return (
    events
      .map(function (event) {
        return event.getAsHtml(true)
      })
      .join("") + getRequiredScriptProperty("SIGNATURE")
  )
}

/**
 * Get a draft of an event announcement e-mail body,
 * with events occuring on the same date grouped under a single date header.
 * @param {Array<Event>} An array of events.
 * @returns {string} a message body formatted as HTML.
 */
function draftMessageBodyByDates(events) {
  if (events.length == 0) {
    return "<p><strong>No events!</strong></p>"
  }
  var output = ""
  var date = null
  for (e of events) {
    if (e.date != date) {
      output += `<h3>${e.date}</h3>
`
      date = e.date
    }
    output += e.getAsHtml()
  }
  return output + getRequiredScriptProperty("SIGNATURE")
}

/**
 * Send an e-mail announcing the current week's events.
 */
function sendWeeklyEventsMessage() {
  const calendar = CalendarApp.getOwnedCalendarById(
    getRequiredScriptProperty("NORCAL_CALENDAR_ID"),
  )
  const timezone = calendar.getTimeZone()
  const [start, end] = getCurrentWeek()
  const subject = getCurrentWeekSubject(start, end, timezone)
  const events = getEvents(calendar, start, end, timezone)
  const htmlBody = draftMessageBodyByEvents(events)
  Logger.log("Drafted message:\n" + subject + "\n" + htmlBody)
  MailApp.sendEmail({
    to: getRequiredScriptProperty("RECIPIENT"),
    subject: subject,
    htmlBody: htmlBody,
  })
}

/**
 * Send an e-mail announcing the next month's events.
 */
function sendMonthlyEventsMessage() {
  const calendar = CalendarApp.getOwnedCalendarById(
    getRequiredScriptProperty("NORCAL_CALENDAR_ID"),
  )
  const timezone = calendar.getTimeZone()
  const [start, end] = getNextMonth()
  const subject =
    "Next month's events: " + Utilities.formatDate(start, timezone, "MMMM yyyy")
  const syllabus = getSyllabusAsTable(start.getFullYear(), start.getMonth() + 1)
  const events = getEvents(calendar, start, end, timezone)
  const htmlBody =
    `<h3>Training calendar</h3>
<p>
${syllabus}
</p>
` + draftMessageBodyByDates(events)
  Logger.log("Drafted monthly message: " + subject)
  MailApp.sendEmail({
    to: getRequiredScriptProperty("RECIPIENT"),
    subject: subject,
    htmlBody: htmlBody,
  })
}
