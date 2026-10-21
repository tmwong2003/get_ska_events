# Monthly training syllabus (local Playwright)

Install dependencies with `npm install`, then install the browser with
`npx playwright install chromium`. Run from an interactive terminal:

```sh
node experimental/scripts/get-training.mjs --month 12 --year 2026
```

A browser opens. When prompted, log in normally, follow **SKA News → Training
Calendar** in the same tab, and press Enter in the terminal. The script selects
both month and year and prints JSON containing the KATA, KIHON, and KUMITE rows
for junior and senior training. Paragraph breaks are preserved as newlines.
To save the JSON, append `> .cache/training-dec-2026.json` to the command;
prompts are written to stderr.

Authentication state is saved in `.cache/training/session.json`, which is
ignored by Git. Treat that file as a credential. Later runs reuse it and prompt
for login again if the calendar is inaccessible. Delete the file to force a
fresh login. The browser still opens visibly on cached runs. This script runs
locally in Node.js and does not replace the existing Apps Script functions.

## Automatic login

Set both `SKA_USERNAME` and `SKA_PASSWORD` to let the script fill the login
form and follow SKA News → Training Calendar automatically when the session
expires. With neither variable set, the interactive workflow remains available.
Setting just one variable is an error.

For a fresh, unattended login test, enter credentials using these zsh prompts
(the password is hidden and is not included in shell history):

```zsh
read "SKA_USERNAME?SKA email: "
read -rs "SKA_PASSWORD?SKA password: "
printf '\n'
export SKA_USERNAME SKA_PASSWORD
node experimental/scripts/get-training.mjs --month 12 --year 2026 --fresh-login --headless
unset SKA_USERNAME SKA_PASSWORD
```

`--fresh-login` ignores the cached state for that run, and replaces it after
successful extraction. `--headless` runs without a browser window and fails
instead of prompting when credentials are missing and login is required.
Omit `--headless` to watch the automatic login while troubleshooting. Passwords
and authentication URLs are not printed by the script. Cloud deployment can
supply these same environment variables from Secret Manager.

## Redacted authentication trace

With credentials exported, run:

```sh
node experimental/scripts/get-training.mjs --month 12 --year 2026 --fresh-login --headless --trace-auth > .cache/syllabus.json 2> .cache/auth-trace.log
```

The trace records document navigation on the two SKA hosts, with request IDs,
redirect relationships, status codes, query parameter names, sent cookie names,
and issued cookie names/domain/path/flags. Query values, cookie values, bodies,
and arbitrary headers are omitted. Unknown URL paths and hosts are masked.
This is a navigation trace, not a full network capture; it excludes subresources
and fetch/XHR requests. A nonzero `loggingFailures` count means it is incomplete.

The `experimental/Dockerfile` packages the same command as a Cloud Run Job (no public endpoint
is needed). Configure one task, zero retries, a five-minute task timeout, and
start with 1 CPU and 2 GiB memory. Map Secret Manager secrets to `SKA_USERNAME`
and `SKA_PASSWORD` using a job service account with accessor permission on those
specific secrets. Do not include credentials in build arguments or the image.
The default command traces December 2026; override job arguments for other months.
Execute the job and filter Cloud Logging for its execution and `auth_request`,
`auth_response`, and `auth_trace_complete` events. Application stderr contains
the redacted JSON trace; stdout contains the extracted syllabus. The container
build and Cloud execution still require verification in the chosen project.

# HTTP-only Apps Script experiment

`Training.js` now implements `getTrainingCalendar(year, month)` with UrlFetchApp.
It begins with fresh in-memory cookie state, visits the news calendar and login
page, preserves hidden login inputs, submits form-encoded credentials, follows
the exact SKA News handoff URL, and requests the selected calendar month. Cookies
are retained by domain/path, including replacements and expiration. Redirects
are restricted to HTTPS on secure.ska.org and news.ska.org. It extracts only the
three-column training syllabus; paragraph breaks are retained.

Credentials are read from `ska-username` and `ska-password` in Secret Manager
in `get-ska-events`, using `ScriptApp.getOAuthToken()`. The manifest includes
`script.external_request` and `cloud-platform` scopes alongside the existing
mail/calendar scopes. The executing user (and ultimately the clock trigger's
creator) must have secret-access IAM permissions; the current project owner
already has access. No service-account keys or passwords go into source code.

To test:

1. Enable **Google Apps Script API** in https://script.google.com/home/usersettings
   if clasp reports that the user setting is disabled.
