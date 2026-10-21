Get NorCal SKA Events
=====================

A Google Apps Script application for creating weekly and monthly event e-mail messages from the NorCal SKA event calendar and the SKA monthly training syllabus.

## Google Apps Script synchronization

To develop and test Get NorCal SKA Events, create a new standalone Google Apps Script project. We assume that you have [enabled the Google Apps Script API](https://developers.google.com/apps-script/api/quickstart/js#enable-api) in your workspace and [installed `Node.js` and `npm`](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm).

- Install locked root and syllabus app dependencies, including the Apps Script `clasp` CLI, Prettier, and ESLint: `make env`. Use Node.js 22 to match the Cloud Run runtime.
- Log in to the Apps Script API: `make clasp-login`
- Create a new standalone Apps Script project: `make clasp-project`. The new project name is "Get NorCal SKA Events" by default; set the `PROJECT_NAME` environment variable to override the default. This command creates the project metadata file `.clasp.json` in the repository and links the local files to the new Apps Script project.

After running these steps, you should have:

- A new project in the [Apps Script dashboard](https://script.google.com/home)

### `appsscript.json`

`appsscript.json` defines the OAuth scopes required by the Get NorCal SKA Events script to execute. Unfortunately, `make clasp-project` (via `clasp create`) will overwrite the existing `appsscript.json` file in the local repository, so run `git checkout appsscript.json` to restore the correct scope definitions.

## Development `make` targets

The root `.nvmrc` selects Node.js 22. If you use nvm, run `nvm install` and
`nvm use` from the repository root before running `make env`. Other version
managers should select Node.js 22 as well.

Code sanity targets:

- `format`: Format project files with Prettier
- `lint`: Run ESLint on the project JavaScript files

Google Apps Script project setup and synchronization targets:

- `clasp-login`: Log in to the Apps Script API
- `clasp-project`: Create and link a new standalone Apps Script project
- `clasp-test`: Run the Apps Script unit tests locally with Node
- `clasp-push`: Push local changes to Apps Script files (including `*.js` and `appsscript.json`) to the remote project
- `clasp-pull`: Pull remote changes made in the Apps Script console into the local repository

Cloud Run setup, testing, and deployment targets:

- `cloudrun-init`: Provision the syllabus app's Google Cloud resources
- `cloudrun-test`: Run the syllabus app's local tests without accessing Google Cloud
- `cloudrun-deploy`: Test and deploy the syllabus HTTP function

The two workflows are separate: `clasp-push` does not deploy the Cloud Run
function, and `cloudrun-deploy` does not upload Apps Script files.

## Apps Script tests

Run `make clasp-test` to execute `runTests()` from `Test.js` locally with Node.
The harness loads the original Apps Script sources in a shared VM context,
fixes the local and calendar timezones to `America/Los_Angeles`, and substitutes
`CalendarApp`, `Logger`, and the three `Utilities.formatDate` formats used by
the tests. Unsupported date formats fail explicitly.

Logged test failures and exceptions cause a nonzero exit status. No Google
login or calendar access is required. These are local unit tests, not a full
Apps Script runtime emulator; run `runTests` in the Apps Script editor to
check real service access and Google's date formatting.

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

## Standalone syllabus app

The standalone Node app lives in [`apps/syllabus/`](apps/syllabus/README.md).
It has its own package manifest, lockfile, CLI, and tests, separate from the
Apps Script project. From the repository root:

- Install dependencies: `make env`
- Run tests: `make cloudrun-test`
- Retrieve a syllabus from the command line: `npm --prefix apps/syllabus run cli -- --year 2026 --month 12 --gcloud-auth`
- Initialize Google Cloud resources: `make cloudrun-init`
- Deploy the authenticated HTTP function: `make cloudrun-deploy`

`make env` installs locked dependencies for both application components.
`make cloudrun-init` enables APIs, provisions build/runtime service
accounts, and prompts securely for missing SKA secrets in an existing project
with billing enabled. `make cloudrun-deploy` tests and deploys the function using those
identities, with `cloudrun-test` as a prerequisite. Neither testing nor deployment
reinstalls local dependencies; run `make env` after changes
to the app's package manifest or lockfile. Set `GCP_PROJECT`, `GCP_REGION`, `SYLLABUS_SERVICE`,
`SYLLABUS_ACCOUNT_ID`, or `SYLLABUS_BUILD_ACCOUNT_ID` to override defaults. See
the app README for initialization prerequisites and the HTTP interface.

The existing Apps Script files stay at the repository root. `.claspignore`
limits uploads to root script/HTML files and the Apps Script manifest, excluding
the standalone app and its nested `node_modules`.
