import { URL } from "node:url"

const hosts = new Set(["secure.ska.org", "news.ska.org"])
const paths = new Set([
  "/",
  "/en/account/login",
  "/en/cfilters/news",
  "/en/account",
  "/en/account/",
  "/calendars/calendar/",
])

export function safeUrl(value, base) {
  try {
    const url = new URL(value, base)
    return {
      host: hosts.has(url.hostname) ? url.hostname : "[other host]",
      path: paths.has(url.pathname) ? url.pathname : "[other path]",
      queryKeys: [...new Set(url.searchParams.keys())],
    }
  } catch {
    return { invalidUrl: true }
  }
}

export function cookieMetadata(value) {
  const [pair, ...attributes] = value.split(";")
  const result = { name: pair.slice(0, pair.indexOf("=")).trim() }
  for (const attribute of attributes) {
    const [key, ...parts] = attribute.trim().split("=")
    const name = key.toLowerCase()
    if (["domain", "path", "samesite"].includes(name)) {
      result[name] = parts.join("=")
    } else if (["secure", "httponly"].includes(name)) {
      result[name] = true
    }
  }
  return result
}

// Only document requests on the two SKA hosts; never bodies or raw headers.
export function attachAuthTrace(context, write, getStage) {
  const ids = new WeakMap()
  const pending = new Set()
  let sequence = 0
  let failures = 0
  const eligible = (request) =>
    request.isNavigationRequest() && hosts.has(new URL(request.url()).hostname)
  const onRequest = (request) => {
    if (!eligible(request)) return
    const id = ++sequence
    ids.set(request, id)
    write({
      event: "auth_request",
      id,
      stage: getStage(),
      method: request.method(),
      url: safeUrl(request.url()),
      redirectedFrom: ids.get(request.redirectedFrom()) ?? null,
    })
  }
  const onResponse = (response) => {
    const request = response.request()
    if (!ids.has(request)) return
    const responseStage = getStage()
    const task = (async () => {
      const headers = await response.headersArray()
      const location = headers.find((h) => h.name.toLowerCase() === "location")
      const sent = await request.headerValue("cookie")
      write({
        event: "auth_response",
        id: ids.get(request),
        stage: responseStage,
        status: response.status(),
        url: safeUrl(response.url()),
        location: location ? safeUrl(location.value, response.url()) : null,
        sentCookieNames: sent
          ? sent.split(";").map((c) => c.trim().split("=")[0])
          : [],
        setCookies: headers
          .filter((h) => h.name.toLowerCase() === "set-cookie")
          .map((h) => cookieMetadata(h.value)),
      })
    })()
      .catch(() => {
        failures++
      })
      .finally(() => pending.delete(task))
    pending.add(task)
  }
  const onFailed = (request) => {
    if (ids.has(request))
      write({
        event: "auth_request_failed",
        id: ids.get(request),
        stage: getStage(),
      })
  }
  context.on("request", onRequest)
  context.on("response", onResponse)
  context.on("requestfailed", onFailed)
  return async () => {
    context.off("request", onRequest)
    context.off("response", onResponse)
    context.off("requestfailed", onFailed)
    await Promise.all([...pending])
    write({
      event: "auth_trace_complete",
      requests: sequence,
      loggingFailures: failures,
    })
  }
}
