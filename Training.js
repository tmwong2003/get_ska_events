/**
 * Applying some heuristics:
 * 1. Member Driven returns at least one, usually two PHPSESSID cookies.
 * 2. If two, we need to use the second PHPSESSID cookie.
 */
function getSessionIdCookie(headers) {
  if (headers["Set-Cookie"] == null) {
    throw Error("Expected at least one cookie but got nothing.")
  }
  if (!Array.isArray(headers["Set-Cookie"])) {
    headers["Set-Cookie"] = [headers["Set-Cookie"]]
  }
  var sessionIdCookie = null
  Logger.log(headers["Set-Cookie"])
  for (const cookie of headers["Set-Cookie"]) {
    const cookieCrumbs = cookie.split(";")
    if (cookieCrumbs[0].startsWith("PHPSESSID")) {
      sessionIdCookie = cookieCrumbs[0].trim()
    }
  }
  if (sessionIdCookie == null) {
    throw Error("Expected session ID cookie but got nothing.")
  }
  return sessionIdCookie
}

function getTrainingCalendar() {
  const month = "oct"
  const year = "2025"
  Logger.log("Authenticating to Member Driven to get a session ID cookie...")
  var requestUrl = "https://secure.ska.org/en/account/login"
  var requestParams = {
    method: "post",
    payload:
      "referer=&email=tmw%40tmwong.org&pass=[INSERT PASSWORD HERE]&submit=Submit",
    followRedirects: false,
  }
  var response = UrlFetchApp.fetch(requestUrl, requestParams)
  var sessionIdCookie = getSessionIdCookie(response.getAllHeaders())
  /*
    Ignore the redirect to the Member Driven membership dashboard.
    Instead, start to load the SKA News page,
    but snag the SKA News website authentication parameters
    from the redirect Location: without following the redirect.
  */
  Logger.log(
    `Start to load the SKA News page with cookie ${sessionIdCookie}...`,
  )
  requestUrl = "https://secure.ska.org/en/cfilters/news"
  requestParams = {
    headers: {
      Cookie: sessionIdCookie,
    },
    followRedirects: false,
  }
  response = UrlFetchApp.fetch(requestUrl, requestParams)
  responseHeaders = response.getAllHeaders()
  Logger.log("Intercepted the SKA News redirect.")
  Logger.log(responseHeaders)
  if (responseHeaders["Location"] == null) {
    throw Error("Expected a URL redirect on the raw news URL, got none.")
  }
  // Split the redirect to get the extended ska.org authentication token.
  var skaToken = responseHeaders["Location"].split("?")[1]
  /*
    Load the requested training calendar.
  */
  requestUrl = `https://news.ska.org/calendars/calendar/?calendar_month=${month}&calendar_yr=${year}&${skaToken}`
  Logger.log(`Loading the training calendar at ${requestUrl}...`)
  requestParams = {
    headers: {
      Cookie: sessionIdCookie,
    },
    followRedirects: false,
  }
  response = UrlFetchApp.fetch(requestUrl, requestParams)
  responseHeaders = response.getAllHeaders()
  Logger.log("Loaded calendar.")
  Logger.log(responseHeaders)
  if (responseHeaders["Location"]) {
    throw Error("Expected a calendar, got a redirect.")
  }
  var content = response.getContent()
  Logger.log(content)
}
