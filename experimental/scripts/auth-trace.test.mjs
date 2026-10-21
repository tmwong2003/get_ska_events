import test from "node:test"
import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { attachAuthTrace, cookieMetadata, safeUrl } from "./auth-trace.mjs"

test("URLs and cookies retain diagnostic metadata without credential values", () => {
  assert.deepEqual(
    safeUrl("https://news.ska.org/?src=driven&id=123&auth=SECRET#SECRET"),
    {
      host: "news.ska.org",
      path: "/",
      queryKeys: ["src", "id", "auth"],
    },
  )
  assert.deepEqual(
    cookieMetadata(
      "PHPSESSID=SECRET; Domain=.ska.org; Path=/; Secure; HttpOnly; SameSite=Lax",
    ),
    {
      name: "PHPSESSID",
      domain: ".ska.org",
      path: "/",
      secure: true,
      httponly: true,
      samesite: "Lax",
    },
  )
})

test("trace links redirects and drains asynchronous response metadata", async () => {
  const context = new EventEmitter()
  const entries = []
  const finish = attachAuthTrace(
    context,
    (entry) => entries.push(entry),
    () => "test",
  )
  const request = {
    isNavigationRequest: () => true,
    url: () => "https://secure.ska.org/en/cfilters/news",
    method: () => "GET",
    redirectedFrom: () => null,
    headerValue: async () => "PHPSESSID=SECRET; other=SECRET",
  }
  context.emit("request", request)
  context.emit("response", {
    request: () => request,
    url: request.url,
    status: () => 302,
    headersArray: async () => [
      { name: "Location", value: "https://news.ska.org/?auth=SECRET" },
      { name: "Set-Cookie", value: "PHPSESSID=SECRET; Path=/; HttpOnly" },
    ],
  })
  context.emit("request", {
    ...request,
    url: () => "https://news.ska.org/?auth=SECRET",
    redirectedFrom: () => request,
  })
  await finish()
  assert.equal(entries.find((e) => e.id === 2).redirectedFrom, 1)
  assert.equal(entries.find((e) => e.event === "auth_response").status, 302)
  assert.equal(JSON.stringify(entries).includes("SECRET"), false)
  assert.equal(entries.at(-1).loggingFailures, 0)
  assert.equal(context.listenerCount("request"), 0)
})
