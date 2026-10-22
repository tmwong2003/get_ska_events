const SYLLABUS_SERVICE_URL_PROPERTY = "SYLLABUS_SERVICE_URL"

/**
 * Get the executing user's ID token without storing or logging it.
 * @returns {string} A Google-signed OpenID Connect token.
 */
function getSyllabusIdentityToken() {
  const token = ScriptApp.getIdentityToken()
  if (!token) {
    throw Error("No identity token available. Reauthorize the script.")
  }
  return token
}

/**
 * Log only the audience to configure on the private Cloud Run service.
 * Run manually after authorizing the openid and userinfo.email scopes.
 * @returns {string} The Apps Script OAuth client audience.
 */
function logSyllabusAudience() {
  const token = getSyllabusIdentityToken()
  const claims = JSON.parse(
    Utilities.newBlob(
      Utilities.base64DecodeWebSafe(token.split(".")[1]),
    ).getDataAsString(),
  )
  if (typeof claims.aud !== "string" || !claims.aud) {
    throw Error("The identity token has no audience.")
  }
  Logger.log(claims.aud)
  return claims.aud
}

/**
 * Retrieve a month's syllabus from the private Cloud Run service.
 * Set SYLLABUS_SERVICE_URL in Script Properties to its HTTPS run.app origin.
 * @param {number} year The calendar year, from 1996 through 2055.
 * @param {number} month The calendar month, from 1 through 12.
 * @returns {{year: number, month: number, training: Array<{training: string, junior: string, senior: string}>}}
 *     The selected month's syllabus.
 */
function getSyllabus(year, month) {
  if (
    !Number.isInteger(year) ||
    year < 1996 ||
    year > 2055 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw Error("Provide year (1996-2055) and month (1-12) as integers.")
  }
  const serviceUrl = PropertiesService.getScriptProperties().getProperty(
    SYLLABUS_SERVICE_URL_PROPERTY,
  )
  if (
    typeof serviceUrl !== "string" ||
    !/^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.run\.app\/?$/.test(serviceUrl)
  ) {
    throw Error(
      `Set ${SYLLABUS_SERVICE_URL_PROPERTY} in Script Properties to the service's HTTPS run.app URL.`,
    )
  }
  const response = UrlFetchApp.fetch(
    `${serviceUrl.replace(/\/$/, "")}/?year=${year}&month=${month}`,
    {
      method: "get",
      headers: { Authorization: `Bearer ${getSyllabusIdentityToken()}` },
      followRedirects: false,
      muteHttpExceptions: true,
    },
  )
  const status = response.getResponseCode()
  if (status !== 200) {
    throw Error(
      `Syllabus request failed (HTTP ${status}). Check Cloud Run access, custom audience, and service logs.`,
    )
  }
  let syllabus
  try {
    syllabus = JSON.parse(response.getContentText())
  } catch {
    throw Error("The syllabus service returned invalid JSON.")
  }
  if (
    syllabus === null ||
    syllabus.year !== year ||
    syllabus.month !== month ||
    !Array.isArray(syllabus.training) ||
    syllabus.training.length !== 3 ||
    syllabus.training.some(
      (row, index) =>
        row === null ||
        row.training !== ["KATA", "KIHON", "KUMITE"][index] ||
        typeof row.junior !== "string" ||
        typeof row.senior !== "string",
    )
  ) {
    throw Error("The syllabus service returned an unexpected syllabus.")
  }
  return syllabus
}

/**
 * Retrieve a month's syllabus and format its training rows as an HTML table.
 * @param {number} year The calendar year, from 1996 through 2055.
 * @param {number} month The calendar month, from 1 through 12.
 * @returns {string} The syllabus formatted as an HTML table.
 */
function getSyllabusAsTable(year, month) {
  const syllabus = getSyllabus(year, month)
  const table = `<table border="1" cellpadding="5" cellspacing="0">
  <thead>
    <tr>
      <th>Training</th>
      <th>Junior</th>
      <th>Senior</th>
    </tr>
  </thead>
  <tbody>
    ${syllabus.training
      .map(
        (row) => `
    <tr>
      <td>${row.training}</td>
      <td>${row.junior}</td>
      <td>${row.senior}</td>
    </tr>
    `,
      )
      .join("")}
  </tbody>
</table>
`
  return table
}
