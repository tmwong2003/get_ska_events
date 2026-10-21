import test from "node:test"
import assert from "node:assert/strict"
import { createSyllabusHandler } from "./function.mjs"

function response() {
  return {
    code: 200,
    headers: {},
    body: undefined,
    set(key, value) {
      this.headers[key] = value
      return this
    },
    status(code) {
      this.code = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

test("function returns the selected syllabus as JSON", async () => {
  const result = { year: 2026, month: 12, training: [] }
  const handler = createSyllabusHandler(async (input) => {
    assert.equal(input.year, 2026)
    assert.equal(input.month, 12)
    return result
  })
  const res = response()
  await handler({ method: "GET", query: { year: "2026", month: "12" } }, res)
  assert.equal(res.code, 200)
  assert.deepEqual(res.body, result)
  assert.equal(res.headers["Cache-Control"], "no-store")
})

test("invalid HTTP requests never read secrets or log in", async () => {
  let called = false
  const handler = createSyllabusHandler(async () => {
    called = true
  })
  for (const query of [
    {},
    { year: "2026", month: "13" },
    { year: ["2026", "2027"], month: "12" },
    { year: "2026", month: "1e1" },
  ]) {
    const res = response()
    await handler({ method: "GET", query }, res)
    assert.equal(res.code, 400)
  }
  const res = response()
  await handler({ method: "POST", query: { year: "2026", month: "12" } }, res)
  assert.equal(res.code, 405)
  assert.equal(res.headers.Allow, "GET")
  assert.equal(called, false)
})

test("HTTP errors do not expose upstream credentials or tokens", async () => {
  const handler = createSyllabusHandler(async () => {
    throw Error("PASSWORD_OR_TOKEN")
  })
  const res = response()
  await handler({ method: "GET", query: { year: "2026", month: "12" } }, res)
  assert.equal(res.code, 502)
  assert.equal(JSON.stringify(res.body).includes("PASSWORD_OR_TOKEN"), false)
})
