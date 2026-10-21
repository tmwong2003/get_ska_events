import { readFileSync } from "node:fs"
import { URL } from "node:url"
import vm from "node:vm"

try {
  const endpoint = new URL(process.env.PROBE_URL)
  if (
    endpoint.protocol !== "https:" ||
    !/^ska-transport-probe-[a-z0-9-]+(?:\.[a-z0-9-]+)?\.run\.app$/.test(
      endpoint.hostname,
    )
  )
    throw Error("Invalid endpoint")
  const context = vm.createContext({})
  vm.runInContext(
    readFileSync(new URL("../TransportProbe.js", import.meta.url), "utf8"),
    context,
  )
  for (const probe of context.transportProbeCases()) {
    const headers = {
      ...probe.headers,
      "X-Diagnostic-Client": "cloud-run-node",
    }
    if (probe.contentType) headers["Content-Type"] = probe.contentType
    const response = await globalThis.fetch(
      `${endpoint.origin}/probe?case=${probe.name}&sample=a%2Bb%2Fc%3D&space=hello%20world`,
      {
        method: probe.method,
        headers,
        body: probe.payload,
        redirect: "manual",
        signal: globalThis.AbortSignal.timeout(25000),
      },
    )
    if (response.status !== 200) throw Error("Probe rejected")
    process.stdout.write(`${JSON.stringify(await response.json())}\n`)
  }
} catch {
  process.stderr.write("Transport comparison failed.\n")
  process.exitCode = 1
}
