const DATE_FORMAT = "E d MMM yyyy"
const TIME_FORMAT = "h:mma"

/**
 * Read required deployment configuration without defaulting to personal values.
 * @param {string} name The Script Property name.
 * @returns {string} The configured value, preserving HTML and whitespace.
 */
function getRequiredScriptProperty(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name)
  if (value === null || value.trim() === "") {
    throw Error(
      `Set ${name} in Script Properties before running this function.`,
    )
  }
  return value
}

/**
 * A calendar event class.
 */
class Event {
  /**
   * Construct an Event instance from a Google CalendarEvent instance.
   * @param {CalendarEvent} event A Google CalendarEvent instance.
   * @param {string} timezone The timezone of the source Google Calendar.
   */
  constructor(event, timezone) {
    this.title = event.getTitle()
    this.date = Utilities.formatDate(
      event.getStartTime(),
      timezone,
      DATE_FORMAT,
    )
    this.start = Utilities.formatDate(
      event.getStartTime(),
      timezone,
      TIME_FORMAT,
    )
    this.end = Utilities.formatDate(event.getEndTime(), timezone, TIME_FORMAT)
    this.location = event.getLocation()
    this.description = event.getDescription()
  }

  /**
   * Get an event as HTML.
   * @param {boolean} withDate If true, include the date with the event details.
   * @returns {string} a string containing the event details formatted as HTML.
   */
  getAsHtml(withDate) {
    var output = `<p>
  <strong>${this.title}</strong><br>`
    if (withDate) {
      output += `
  ${this.date}<br>`
    }
    output += `
  ${this.start}&ndash;${this.end}<br>`
    if (this.location.length > 0) {
      output += `
  ${this.location}<br>`
    }
    if (this.description.length > 0) {
      output += `
  ${this.description}<br>`
    }
    output += `
</p>
`
    return output
  }
}

/**
 * Get the start and end dates of the current week.
 * Note that this function uses time based on the callee's local timezone.
 * @returns {Array<Date>} a two-element array containing the start date and end date of the current week.
 */
function getCurrentWeek() {
  const startOfWeek = new Date()
  startOfWeek.setDate(startOfWeek.getDate() - (startOfWeek.getDay() - 1))
  startOfWeek.setHours(0)
  startOfWeek.setMinutes(0)
  startOfWeek.setSeconds(0)
  startOfWeek.setMilliseconds(0)
  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(endOfWeek.getDate() + 8)
  return [startOfWeek, endOfWeek]
}

/**
 * Get the subject line for a weekly event announcement e-mail.
 * @param {Date} start The start date of the week
 * @param {Date} end The end date of the week, inclusive.
 * @return {string} a subject line with bounds adjusted as necessary if week spans two months or two years.
 */
function getCurrentWeekSubject(start, end, timezone) {
  var startDay = Utilities.formatDate(start, timezone, "d") // numeric-day
  const endDate = Utilities.formatDate(end, timezone, "d MMMM yyyy")
  if (end.getYear() != start.getYear()) {
    startDay = Utilities.formatDate(start, timezone, "d MMMM yyyy")
  } else if (end.getMonth() != start.getMonth()) {
    startDay = Utilities.formatDate(start, timezone, "d MMMM")
  }
  return `This week's events: ${startDay}–${endDate}`
}

/**
 * Get the start and end dates of the next month from today's month.
 * Note that this function uses time based on the callee's local timezone.
 * @returns {Array<Date>} a two-element array containing the start date and end date of the next month.
 */
function getNextMonth() {
  const startOfNextMonth = new Date()
  const nextMonth = (startOfNextMonth.getMonth() + 1) % 12
  startOfNextMonth.setFullYear(
    startOfNextMonth.getFullYear() + (nextMonth == 0 ? 1 : 0),
  )
  startOfNextMonth.setMonth(nextMonth)
  startOfNextMonth.setDate(1)
  startOfNextMonth.setHours(0)
  startOfNextMonth.setMinutes(0)
  startOfNextMonth.setSeconds(0)
  startOfNextMonth.setMilliseconds(0)
  const endOfNextMonth = new Date(startOfNextMonth)
  endOfNextMonth.setDate(endOfNextMonth.getDate() + 31)
  Logger.log(`Got next month span: ${startOfNextMonth}–${endOfNextMonth}.`)
  return [startOfNextMonth, endOfNextMonth]
}

/**
 * Get the events from a Google Calendar that occur within a specified time period.
 * @param {Calendar} calendar A Google Calendar instance.
 * @param {Date} periodStart The start of the period.
 * @param {Date} periodEnd The end of the period, inclusive.
 * @param {string} timezone The timezone of the source Google Calendar.
 * @returns {Array{<Event>} an array of events in the period ordered by later start date and time.
 */
function getEvents(calendar, periodStart, periodEnd, timezone) {
  Logger.log(
    "Getting events from '%s' for period starting '%s'...",
    calendar.getName(),
    periodStart,
  )
  var events = new Array()
  // Calendar.getEvents() is _exclusive_ bound. Bah.
  var periodEndExclusive = new Date(periodEnd)
  periodEndExclusive.setDate(periodEnd.getDate() + 1)
  for (const e of calendar.getEvents(periodStart, periodEndExclusive)) {
    events.push(new Event(e, timezone))
  }
  return events
}

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
  const events = getEvents(calendar, start, end, timezone)
  const subject = getCurrentWeekSubject(start, end, timezone)
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
  const events = getEvents(calendar, start, end, timezone)
  const subject =
    "Next month's events: " + Utilities.formatDate(start, timezone, "MMMM yyyy")
  const htmlBody =
    `<h3>Training calendar</h3>
<p>
[Insert calendar here]
</p>
` + draftMessageBodyByDates(events)
  Logger.log("Drafted message:\n" + subject + "\n" + htmlBody)
  MailApp.sendEmail({
    to: getRequiredScriptProperty("RECIPIENT"),
    subject: subject,
    htmlBody: htmlBody,
  })
}
