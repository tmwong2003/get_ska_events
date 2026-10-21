import { createServer } from "node:http"
import { createHash } from "node:crypto"
import { Buffer } from "node:buffer"
import { URL, fileURLToPath } from "node:url"

const hash = (value) => createHash("sha256").update(value).digest("hex")
const cases = new Set(["default", "browser", "browser-exact", "form"])
const expectedCookie =
  "ska_probe=synthetic-only; ska_probe_second=synthetic-two"
const expectedBody = "probe_message=a%2Bb%2Fc%3D&probe_space=hello%20world"

export function observeRequest(request, body) {
  const url = new URL(request.url, "https://probe.invalid")
  const name = url.searchParams.get("case")
  if (
    url.pathname !== "/probe" ||
    !cases.has(name) ||
    !["GET", "POST"].includes(request.method)
  )
    return null
  const client = ["apps-script", "cloud-run-node"].includes(
    request.headers["x-diagnostic-client"],
  )
    ? request.headers["x-diagnostic-client"]
    : "unknown"
  const publicHeaders = {}
  for (const key of [
    "user-agent",
    "accept",
    "accept-encoding",
    "accept-language",
    "content-type",
    "content-length",
    "sec-fetch-mode",
    "via",
  ]) {
    if (request.headers[key])
      publicHeaders[key] = String(request.headers[key]).slice(0, 1024)
  }
  const forwarding = {}
  // Hash address metadata consistently across requests, so comparisons needn't
  // publish the actual addresses. Proxies on this destination can add entries.
  for (const key of [
    "x-forwarded-for",
    "forwarded",
    "x-real-ip",
    "x-appengine-user-ip",
  ]) {
    if (request.headers[key])
      forwarding[key] = String(request.headers[key])
        .split(",")
        .map((part) => hash(part.trim()))
  }
  return {
    event: "transport_observation",
    client,
    case: name,
    method: request.method,
    httpVersionAtContainer: request.httpVersion,
    headerNames: Object.keys(request.headers).sort(),
    headers: publicHeaders,
    forwardingFingerprints: forwarding,
    proxyPeerFingerprint: hash(request.socket.remoteAddress || "unknown"),
    authorizationPresent: Boolean(request.headers.authorization),
    cookieMatchesExpected: request.headers.cookie === expectedCookie,
    cookiePresent: Boolean(request.headers.cookie),
    queryBytesMatchExpected:
      request.url ===
      `/probe?case=${name}&sample=a%2Bb%2Fc%3D&space=hello%20world`,
    decodedQueryMatchesExpected:
      url.searchParams.get("sample") === "a+b/c=" &&
      url.searchParams.get("space") === "hello world",
    bodyBytes: Buffer.byteLength(body),
    bodySha256: hash(body),
    bodyMatchesExpected:
      request.method === "POST" ? body === expectedBody : body === "",
  }
}

export function createProbeServer(
  write = (entry) => process.stdout.write(`${JSON.stringify(entry)}\n`),
) {
  return createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json")
    response.setHeader("Cache-Control", "no-store")
    try {
      const chunks = []
      let size = 0
      for await (const chunk of request) {
        size += chunk.length
        if (size > 4096) {
          response.writeHead(413).end("{}")
          return
        }
        chunks.push(chunk)
      }
      const observation = observeRequest(
        request,
        Buffer.concat(chunks).toString("utf8"),
      )
      if (!observation) {
        response.writeHead(404).end("{}")
        return
      }
      write(observation)
      response.end(JSON.stringify(observation))
    } catch {
      response.writeHead(400).end("{}")
    }
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createProbeServer().listen(Number(process.env.PORT || 8080), "0.0.0.0")
}
