/** HTTP-only training syllabus experiment. No browser or persistent session. */
function getTrainingCalendar(year, month, httpOptions = {}) {
  if (
    !Number.isInteger(year) ||
    year < 1996 ||
    year > 2055 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw Error("Provide a supported year and numeric month (1–12).")
  }
  const client = createTrainingHttpClient(
    (url, options) => {
      const prepared = UrlFetchApp.getRequest(url, options)
      // Compare privately; never log the prepared URL or request object.
      Logger.log(
        JSON.stringify({
          event: "training_url_check",
          unchanged: prepared.url === url,
          escapingDisabled: options.escaping === false,
        }),
      )
      return UrlFetchApp.fetch(url, options)
    },
    (entry) => Logger.log(JSON.stringify(entry)),
    httpOptions,
  )
  // Visiting news first establishes its separate PHP session, as in the trace.
  client.request("https://news.ska.org/calendars/calendar/")
  const login = client.request("https://secure.ska.org/en/account/login")
  const fields = trainingLoginFields(login.html)
  fields.email = getTrainingSecret("ska-username")
  fields.pass = getTrainingSecret("ska-password")
  fields.submit = fields.submit || "Submit"
  client.request("https://secure.ska.org/en/account/login", {
    method: "post",
    payload: Object.entries(fields)
      .map(
        ([key, value]) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
      )
      .join("&"),
    contentType: "application/x-www-form-urlencoded",
  })
  if (httpOptions.inspectHandoffIps) {
    const ips = []
    for (let i = 0; i < 4; i++) {
      const handoff = client.request(
        "https://secure.ska.org/en/cfilters/news",
        { stopAtNews: true },
      )
      const match = handoff.url.match(/[?&]ip=([^&#]*)/)
      if (match) ips.push(decodeURIComponent(match[1]))
    }
    const result = {
      event: "training_handoff_ip_check",
      requests: 4,
      responsesWithIp: ips.length,
      distinctIpCount: new Set(ips).size,
      allMatch: ips.length === 4 && new Set(ips).size === 1,
    }
    Logger.log(JSON.stringify(result))
    return result
  }
  if (httpOptions.freshNewsSession) client.clearCookiesForHost("news.ska.org")
  const handoff = client.request("https://secure.ska.org/en/cfilters/news")
  if (trainingUrl(handoff.url).host !== "news.ska.org") {
    throw Error("Authentication handoff did not reach the news site.")
  }
  const monthName = "jan feb mar apr may jun jul aug sep oct nov dec".split(
    " ",
  )[month - 1]
  const result = client.request(
    `https://news.ska.org/calendars/calendar/?calendar_month=${monthName}&calendar_yr=${year}`,
  )
  if (trainingUrl(result.url).host !== "news.ska.org") {
    throw Error(
      "News authentication was not retained for the calendar request.",
    )
  }
  const expected = `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][month - 1]} ${year}`
  const heading = result.html.match(
    /<td\b[^>]*class=["'][^"']*\bcalendar-month\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i,
  )
  if (!heading || trainingText(heading[1]) !== expected) {
    throw Error("Response did not contain the requested calendar month.")
  }
  return { year, month, training: parseTrainingSyllabus(result.html) }
}

/** Run manually in the Apps Script editor; does not send email. */
function testTrainingHttp() {
  const result = getTrainingCalendar(2026, 12)
  Logger.log(JSON.stringify(result))
  return result
}

/** Controlled comparison: same HTTP flow with a browser-style User-Agent. */
function testTrainingHttpBrowserAgent() {
  return testTrainingHttpOptions({})
}

/** Controlled comparison: preserve the server-issued URL without re-escaping. */
function testTrainingHttpExactUrl() {
  return testTrainingHttpOptions({ escaping: false })
}

/** Compare provider-reported request IPs without consuming the auth tokens. */
function testTrainingHttpIpConsistency() {
  return testTrainingHttpOptions({ escaping: false, inspectHandoffIps: true })
}

/** Keep the authenticated membership session; discard pre-login news cookies. */
function testTrainingHttpFreshNewsSession() {
  return testTrainingHttpOptions({
    escaping: false,
    nodeHeaders: true,
    freshNewsSession: true,
  })
}

/** Test only calendar access with a recently authenticated Cloud Run session. */
function testTrainingImportedSession() {
  const session = JSON.parse(getTrainingSecret("ska-diagnostic-news-session"))
  const age = Date.now() - Date.parse(session.createdAt)
  if (
    !Number.isFinite(age) ||
    age < 0 ||
    age > 15 * 60 * 1000 ||
    !/^PHPSESSID=[^;\s]+$/.test(session.cookie || "")
  ) {
    throw Error(
      "Diagnostic session is missing, invalid, or older than 15 minutes; mint a fresh session.",
    )
  }
  let response
  try {
    response = UrlFetchApp.fetch(
      "https://news.ska.org/calendars/calendar/?calendar_month=dec&calendar_yr=2026",
      {
        headers: {
          Cookie: session.cookie,
          Accept: "*/*",
          "Accept-Language": "*",
          "Sec-Fetch-Mode": "cors",
        },
        escaping: false,
        followRedirects: false,
        muteHttpExceptions: true,
      },
    )
  } catch {
    throw Error("Imported-session calendar request failed.")
  }
  const status = response.getResponseCode()
  Logger.log(
    JSON.stringify({
      event: "training_imported_session",
      status,
      ageSeconds: Math.round(age / 1000),
    }),
  )
  if (status !== 200)
    throw Error(
      "The imported news session was not accepted for the calendar request.",
    )
  const html = response.getContentText()
  if (
    !/<td\b[^>]*class=["'][^"']*\bcalendar-month\b[^"']*["'][^>]*>\s*December 2026\s*<\/td>/i.test(
      html,
    )
  ) {
    throw Error(
      "Imported session response did not contain the requested calendar.",
    )
  }
  const result = {
    year: 2026,
    month: 12,
    training: parseTrainingSyllabus(html),
  }
  Logger.log(JSON.stringify(result))
  return result
}

function testTrainingHttpOptions(options) {
  const result = getTrainingCalendar(2026, 12, {
    ...options,
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
  })
  Logger.log(JSON.stringify(result))
  return result
}

function getTrainingSecret(name) {
  const endpoint = `https://secretmanager.googleapis.com/v1/projects/get-ska-events/secrets/${name}/versions/latest:access`
  let response
  try {
    response = UrlFetchApp.fetch(endpoint, {
      headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` },
      muteHttpExceptions: true,
      followRedirects: false,
    })
  } catch {
    throw Error(`Secret Manager request failed for ${name}.`)
  }
  if (response.getResponseCode() !== 200) {
    throw Error(
      `Secret Manager returned HTTP ${response.getResponseCode()} for ${name}. Check OAuth authorization and IAM.`,
    )
  }
  try {
    const payload = JSON.parse(response.getContentText()).payload.data
    const value = Utilities.newBlob(
      Utilities.base64Decode(payload),
    ).getDataAsString("UTF-8")
    if (!value) throw Error("Empty secret")
    return value
  } catch {
    throw Error(`Could not decode secret ${name}.`)
  }
}

// Apps Script does not expose the browser URL API. Restrict this small resolver
// to HTTPS on the two known hosts, including redirects and relative locations.
function trainingUrl(value, base) {
  const absolute = /^https:\/\/([^/?#]+)([^?#]*)(\?[^#]*)?(?:#.*)?$/i
  let match = value.match(absolute)
  if (!match && base) {
    const parent = trainingUrl(base)
    if (value.startsWith("//")) return trainingUrl(`https:${value}`)
    if (/^[a-z][a-z0-9+.-]*:/i.test(value))
      throw Error("Unsupported redirect protocol.")
    const path = value.startsWith("/")
      ? value
      : value.startsWith("?")
        ? parent.path + value
        : parent.path.slice(0, parent.path.lastIndexOf("/") + 1) + value
    return trainingUrl(`https://${parent.host}${path}`)
  }
  if (!match) throw Error("Invalid training URL.")
  const host = match[1].toLowerCase()
  if (!["secure.ska.org", "news.ska.org"].includes(host)) {
    throw Error("Training redirect left the allowed hosts.")
  }
  const segments = []
  for (const segment of (match[2] || "/").split("/")) {
    if (segment === "..") segments.pop()
    else if (segment !== ".") segments.push(segment)
  }
  const path = segments.join("/") || "/"
  const query = match[3] || ""
  return { host, path, url: `https://${host}${path}${query}` }
}

function createTrainingHttpClient(fetch, log, httpOptions = {}) {
  let cookies = []
  let sequence = 0
  function headerValues(headers, name) {
    const key = Object.keys(headers).find((key) => key.toLowerCase() === name)
    if (!key) return []
    return Array.isArray(headers[key]) ? headers[key] : [headers[key]]
  }
  function storeCookie(raw, origin) {
    const [pair, ...attributes] = raw.split(";")
    const equals = pair.indexOf("=")
    if (equals < 1) return null
    const cookie = {
      name: pair.slice(0, equals).trim(),
      value: pair.slice(equals + 1).trim(),
      domain: origin.host,
      hostOnly: true,
      path: origin.path.slice(0, origin.path.lastIndexOf("/")) || "/",
      expires: null,
    }
    for (const attribute of attributes) {
      const [key, ...parts] = attribute.trim().split("=")
      const value = parts.join("=")
      switch (key.toLowerCase()) {
        case "domain":
          cookie.domain = value.toLowerCase().replace(/^\./, "")
          cookie.hostOnly = false
          break
        case "path":
          if (value.startsWith("/")) cookie.path = value
          break
        case "max-age":
          if (/^-?\d+$/.test(value)) cookie.maxAge = Number(value)
          break
        case "expires":
          cookie.expires = Date.parse(value)
          break
      }
    }
    if (!["ska.org", "secure.ska.org", "news.ska.org"].includes(cookie.domain))
      return null
    if (!(
      origin.host === cookie.domain || origin.host.endsWith(`.${cookie.domain}`)
    ))
      return null
    if (cookie.maxAge !== undefined)
      cookie.expires = Date.now() + cookie.maxAge * 1000
    cookies = cookies.filter(
      (old) =>
        !(
          old.name === cookie.name &&
          old.domain === cookie.domain &&
          old.path === cookie.path
        ),
    )
    if (
      cookie.expires === null ||
      Number.isNaN(cookie.expires) ||
      cookie.expires > Date.now()
    )
      cookies.push(cookie)
    return {
      name: cookie.name,
      domain: cookie.domain,
      hostOnly: cookie.hostOnly,
      path: cookie.path,
    }
  }
  function applicableCookies(target) {
    return cookies
      .filter(
        (cookie) =>
          (cookie.expires === null ||
            Number.isNaN(cookie.expires) ||
            cookie.expires > Date.now()) &&
          (cookie.hostOnly
            ? target.host === cookie.domain
            : target.host === cookie.domain ||
              target.host.endsWith(`.${cookie.domain}`)) &&
          (target.path === cookie.path ||
            (target.path.startsWith(cookie.path) &&
              (cookie.path.endsWith("/") ||
                target.path[cookie.path.length] === "/"))),
      )
      .sort((a, b) => b.path.length - a.path.length)
  }
  function cookieHeaderFor(value) {
    return applicableCookies(trainingUrl(value))
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ")
  }
  function request(value, options = {}) {
    let target = trainingUrl(value)
    let method = options.method || "get"
    let payload = options.payload
    for (let hop = 0; hop < 16; hop++) {
      const applicable = applicableCookies(target)
      const params = {
        method,
        followRedirects: false,
        muteHttpExceptions: true,
        headers: applicable.length
          ? { Cookie: applicable.map((c) => `${c.name}=${c.value}`).join("; ") }
          : {},
      }
      if (payload !== undefined) {
        params.payload = payload
        params.contentType = options.contentType
      }
      if (httpOptions.userAgent)
        params.headers["User-Agent"] = httpOptions.userAgent
      if (httpOptions.escaping === false) params.escaping = false
      if (httpOptions.nodeHeaders) {
        params.headers.Accept = "*/*"
        params.headers["Accept-Language"] = "*"
        params.headers["Sec-Fetch-Mode"] = "cors"
      }
      let response
      try {
        response = fetch(target.url, params)
      } catch {
        throw Error(
          `Training HTTP request ${sequence + 1} failed on ${target.host}.`,
        )
      }
      const status = response.getResponseCode()
      const headers = response.getAllHeaders()
      const issued = headerValues(headers, "set-cookie")
        .map((raw) => storeCookie(raw, target))
        .filter(Boolean)
      const location = headerValues(headers, "location")[0]
      const next = location ? trainingUrl(location, target.url) : null
      // No query values, cookie values, response bodies, or raw exceptions.
      log({
        event: "training_http",
        id: ++sequence,
        method: method.toUpperCase(),
        host: target.host,
        endpoint: trainingTraceEndpoint(target),
        browserAgentRequested: Boolean(httpOptions.userAgent),
        nodeHeadersRequested: Boolean(httpOptions.nodeHeaders),
        status,
        sentCookies: applicable.map((c) => ({
          name: c.name,
          domain: c.domain,
          path: c.path,
        })),
        setCookies: issued,
        redirectHost: next ? next.host : null,
        redirectEndpoint: next ? trainingTraceEndpoint(next) : null,
      })
      if ([301, 302, 303, 307, 308].includes(status)) {
        if (!next) throw Error("Redirect response had no Location header.")
        if (
          options.stopAtNews &&
          target.host === "secure.ska.org" &&
          target.path === "/en/cfilters/news" &&
          next.host === "news.ska.org"
        ) {
          return { url: next.url, html: "" }
        }
        if (
          status === 303 ||
          ((status === 301 || status === 302) && method === "post")
        ) {
          method = "get"
          payload = undefined
        }
        target = next
        continue
      }
      if (status !== 200)
        throw Error(
          `Training site returned HTTP ${status} on request ${sequence}.`,
        )
      return { url: target.url, html: response.getContentText() }
    }
    throw Error("Training redirect limit exceeded.")
  }
  function clearCookiesForHost(host) {
    const allowedHost = trainingUrl(`https://${host}/`).host
    const before = cookies.length
    cookies = cookies.filter((cookie) => cookie.domain !== allowedHost)
    log({
      event: "training_cookie_reset",
      host: allowedHost,
      removed: before - cookies.length,
    })
  }
  return { request, clearCookiesForHost, cookieHeaderFor }
}

function trainingTraceEndpoint(target) {
  const known = [
    "/",
    "/en",
    "/en/",
    "/en/account/login",
    "/en/account",
    "/en/account/",
    "/en/cfilters/news",
    "/calendars/calendar/",
  ]
  return known.includes(target.path) ? target.path : "[other path]"
}

function trainingAttributes(tag) {
  const result = {}
  for (const match of tag.matchAll(
    /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,
  )) {
    result[match[1].toLowerCase()] = trainingDecode(
      match[2] ?? match[3] ?? match[4],
    )
  }
  return result
}

function trainingLoginFields(html) {
  const forms = html.match(/<form\b[^>]*>[\s\S]*?<\/form>/gi) || []
  const form = forms.find((form) =>
    /<input\b[^>]*\bname\s*=\s*["']pass["']/i.test(form),
  )
  if (!form)
    throw Error("Login form not found; authentication markup may have changed.")
  const fields = {}
  for (const input of form.match(/<input\b[^>]*>/gi) || []) {
    const attrs = trainingAttributes(input)
    if (attrs.name && attrs.type?.toLowerCase() === "hidden")
      fields[attrs.name] = attrs.value || ""
  }
  return fields
}

function trainingDecode(value) {
  const entities = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ndash: "–",
    mdash: "—",
    rsquo: "’",
    lsquo: "‘",
    rdquo: "”",
    ldquo: "“",
  }
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity) => {
    if (entity.startsWith("#")) {
      const number =
        entity[1].toLowerCase() === "x"
          ? parseInt(entity.slice(2), 16)
          : Number(entity.slice(1))
      return number > 0 && number <= 0x10ffff
        ? String.fromCodePoint(number)
        : whole
    }
    return entities[entity.toLowerCase()] ?? whole
  })
}

function trainingText(html) {
  return trainingDecode(
    html
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?\s*>|<\/(?:p|div|li)>/gi, "\n")
      .replace(/<[^>]*>/g, ""),
  )
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
}

function parseTrainingSyllabus(html) {
  // This narrowly targets the supplied three-column syllabus markup. It is not
  // a general HTML parser; fail explicitly if the site's structure changes.
  for (const match of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const rows = Array.from(
      match[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi),
      (row) =>
        Array.from(
          row[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi),
          (cell) => trainingText(cell[1]),
        ),
    )
    if (rows[0]?.join("|") !== "TRAINING|JUNIOR|SENIOR") continue
    if (
      rows.length !== 4 ||
      rows.slice(1).some((row) => row.length !== 3) ||
      rows
        .slice(1)
        .map((row) => row[0])
        .join("|") !== "KATA|KIHON|KUMITE"
    ) {
      throw Error("Unexpected training syllabus structure.")
    }
    return rows
      .slice(1)
      .map(([training, junior, senior]) => ({ training, junior, senior }))
  }
  throw Error("Training syllabus table not found in server-rendered HTML.")
}
