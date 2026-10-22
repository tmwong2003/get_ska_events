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

Install the Google Cloud CLI for Cloud Run initialization and deployment. Also, complete the [Google Cloud prerequisites](GCP_PREREQUISITES.md) before initializing or deploying the syllabus service, which cover project billing, IAM permissions, and required APIs.

In VS Code, install the recommended Prettier (`esbenp.prettier-vscode`) and ESLint (`dbaeumer.vscode-eslint`) extensions.

Enable **Google Apps Script API** in your [Apps Script user settings](https://script.google.com/home/usersettings) before `make clasp-init` or synchronization. Enabling an API in a Cloud project does not replace this user setting.

## Google Apps Script synchronization

Use the following commands to create and link a new standalone Google Apps Script project:

- Log in to the Apps Script API: `make clasp-login`
- Create a new standalone Apps Script project: `make clasp-init`. The new project name is "Get NorCal SKA Events" by default; set the `PROJECT_NAME` environment variable to override the default. This command creates the project metadata file `.clasp.json` in the repository and links the local files to the new Apps Script project. Run it only when creating a new project, not when returning to an already-linked checkout.
- Restore the manifest as described below, then upload the application sources: `make clasp-push`.

Open the linked project in the [Apps Script dashboard](https://script.google.com/home).

### `appsscript.json`

`appsscript.json` defines the OAuth scopes required by the Get NorCal SKA Events script to execute. `make clasp-init` (via `clasp create`) overwrites the existing `appsscript.json` file in the local repository, so run `git checkout appsscript.json` to restore the correct scope definitions.

### Authorize and schedule email

Before executing email functions, set these values in Apps Script **Project Settings > Script Properties**:

| Property             | Value to supply                                           |
| -------------------- | --------------------------------------------------------- |
| `NORCAL_CALENDAR_ID` | Your Google Calendar ID                                   |
| `RECIPIENT`          | The announcement recipient's email address                |
| `SIGNATURE`          | Your HTML email signature, including any desired newlines |

Missing or blank required values produce an explicit error when used; there are no personal defaults in the source. Script Properties are shared project configuration accessible to project editors, not a secret vault. `DATE_FORMAT` and `TIME_FORMAT` remain presentation constants in `Events.js`.

The account that runs the script must own the configured calendar because the application calls `getOwnedCalendarById`; read-only sharing does not meet that requirement.

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
- `cloudrun-validate`: Retrieve the current month's syllabus from the deployed service using the CLI account
- `cloudrun-deploy`: Deploy the syllabus HTTP function and grant `INVOKER_EMAIL` service-scoped Invoker access
- `cloudrun-register-audience`: After deployment, register `AUDIENCE` and print the service URL to save in Script Properties

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

The standalone Node app in [`apps/syllabus/`](apps/syllabus/) retrieves a month's training syllabus as JSON using credentials from Secret Manager and a fresh TrustDriven/SKA News session. It imports no Apps Script sources.

### Initialize and deploy

Complete the [prerequisites](#prerequisites), then run these commands from the repository root:

```sh
make cloudrun-login
make cloudrun-init
make cloudrun-test
make cloudrun-deploy INVOKER_EMAIL='YOUR_GOOGLE_ACCOUNT_EMAIL'
```

`cloudrun-init` enables the provisioning APIs, creates separate build and runtime service accounts, grants build permissions, and gives the runtime account access to `ska-username` and `ska-password`. It prompts securely for missing secret values, reuses enabled latest versions, and supports reruns after partial failure.

`cloudrun-deploy` requires a single `INVOKER_EMAIL`, validates it before deploying, builds with Google's Node 22 buildpack, and grants that user **Cloud Run Invoker** on the deployed service. The image is stored in Artifact Registry; no local Docker installation is needed. The target does not run initialization or tests. If the IAM grant fails, the deployment remains but Make reports failure; correct the error and retry. Existing Invoker grants are preserved.

Defaults are project `get-ska-events`, region `us-west1`, service `ska-syllabus`, runtime account ID `ska-syllabus`, and build account ID `ska-syllabus-build`. Override `GCP_PROJECT`, `GCP_REGION`, `SYLLABUS_SERVICE`, `SYLLABUS_ACCOUNT_ID`, or `SYLLABUS_BUILD_ACCOUNT_ID` as Make variables. Use consistent overrides for initialization and deployment. Allow several minutes for IAM changes to propagate before retrying a deployment.

The deployment requires authenticated invocation and configures zero minimum instances, one maximum instance, concurrency of one, and a five-minute request timeout. The app's `.gcloudignore` uploads only its function and retriever modules and package files.

### Run locally

Retrieve a syllabus from the repository root:

```sh
npm --prefix apps/syllabus run cli -- --year 2026 --month 12 --gcloud-auth
```

`--gcloud-auth` uses the account selected by `make cloudrun-login`. Local retrieval requires that account to have access to both SKA secrets; initialization grants this access only to the deployed runtime account. Use `--project OTHER_PROJECT` to select another secret project.

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

### Validate a deployment

After `make cloudrun-login`, use the account granted Invoker access during deployment (or another account granted access separately in Cloud Run Permissions):

```sh
make cloudrun-validate
```

The target uses the deployment's project, region, and service overrides and prints the current month's syllabus JSON (using the local CLI date). It contacts real SKA services and exits with an error on HTTP failure. Treat its output as member-only content. HTTP 401/403 indicates an authentication/access problem; HTTP 502 indicates an upstream retrieval failure.

### Integrate with Apps Script

`Syllabus.js` provides `getSyllabus(year, month)`, returning the parsed syllabus JSON. It uses `ScriptApp.getIdentityToken()` for the executing user, with no stored tokens, service-account keys, or SKA credentials in Apps Script. The Cloud Run service remains private.

Configure the linked Apps Script project and deployed service once:

1. Run `make clasp-push`. The manifest includes `openid`, `userinfo.email`, and `script.external_request` scopes in addition to the existing calendar and email scopes.
2. In the Apps Script editor, run `logSyllabusAudience` and complete authorization as the intended execution account. Copy the audience value from the execution log. This helper decodes the token locally and logs only its `aud` claim, never the token itself.
3. After deploying the Cloud Run service, register that exact audience:

   ```sh
   make cloudrun-register-audience AUDIENCE='PASTE_AUDIENCE_FROM_APPS_SCRIPT'
   ```

   Use the same project, region, and service overrides as deployment. The target registers the audience and prints the URL without changing IAM permissions. It is safe to rerun and requires permission to update the service. The Apps Script execution account (the trigger creator for scheduled runs) must have Invoker access: use its email as `INVOKER_EMAIL` during deployment, or grant it access separately in Cloud Run Permissions if it differs from the CLI tester.

4. In Apps Script **Project Settings > Script Properties**, set `SYLLABUS_SERVICE_URL` to the HTTPS `run.app` URL printed above, without query parameters or a path. An optional trailing slash is accepted.
5. Run `test_getSyllabus` in the Apps Script editor to validate live retrieval, or call `getSyllabus(year, month)` from your script.

Repeat audience registration if the script's OAuth client changes. For HTTP 401/403, check the registered audience and executing account's Invoker access. The live test checks authorization and retrieval without logging syllabus content or tokens.

### Apps Script separation

The existing Apps Script files stay at the repository root. `.claspignore` limits uploads to root script/HTML files and the Apps Script manifest, excluding the standalone app and its nested `node_modules`.
