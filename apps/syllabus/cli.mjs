/**
 * @fileoverview Run the syllabus retriever from the command line.
 * Accepts --year, --month, --project, and --help. Authentication uses
 * Application Default Credentials. Success writes syllabus JSON to stdout;
 * failure writes a sanitized message to stderr and sets exit status 1.
 */

import { parseArgs } from "node:util"
import { getSyllabus } from "./syllabus.mjs"

try {
  const { values } = parseArgs({
    options: {
      year: { type: "string" },
      month: { type: "string" },
      project: { type: "string", default: "get-ska-events" },
      help: { type: "boolean" },
    },
  })
  if (values.help) {
    process.stdout.write(
      "Usage: npm run cli -- --year 2026 --month 12 [--project get-ska-events]\n",
    )
  } else {
    const result = await getSyllabus({
      year: Number(values.year),
      month: Number(values.month),
      projectId: values.project,
    })
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  }
} catch (error) {
  // getSyllabus sanitizes transport/auth errors; never print child-process errors.
  process.stderr.write(
    `${error.message?.startsWith("Syllabus request failed") || error.message?.startsWith("Provide a year") || error.message === "Invalid Google Cloud project ID." ? error.message : "Unable to run syllabus app. Use --help for usage."}\n`,
  )
  process.exitCode = 1
}
