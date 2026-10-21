Get NorCal SKA Events
=====================

A Google Apps Script application for creating weekly and monthly event e-mail messages from the NorCal SKA event calendar and the SKA monthly training syllabus.

## Prerequisites

Use Node.js 22 to match the Cloud Run runtime. Select it with a Node version manager such as `fnm` or `nvm`. For example, run these commands from the repository root with fnm:

```bash
# Read .nvmrc to select the required Node.js version.
fnm install
fnm use
node --version
```

Run `make env` to install locked root and syllabus app dependencies, including the Apps Script `clasp` CLI, Prettier, and ESLint. Rerun it after changes to either the package manifest or lockfile.

Install the Google Cloud CLI for Cloud Run initialization and deployment.

In VS Code, install the recommended Prettier (`esbenp.prettier-vscode`) and ESLint (`dbaeumer.vscode-eslint`) extensions.

Enable **Google Apps Script API** in your [Apps Script user settings](https://script.google.com/home/usersettings) before `make clasp-init` or synchronization. Enabling an API in a Cloud project does not replace this user setting.

### Google Cloud prerequisites

The following project, billing, and IAM requirements apply to both personal Google accounts and managed Workspace accounts. Ordinary Apps Script execution and time-driven triggers do not require Cloud billing.

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select a project and record its project ID. In **Billing**, link an active billing account. For the initializer's billing check, grant the initializing user **Billing Account Viewer** (`roles/billing.viewer`) on that billing account if they lack billing visibility; this account-level role also exposes billing information. See [Google's billing-status permissions](https://docs.cloud.google.com/billing/docs/how-to/verify-billing-enabled). Project creation and billing enrollment remain administrator tasks; `cloudrun-init` does neither.
2. In **IAM & Admin > IAM**, confirm that the initializing user has the permissions below through existing roles or explicit grants. You do not need duplicate grants when existing roles already provide access. These bootstrap roles allow broad IAM and secret management; grant them only to the trusted operator and remove provisioning privileges when they no longer need to rerun initialization.

   | Role                                                         | Purpose                                              |
   | ------------------------------------------------------------ | ---------------------------------------------------- |
   | Service Usage Admin (`roles/serviceusage.serviceUsageAdmin`) | Enable the required APIs                             |
   | Service Account Admin (`roles/iam.serviceAccountAdmin`)      | Create and inspect runtime and build accounts        |
   | Project IAM Admin (`roles/resourcemanager.projectIamAdmin`)  | Grant the build account its project role             |
   | Secret Manager Admin (`roles/secretmanager.admin`)           | Create secrets and versions and grant runtime access |

3. Grant the deploying user **Cloud Run Source Developer** (`roles/run.sourceDeveloper`) and **Service Usage Consumer** (`roles/serviceusage.serviceUsageConsumer`) on the project. Grant **Cloud Run Admin** (`roles/run.admin`) for this target's service IAM configuration (`--no-allow-unauthenticated`). Grant **Service Account User** (`roles/iam.serviceAccountUser`) on both the runtime and build accounts so the deployer can act as them. Since these accounts do not exist before initialization, either grant that role at project scope initially or have an administrator grant it on the two accounts after `make cloudrun-init` and before deployment. Prefer account-level grants for ongoing deployment. See [Google's source-deployment IAM requirements](https://docs.cloud.google.com/run/docs/configuring/services/build-service-account).

Continue with [initialization and deployment](#initialize-and-deploy); the initializer handles API enablement, service accounts, and secrets, so you do not need to pre-create those resources in the Console.

Managed organizational accounts may also face service, OAuth, or organization-policy restrictions. Ask your administrator to review Google's [Apps Script service controls](https://support.google.com/a/answer/15100049), [OAuth app access controls](https://support.google.com/a/answer/7281227), and [organization policies](https://docs.cloud.google.com/resource-manager/docs/organization-policy/overview) if access fails despite the required permissions. Personal accounts need no Workspace administrator setup.

## Google Apps Script synchronization

Use the following commands to create and link a new standalone Google Apps Script project:

- Log in to the Apps Script API: `make clasp-login`
- Create a new standalone Apps Script project: `make clasp-init`. The new project name is "Get NorCal SKA Events" by default; set the `PROJECT_NAME` environment variable to override the default. This command creates the project metadata file `.clasp.json` in the repository and links the local files to the new Apps Script project. Run it only when creating a new project, not when returning to an already-linked checkout.
- Restore the manifest as described below, then upload the application sources: `make clasp-push`.

Open the linked project in the [Apps Script dashboard](https://script.google.com/home).

### `appsscript.json`

`appsscript.json` defines the OAuth scopes required by the Get NorCal SKA Events script to execute. `make clasp-init` (via `clasp create`) overwrites the existing `appsscript.json` file in the local repository, so run `git checkout appsscript.json` to restore the correct scope definitions.

### Authorize and schedule email

Review `NORCAL_CALENDAR_ID`, `RECIPIENT`, and `SIGNATURE` in `Events.js` before uploading or executing email functions. The account that runs the script must own the configured calendar because the application calls `getOwnedCalendarById`; read-only sharing does not meet that requirement.

Open the project in the Apps Script editor, run `runTests`, and complete the Google authorization prompts as the intended execution account. This checks real calendar access and Google's date formatting. Manually running `sendWeeklyEventsMessage` or `sendMonthlyEventsMessage` sends email immediately.

For recurring delivery, use the editor's **Triggers > Add Trigger** screen to create time-driven triggers for `sendWeeklyEventsMessage` (week timer) and `sendMonthlyEventsMessage` (month timer), choosing the intended day and time. The trigger creator supplies the execution identity and authorizations. Review the project timezone (`America/Los_Angeles` in the manifest) and execution failures. The Make targets do not create triggers.

## Development `make` targets

Code sanity targets:

- `format`: Format project files with Prettier
- `lint`: Run ESLint on the project JavaScript files
- `test`: Run both local test suites (`clasp-test` and `cloudrun-test`)

Google Apps Script project setup and synchronization targets:

- `clasp-login`: Log in to the Apps Script API
- `clasp-init`: Create and link a new standalone Apps Script project
- `clasp-test`: Run the Apps Script unit tests locally with Node
- `clasp-push`: Push local changes to Apps Script files (including `*.js` and `appsscript.json`) to the remote project
- `clasp-pull`: Pull remote changes made in the Apps Script console into the local repository

Cloud Run setup, testing, and deployment targets:

- `cloudrun-login`: Log in to Google Cloud with the Google Cloud CLI
- `cloudrun-init`: Provision the syllabus app's Google Cloud resources
- `cloudrun-test`: Run the syllabus app's local tests without accessing Google Cloud
- `cloudrun-deploy`: Deploy the syllabus HTTP function

The two workflows are separate: `clasp-push` does not deploy the Cloud Run function, and `cloudrun-deploy` does not upload Apps Script files.

## Tests

Run `make test` from the repository root to run both the Apps Script and syllabus app unit tests locally. Neither suite needs Google authentication, the Google Cloud CLI, an Apps Script project, or cloud infrastructure. Test failures, including logged Apps Script failures and exceptions, cause a nonzero exit status.

Use `make clasp-test` or `make cloudrun-test` to run one suite independently.

The Apps Script harness executes `runTests()` from `Test.js` in a shared Node VM context using the original sources; it fixes the local and calendar timezones to `America/Los_Angeles` and substitutes `CalendarApp`, `Logger`, and the three `Utilities.formatDate` formats the tests use. Unsupported date formats fail explicitly. The harness does not emulate the full Apps Script runtime; follow [Authorize and schedule email](#authorize-and-schedule-email) to check real service behavior.

The syllabus tests use synthetic HTTP responses and injected providers rather than live services; initializer tests simulate the Google Cloud CLI.

### Continuous integration

The `run-tests.yml` and `run-linter.yml` workflows run on pull requests to `main` and pushes to `main`. Both call the reusable [run-check.yml](.github/workflows/run-check.yml) workflow, which checks out the code, selects Node.js from `.nvmrc`, runs `make env`, and executes the supplied `lint` or `test` target. Each job uses a separate runner with read-only repository permissions and no cloud credentials.

## Formatting

Use `make format` or `npm run format` to format files. Use `npm run format:check` to check formatting without modifying files.

The VS Code workspace selects Prettier as the default formatter and uses the local Prettier installation. Both VS Code and the command-line scripts use `.prettierrc.json` and `.prettierignore` so that formatting rules stay consistent.

## Linting

Use `make lint` or `npm run lint` to check JavaScript files without modifying them.

## Standalone syllabus app

The standalone Node app in [`apps/syllabus/`](apps/syllabus/) reads SKA credentials from Secret Manager, logs in through TrustDriven, follows the SKA News authentication handoff, and returns a month's training syllabus as JSON. Each retrieval starts a fresh session. The app has its own package manifest, lockfile, CLI, and tests; it imports no Apps Script sources.

### Initialize and deploy

Complete the [prerequisites](#prerequisites), then run these commands from the repository root:

```sh
make cloudrun-login
make cloudrun-init
make cloudrun-test
make cloudrun-deploy
```

`cloudrun-login` configures Google Cloud CLI credentials, not Application Default Credentials. `cloudrun-init` requires an active account, enables IAM, Cloud Run, Cloud Build, Artifact Registry, Secret Manager, and Logging APIs, creates separate runtime and build service accounts, and grants the build account `roles/run.builder`. It grants the runtime account access to only `ska-username` and `ska-password`.

The initializer creates missing secrets with automatic replication and prompts for a new value when the latest version is missing, disabled, or destroyed. It sends values to Secret Manager through stdin without storing them in local files, command arguments, or shell history. It reuses enabled latest versions, retries temporary service-account visibility errors, and supports reruns after partial failure.

`cloudrun-deploy` submits a source build using Google's Node 22 buildpack and the dedicated build and runtime accounts. Google stores the image in Artifact Registry; you need no Dockerfile or local Docker installation. The target does not install dependencies, run initialization, or run tests. The sequence above recommends testing first without making it a deployment prerequisite.

Defaults are project `get-ska-events`, region `us-west1`, service `ska-syllabus`, runtime account ID `ska-syllabus`, and build account ID `ska-syllabus-build`. Override `GCP_PROJECT`, `GCP_REGION`, `SYLLABUS_SERVICE`, `SYLLABUS_ACCOUNT_ID`, or `SYLLABUS_BUILD_ACCOUNT_ID` as Make variables. Use consistent overrides for initialization and deployment. Allow several minutes for IAM changes to propagate before retrying a deployment.

The deployment requires authenticated invocation and configures zero minimum instances, one maximum instance, concurrency of one, and a five-minute request timeout. The app's `.gcloudignore` uploads only its function and retriever modules and package files.

### Run locally

Retrieve a syllabus from the repository root:

```sh
npm --prefix apps/syllabus run cli -- --year 2026 --month 12 --gcloud-auth
```

`--gcloud-auth` uses the account selected by `make cloudrun-login`. That account needs secret access to `ska-username` and `ska-password`; deployment permissions alone do not necessarily grant access to secret values. Use `--project OTHER_PROJECT` to select another secret project. The CLI prints syllabus JSON on success and a sanitized error on failure.

Without `--gcloud-auth`, the CLI uses Application Default Credentials. For local use, configure them separately with `gcloud auth application-default login`. The deployed function uses its runtime service account instead.

To serve the HTTP function locally with Application Default Credentials, run:

```sh
npm --prefix apps/syllabus start
```

Set `SKA_SECRET_PROJECT` to override the local function's default secret project, `get-ska-events`. Both local execution modes contact real services.

### HTTP interface

Request a syllabus with:

```text
GET /?year=2026&month=12
```

Provide a year from 1996 through 2055 and a month from 1 through 12. Successful responses contain `year`, `month`, and a `training` array with KATA, KIHON, and KUMITE rows. Each row contains `training`, `junior`, and `senior` strings, with paragraph breaks represented as newlines.

The handler returns HTTP 400 for invalid parameters, 405 for unsupported methods, and 502 for retrieval failures. It disables response caching and omits upstream error details that could contain credentials or authentication tokens.

### Validate a private deployment

In Google Cloud Console, open **Cloud Run > ska-syllabus > Permissions** and grant **Cloud Run Invoker** (`roles/run.invoker`) to a designated human tester if their existing roles do not allow invocation. Select the actual service name if you override `SYLLABUS_SERVICE`. Do not grant access to `allUsers`.

After `make cloudrun-login`, run:

```sh
PROJECT=get-ska-events
REGION=us-west1
SERVICE=ska-syllabus
URL=$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.url)')
curl --fail-with-body \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  "$URL/?year=2026&month=12"
```

Use the same project, region, and service values as deployment. This live check reads SKA secrets and authenticates to SKA. A 403 indicates an invocation/access problem; see [HTTP interface](#http-interface) for application responses. The user identity token supports this manual test, not unattended Apps Script authentication.

### Apps Script separation

The existing Apps Script files stay at the repository root. `.claspignore` limits uploads to root script/HTML files and the Apps Script manifest, excluding the standalone app and its nested `node_modules`.
