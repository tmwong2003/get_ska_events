/** Synthetic requests only. This experiment never retrieves SKA credentials. */
const TRANSPORT_PROBE_URL =
  "https://ska-transport-probe-558742426345.us-west1.run.app"

function transportProbeCases() {
  const userAgent =
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"
  const cookie = "ska_probe=synthetic-only; ska_probe_second=synthetic-two"
  return [
    { name: "default", method: "get", headers: { Cookie: cookie } },
    {
      name: "browser",
      method: "get",
      headers: { Cookie: cookie, "User-Agent": userAgent },
    },
    {
      name: "browser-exact",
      method: "get",
      escaping: false,
      headers: { Cookie: cookie, "User-Agent": userAgent },
    },
    {
      name: "form",
      method: "post",
      escaping: false,
      headers: { Cookie: cookie, "User-Agent": userAgent },
      contentType: "application/x-www-form-urlencoded",
      payload: "probe_message=a%2Bb%2Fc%3D&probe_space=hello%20world",
    },
  ]
}

function testTransportRequests() {
  if (
    !/^https:\/\/ska-transport-probe-[a-z0-9-]+(?:\.[a-z0-9-]+)?\.run\.app$/.test(
      TRANSPORT_PROBE_URL,
    )
  ) {
    throw Error("Transport probe endpoint has not been configured.")
  }
  const results = []
  for (const probe of transportProbeCases()) {
    const url = `${TRANSPORT_PROBE_URL}/probe?case=${probe.name}&sample=a%2Bb%2Fc%3D&space=hello%20world`
    const options = {
      ...probe,
      followRedirects: false,
      muteHttpExceptions: true,
    }
    delete options.name
    options.headers = { ...probe.headers, "X-Diagnostic-Client": "apps-script" }
    const response = UrlFetchApp.fetch(url, options)
    if (response.getResponseCode() !== 200)
      throw Error(
        `Transport probe ${probe.name} returned HTTP ${response.getResponseCode()}.`,
      )
    const observation = JSON.parse(response.getContentText())
    Logger.log(JSON.stringify(observation))
    results.push(observation)
  }
  return results
}

/** Verify new headers with synthetic data before using them for SKA login. */
function testTrainingHttpNodeHeaders() {
  const headers = {
    Accept: "*/*",
    "Accept-Language": "*",
    "Sec-Fetch-Mode": "cors",
  }
  const response = UrlFetchApp.fetch(
    `${TRANSPORT_PROBE_URL}/probe?case=browser-exact&sample=a%2Bb%2Fc%3D&space=hello%20world`,
    {
      headers: { ...headers, "X-Diagnostic-Client": "apps-script" },
      escaping: false,
      followRedirects: false,
      muteHttpExceptions: true,
    },
  )
  if (response.getResponseCode() !== 200)
    throw Error("Header verification endpoint failed.")
  const observation = JSON.parse(response.getContentText())
  const verified = Object.entries(headers).every(
    ([key, value]) => observation.headers[key.toLowerCase()] === value,
  )
  Logger.log(
    JSON.stringify({
      event: "training_header_verification",
      verified,
      headers: observation.headers,
    }),
  )
  if (!verified)
    throw Error(
      "Requested headers were not received unchanged; login test skipped.",
    )
  return testTrainingHttpOptions({ escaping: false, nodeHeaders: true })
}
