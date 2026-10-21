# SKA syllabus app

A standalone Node app that reads SKA credentials from Google Secret Manager,
logs in through TrustDriven, follows the SKA News authentication handoff, and
returns a month's training syllabus as JSON. Each call starts a fresh session.

## Install and run

Requires Node.js 22 or newer. From the repository root:

```sh
npm --prefix apps/syllabus ci
npm --prefix apps/syllabus run cli -- --year 2026 --month 12 --gcloud-auth
```

`--gcloud-auth` uses the account already logged in through `gcloud auth login`.
The CLI captures its access token in memory and uses it to read the secrets; it
never prints the token. That account needs access to `ska-username` and
`ska-password` in `get-ska-events`. Use `--project OTHER_PROJECT` if needed.

Without `--gcloud-auth`, the app uses Application Default Credentials through
Google's authentication library. Locally, configure those separately using
`gcloud auth application-default login`. In the deployed Cloud Run function, the
runtime service account supplies them; it will need access to the two secrets.

Successful execution prints only syllabus JSON. Errors report the failed stage
without passwords, cookie values, authentication URLs, or underlying raw errors.
There is no session cache, browser, Dockerfile, scheduler, or email sender.

## Deploy the HTTP function

From the repository root:

```sh
make deploy
```

The target installs locked dependencies and runs tests before making cloud
changes. It enables the required APIs, creates the `ska-syllabus` runtime service
account if needed, retries temporary service-account visibility errors for up to
94 seconds, grants it access to the two SKA secrets, and deploys the
`syllabus` function from this directory using Google's Node 22 buildpack. No
Dockerfile or manually built image is required. Google manages the build image
and stores it in Artifact Registry.

Defaults are project `get-ska-events`, region `us-west1`, and service
`ska-syllabus`. Override `GCP_PROJECT`, `GCP_REGION`, `SYLLABUS_SERVICE`, or
`SYLLABUS_ACCOUNT_ID` as Make variables. The selected project must already
contain `ska-username` and `ska-password`, have billing enabled, and allow your
account to deploy services and configure their IAM. The source-build identity
must have the Cloud Run build permissions required by Google.

The service requires authenticated invocation and returns syllabus JSON for:

```text
GET /?year=2026&month=12
```

Missing/invalid parameters return HTTP 400, other methods return 405, and
upstream failures return 502 without exposing credentials. The deployment uses
zero minimum instances, one maximum instance, and a five-minute request timeout.
Caller IAM/invocation and the Apps Script integration are separate from deployment.

To serve the function locally with Application Default Credentials:

```sh
npm --prefix apps/syllabus start
```

The app-local `.gcloudignore` uploads only `function.mjs`, `syllabus.mjs`, and
the two package files. Tests, local dependencies, and diagnostic files are excluded.

## Files

- `syllabus.mjs`: exported `getSyllabus({year, month, projectId})` and HTML parser.
- `cli.mjs`: command-line entry point.
- `function.mjs`: HTTP function entry point and request validation.
- `syllabus.test.mjs`: isolated tests with synthetic HTTP responses.
- `function.test.mjs`: HTTP request validation and error-response tests.
- `package.json` / `package-lock.json`: independent dependencies and lockfile.

`getSyllabus` optionally accepts a second argument with `fetch` and
`getAccessToken` functions for testing. Production callers normally omit it.
The app uses native Node fetch with `fetch-cookie` for cookie/redirect handling,
Cheerio for HTML parsing, and `google-auth-library` for Google credentials.
It imports nothing from the root Apps Script files or diagnostic scripts.

## Tests and validation

```sh
npm --prefix apps/syllabus test
```

The tests cover the complete login and redirect sequence, cookie isolation and
rotation, password/hidden-field encoding, a fresh session on every call, month
validation, and sanitization of errors and disallowed redirects.

On October 21, 2026, the local app successfully read the real Secret Manager
credentials, logged in from a fresh session, and returned December 2026:

| Training | Junior       | Senior                            |
| -------- | ------------ | --------------------------------- |
| KATA     | Heian Nidan  | Bassai                            |
| KIHON    | Ten no kata  | Ten no kata                       |
| KUMITE   | Ippon kumite | Jiyu kumite slow / Study strategy |

Paragraphs remain separated by newlines in JSON. This live test used the local
Node 26 runtime and the existing gcloud login, independently of Apps Script and
Cloud Run. No cloud resources or deployments were created for this app test.

## Apps Script separation

The repository's `.claspignore` allowlists root `.js`, `.gs`, `.html`, and
`appsscript.json` files. All existing Apps Script `.js` files remain at the root.
The standalone app, including nested dependencies, is excluded from clasp.
