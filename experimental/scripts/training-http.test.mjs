import test from "node:test"
import assert from "node:assert/strict"
import vm from "node:vm"
import { readFileSync } from "node:fs"
import { URL } from "node:url"
import { Buffer } from "node:buffer"

const source = readFileSync(
  new URL("../../Training.js", import.meta.url),
  "utf8",
)
function load(globals = {}) {
  return vm.createContext({ ...globals })
}
function response(status, headers = {}, html = "") {
  return {
    getResponseCode: () => status,
    getAllHeaders: () => headers,
    getContentText: () => html,
  }
}
const syllabus = `<table border="1 cellspacing=" 4'=""><tr><th>TRAINING</th><th>JUNIOR</th><th>SENIOR</th></tr>
<tr><th>KATA</th><td>Heian Nidan</td><td>Bassai</td></tr>
<tr><th>KIHON</th><td>Ten no kata</td><td>Ten no kata</td></tr>
<tr><th>KUMITE</th><td>Ippon kumite</td><td><p>Jiyu kumite slow</p><p>Study strategy &amp; timing</p></td></tr></table>`

test("syllabus parser accepts supplied malformed table and preserves paragraph breaks", () => {
  const context = load()
  vm.runInContext(source, context)
  const rows = context.parseTrainingSyllabus(syllabus)
  assert.equal(rows.length, 3)
  assert.equal(rows[2].senior, "Jiyu kumite slow\nStudy strategy & timing")
  assert.throws(
    () => context.parseTrainingSyllabus("<html>Login</html>"),
    /not found/,
  )
})

test("HTTP flow keeps host sessions separate, follows exact token destination and retrieves secrets", () => {
  const logs = []
  const calls = []
  const context = load({
    Logger: { log: (entry) => logs.push(entry) },
    ScriptApp: { getOAuthToken: () => "OAUTH_SECRET" },
    Utilities: {
      base64Decode: (data) => Buffer.from(data, "base64"),
      newBlob: (data) => ({ getDataAsString: () => data.toString("utf8") }),
    },
    UrlFetchApp: {
      getRequest: (url) => ({ url }),
      fetch: (url, params) => {
        calls.push({ url, params })
        if (url.startsWith("https://secretmanager.googleapis.com/")) {
          const value = url.includes("ska-username")
            ? "user@example.org"
            : "PASSWORD&+="
          return response(
            200,
            {},
            JSON.stringify({
              payload: { data: Buffer.from(value).toString("base64") },
            }),
          )
        }
        if (
          url === "https://news.ska.org/calendars/calendar/" &&
          !params.headers.Cookie
        ) {
          return response(302, {
            "Set-Cookie": "PHPSESSID=NEWS_SECRET; Path=/; Secure",
            Location: "https://secure.ska.org/en/account/login",
          })
        }
        if (
          url === "https://secure.ska.org/en/account/login" &&
          params.method === "get"
        ) {
          assert.equal(
            params.headers.Cookie?.includes("NEWS_SECRET") ?? false,
            false,
          )
          return response(
            200,
            {
              "set-cookie": [
                "PHPSESSID=SECURE_SECRET; Path=/; Secure",
                "userid=42; Path=/",
              ],
            },
            '<form><input type="hidden" name="csrf" value="CSRF_SECRET"><input name="pass" type="password"></form>',
          )
        }
        if (params.method === "post") {
          assert.match(params.headers.Cookie, /PHPSESSID=SECURE_SECRET/)
          assert.match(params.payload, /pass=PASSWORD%26%2B%3D/)
          assert.match(params.payload, /csrf=CSRF_SECRET/)
          return response(302, {
            Location: "/en/account",
            "Set-Cookie": "PHPSESSID=ROTATED_SECRET; Path=/",
          })
        }
        if (url === "https://secure.ska.org/en/account") {
          assert.equal(params.method, "get")
          assert.equal(params.payload, undefined)
          assert.match(params.headers.Cookie, /ROTATED_SECRET/)
          return response(200)
        }
        if (url === "https://secure.ska.org/en/cfilters/news")
          return response(302, {
            Location:
              "https://news.ska.org/?src=driven&id=42&ip=IP_SECRET&auth=TOKEN_SECRET",
          })
        if (url.startsWith("https://news.ska.org/?src=")) {
          assert.equal(params.headers.Cookie, "PHPSESSID=NEWS_SECRET")
          return response(302, { Location: "/calendars/calendar/" })
        }
        if (url === "https://news.ska.org/calendars/calendar/")
          return response(200)
        if (url.endsWith("?calendar_month=dec&calendar_yr=2026")) {
          assert.equal(params.headers.Cookie, "PHPSESSID=NEWS_SECRET")
          return response(
            200,
            {},
            `<td class="calendar-month">December 2026</td>${syllabus}`,
          )
        }
        throw Error("Unexpected request")
      },
    },
  })
  vm.runInContext(source, context)
  assert.equal(
    context.getTrainingCalendar(2026, 12).training[0].senior,
    "Bassai",
  )
  assert.equal(
    calls.filter((call) => call.url.includes("secretmanager")).length,
    2,
  )
  assert.equal(logs.join("\n").includes("SECRET"), false)
})

