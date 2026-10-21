import test from "node:test"
import assert from "node:assert/strict"
import { Buffer } from "node:buffer"
import { URL, URLSearchParams } from "node:url"
import { getSyllabus, parseSyllabus } from "./syllabus.mjs"

const calendarUrl = "https://news.ska.org/calendars/calendar/"
const fixture = `<table><tr><td class="calendar-month">December 2026</td></tr></table>
<table border="1 cellspacing=" 4'=""><tr><th>TRAINING</th><th>JUNIOR</th><th>SENIOR</th></tr>
<tr><th>KATA</th><td>Heian Nidan</td><td>Bassai</td></tr>
<tr><th>KIHON</th><td><p>Ten no kata</p></td><td>Ten no kata</td></tr>
<tr><th>KUMITE</th><td>Ippon kumite</td><td><p>Jiyu kumite slow</p><p>Study strategy &amp; timing</p></td></tr></table>`
function reply(url, body = "", status = 200, headers = {}) {
  const response = new globalThis.Response(body, { status, headers })
  Object.defineProperty(response, "url", { value: url })
  return response
}
function site({ externalRedirect = false } = {}) {
  const calls = []
  return {
    calls,
    getAccessToken: async () => "GOOGLE_SECRET",
    fetch: async (input, options) => {
      const url = String(input)
      const target = new URL(url)
      const headers = new globalThis.Headers(options.headers)
      const cookie = headers.get("cookie")
      calls.push({ url, cookie })
      if (target.hostname === "secretmanager.googleapis.com") {
        assert.equal(headers.get("authorization"), "Bearer GOOGLE_SECRET")
        const secret = url.includes("ska-username")
          ? "user@example.org"
          : "PASSWORD&+="
        return reply(
          url,
          JSON.stringify({
            payload: { data: Buffer.from(secret).toString("base64") },
          }),
        )
      }
      assert.equal(headers.has("authorization"), false)
      if (
        target.hostname === "news.ska.org" &&
        target.pathname === "/calendars/calendar/" &&
        !cookie
      ) {
        return reply(url, "", 302, {
          "Set-Cookie": "PHPSESSID=NEWS; Path=/",
          Location: "https://secure.ska.org/en/account/login",
        })
      }
      if (
        target.pathname === "/en/account/login" &&
        options.method !== "POST"
      ) {
        assert.equal(cookie?.includes("NEWS") ?? false, false)
        return reply(
          url,
          '<form><input type="hidden" name="csrf" value="CSRF&amp;SECRET"><input name="pass"></form>',
          200,
          { "Set-Cookie": "PHPSESSID=SECURE; Path=/" },
        )
      }
      if (target.pathname === "/en/account/login") {
        assert.equal(cookie, "PHPSESSID=SECURE")
        const form = new URLSearchParams(options.body)
        assert.equal(form.get("pass"), "PASSWORD&+=")
        assert.equal(form.get("email"), "user@example.org")
        assert.equal(form.get("csrf"), "CSRF&SECRET")
        return reply(url, "", 302, {
          "Set-Cookie": "PHPSESSID=SECURE_ROTATED; Path=/",
          Location: "/en/account",
        })
      }
      if (target.pathname === "/en/account") {
        assert.equal(options.method, "GET")
        assert.equal(options.body, undefined)
        assert.equal(cookie, "PHPSESSID=SECURE_ROTATED")
        return reply(url)
      }
      if (target.pathname === "/en/cfilters/news") {
        assert.equal(cookie, "PHPSESSID=SECURE_ROTATED")
        return reply(url, "", 302, {
          Location: externalRedirect
            ? "https://attacker.invalid/?auth=TOKEN_SECRET"
            : "https://news.ska.org/?src=driven&id=42&ip=192.0.2.1&auth=TOKEN_SECRET",
        })
      }
      if (target.pathname === "/") {
        assert.equal(cookie, "PHPSESSID=NEWS")
        assert.equal(target.searchParams.get("auth"), "TOKEN_SECRET")
        return reply(url, "", 302, {
          Location: "/calendars/calendar/",
          "Set-Cookie": "PHPSESSID=NEWS_AUTH; Path=/",
        })
      }
      if (target.pathname === "/calendars/calendar/") {
        assert.equal(cookie, "PHPSESSID=NEWS_AUTH")
        if (target.search) {
          assert.equal(target.searchParams.get("calendar_month"), "dec")
          assert.equal(target.searchParams.get("calendar_yr"), "2026")
        }
        return reply(url, fixture)
      }
      throw Error("Unexpected request with TOKEN_SECRET")
    },
  }
}

test("fresh login reads secrets, follows the original handoff and isolates host cookies", async () => {
  const mock = site()
  const result = await getSyllabus({ year: 2026, month: 12 }, mock)
  assert.equal(result.training[0].junior, "Heian Nidan")
  assert.equal(
    result.training[2].senior,
    "Jiyu kumite slow\nStudy strategy & timing",
  )
  assert.equal(
    mock.calls.filter((call) =>
      call.url.includes("secretmanager.googleapis.com"),
    ).length,
    2,
  )
  const firstRunLength = mock.calls.length
  await getSyllabus({ year: 2026, month: 12 }, mock)
  assert.equal(
    mock.calls.slice(firstRunLength).find((call) => call.url === calendarUrl)
      .cookie,
    null,
  )
})

test("HTML parser rejects missing or wrong month rather than returning stale training", () => {
  assert.throws(() => parseSyllabus(fixture, 2026, 11), /month not found/)
  assert.throws(
    () =>
      parseSyllabus(
        '<table><tr><td class="calendar-month">December 2026</td></tr></table>',
        2026,
        12,
      ),
    /table not found/,
  )
})

test("invalid arguments are rejected before authentication or networking", async () => {
  const mock = site()
  await assert.rejects(
    getSyllabus({ year: 2026, month: 13 }, mock),
    /Provide a year/,
  )
  await assert.rejects(
    getSyllabus({ year: 2026, month: 12, projectId: "../other" }, mock),
    /project ID/,
  )
  assert.equal(mock.calls.length, 0)
})

test("redirects outside SKA fail without leaking token URLs through errors", async () => {
  const mock = site({ externalRedirect: true })
  await assert.rejects(
    getSyllabus({ year: 2026, month: 12 }, mock),
    (error) => {
      assert.equal(
        error.message,
        "Syllabus request failed while authenticating to SKA News.",
      )
      assert.equal(error.cause, undefined)
      return true
    },
  )
  assert.equal(
    mock.calls.some((call) => call.url.includes("attacker.invalid")),
    false,
  )
})

test("credential read errors are sanitized before contacting the website", async () => {
  await assert.rejects(
    getSyllabus(
      { year: 2026, month: 12 },
      {
        getAccessToken: async () => {
          throw Error("GOOGLE_SECRET")
        },
        fetch: async () => {
          throw Error("Should not fetch")
        },
      },
    ),
    {
      message:
        "Syllabus request failed while reading SKA credentials from Secret Manager.",
    },
  )
})
