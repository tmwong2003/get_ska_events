import assert from "node:assert/strict"
import { Buffer } from "node:buffer"
import { readFileSync } from "node:fs"
import test from "node:test"
import { URL } from "node:url"
import vm from "node:vm"

const syllabusSource = readFileSync(
  new URL("../apps/script/Syllabus.js", import.meta.url),
  "utf8",
)
const expectedSyllabus = {
  year: 2026,
  month: 12,
  training: ["KATA", "KIHON", "KUMITE"].map((training) => ({
    training,
    junior: "Junior\ntraining",
    senior: "Senior training",
  })),
}
const testIdentityToken = "test-id-token"

test("the manual live syllabus test checks its result without logging content", () => {
  for (const valid of [true, false]) {
    const logs = []
    const context = vm.createContext({
      getSyllabus(year, month) {
        assert.equal(year, 2026)
        assert.equal(month, 10)
        return {
          ...expectedSyllabus,
          month: valid ? 10 : 12,
        }
      },
      Logger: { log: (message) => logs.push(message) },
    })
    vm.runInContext(
      readFileSync(new URL("../apps/script/Test.js", import.meta.url), "utf8"),
      context,
    )
    if (valid) {
      assert.equal(vm.runInContext("test_getSyllabus()", context), true)
      assert.deepEqual(logs, ["Retrieved 2026-10: 3 training categories"])
    } else {
      assert.throws(
        () => vm.runInContext("test_getSyllabus()", context),
        /Live syllabus test failed/,
      )
      assert.deepEqual(logs, [])
    }
  }
})

function createSyllabusContext({
  serviceUrl = "https://ska-syllabus-example-uw.a.run.app",
  token = testIdentityToken,
  status = 200,
  body = JSON.stringify(expectedSyllabus),
} = {}) {
  const requests = []
  const logs = []
  let tokenCalls = 0
  const context = vm.createContext({
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty(name) {
          assert.equal(name, "SYLLABUS_SERVICE_URL")
          return serviceUrl
        },
      }),
    },
    ScriptApp: {
      getIdentityToken() {
        tokenCalls++
        return token
      },
    },
    UrlFetchApp: {
      fetch(url, options) {
        requests.push({ url, options })
        return {
          getResponseCode: () => status,
          getContentText: () => body,
        }
      },
    },
    Utilities: {
      base64DecodeWebSafe: (value) => Buffer.from(value, "base64url"),
      newBlob: (value) => ({ getDataAsString: () => value.toString("utf8") }),
    },
    Logger: { log: (value) => logs.push(value) },
  })
  vm.runInContext(syllabusSource, context, { filename: "Syllabus.js" })
  return { context, requests, logs, tokenCalls: () => tokenCalls }
}

test("getSyllabus sends an authenticated GET and returns the syllabus", () => {
  for (const serviceUrl of [
    "https://ska-syllabus-example-uw.a.run.app",
    "https://ska-syllabus-example-uw.a.run.app/",
    "https://ska-syllabus-123456789.us-west1.run.app",
  ]) {
    const { context, requests, logs } = createSyllabusContext({
      serviceUrl,
    })
    const result = vm.runInContext("getSyllabus(2026, 12)", context)
    assert.deepEqual(JSON.parse(JSON.stringify(result)), expectedSyllabus)
    assert.equal(requests.length, 1)
    assert.equal(
      requests[0].url,
      `${serviceUrl.replace(/\/$/, "")}/?year=2026&month=12`,
    )
    assert.deepEqual(JSON.parse(JSON.stringify(requests[0].options)), {
      method: "get",
      headers: { Authorization: `Bearer ${testIdentityToken}` },
      followRedirects: false,
      muteHttpExceptions: true,
    })
    assert.deepEqual(logs, [])
  }
})

test("getSyllabusAsTable formats the syllabus as an HTML table", () => {
  const { context, requests } = createSyllabusContext()
  const table = vm.runInContext("getSyllabusAsTable(2026, 12)", context)

  assert.equal(typeof table, "string")
  assert.ok(table.includes("<th>Training</th>"))
  assert.ok(table.includes("<th>Junior</th>"))
  assert.ok(table.includes("<th>Senior</th>"))
  for (const row of expectedSyllabus.training) {
    assert.ok(
      table.includes(
        `<td>${row.training}</td>\n      <td>${row.junior}</td>\n      <td>${row.senior}</td>`,
      ),
    )
  }
  assert.equal(requests.length, 1)
})

test("getSyllabus rejects invalid inputs before requesting a token", () => {
  for (const args of [
    "1995, 1",
    "2056, 1",
    "2026, 0",
    "2026, 13",
    "2026.5, 1",
    "2026, 1.5",
    "'2026', 12",
    "2026, '12'",
    "NaN, 1",
    "2026",
  ]) {
    const { context, requests, tokenCalls } = createSyllabusContext()
    assert.throws(
      () => vm.runInContext(`getSyllabus(${args})`, context),
      /Provide year/,
    )
    assert.equal(requests.length, 0)
    assert.equal(tokenCalls(), 0)
  }
})

