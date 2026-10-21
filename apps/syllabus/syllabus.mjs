/**
 * @fileoverview Retrieve and parse the monthly SKA training syllabus using a
 * fresh authenticated HTTP session and credentials from Google Secret Manager.
 */

import { Buffer } from "node:buffer"
import { URL, URLSearchParams } from "node:url"
import { load } from "cheerio"
import makeFetchCookie from "fetch-cookie"
import { GoogleAuth } from "google-auth-library"

const loginUrl = "https://secure.ska.org/en/account/login"
const calendarUrl = "https://news.ska.org/calendars/calendar/"
const userAgent =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"
const months = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ")

/**
 * A training category's junior and senior syllabus entries.
 * @typedef {Object} TrainingRow
 * @property {string} training The category: KATA, KIHON, or KUMITE.
 * @property {string} junior Junior training, with paragraph breaks as newlines.
 * @property {string} senior Senior training, with paragraph breaks as newlines.
 */

/**
 * The training syllabus for a selected calendar month.
 * @typedef {Object} Syllabus
 * @property {number} year The calendar year.
 * @property {number} month The calendar month, from 1 to 12.
 * @property {Array<TrainingRow>} training The three training categories.
 */

/**
 * Select the month and Google Cloud project used to retrieve a syllabus.
 * @typedef {Object} SyllabusOptions
 * @property {number} year The calendar year, from 1996 to 2055.
 * @property {number} month The calendar month, from 1 to 12.
 * @property {string} [projectId="get-ska-events"] The project holding SKA secrets.
 */

/**
 * Extract the training table after checking the requested month heading.
 * @param {string} html The calendar page's HTML.
 * @param {number} year The expected calendar year.
 * @param {number} month The expected calendar month, from 1 to 12.
 * @returns {Syllabus} The syllabus with paragraph breaks preserved as newlines.
 * @throws {Error} If the month heading or training table does not match.
 */
export function parseSyllabus(html, year, month) {
  const $ = load(html)
  const expected = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)))
  if ($(".calendar-month").text().trim() !== expected)
    throw Error("Requested month not found")
  /**
   * Collapse whitespace within a single line of syllabus text.
   * @param {string} value The text to normalize.
   * @returns {string} The trimmed text with consecutive whitespace collapsed.
   */
  const clean = (value) => value.replace(/\s+/g, " ").trim()
  const table = $("table")
    .filter(
      (_, element) =>
        $(element)
          .find("tr")
          .first()
          .children("th, td")
          .toArray()
          .map((cell) => clean($(cell).text()))
          .join("|") === "TRAINING|JUNIOR|SENIOR",
    )
    .first()
  const rows = table
    .find("tr")
    .slice(1)
    .toArray()
    .map((row) =>
      $(row)
        .children("th, td")
        .toArray()
        .map((cell) => {
          const copy = $(cell).clone()
          copy.find("br").replaceWith("\n")
          copy.find("p, div, li").append("\n")
          return copy.text().split(/\n+/).map(clean).filter(Boolean).join("\n")
        }),
    )
  if (
    rows.length !== 3 ||
    rows.some((row) => row.length !== 3) ||
    rows.map((row) => row[0]).join("|") !== "KATA|KIHON|KUMITE"
  ) {
    throw Error("Training syllabus table not found or changed")
  }
  return {
    year,
    month,
    training: rows.map(([training, junior, senior]) => ({
      training,
      junior,
      senior,
    })),
  }
}

/**
 * Read SKA credentials, log in, and retrieve the selected month's syllabus.
 * Each call creates a fresh cookie jar. Credentials and session tokens stay in
 * memory; upstream failures are replaced with an error naming only the stage.
 * @param {SyllabusOptions} options The month and secret project to use.
 * @param {Object} [dependencies={}] Optional dependencies for isolated tests.
 * @param {typeof globalThis.fetch} [dependencies.fetch=globalThis.fetch] The HTTP
 *     transport used for secret access and SKA requests.
 * @param {function(): Promise<string|null>} [dependencies.getAccessToken] A
 *     Google access-token provider; defaults to Application Default Credentials.
 * @returns {Promise<Syllabus>} The requested month's training syllabus.
 * @throws {Error} If arguments are invalid or a retrieval stage fails.
 */
