Get NorCal SKA Events developer notes
==================================

## Google Apps Script synchronization

To develop and test Get NorCal SKA Events, create a new standalone Google Apps Script project. We assume that you have [enabled the Google Apps Script API](https://developers.google.com/apps-script/api/quickstart/js#enable-api) in your workspace and [installed `Node.js` and `npm`](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm).

- Install project dependencies, including the Apps Script `clasp` CLI, Prettier, and ESLint: `make env`
- Log in to the Apps Script API: `make login`
- Create a new standalone Apps Script project: `make project`. The new project name is "Get NorCal SKA Events" by default; set the `PROJECT_NAME` environment variable to override the default. This command creates the project metadata file `.clasp.json` in the repository and links the local files to the new Apps Script project.

After running these steps, you should have:

- A new project in the [Apps Script dashboard](https://script.google.com/home)

### `appsscript.json`

`appsscript.json` defines the OAuth scopes required by the Get NorCal SKA Events script to execute. Unfortunately, `make project` (via `clasp create`) will overwrite the existing `appsscript.json` file in the local repository, so run `git checkout appsscript.json` to restore the correct scope definitions.

## Development `make` targets

Code sanity targets:

- `format`: Format project files with Prettier
- `lint`: Run ESLint on the project JavaScript files

Google Apps Script project management targets:

- `login`: Log in to the Apps Script API
- `push`: Push local changes to Apps Script files (including `*.js` and `appsscript.json`) to the remote project
- `pull`: Pull remote changes made in the Apps Script console into the local repository

## Formatting

Run `make env` to install the local Prettier development dependency.
Use `make format` or `npm run format` to format files. Use `npm run format:check`
to check formatting without modifying files.

In VS Code, install the recommended Prettier extension (`esbenp.prettier-vscode`).
The workspace selects it as the default formatter and uses the local Prettier
installation. Both VS Code and the command-line scripts use `.prettierrc.json`
and `.prettierignore` so that formatting rules stay consistent.

## Linting

Run `make env` to install the local ESLint development dependency.
Use `make lint` or `npm run lint` to check JavaScript files without modifying them.
In VS Code, install the recommended ESLint extension (`dbaeumer.vscode-eslint`).

## Monthly training syllabus (local Playwright)

Install dependencies with `npm install`, then install the browser with
`npx playwright install chromium`. Run from an interactive terminal:

```sh
node experiments/scripts/get-training.mjs --month 12 --year 2026
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

### Automatic login

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
node experiments/scripts/get-training.mjs --month 12 --year 2026 --fresh-login --headless
unset SKA_USERNAME SKA_PASSWORD
```

`--fresh-login` ignores the cached state for that run, and replaces it after
successful extraction. `--headless` runs without a browser window and fails
instead of prompting when credentials are missing and login is required.
Omit `--headless` to watch the automatic login while troubleshooting. Passwords
and authentication URLs are not printed by the script. Cloud deployment can
supply these same environment variables from Secret Manager.

### Redacted authentication trace

With credentials exported, run:

```sh
node experiments/scripts/get-training.mjs --month 12 --year 2026 --fresh-login --headless --trace-auth > .cache/syllabus.json 2> .cache/auth-trace.log
```

The trace records document navigation on the two SKA hosts, with request IDs,
redirect relationships, status codes, query parameter names, sent cookie names,
and issued cookie names/domain/path/flags. Query values, cookie values, bodies,
and arbitrary headers are omitted. Unknown URL paths and hosts are masked.
This is a navigation trace, not a full network capture; it excludes subresources
and fetch/XHR requests. A nonzero `loggingFailures` count means it is incomplete.

The `experiments/Dockerfile` packages the same command as a Cloud Run Job (no public endpoint
is needed). Configure one task, zero retries, a five-minute task timeout, and
start with 1 CPU and 2 GiB memory. Map Secret Manager secrets to `SKA_USERNAME`
and `SKA_PASSWORD` using a job service account with accessor permission on those
specific secrets. Do not include credentials in build arguments or the image.
The default command traces December 2026; override job arguments for other months.
Execute the job and filter Cloud Logging for its execution and `auth_request`,
`auth_response`, and `auth_trace_complete` events. Application stderr contains
the redacted JSON trace; stdout contains the extracted syllabus. The container
build and Cloud execution still require verification in the chosen project.

## HTTP-only Apps Script experiment

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

The tests in `experiments/scripts/training-http.test.mjs` exercise the same Apps Script source
in a Node VM with simulated Google services. Run `node --test experiments/scripts/*.test.mjs`.
Those tests check parser behavior, separate host sessions, encoded credentials,
hidden form values, redirects, cookie paths/deletion, and secret redaction. They
are not proof that real UrlFetchApp traffic is accepted by the authentication
provider; the editor run is the decisive live experiment.

## Credential-free transport probe

The archived `experiments/TransportProbe.js` is excluded from normal `clasp push`.
To repeat this experiment, copy it into the Apps Script editor and select
`testTransportRequests` to send four synthetic
requests to the temporary Cloud Run `ska-transport-probe` service. It does not
retrieve SKA credentials, use real session cookies, or send mail. Cases cover a
default GET, requested browser User-Agent, disabled URL escaping, and a form POST.
The matching Cloud Run client uses `experiments/scripts/run-transport-comparison.mjs`.

The endpoint records allowlisted header values, header names, exact synthetic
cookie/query/body comparisons, and fingerprints of forwarding metadata. It
omits authorization/cookie values and request bodies from its application logs.
Its public service and client job use a dedicated account without secret grants.
See `experiments/TRANSPORT-COMPARISON.md` for measured results and source qualifications,
`experiments/TRANSPORT-OBSERVATIONS.json` for the export, and
`experiments/TRACE-RESOURCE-INVENTORY.md` for all cleanup candidates.

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

## Standalone syllabus app

The small standalone Node implementation lives in [`apps/syllabus/`](apps/syllabus/README.md).
It has its own package manifest, lockfile, CLI, and isolated tests, with no
imports from the Apps Script experiments. From the repository root:

```sh
npm --prefix apps/syllabus ci
npm --prefix apps/syllabus test
npm --prefix apps/syllabus run cli -- --year 2026 --month 12 --gcloud-auth
```

The existing Apps Script files stay at the root. `.claspignore` limits uploads
to root script/HTML files and the Apps Script manifest, excluding the app and
its nested node_modules. This app has not yet been deployed as a Cloud Run function.

Deploy the authenticated HTTP function from source using `make deploy`. The
target tests first, configures a dedicated runtime identity with access to the
two SKA secrets, and deploys `ska-syllabus` to `get-ska-events/us-west1`. Set
`GCP_PROJECT`, `GCP_REGION`, `SYLLABUS_SERVICE`, or `SYLLABUS_ACCOUNT_ID` to
override defaults. See the app README for prerequisites and the HTTP interface.