test("getSyllabus accepts the supported date boundaries", () => {
  for (const [year, month] of [
    [1996, 1],
    [2055, 12],
  ]) {
    const syllabus = { ...expectedSyllabus, year, month }
    const { context } = createSyllabusContext({
      body: JSON.stringify(syllabus),
    })
    const result = vm.runInContext(`getSyllabus(${year}, ${month})`, context)
    assert.deepEqual(JSON.parse(JSON.stringify(result)), syllabus)
  }
})

test("getSyllabus rejects missing or unsafe service URLs before authentication", () => {
  for (const serviceUrl of [
    null,
    "",
    "http://ska-syllabus-example.run.app",
    "https://example.org",
    "https://ska-syllabus-example.run.app.evil.example",
    "https://ska-syllabus-example.run.app/path",
    "https://ska-syllabus-example.run.app?year=2025",
  ]) {
    const { context, requests, tokenCalls } = createSyllabusContext({
      serviceUrl,
    })
    assert.throws(
      () => vm.runInContext("getSyllabus(2026, 12)", context),
      /Set SYLLABUS_SERVICE_URL/,
    )
    assert.equal(requests.length, 0)
    assert.equal(tokenCalls(), 0)
  }
})

test("syllabus functions fail explicitly when authorization is missing", () => {
  for (const expression of ["getSyllabus(2026, 12)", "logSyllabusAudience()"]) {
    const { context, requests } = createSyllabusContext({ token: null })
    assert.throws(
      () => vm.runInContext(expression, context),
      /Reauthorize the script/,
    )
    assert.equal(requests.length, 0)
  }
})

test("getSyllabus reports HTTP failures without including the response body", () => {
  for (const status of [302, 400, 401, 403, 405, 502]) {
    const { context, logs } = createSyllabusContext({
      status,
      body: "private upstream content",
    })
    assert.throws(
      () => vm.runInContext("getSyllabus(2026, 12)", context),
      (error) => {
        assert.match(error.message, new RegExp(`HTTP ${status}`))
        assert.doesNotMatch(error.message, /private/)
        return true
      },
    )
    assert.deepEqual(logs, [])
  }
})

test("getSyllabus rejects invalid JSON without exposing response content", () => {
  const { context } = createSyllabusContext({ body: "private invalid JSON" })
  assert.throws(() => vm.runInContext("getSyllabus(2026, 12)", context), {
    message: "The syllabus service returned invalid JSON.",
  })
})

test("getSyllabus validates the requested month and all training rows", () => {
  for (const syllabus of [
    null,
    {},
    { ...expectedSyllabus, year: 2025 },
    { ...expectedSyllabus, month: 11 },
    { ...expectedSyllabus, training: {} },
    { ...expectedSyllabus, training: [] },
    { ...expectedSyllabus, training: [null, null, null] },
    {
      ...expectedSyllabus,
      training: expectedSyllabus.training.toReversed(),
    },
    {
      ...expectedSyllabus,
      training: expectedSyllabus.training.map((row) => ({
        ...row,
        junior: null,
      })),
    },
    {
      ...expectedSyllabus,
      training: expectedSyllabus.training.map((row) => ({
        ...row,
        senior: 123,
      })),
    },
  ]) {
    const { context } = createSyllabusContext({
      body: JSON.stringify(syllabus),
    })
    assert.throws(
      () => vm.runInContext("getSyllabus(2026, 12)", context),
      /unexpected syllabus/,
    )
  }
})

test("logSyllabusAudience logs only the decoded audience, not the token", () => {
  const audience = "example-client.apps.googleusercontent.com"
  const claims = Buffer.from(
    JSON.stringify({ aud: audience, email: "private@example.org" }),
  ).toString("base64url")
  const { context, logs, requests } = createSyllabusContext({
    token: `header.${claims}.private-signature`,
  })
  assert.equal(vm.runInContext("logSyllabusAudience()", context), audience)
  assert.deepEqual(logs, [audience])
  assert.equal(requests.length, 0)
})

test("logSyllabusAudience rejects a missing audience without logging claims", () => {
  const claims = Buffer.from(JSON.stringify({ sub: "private-user" })).toString(
    "base64url",
  )
  const { context, logs } = createSyllabusContext({
    token: `header.${claims}.signature`,
  })
  assert.throws(
    () => vm.runInContext("logSyllabusAudience()", context),
    /no audience/,
  )
  assert.deepEqual(logs, [])
})

test("the Apps Script manifest declares syllabus authentication scopes", () => {
  const manifest = JSON.parse(
    readFileSync(
      new URL("../apps/script/appsscript.json", import.meta.url),
      "utf8",
    ),
  )
  for (const scope of [
    "openid",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/script.send_mail",
  ]) {
    assert.ok(manifest.oauthScopes.includes(scope), `Missing scope: ${scope}`)
  }
})
