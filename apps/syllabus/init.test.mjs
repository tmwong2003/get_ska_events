import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath, URL } from "node:url"

const initializer = fileURLToPath(new URL("./init.sh", import.meta.url))
const mock = `
gcloud() {
  printf '%s\\n' "$*" >> "$CALL_LOG"
  case "$1 $2 $3" in
    "auth list "*)
      if [ "$SCENARIO" = auth-error ]; then echo "Account lookup failed" >&2; return 1; fi
      if [ "$SCENARIO" != signed-out ]; then echo developer@example.org; fi ;;
    "billing projects describe")
      if [ "$SCENARIO" = billing-error ]; then echo "Billing denied" >&2; return 1; fi
      echo True ;;
    "iam service-accounts list")
      if [ "$SCENARIO" = account-error ]; then echo "Account listing denied" >&2; return 1; fi
      if [ "$SCENARIO" != new ]; then echo existing@example.org; fi ;;
    "secrets list "*)
      if [ "$SCENARIO" = secret-error ]; then echo "Secret listing denied" >&2; return 1; fi
      if [ "$SCENARIO" != new ]; then printf 'ska-username\\nska-password\\n'; fi ;;
    "secrets versions list")
      case "$SCENARIO" in
        version-error) echo "Version listing denied" >&2; return 1 ;;
        disabled) echo DISABLED ;;
        destroyed) echo DESTROYED ;;
        new|whitespace) ;;
        *) echo ENABLED ;;
      esac ;;
    "secrets versions add")
      received=$(cat)
      if [ "$SCENARIO" = whitespace ]; then
        case "$4" in
          ska-password)
            if [ "$received" != "$EXPECTED_PASSWORD" ]; then
              echo "Credential bytes changed" >&2
              return 1
            fi ;;
        esac
      fi ;;
  esac
}
`

function initialize(scenario, password = "test-password") {
  const directory = mkdtempSync(join(tmpdir(), "ska-init-test-"))
  try {
    const environment = join(directory, "environment.sh")
    const log = join(directory, "calls")
    writeFileSync(environment, mock)
    const result = spawnSync(
      "bash",
      [initializer, "example-project", "example-runtime", "example-build"],
      {
        env: {
          ...process.env,
          BASH_ENV: environment,
          CALL_LOG: log,
          SCENARIO: scenario,
          EXPECTED_PASSWORD: password,
        },
        encoding: "utf8",
        input: `test-user\n${password}\n`,
        timeout: 10000,
      },
    )
    assert.ifError(result.error)
    return { ...result, calls: readFileSync(log, "utf8") }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test("initializer creates missing accounts and secrets with both identity grants", () => {
  const result = initialize("new")
  assert.equal(result.status, 0, result.stderr)
  for (const account of ["example-runtime", "example-build"]) {
    assert.match(result.calls, new RegExp(`service-accounts create ${account}`))
  }
  assert.match(result.calls, /role=roles\/run.builder/)
  assert.equal(result.calls.match(/secrets create /g)?.length, 2)
  assert.equal(result.calls.match(/secrets versions add /g)?.length, 2)
  assert.equal(
    result.calls.match(/role=roles\/secretmanager.secretAccessor/g)?.length,
    2,
  )
  assert.doesNotMatch(result.calls, /test-password|test-user/)
})

test("initializer reuses enabled latest versions and existing resources", () => {
  const result = initialize("existing")
  assert.equal(result.status, 0, result.stderr)
  assert.doesNotMatch(
    result.calls,
    /service-accounts create|secrets create|versions add/,
  )
  assert.match(result.calls, /--sort-by=~createTime --limit=1/)
  assert.doesNotMatch(result.calls, /auth login/)
})

test("initializer requires explicit login before provisioning", () => {
  const result = initialize("signed-out")
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /make cloudrun-login/)
  assert.doesNotMatch(
    result.calls,
    /auth login|services enable|create|versions add/,
  )
})

test("initializer preserves credential whitespace and backslashes", () => {
  const result = initialize("whitespace", " \tpassword\\with\\slashes\t ")
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.calls.match(/secrets versions add /g)?.length, 2)
})

for (const state of ["disabled", "destroyed"]) {
  test(`initializer replaces a ${state} latest secret version`, () => {
    const result = initialize(state)
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.calls.match(/secrets versions add /g)?.length, 2)
  })
}

for (const [scenario, message] of [
  ["account-error", "Account listing denied"],
  ["secret-error", "Secret listing denied"],
  ["version-error", "Version listing denied"],
  ["billing-error", "Billing denied"],
  ["auth-error", "Account lookup failed"],
]) {
  test(`initializer preserves ${scenario} without attempting resource creation`, () => {
    const result = initialize(scenario)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, new RegExp(message))
    assert.doesNotMatch(
      result.calls,
      /service-accounts create|secrets create|versions add/,
    )
  })
}