test("redirects cannot exfiltrate credentials outside SKA hosts", () => {
  const context = load()
  vm.runInContext(source, context)
  const client = context.createTrainingHttpClient(
    () => response(307, { Location: "https://attacker.example/" }),
    () => {},
  )
  assert.throws(
    () =>
      client.request("https://secure.ska.org/en/account/login", {
        method: "post",
        payload: "secret",
      }),
    /allowed hosts/,
  )
})

test("cookie paths, deletion and redirect method preservation", () => {
  const context = load()
  vm.runInContext(source, context)
  let step = 0
  const client = context.createTrainingHttpClient(
    (url, params) => {
      step++
      if (step === 1)
        return response(200, {
          "Set-Cookie": ["a=1; Path=/en", "b=2; Path=/", "bad=3; Domain=org"],
        })
      if (step === 2) {
        assert.equal(params.headers.Cookie, "b=2")
        return response(200, { "Set-Cookie": "b=; Path=/; Max-Age=0" })
      }
      if (step === 3) {
        assert.equal(params.headers.Cookie, "a=1")
        return response(307, { Location: "../account/login" })
      }
      assert.equal(url, "https://secure.ska.org/account/login")
      assert.equal(params.method, "post")
      assert.equal(params.payload, "retained")
      assert.equal(params.headers.Cookie, undefined)
      return response(200)
    },
    () => {},
  )
  client.request("https://secure.ska.org/en/account/login")
  client.request("https://secure.ska.org/english")
  client.request("https://secure.ska.org/en/start", {
    method: "post",
    payload: "retained",
  })
})

test("browser-agent comparison adds only the requested User-Agent", () => {
  const context = load()
  vm.runInContext(source, context)
  const logs = []
  const client = context.createTrainingHttpClient(
    (url, params) => {
      assert.equal(params.headers["User-Agent"], "test-browser-agent")
      assert.equal(params.headers.Referer, undefined)
      return response(200)
    },
    (entry) => logs.push(entry),
    { userAgent: "test-browser-agent" },
  )
  client.request("https://news.ska.org/?auth=SECRET")
  assert.equal(logs[0].endpoint, "/")
  assert.equal(logs[0].browserAgentRequested, true)
  assert.equal(JSON.stringify(logs).includes("SECRET"), false)
})

test("exact-URL variant disables escaping without modifying the token URL", () => {
  const context = load()
  vm.runInContext(source, context)
  const tokenUrl = "https://news.ska.org/?auth=TEST%2B%2F%3D&src=driven"
  const client = context.createTrainingHttpClient(
    (url, params) => {
      assert.equal(url, tokenUrl)
      assert.equal(params.escaping, false)
      return response(200)
    },
    () => {},
    { escaping: false },
  )
  client.request(tokenUrl)
})

test("IP diagnostic stops before consuming handoff tokens", () => {
  const context = load()
  vm.runInContext(source, context)
  let requests = 0
  const entries = []
  const client = context.createTrainingHttpClient(
    () => {
      requests++
      return response(302, {
        Location: "https://news.ska.org/?ip=192.0.2.1&auth=TOKEN_SECRET",
      })
    },
    (entry) => entries.push(entry),
  )
  const result = client.request("https://secure.ska.org/en/cfilters/news", {
    stopAtNews: true,
  })
  assert.match(result.url, /TOKEN_SECRET/)
  assert.equal(requests, 1)
  assert.equal(JSON.stringify(entries).includes("TOKEN_SECRET"), false)
  assert.equal(JSON.stringify(entries).includes("192.0.2.1"), false)
})

