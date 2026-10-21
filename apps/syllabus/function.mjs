/**
 * @fileoverview Serve syllabus JSON through the Google Cloud Functions Framework.
 * Cloud Run IAM controls invocation; the handler validates the requested month.
 */

import { http } from "@google-cloud/functions-framework"
import { getSyllabus } from "./syllabus.mjs"

/**
 * Create an HTTP handler with an optional syllabus provider for isolated tests.
 * Responses disable caching. Invalid inputs return 400, unsupported methods
 * return 405, and retrieval failures return 502 without upstream error details.
 * @param {function(import("./syllabus.mjs").SyllabusOptions): Promise<import("./syllabus.mjs").Syllabus>}
 *     [fetchSyllabus=getSyllabus] The syllabus provider.
 * @returns {function(import("express").Request, import("express").Response): Promise<import("express").Response>}
 *     The HTTP request handler.
 */
export function createSyllabusHandler(fetchSyllabus = getSyllabus) {
  /**
   * Validate the GET query and return the selected month's syllabus as JSON.
   * @param {import("express").Request} request The incoming HTTP request.
   * @param {import("express").Response} response The outgoing HTTP response.
   * @returns {Promise<import("express").Response>} The JSON success or error response.
   */
  return async (request, response) => {
    response.set("Cache-Control", "no-store")
    if (request.method !== "GET") {
      response.set("Allow", "GET")
      return response.status(405).json({ error: "Use GET." })
    }
    const { year, month } = request.query || {}
    if (
      typeof year !== "string" ||
      !/^\d{4}$/.test(year) ||
      Number(year) < 1996 ||
      Number(year) > 2055 ||
      typeof month !== "string" ||
      !/^\d{1,2}$/.test(month) ||
      Number(month) < 1 ||
      Number(month) > 12
    ) {
      return response.status(400).json({
        error: "Provide year (1996–2055) and month (1–12) query parameters.",
      })
    }
    try {
      const result = await fetchSyllabus({
        year: Number(year),
        month: Number(month),
        projectId: process.env.SKA_SECRET_PROJECT || "get-ska-events",
      })
      return response.json(result)
    } catch {
      return response
        .status(502)
        .json({ error: "Unable to retrieve the syllabus." })
    }
  }
}

/**
 * The deployed HTTP entry point, using the default syllabus provider.
 * @type {function(import("express").Request, import("express").Response): Promise<import("express").Response>}
 */
export const syllabus = createSyllabusHandler()
http("syllabus", syllabus)
