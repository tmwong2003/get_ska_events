// Run the actual Apps Script HTTP client in Node with a synchronous fetch shim.
// Credentials and raw responses stay in memory/pipes, never command arguments.
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { URL } from "node:url"
import vm from "node:vm"
import { Buffer } from "node:buffer"

async function saveDiagnosticSession(cookie) {
  if (!/^PHPSESSID=[^;\s]+$/.test(cookie))
    throw Error("Unexpected diagnostic cookie")
  const tokenResponse = await globalThis.fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    {
      headers: { "Metadata-Flavor": "Google" },
      signal: globalThis.AbortSignal.timeout(10000),
    },
  )
  if (!tokenResponse.ok) throw Error("Metadata authentication failed")
  const { access_token: token } = await tokenResponse.json()
  const payload = { createdAt: new Date().toISOString(), cookie }
  const response = await globalThis.fetch(
    "https://secretmanager.googleapis.com/v1/projects/get-ska-events/secrets/ska-diagnostic-news-session:addVersion",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        payload: {
          data: Buffer.from(JSON.stringify(payload)).toString("base64"),
        },
      }),
      signal: globalThis.AbortSignal.timeout(15000),
    },
  )
  if (!response.ok) throw Error("Could not save diagnostic session")
  process.stdout.write(
    `${JSON.stringify({ event: "diagnostic_session_saved", createdAt: payload.createdAt })}\n`,
  )
}

const fetchWorker = `
let input = ""
for await (const chunk of process.stdin) input += chunk
try {
  const { url, options } = JSON.parse(input)
  const headers = { ...options.headers }
  if (options.contentType) headers["Content-Type"] = options.contentType
  const response = await fetch(url, {
    method: options.method, headers, body: options.payload,
    redirect: "manual", signal: AbortSignal.timeout(25000),
  })
  const resultHeaders = Object.fromEntries(response.headers)
  resultHeaders["set-cookie"] = response.headers.getSetCookie()
  process.stdout.write(JSON.stringify({
    status: response.status, headers: resultHeaders, html: await response.text(),
  }))
} catch {
  process.exitCode = 1
}
`

async function runComparison(profile, userAgent) {
  if (!process.env.SKA_USERNAME || !process.env.SKA_PASSWORD) {
    throw Error("Missing credentials")
  }
  const context = vm.createContext({
    Logger: {
      log: (entry) =>
        process.stdout.write(
          `${JSON.stringify({ profile, ...JSON.parse(entry) })}\n`,
        ),
    },
    UrlFetchApp: {
      getRequest: (url) => ({ url }),
      fetch: (url, options) => {
        const child = spawnSync(
          process.execPath,
          ["--input-type=module", "-e", fetchWorker],
          {
            input: JSON.stringify({ url, options }),
            encoding: "utf8",
            maxBuffer: 8 * 1024 * 1024,
            timeout: 30000,
          },
        )
        if (child.status !== 0) throw Error("HTTP worker failed")
        const data = JSON.parse(child.stdout)
        return {
          getResponseCode: () => data.status,
          getAllHeaders: () => data.headers,
          getContentText: () => data.html,
        }
      },
    },
  })
  vm.runInContext(
    readFileSync(new URL("../../Training.js", import.meta.url), "utf8"),
    context,
  )
  let client
  const originalClientFactory = context.createTrainingHttpClient
  context.createTrainingHttpClient = (...args) => {
    client = originalClientFactory(...args)
    return client
  }
  // Only replace secret retrieval; login, cookie handling, redirects, and parser
  // are exactly the same functions used in the live Apps Script experiment.
  context.getTrainingSecret = (name) => {
    if (name === "ska-username") return process.env.SKA_USERNAME
    if (name === "ska-password") return process.env.SKA_PASSWORD
    throw Error("Unknown secret")
  }
  const result = userAgent
    ? context.getTrainingCalendar(2026, 12, { userAgent })
    : context.testTrainingHttpBrowserAgent()
  process.stdout.write(
    `${JSON.stringify({ event: "http_comparison_result", profile, result })}\n`,
  )
  if (process.env.EXPORT_NEWS_SESSION === "true") {
    await saveDiagnosticSession(
      client.cookieHeaderFor("https://news.ska.org/calendars/calendar/"),
    )
  }
}

const profiles =
  process.env.EXPORT_NEWS_SESSION === "true"
    ? []
    : [["browser-control", undefined]]
if (process.env.APPS_SCRIPT_USER_AGENT)
  profiles.push(["apps-script-agent", process.env.APPS_SCRIPT_USER_AGENT])
for (const [profile, agent] of profiles) {
  try {
    await runComparison(profile, agent)
    process.stdout.write(
      `${JSON.stringify({ event: "http_comparison_complete", profile, success: true })}\n`,
    )
  } catch {
    process.stderr.write(
      `${JSON.stringify({ event: "http_comparison_complete", profile, success: false })}\n`,
    )
    process.exitCode = 1
  }
}