export async function getSyllabus(
  { year, month, projectId = "get-ska-events" },
  {
    fetch = globalThis.fetch,
    getAccessToken = () =>
      new GoogleAuth({
        scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      }).getAccessToken(),
  } = {},
) {
  if (
    !Number.isInteger(year) ||
    year < 1996 ||
    year > 2055 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw Error("Provide a year from 1996 to 2055 and month from 1 to 12.")
  }
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId))
    throw Error("Invalid Google Cloud project ID.")
  let stage = "reading SKA credentials from Secret Manager"
  try {
    const token = await getAccessToken()
    if (!token) throw Error("Missing Google credentials")
    /**
     * Read the latest version of a secret using the current Google access token.
     * @param {string} name The Secret Manager secret name.
     * @returns {Promise<string>} The decoded, nonempty secret value.
     * @throws {Error} If the secret request fails or the value is empty.
     */
    const readSecret = async (name) => {
      const response = await fetch(
        `https://secretmanager.googleapis.com/v1/projects/${projectId}/secrets/${name}/versions/latest:access`,
        {
          headers: { Authorization: `Bearer ${token}` },
          redirect: "error",
          signal: globalThis.AbortSignal.timeout(30000),
        },
      )
      if (!response.ok) throw Error("Secret read failed")
      const { payload } = await response.json()
      const value = Buffer.from(payload.data, "base64").toString("utf8")
      if (!value) throw Error("Empty secret")
      return value
    }
    const [email, password] = await Promise.all([
      readSecret("ska-username"),
      readSecret("ska-password"),
    ])
    const sessionFetch = makeFetchCookie(async (url, options) => {
      const target = new URL(url)
      if (
        target.protocol !== "https:" ||
        !["secure.ska.org", "news.ska.org"].includes(target.hostname)
      )
        throw Error("Unexpected redirect destination")
      if (options.body && target.origin !== "https://secure.ska.org")
        throw Error("Unexpected form destination")
      return fetch(url, {
        ...options,
        signal: globalThis.AbortSignal.timeout(30000),
      })
    })
    /**
     * Request an SKA page using this call's cookie jar and bounded redirects.
     * The session transport restricts destinations to the two SKA HTTPS hosts.
     * @param {string} url The page URL.
     * @param {RequestInit} [options={}] The HTTP method, headers, and form body.
     * @returns {Promise<Response>} A successful response after redirects.
     * @throws {Error} If the request fails or a redirect is rejected.
     */
    const request = async (url, options = {}) => {
      const response = await sessionFetch(url, {
        ...options,
        headers: { "User-Agent": userAgent, ...options.headers },
        maxRedirect: 15,
      })
      if (!response.ok) throw Error("Website request failed")
      return response
    }
    stage = "opening the calendar and login page"
    await request(calendarUrl)
    const $ = load(await (await request(loginUrl)).text())
    const form = $("form")
      .filter((_, element) => $(element).find('input[name="pass"]').length > 0)
      .first()
    if (!form.length) throw Error("Login form not found")
    const fields = new URLSearchParams()
    form
      .find('input[type="hidden"][name]')
      .each((_, input) =>
        fields.set($(input).attr("name"), $(input).attr("value") || ""),
      )
    fields.set("email", email)
    fields.set("pass", password)
    if (!fields.has("submit")) fields.set("submit", "Submit")
    stage = "logging in"
    // Submit credentials with the login form's hidden fields and the secure
    // site's session cookies. The cookie jar retains any session cookie issued
    // or replaced during login. Authentication to news.ska.org happens next via
    // the provider's handoff URL; its session cookies remain separate by host.
    await request(loginUrl, {
      method: "POST",
      body: fields.toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    })
    stage = "authenticating to SKA News"
    const handoff = await request("https://secure.ska.org/en/cfilters/news")
    if (new URL(handoff.url).hostname !== "news.ska.org")
      throw Error("News handoff rejected")
    stage = "fetching the requested syllabus"
    const url = new URL(calendarUrl)
    url.searchParams.set("calendar_month", months[month - 1])
    url.searchParams.set("calendar_yr", String(year))
    const response = await request(url.href)
    if (new URL(response.url).hostname !== "news.ska.org")
      throw Error("News session rejected")
    return parseSyllabus(await response.text(), year, month)
  } catch {
    // HTTP libraries can include passwords, cookies, and token URLs in errors.
    throw Error(`Syllabus request failed while ${stage}.`)
  }
}
