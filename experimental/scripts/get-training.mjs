import { chromium } from "playwright"
import { mkdir, chmod } from "node:fs/promises"
import { existsSync } from "node:fs"
import { fileURLToPath, URL } from "node:url"
import { parseArgs } from "node:util"
import { createInterface } from "node:readline/promises"
import { stdin, stdout, stderr } from "node:process"
import { attachAuthTrace } from "./auth-trace.mjs"

const months = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ")
const calendarUrl = "https://news.ska.org/calendars/calendar/"
const authDir = fileURLToPath(
  new URL("../../.cache/training/", import.meta.url),
)
const authPath = `${authDir}/session.json`
let stage = "validating arguments"

// Runs in the browser, so keep this function independent of Node globals.
export function extractTraining() {
  const clean = (value) => value.replace(/\s+/g, " ").trim()
  const table = Array.from(document.querySelectorAll("table")).find(
    (candidate) =>
      Array.from(candidate.rows[0]?.cells ?? [], (cell) =>
        clean(cell.textContent),
      ).join("|") === "TRAINING|JUNIOR|SENIOR",
  )
  if (!table) throw new Error("Training syllabus table not found")

  const text = (cell) =>
    cell.innerText.split(/\n+/).map(clean).filter(Boolean).join("\n")

  return Array.from(table.rows)
    .slice(1)
    .map((row) => {
      if (row.cells.length !== 3) {
        throw new Error("Unexpected training syllabus row structure")
      }
      return {
        training: text(row.cells[0]),
        junior: text(row.cells[1]),
        senior: text(row.cells[2]),
      }
    })
}

async function main() {
  const { values } = parseArgs({
    options: {
      month: { type: "string" },
      year: { type: "string" },
      help: { type: "boolean" },
      "fresh-login": { type: "boolean" },
      headless: { type: "boolean" },
      "trace-auth": { type: "boolean" },
    },
  })
  if (values.help) {
    stdout.write(
      "Usage: node experimental/scripts/get-training.mjs --month 12 --year 2026 [--fresh-login] [--headless] [--trace-auth]\nAutomatic login reads SKA_USERNAME and SKA_PASSWORD from the environment.\n",
    )
    return
  }
  if (!/^(?:[1-9]|1[0-2])$/.test(values.month ?? "")) {
    throw new Error("Provide --month as a number from 1 to 12")
  }
  if (!/^\d{4}$/.test(values.year ?? "")) {
    throw new Error("Provide --year as a four-digit year")
  }
  const month = Number(values.month)
  const year = Number(values.year)
  const username = process.env.SKA_USERNAME
  const password = process.env.SKA_PASSWORD
  if (Boolean(username) !== Boolean(password)) {
    throw new Error("Set both SKA_USERNAME and SKA_PASSWORD")
  }
  stage = "opening the browser"
  const browser = await chromium.launch({ headless: Boolean(values.headless) })
  let finishTrace
  try {
    const context = await browser.newContext({
      storageState:
        !values["fresh-login"] && existsSync(authPath) ? authPath : undefined,
    })
    if (values["trace-auth"]) {
      finishTrace = attachAuthTrace(
        context,
        (entry) => stderr.write(`${JSON.stringify(entry)}\n`),
        () => stage,
      )
    }
    const page = await context.newPage()
    page.setDefaultTimeout(20_000)
    page.setDefaultNavigationTimeout(30_000)
    stage = "opening the calendar with cached authentication"
    await page.goto(calendarUrl)

    const isCalendar = async () =>
      new URL(page.url()).origin === "https://news.ska.org" &&
      (await page.locator('select[name="calendar_month"]').isVisible())

    if (values["fresh-login"] || !(await isCalendar())) {
      if (username && password) {
        stderr.write("Authenticating and opening Training Calendar…\n")
        stage = "loading the login page"
        await page.goto("https://secure.ska.org/en/account/login")
        stage = "filling the login form"
        await page
          .getByRole("textbox", { name: "Email *", exact: true })
          .fill(username)
        await page
          .getByRole("textbox", { name: "Password *", exact: true })
          .fill(password)
        stage = "submitting login"
        await page.getByRole("button", { name: "Login", exact: true }).click()
        stage = "following SKA News"
        await page
          .getByRole("link", { name: "SKA News ⤴", exact: true })
          .click()
        stage = "opening Training Calendar after the authentication handoff"
        await page.waitForURL((url) => url.origin === "https://news.ska.org", {
          waitUntil: "domcontentloaded",
        })
        await page.goto(calendarUrl, { waitUntil: "domcontentloaded" })
        stage = "waiting for the calendar controls"
        await page.locator('select[name="calendar_month"]').waitFor()
      } else {
        if (values.headless || !stdin.isTTY) {
          stderr.write(
            "Set SKA_USERNAME and SKA_PASSWORD for unattended login.\n",
          )
          throw new Error(
            "Session needs login. Run from an interactive terminal.",
          )
        }
        await page.goto("https://secure.ska.org/en/account/login")
        const terminal = createInterface({ input: stdin, output: stderr })
        try {
          await terminal.question(
            "Log in in the browser, follow SKA News → Training Calendar, then press Enter here.\n",
          )
        } finally {
          terminal.close()
        }
      }
      if (!(await isCalendar())) {
        throw new Error(
          "Open Training Calendar in the original browser tab and retry",
        )
      }
    }

    // The supplied calendar form uses GET. Navigate to its equivalent URL,
    // avoiding clicks/scrolling while the freshly loaded page is settling.
    stage = "loading the requested month"
    stderr.write(
      `Loading training syllabus for ${year}-${String(month).padStart(2, "0")}…\n`,
    )
    const requestedUrl = new URL(calendarUrl)
    requestedUrl.searchParams.set("calendar_month", months[month - 1])
    requestedUrl.searchParams.set("calendar_yr", values.year)
    await page.goto(requestedUrl.href, { waitUntil: "domcontentloaded" })
    stage = "checking the requested calendar month"
    const heading = await page.locator(".calendar-month").innerText()
    const expectedHeading = new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(year, month - 1, 1)))
    if (heading.trim() !== expectedHeading) {
      throw new Error("Calendar did not load the requested month and year")
    }
    stage = "extracting the training syllabus"
    const training = await page.evaluate(extractTraining)
    if (training.map((row) => row.training).join("|") !== "KATA|KIHON|KUMITE") {
      throw new Error("Expected KATA, KIHON, and KUMITE syllabus rows")
    }

    stage = "saving the authenticated session"
    await mkdir(authDir, { recursive: true, mode: 0o700 })
    await chmod(authDir, 0o700)
    await context.storageState({ path: authPath })
    await chmod(authPath, 0o600)
    stdout.write(`${JSON.stringify({ year, month, training }, null, 2)}\n`)
  } finally {
    if (finishTrace) await finishTrace()
    await browser.close()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    // Browser errors can contain authentication URLs; keep those out of logs.
    stderr.write(
      `Training extraction failed while ${stage}${error?.name === "TimeoutError" ? " (timed out)" : ""}. Use --help for usage.\n`,
    )
    process.exitCode = 1
  })
}