test("Node-header variant preserves cookies and sends the three measured headers", () => {
  const context = load()
  vm.runInContext(source, context)
  let step = 0
  const client = context.createTrainingHttpClient(
    (url, params) => {
      assert.equal(params.headers.Accept, "*/*")
      assert.equal(params.headers["Accept-Language"], "*")
      assert.equal(params.headers["Sec-Fetch-Mode"], "cors")
      if (step++ === 0)
        return response(302, {
          Location: "/en/account",
          "Set-Cookie": "PHPSESSID=SECRET; Path=/",
        })
      assert.equal(params.headers.Cookie, "PHPSESSID=SECRET")
      return response(200)
    },
    () => {},
    { nodeHeaders: true },
  )
  client.request("https://secure.ska.org/en/account/login")
})

test("news-session reset preserves secure cookies and accepts new news cookies", () => {
  const context = load()
  vm.runInContext(source, context)
  let step = 0
  const entries = []
  const client = context.createTrainingHttpClient(
    (url, params) => {
      step++
      if (step === 1)
        return response(200, { "Set-Cookie": "PHPSESSID=NEWS_OLD; Path=/" })
      if (step === 2)
        return response(200, { "Set-Cookie": "PHPSESSID=SECURE; Path=/" })
      if (step === 3) {
        assert.equal(params.headers.Cookie, "PHPSESSID=SECURE")
        return response(302, { Location: "https://news.ska.org/?auth=SECRET" })
      }
      if (step === 4) {
        assert.equal(params.headers.Cookie, undefined)
        return response(302, {
          Location: "/calendars/calendar/",
          "Set-Cookie": "PHPSESSID=NEWS_NEW; Path=/",
        })
      }
      assert.equal(params.headers.Cookie, "PHPSESSID=NEWS_NEW")
      return response(200)
    },
    (entry) => entries.push(entry),
  )
  client.request("https://news.ska.org/calendars/calendar/")
  client.request("https://secure.ska.org/en/account/login")
  client.clearCookiesForHost("news.ska.org")
  client.request("https://secure.ska.org/en/cfilters/news")
  assert.equal(
    entries.find((entry) => entry.event === "training_cookie_reset").removed,
    1,
  )
  assert.equal(JSON.stringify(entries).includes("NEWS_OLD"), false)
  assert.equal(JSON.stringify(entries).includes("NEWS_NEW"), false)
  assert.equal(JSON.stringify(entries).includes("SECRET"), false)
})

test("exported cookie header contains only cookies valid for the requested host", () => {
  const context = load()
  vm.runInContext(source, context)
  const client = context.createTrainingHttpClient(
    (url) =>
      response(200, {
        "Set-Cookie": url.includes("secure.ska.org")
          ? "PHPSESSID=SECURE_SECRET; Path=/"
          : "PHPSESSID=NEWS_SECRET; Path=/",
      }),
    () => {},
  )
  client.request("https://secure.ska.org/en/account/login")
  client.request("https://news.ska.org/calendars/calendar/")
  assert.equal(
    client.cookieHeaderFor("https://news.ska.org/calendars/calendar/"),
    "PHPSESSID=NEWS_SECRET",
  )
})

test("imported-session test requests only the calendar and never logs cookie values", () => {
  const logs = []
  let calls = 0
  const context = load({
    Logger: { log: (entry) => logs.push(entry) },
    UrlFetchApp: {
      fetch: (url, options) => {
        calls++
        assert.equal(
          url,
          "https://news.ska.org/calendars/calendar/?calendar_month=dec&calendar_yr=2026",
        )
        assert.equal(options.headers.Cookie, "PHPSESSID=NEWS_SECRET")
        assert.equal(options.followRedirects, false)
        return response(
          200,
          {},
          `<td class="calendar-month">December 2026</td>${syllabus}`,
        )
      },
    },
  })
  vm.runInContext(source, context)
  context.getTrainingSecret = () =>
    JSON.stringify({
      createdAt: new Date().toISOString(),
      cookie: "PHPSESSID=NEWS_SECRET",
    })
  assert.equal(
    context.testTrainingImportedSession().training[0].senior,
    "Bassai",
  )
  assert.equal(calls, 1)
  assert.equal(logs.join("\n").includes("NEWS_SECRET"), false)
  context.UrlFetchApp.fetch = () =>
    response(302, { Location: "https://secure.ska.org/" })
  assert.throws(() => context.testTrainingImportedSession(), /not accepted/)
  context.getTrainingSecret = () =>
    JSON.stringify({
      createdAt: "2020-01-01T00:00:00Z",
      cookie: "PHPSESSID=NEWS_SECRET",
    })
  assert.throws(
    () => context.testTrainingImportedSession(),
    /older than 15 minutes/,
  )
})
