Get NorCal SKA Events
=====================

**Get NorCal SKA Events** is an application that generates and sends weekly and monthly announcements of upcoming events in the NorCal SKA region. The application comprises two parts: an Apps Script [script](apps/script/) that parses events from the NorCal SKA Google Calendar, and a Google Cloud Run [service app](apps/syllabus/) that retrieves the monthly training syllabus from the SKA News website.

The application requires login credentials (`ska-username` and `ska-password`) for a current SKA member's account to access the syllabus on the protected SKA News website, and stores these SKA account credentials in Google Cloud Secret Manager. For privacy reasons, the application does not retain or otherwise log the syllabus.

## Make targets at a glance

Use the following Make targets to set up, test, and deploy either application component.

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

Note that Apps Script synchronization and Cloud Run deployment are separate: `clasp-push` does not deploy Cloud Run, and `cloudrun-deploy` does not upload Apps Script files.

## Prerequisite configuration

Configure your local and GCP environment before starting development as follows:

1. Install Node.js v22 with a Node version manager such as `fnm` or `nvm`; we require v22 for compatibility with the Cloud Run runtime. For example, with `fnm`:

```bash
# Read .nvmrc to select the required Node.js version.
fnm install
fnm use
node --version
```

1. Install locked script and syllabus service dependencies, including the Apps Script `clasp` CLI, Prettier, and ESLint, with `make env`.
1. Install the Google Cloud CLI for Cloud Run initialization and deployment. Also, complete the [Google Cloud prerequisites](PREREQUISITES.md) to configure project billing, IAM permissions, and required GCP APIs before initializing or deploying the syllabus service.
1. Enable **Google Apps Script API** in your [Apps Script user settings](https://script.google.com/home/usersettings) before `make clasp-init` or synchronization. Enabling the API in a Google Cloud project does not replace this user setting.
1. If using VS Code, install the recommended Prettier (`esbenp.prettier-vscode`) and ESLint (`dbaeumer.vscode-eslint`) extensions.

## Local development

### Tests

Run both the script and syllabus service unit test suites locally with `make test` from the repository root. Neither suite needs Google authentication or GCP cloud infrastructure to run. Test failures, including logged Apps Script failures and exceptions, cause a nonzero exit status. Use `make clasp-test` or `make cloudrun-test` to run either suite independently.

The script test harness executes `runTests()` from `apps/script/Test.js` in a shared Node VM context using the original sources. The harness fixes the local and calendar timezones to `America/Los_Angeles` and substitutes `CalendarApp`, `Logger`, and the three `Utilities.formatDate` formats the tests use. The harness does not emulate the full Apps Script runtime; refer to [E-mail authorization and scheduling](#e-mail-authorization-and-scheduling-configuration) to check real service behavior.

The syllabus service test harness uses synthetic HTTP responses and injected providers rather than live services, while the associated GCP configuration initializer test harness simulates the Google Cloud CLI.

### Formatting

Format source files with `make format` or `npm run format`. Check formatting without modifying files with `npm run format:check`.

If using VS Code, the IDE selects Prettier as the default formatter and uses the local Prettier installation. Both VS Code and the command-line scripts use `.prettierrc.json` and `.prettierignore` to preserve consistency between the IDE and CLI scripts.

### Linting

Check JavaScript files without modifying them with `make lint` or `npm run lint`.

## Deployment

### Google Apps Script deployment

Create and link a standalone Apps Script project once from the repository root as follows before deploying the script for the first time:

```sh
# Test once more before initialization and deployment
make clasp-test
make clasp-login
make clasp-init
git restore apps/script/appsscript.json
```

- `make clasp-login` authenticates and authorizes the developer/deployer to Google Apps Script.
- `make clasp-init` creates a new Apps Script project. It names the project "Get NorCal SKA Events" by default; set the `PROJECT_NAME` environment variable to override the default.
- `git restore apps/script/appsscript.json` restores the checked-in [`apps/script/appsscript.json`](apps/script/appsscript.json) script manifest, which defines the OAuth scopes required by the script. `clasp-init` will overwrite the manifest with the default manifest pulled from the new project.

Once you have created a project, upload the script sources with `make clasp-push` and open the linked project in the [Apps Script dashboard](https://script.google.com/home) to confirm a successful upload.

#### E-mail authorization and scheduling configuration

Set the following values in the Apps Script project **Project Settings > Script Properties** to enable e-mail sending. Missing or blank required values produce an explicit error when used, as the script does not provide any defaults.

| Property             | Value                                                                               |
| -------------------- | ----------------------------------------------------------------------------------- |
| `NORCAL_CALENDAR_ID` | The ID of the source NorCal Google Calendar†                                        |
| `RECIPIENT`          | The e-mail address of the announcement recipient                                    |
| `SIGNATURE`          | An HTML e-mail signature to append to announcements, including any desired newlines |

After setting the values, open the project in the Apps Script editor and run `runTests`. The first time you run `runTests`, you should complete the Google authorization prompts as the intended execution account. This checks calendar access and Google's date formatting.

For immediate delivery of an announcement, run either `sendWeeklyEventsMessage` or `sendMonthlyEventsMessage`.

For recurring delivery, use the **Triggers > Add Trigger** screen in the editor to create time-driven triggers for `sendWeeklyEventsMessage` (week timer) and `sendMonthlyEventsMessage` (month timer), choosing the intended day and time. The trigger creator supplies the execution identity and authorizations.

In the event of a script failure, review the **Executions** screen in the editor. As noted above, the logs will not contain copies of the syllabus, but will log a message to confirm successful announcement generation.

† The account that runs the script must own the configured calendar because the script calls `getOwnedCalendarById`; `getOwnedCalendarById` cannot access a calendar shared from another account.

### Cloud Run syllabus service deployment

Initialize the GCP project and deploy the syllabus service from the repository root as follows†:

```sh
# Test once more before initialization and deployment
make cloudrun-test
make cloudrun-login
make cloudrun-init
make cloudrun-deploy INVOKER_EMAIL='YOUR_GOOGLE_ACCOUNT_EMAIL'
```

- `cloudrun-login` authenticates the CLI account used by subsequent `gcloud` commands. This account runs initialization and deployment; `INVOKER_EMAIL` names the Invoker account, which may differ from it.
- `cloudrun-init` enables the provisioning APIs, creates separate build and runtime service accounts, grants build permissions, and gives the runtime service account access to the SKA account credentials stored in the `ska-username` and `ska-password` Google Cloud Secret Manager secrets. It prompts securely for missing secret values, reuses enabled latest versions, and supports reruns after partial failure.
- `cloudrun-deploy` deploys the service from source. It:
  - Accepts and validates a single `INVOKER_EMAIL`.
  - Builds the service image with the Cloud Run Node.js 22 buildpack and stores it in Artifact Registry. No local Docker installation is needed.
  - Grants the Invoker account specified by `INVOKER_EMAIL` **Cloud Run Invoker** access to the deployed service. If the IAM grant fails, the deployment remains but Make reports failure; correct the error and retry. It retains any existing Invoker grants.

The Cloud Run configuration uses project ID `get-ska-events`, region `us-west1`, service name `ska-syllabus`, runtime account ID `ska-syllabus`, and build account ID `ska-syllabus-build` by default. Set `GCP_PROJECT`, `GCP_REGION`, `SYLLABUS_SERVICE`, `SYLLABUS_ACCOUNT_ID`, or `SYLLABUS_BUILD_ACCOUNT_ID` as Make variables to override the defaults, and make sure to use matching overrides for service initialization and deployment, as well as for the script-to-service connection. If you receive transient IAM permission errors during deployment, allow several minutes for IAM changes to propagate before retrying.

The service is private, meaning that only users or service accounts with appropriate authorization may call the service to retrieve a syllabus.

The deployment requires authenticated invocation and configures zero minimum instances, one maximum instance, concurrency of one, and a five-minute request timeout. The `.gcloudignore` file restricts upload to the service function and retriever modules, and package files.

† Unlike the steps in Google Apps Script deployment, `cloudrun-init` is idempotent. You may safely rerun it with the same configuration values without disturbing an existing deployment. `cloudrun-deploy` deploys the current source and may create a new revision.

#### Connect Apps Script to Cloud Run

The script `apps/script/Syllabus.js` provides the `getSyllabus(year, month)` API, which returns parsed training syllabus JSON. It uses `ScriptApp.getIdentityToken()` to retrieve an identity token for the executing user, with no stored tokens, service-account keys, or SKA credentials retained in Apps Script.

Connect the Apps Script project to a deployed syllabus service as follows:

1. If you have not already done so, upload the script sources with `make clasp-push` to install the `appsscript.json` manifest. The manifest specifies `openid`, `userinfo.email`, and `script.external_request` scopes in addition to the existing calendar and e-mail scopes.
2. In the Apps Script editor, run `logSyllabusAudience` and complete authorization using the intended execution account. Copy the audience value from the execution log. The helper decodes the token locally and logs only its non-sensitive `aud` claim, never the token itself.
3. Register the executing account's audience with `make cloudrun-register-audience AUDIENCE='PASTE_AUDIENCE_FROM_APPS_SCRIPT'`. The target registers the audience and prints the service's `run.app` URL. The CLI account needs permission to update the service. The Apps Script execution account (the trigger creator for scheduled runs) must have Invoker access: use its e-mail address as `INVOKER_EMAIL` during deployment, or grant it access separately in Cloud Run Permissions if it differs from the CLI account.
4. In Apps Script **Project Settings > Script Properties**, set `SYLLABUS_SERVICE_URL` to the HTTPS `run.app` URL, without query parameters or a path. An optional trailing slash is accepted.
5. Run `test_getSyllabus` in the Apps Script editor to validate live retrieval.

Repeat audience registration if you change the script's OAuth client. For HTTP 401/403 errors, check that you registered the correct audience and granted the executing account Invoker access.

#### Validate the deployment

Validate a deployment with `make cloudrun-validate` while authenticated as the Invoker account (or another account granted Invoker access separately in Cloud Run Permissions). The `cloudrun-validate` target retrieves the syllabus for the current month (as determined by the timezone setting in the environment where the CLI runs) from the deployed service and prints syllabus JSON; treat this output as private member-only content.

If an HTTP request fails, validation will fail and report the HTTP status code. Common responses include:

- An HTTP 401 or 403 response indicates an authentication or access problem.
- An HTTP 502 response indicates a retrieval failure, for example, from Secrets Manager or further upstream.

To validate a nondefault service, set `GCP_PROJECT`, `GCP_REGION`, or `SYLLABUS_SERVICE`.

#### Local live retrieval

To retrieve a syllabus locally, configure Application Default Credentials (ADC) with `gcloud auth application-default login` and then run `npm --prefix apps/syllabus run cli -- --year 2026 --month 12` from the repository root. `npm ... run cli ...` retrieves credentials from Secret Manager, contacts live SKA services, and prints syllabus JSON; treat the output as member-only content.

The ADC identity must have permission to access both secrets in the selected Google Cloud project. `gcloud auth application-default login` configures credentials but does not grant Secret Manager permissions by itself. The ADC identity needs its own grant or inherited project-level access; `cloudrun-init` grants access only to the deployed runtime service account. The CLI uses project `get-ska-events` by default to obtain `ska-username` and `ska-password` values; pass `--project PROJECT` to select another project from which to obtain values.

If an HTTP request fails, the CLI prints a sanitized error identifying the retrieval stage and exits with a nonzero status. It does not report the HTTP status code.
