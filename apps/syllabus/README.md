# SKA syllabus app

A standalone Node app that reads SKA credentials from Google Secret Manager,
logs in through TrustDriven, follows the SKA News authentication handoff, and
returns a month's training syllabus as JSON. Each call starts a fresh session.

## Google Cloud prerequisites

Before installation, enable the following Google Cloud APIs:

- [Artifact Registry API](https://console.cloud.google.com/apis/library/artifactregistry.googleapis.com?project=get-ska-events) (`artifactregistry.googleapis.com`)
- [Cloud Build API](https://console.cloud.google.com/apis/library/cloudbuild.googleapis.com?project=get-ska-events) (`cloudbuild.googleapis.com`)
- [Cloud Logging API](https://console.cloud.google.com/apis/library/logging.googleapis.com?project=get-ska-events) (`logging.googleapis.com`)
- [Cloud Run Admin API](https://console.cloud.google.com/apis/library/run.googleapis.com?project=get-ska-events) (`run.googleapis.com`)
- [Identity and Access Management (IAM) API](https://console.cloud.google.com/apis/library/iam.googleapis.com?project=get-ska-events) (`iam.googleapis.com`)
- [Secret Manager API](https://console.cloud.google.com/apis/library/secretmanager.googleapis.com?project=get-ska-events) (`secretmanager.googleapis.com`)

`make cloudrun-init` enables these APIs automatically. The links above open their API
pages in project `get-ska-events`.

## Install and run

Use Node.js 22 to match the Cloud Run runtime. The root `.nvmrc` selects this
version; with nvm, run `nvm install` and `nvm use` first. From the repository root:

```sh
make env
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

## Initialize a new checkout and Cloud environment

Install Node.js 22 (including npm) and the Google Cloud CLI, then run
from the repository root:

```sh
make env
make cloudrun-init
make cloudrun-deploy
```

`make env` checks for Node.js 22 and installs locked root and app
dependencies without Google authentication or cloud provisioning.
`cloudrun-init` opens Google login if no account is active and provisions cloud
resources. The Google Cloud project must already exist with billing
enabled. Your account must be allowed to enable APIs, manage service accounts,
set project and secret IAM policies, and deploy Cloud Run services. Project
creation, billing enrollment, and granting your own administrator access are
prerequisites rather than actions performed by this target.

The target enables IAM, Cloud Run, Cloud Build, Artifact Registry, Secret Manager,
and Logging APIs. It creates separate runtime (`ska-syllabus`) and build
(`ska-syllabus-build`) service accounts, granting the build account
`roles/run.builder` as described in Google's
[source-build documentation](https://docs.cloud.google.com/run/docs/configuring/services/build-service-account).
The runtime account receives accessor permission on only the two SKA secrets.
Temporary service-account visibility errors are retried with up to 94 seconds
of backoff.

Missing secrets are created with automatic replication. If a secret has no
enabled version, a hidden prompt collects its value and sends it directly to
Secret Manager through stdin. Values are not stored in local files, command
arguments, or shell history. Existing enabled secret versions are reused.
Initialization can be rerun after a partial failure.

Defaults are project `get-ska-events` and region `us-west1`. Override
`GCP_PROJECT`, `GCP_REGION`, `SYLLABUS_SERVICE`, `SYLLABUS_ACCOUNT_ID`, or
`SYLLABUS_BUILD_ACCOUNT_ID` as Make variables. Use the same overrides for both
commands. Google IAM role changes can take a few minutes to propagate before
source deployment succeeds.

## Deploy the HTTP function

After initialization, `make cloudrun-deploy` runs `cloudrun-test` as a prerequisite
and deploys the `syllabus` function from this directory using
Google's Node 22 buildpack and the dedicated build and runtime identities.
No Dockerfile or manually built image is required. Google manages the build
image and stores it in Artifact Registry. Each invocation of the target submits
a source build.

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
- `init.sh`: Google Cloud resource initialization.
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

After installing dependencies, run the local tests from the repository root:

```sh
make cloudrun-test
```

Neither `cloudrun-test` nor `cloudrun-deploy` reinstalls local dependencies or
runs cloud initialization. `make env` installs dependencies during initial
setup. After changes to a package manifest or lockfile, run
`make env` before testing or deployment; there is no need
to rerun cloud provisioning just to refresh dependencies.

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
