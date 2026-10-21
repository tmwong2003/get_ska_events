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
