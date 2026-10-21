import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { URL } from "node:url"
import vm from "node:vm"
import { observeRequest } from "./request-transport-probe.mjs"

const request = (overrides = {}) => ({
  url: "/probe?case=browser-exact&sample=a%2Bb%2Fc%3D&space=hello%20world",
  method: "GET",
  httpVersion: "1.1",
  socket: { remoteAddress: "192.0.2.100" },
  headers: {
    "x-diagnostic-client": "apps-script",
    "user-agent": "requested-agent",
    cookie: "ska_probe=synthetic-only; ska_probe_second=synthetic-two",
    "x-forwarded-for": "192.0.2.1, 192.0.2.2",
    authorization: "Bearer NEVER_LOG_ME",
    "x-private": "NEVER_LOG_ME",
  },
  ...overrides,
})

test("probe distinguishes exact bytes from equivalent decoded query", () => {
  const exact = observeRequest(request(), "")
  assert.equal(exact.queryBytesMatchExpected, true)
  assert.equal(exact.decodedQueryMatchesExpected, true)
  const altered = observeRequest(
    request({
      url: "/probe?case=browser-exact&sample=a%2bb%2fc%3d&space=hello+world",
    }),
    "",
  )
  assert.equal(altered.queryBytesMatchExpected, false)
  assert.equal(altered.decodedQueryMatchesExpected, true)
})

test("probe omits credentials and hashes address metadata consistently", () => {
  const first = observeRequest(request(), "")
  const second = observeRequest(request(), "")
  assert.equal(first.authorizationPresent, true)
  assert.equal(first.cookieMatchesExpected, true)
  assert.equal(first.headers["user-agent"], "requested-agent")
  assert.deepEqual(first.forwardingFingerprints, second.forwardingFingerprints)
  assert.equal(first.forwardingFingerprints["x-forwarded-for"].length, 2)
  assert.equal(JSON.stringify(first).includes("NEVER_LOG_ME"), false)
  assert.equal(JSON.stringify(first).includes("192.0.2."), false)
})

test("shared synthetic fixtures satisfy probe contract including form bytes", () => {
  const context = vm.createContext({})
  vm.runInContext(
    readFileSync(new URL("../TransportProbe.js", import.meta.url), "utf8"),
    context,
  )
  for (const probe of context.transportProbeCases()) {
    const headers = Object.fromEntries(
      Object.entries(probe.headers).map(([key, value]) => [
        key.toLowerCase(),
        value,
      ]),
    )
    if (probe.contentType) headers["content-type"] = probe.contentType
    const result = observeRequest(
      request({
        method: probe.method.toUpperCase(),
        url: `/probe?case=${probe.name}&sample=a%2Bb%2Fc%3D&space=hello%20world`,
        headers,
      }),
      probe.payload || "",
    )
    assert.equal(result.cookieMatchesExpected, true)
    assert.equal(result.queryBytesMatchExpected, true)
    assert.equal(result.bodyMatchesExpected, true)
  }
  assert.equal(
    observeRequest(request({ url: "/other?auth=NEVER_LOG_ME" }), ""),
    null,
  )
})

test("combined header test requires receiver verification before starting login", () => {
  const context = vm.createContext({
    Logger: { log: () => {} },
    UrlFetchApp: {
      fetch: () => ({
        getResponseCode: () => 200,
        getContentText: () =>
          JSON.stringify({
            headers: {
              accept: "*/*",
              "accept-language": "*",
              "sec-fetch-mode": "cors",
            },
          }),
      }),
    },
    testTrainingHttpOptions: (options) => options.nodeHeaders,
  })
  vm.runInContext(
    readFileSync(new URL("../TransportProbe.js", import.meta.url), "utf8"),
    context,
  )
  assert.equal(context.testTrainingHttpNodeHeaders(), true)
  context.UrlFetchApp.fetch = () => ({
    getResponseCode: () => 200,
    getContentText: () => JSON.stringify({ headers: {} }),
  })
  assert.throws(
    () => context.testTrainingHttpNodeHeaders(),
    /login test skipped/,
  )
})