2. Run `npx clasp push --force` to upload the updated source and manifest.
3. Open the linked project in the Apps Script editor. Its standard Cloud project
   should be `get-ska-events` (number `558742426345`); verify in Project Settings.
4. Select `testTrainingHttp` and click **Run**. Complete Google's authorization
   prompt for the additional scopes. This function extracts December 2026,
   logs the syllabus JSON, and returns it; it sends no email and creates no trigger.
5. Inspect the execution log's `training_http` entries and final result. These
   logs contain status codes, hosts, methods, and cookie names/scopes only.
   Do not add raw headers, response bodies, or authentication URLs to the log.

The tests in `experimental/scripts/training-http.test.mjs` exercise the same Apps Script source
in a Node VM with simulated Google services. Run `node --test experimental/scripts/*.test.mjs`.
Those tests check parser behavior, separate host sessions, encoded credentials,
hidden form values, redirects, cookie paths/deletion, and secret redaction. They
are not proof that real UrlFetchApp traffic is accepted by the authentication
provider; the editor run is the decisive live experiment.

## Credential-free transport probe

The archived `experimental/TransportProbe.js` is excluded from normal `clasp push`.
To repeat this experiment, copy it into the Apps Script editor and select
`testTransportRequests` to send four synthetic
requests to the temporary Cloud Run `ska-transport-probe` service. It does not
retrieve SKA credentials, use real session cookies, or send mail. Cases cover a
default GET, requested browser User-Agent, disabled URL escaping, and a form POST.
The matching Cloud Run client uses `experimental/scripts/run-transport-comparison.mjs`.

The endpoint records allowlisted header values, header names, exact synthetic
cookie/query/body comparisons, and fingerprints of forwarding metadata. It
omits authorization/cookie values and request bodies from its application logs.
Its public service and client job use a dedicated account without secret grants.
See `experimental/TRANSPORT-COMPARISON.md` for measured results and source qualifications,
`experimental/TRANSPORT-OBSERVATIONS.json` for the export, and
`experimental/TRACE-RESOURCE-INVENTORY.md` for all cleanup candidates.

For the next header comparison, run `testTrainingHttpNodeHeaders`. It verifies
three synthetic headers at the probe, then automatically attempts the SKA login
and December extraction if verification passes. Inspect the
`training_header_verification` entry and final result/error. It sends no email.

For the imported-session diagnostic, first execute the Cloud Run HTTP job with
`EXPORT_NEWS_SESSION=true` and `APPS_SCRIPT_USER_AGENT` set to the observed Apps
Script value. After it logs `diagnostic_session_saved`, run
`testTrainingImportedSession` in Apps Script within 15 minutes. This makes one
calendar request using the exported news cookie, without logging in or following
redirects. The cookie is stored only in the temporary Secret Manager secret
`ska-diagnostic-news-session`; remove that secret after testing.

# Authentication experiments

This directory holds the diagnostic scripts, findings, exported observations,
and Cloud Run build definitions used to investigate SKA authentication.

- `TransportProbe.js`: archived Apps Script transport probe, excluded from normal
  `clasp push`; copy into the editor only when repeating the experiment.
- `scripts/`: Playwright scraper, HTTP and transport probes, and their tests.
- [AUTH-TRACE.md](AUTH-TRACE.md): authentication findings.
- [TRANSPORT-COMPARISON.md](TRANSPORT-COMPARISON.md): transport comparison and
  [observations](TRANSPORT-OBSERVATIONS.json).
- [TRACE-RESOURCE-INVENTORY.md](TRACE-RESOURCE-INVENTORY.md): Google Cloud
  resources and cleanup links.
- `Dockerfile*` and `cloudbuild-*.yaml`: diagnostic container builds.

Run commands from the repository root:

```sh
node --test experimental/scripts/*.test.mjs
node experimental/scripts/get-training.mjs --help
```

Diagnostic builds also use the repository root as their context, for example:

```sh
docker build -f experimental/Dockerfile.http .
gcloud builds submit --config=experimental/cloudbuild-http.yaml --project=get-ska-events .
```

The root `.dockerignore` and `.gcloudignore` select the diagnostic build inputs.
Browser session state remains in the ignored root `.cache/training/` directory.
Apps Script sources remain at the repository root for `clasp`; the deployable
syllabus app and its own tests remain in [apps/syllabus](../apps/syllabus/README.md).
