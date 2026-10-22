Get NorCal SKA Events
=====================

An application for creating weekly and monthly e-mail messages from the NorCal SKA event calendar and the SKA monthly training syllabus. Apps Script sources in [`apps/script/`](apps/script/) compose and send the e-mails; the Google Cloud Run app in [`apps/syllabus/`](apps/syllabus/) retrieves training syllabi from the SKA News website.

## Make targets at a glance

Use these Make targets to set up, test, and deploy either application component.

Environment, quality, and test targets:

- `env`: Install locked dependencies
- `format`: Format project files with Prettier
- `lint`: Check formatting and lint JavaScript
- `test`: Run both local test suites

Apps Script targets:

- `clasp-login`: Log in to the Apps Script API
- `clasp-init`: Create and link a standalone Apps Script project
- `clasp-test`: Run the Apps Script unit tests locally
- `clasp-push` / `clasp-pull`: Synchronize sources in `apps/script/`

Cloud Run targets:

- `cloudrun-login`: Log in to Google Cloud with the Google Cloud CLI
- `cloudrun-init`: Provision the syllabus app's Google Cloud resources
- `cloudrun-test`: Run syllabus app unit tests without accessing Google Cloud
- `cloudrun-deploy`: Deploy the private syllabus endpoint and grant `INVOKER_EMAIL` Cloud Run Invoker access
- `cloudrun-validate`: Retrieve the current month's syllabus from the deployed service
- `cloudrun-register-audience`: Register an Apps Script audience and print the service URL

Apps Script synchronization and Cloud Run deployment are separate: `clasp-push` does not deploy Cloud Run, and `cloudrun-deploy` does not upload Apps Script files.

## Prerequisites and setup

Use Node.js 22 to match the Cloud Run runtime. Select it with a Node version manager such as `fnm` or `nvm`. For example, run these commands from the repository root with fnm:

```bash
# Read .nvmrc to select the required Node.js version.
fnm install
fnm use
node --version
```

Run `make env` to install locked root and syllabus app dependencies, including the Apps Script `clasp` CLI, Prettier, and ESLint. Rerun it after changing either app's package manifest or lockfile.

Install the Google Cloud CLI for Cloud Run initialization and deployment. Also, complete the [Google Cloud prerequisites](GCP_PREREQUISITES.md) before initializing or deploying the syllabus service, which cover project billing, IAM permissions, and required APIs.

In VS Code, install the recommended Prettier (`esbenp.prettier-vscode`) and ESLint (`dbaeumer.vscode-eslint`) extensions.

