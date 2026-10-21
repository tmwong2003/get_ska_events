/**
 * @fileoverview Run the syllabus retriever from the command line.
 * Accepts --year, --month, --project, --gcloud-auth, and --help. Authentication
 * uses Application Default Credentials unless --gcloud-auth selects the current
 * gcloud login. Success writes syllabus JSON to stdout; failure writes a
 * sanitized message to stderr and sets exit status 1.
 */

import { execFileSync } from "node:child_process"
import { parseArgs } from "node:util"
import { getSyllabus } from "./syllabus.mjs"

try {
  const { values } = parseArgs({
    options: {
      year: { type: "string" },
      month: { type: "string" },
      project: { type: "string", default: "get-ska-events" },
      "gcloud-auth": { type: "boolean" },
      help: { type: "boolean" },
    },
  })
  if (values.help) {
    process.stdout.write(
      "Usage: npm start -- --year 2026 --month 12 [--project get-ska-events] [--gcloud-auth]\n",
    )
  } else {
    const auth = values["gcloud-auth"]
      ? {
          /**
           * Get an access token from the current gcloud login without printing it.
           * @returns {Promise<string>} The Google access token.
           * @throws {Error} If gcloud fails or exceeds the 30-second timeout.
           */
          getAccessToken: async () =>
            execFileSync("gcloud", ["auth", "print-access-token"], {
              encoding: "utf8",
              stdio: ["ignore", "pipe", "pipe"],
              timeout: 30000,
            }).trim(),
        }
      : {}
    const result = await getSyllabus(
      {
        year: Number(values.year),
        month: Number(values.month),
        projectId: values.project,
      },
      auth,
    )
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  }
} catch (error) {
  // getSyllabus sanitizes transport/auth errors; never print child-process errors.
  process.stderr.write(
    `${error.message?.startsWith("Syllabus request failed") || error.message?.startsWith("Provide a year") || error.message === "Invalid Google Cloud project ID." ? error.message : "Unable to run syllabus app. Use --help for usage."}\n`,
  )
  process.exitCode = 1
}