Enable **Google Apps Script API** in your [Apps Script user settings](https://script.google.com/home/usersettings) before `make clasp-init` or synchronization. Enabling an API in a Cloud project does not replace this user setting.

## Local development

### Tests

Run `make test` from the repository root to run both the Apps Script and syllabus app unit tests locally. Neither suite needs Google authentication, the Google Cloud CLI, an Apps Script project, or cloud infrastructure. Test failures, including logged Apps Script failures and exceptions, cause a nonzero exit status.

Use `make clasp-test` or `make cloudrun-test` to run one suite independently.

The Apps Script harness executes `runTests()` from `apps/script/Test.js` in a shared Node VM context using the original sources; it fixes the local and calendar timezones to `America/Los_Angeles` and substitutes `CalendarApp`, `Logger`, and the three `Utilities.formatDate` formats the tests use. Unsupported date formats fail explicitly. The harness does not emulate the full Apps Script runtime; follow [E-mail authorization and scheduling](#e-mail-authorization-and-scheduling) to check real service behavior.

The syllabus tests use synthetic HTTP responses and injected providers rather than live services; initializer tests simulate the Google Cloud CLI.

### Formatting

Use `make format` or `npm run format` to format files. Use `npm run format:check` to check formatting without modifying files.

The VS Code workspace selects Prettier as the default formatter and uses the local Prettier installation. Both VS Code and the command-line scripts use `.prettierrc.json` and `.prettierignore` so that formatting rules stay consistent.

### Linting

Use `make lint` or `npm run lint` to check JavaScript files without modifying them.

## Deployment

### Google Apps Script deployment

Use these commands to create and link a standalone Apps Script project, then upload the Apps Script sources:

- Log in to the Apps Script API: `make clasp-login`
- Create a new standalone Apps Script project: `make clasp-init`. The new project name is "Get NorCal SKA Events" by default; set the `PROJECT_NAME` environment variable to override the default. This command creates the project metadata file `.clasp.json` in the repository and links files in `apps/script/` to the new Apps Script project. Run it only when creating a new project, not when returning to an already-linked checkout.
- Restore the manifest as described below, then upload the application sources: `make clasp-push`.

For an existing checkout, keep its current script ID and set `"rootDir": "apps/script"` in the repository-root `.clasp.json` once. The `clasp-init` target sets this automatically for new projects.

Open the linked project in the [Apps Script dashboard](https://script.google.com/home).

#### `appsscript.json`

[`apps/script/appsscript.json`](apps/script/appsscript.json) defines the OAuth scopes required by the Apps Script project. `clasp-init` may replace it with the default manifest pulled from the new project; restore the checked-in manifest with `git restore apps/script/appsscript.json` before running `make clasp-push`.

#### E-mail authorization and scheduling

Before executing e-mail functions, set these values in Apps Script **Project Settings > Script Properties**:

| Property             | Value to supply                                            |
| -------------------- | ---------------------------------------------------------- |
| `NORCAL_CALENDAR_ID` | Your Google Calendar ID                                    |
| `RECIPIENT`          | The announcement recipient's e-mail address                |
| `SIGNATURE`          | Your HTML e-mail signature, including any desired newlines |

Missing or blank required values produce an explicit error when used; there are no personal defaults in the source. Script Properties are shared project configuration accessible to project editors, not a secret vault. `DATE_FORMAT` and `TIME_FORMAT` remain presentation constants in `apps/script/Events.js`.

The account that runs the script must own the configured calendar because the application calls `getOwnedCalendarById`; read-only sharing does not meet that requirement.

Open the project in the Apps Script editor, run `runTests`, and complete the Google authorization prompts as the intended execution account. This checks real calendar access and Google's date formatting. Manually running `sendWeeklyEventsMessage` or `sendMonthlyEventsMessage` sends e-mail immediately.

For recurring delivery, use the editor's **Triggers > Add Trigger** screen to create time-driven triggers for `sendWeeklyEventsMessage` (week timer) and `sendMonthlyEventsMessage` (month timer), choosing the intended day and time. The trigger creator supplies the execution identity and authorizations. Review the project timezone (`America/Los_Angeles` in the manifest) and execution failures. The Make targets do not create triggers.

### Cloud Run syllabus service

Complete the [prerequisites above](#prerequisites-and-setup). Run the syllabus tests before deployment with `make cloudrun-test`; they do not access Google Cloud. To initialize and deploy, run these commands from the repository root:

```sh
make cloudrun-login
make cloudrun-init
make cloudrun-deploy INVOKER_EMAIL='YOUR_GOOGLE_ACCOUNT_EMAIL'
```

`cloudrun-init` enables the provisioning APIs, creates separate build and runtime service accounts, grants build permissions, and gives the runtime account access to `ska-username` and `ska-password`. It prompts securely for missing secret values, reuses enabled latest versions, and supports reruns after partial failure.

`cloudrun-deploy` requires a single `INVOKER_EMAIL`, validates it before deploying, builds with Google's Node 22 buildpack, and grants that user **Cloud Run Invoker** on the deployed service. The image is stored in Artifact Registry; no local Docker installation is needed. The target does not run initialization or tests. If the IAM grant fails, the deployment remains but Make reports failure; correct the error and retry. Existing Invoker grants are preserved.

Defaults are project `get-ska-events`, region `us-west1`, service `ska-syllabus`, runtime account ID `ska-syllabus`, and build account ID `ska-syllabus-build`. Override `GCP_PROJECT`, `GCP_REGION`, `SYLLABUS_SERVICE`, `SYLLABUS_ACCOUNT_ID`, or `SYLLABUS_BUILD_ACCOUNT_ID` as Make variables. Use consistent overrides for initialization and deployment. Allow several minutes for IAM changes to propagate before retrying a deployment.

The deployment requires authenticated invocation and configures zero minimum instances, one maximum instance, concurrency of one, and a five-minute request timeout. The app's `.gcloudignore` uploads only its function and retriever modules and package files.

#### Connect Apps Script to Cloud Run

`apps/script/Syllabus.js` provides `getSyllabus(year, month)`, returning the parsed syllabus JSON. It uses `ScriptApp.getIdentityToken()` for the executing user, with no stored tokens, service-account keys, or SKA credentials in Apps Script. The Cloud Run service remains private.

Configure the linked Apps Script project and deployed service once:

1. Run `make clasp-push`. The manifest includes `openid`, `userinfo.email`, and `script.external_request` scopes in addition to the existing calendar and e-mail scopes.
2. In the Apps Script editor, run `logSyllabusAudience` and complete authorization as the intended execution account. Copy the audience value from the execution log. This helper decodes the token locally and logs only its `aud` claim, never the token itself.
3. After deploying the Cloud Run service, register that exact audience:

   ```sh
   make cloudrun-register-audience AUDIENCE='PASTE_AUDIENCE_FROM_APPS_SCRIPT'
   ```

   Use the same project, region, and service overrides as deployment. The target registers the audience and prints the URL without changing IAM permissions. It is safe to rerun and requires permission to update the service. The Apps Script execution account (the trigger creator for scheduled runs) must have Invoker access: use its e-mail address as `INVOKER_EMAIL` during deployment, or grant it access separately in Cloud Run Permissions if it differs from the CLI tester.

4. In Apps Script **Project Settings > Script Properties**, set `SYLLABUS_SERVICE_URL` to the HTTPS `run.app` URL printed above, without query parameters or a path. An optional trailing slash is accepted.
5. Run `test_getSyllabus` in the Apps Script editor to validate live retrieval, or call `getSyllabus(year, month)` from your script.

Repeat audience registration if the script's OAuth client changes. For HTTP 401/403, check the registered audience and executing account's Invoker access. The live test checks authorization and retrieval without logging syllabus content or tokens.

#### Validate the deployment

After deployment, use the account granted Invoker access during deployment (or another account granted access separately in Cloud Run Permissions):

```sh
make cloudrun-validate
```

The target retrieves the current month's syllabus from the deployed service and prints JSON. It contacts real SKA services and exits with an error on HTTP failure. Treat its output as member-only content. HTTP 401/403 indicates an authentication or access problem; HTTP 502 indicates an upstream retrieval failure. To validate a nondefault service, set `GCP_PROJECT`, `GCP_REGION`, or `SYLLABUS_SERVICE`.

#### Local live retrieval

To test live syllabus retrieval locally, configure Application Default Credentials (ADC) once:

```sh
gcloud auth application-default login
npm --prefix apps/syllabus run cli -- --year 2026 --month 12
```

ADC supplies credentials for requests to Google Cloud Secret Manager, where the SKA credentials are stored. The ADC identity needs permission to access both secrets; `cloudrun-init` grants access only to the deployed runtime service account. Access can also be inherited from project-level IAM roles. Use `--project PROJECT` to select another secret project; the default is `get-ska-events`. Local retrieval contacts real TrustDriven/SKA News services.
