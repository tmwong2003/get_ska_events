# SKA authentication trace: resource and cleanup inventory

Exported October 21, 2026 (America/Los_Angeles). No resources were deleted while
preparing this inventory. Resource names and IAM metadata were checked against
Google Cloud. No credential values are included.

Project: [get-ska-events](https://console.cloud.google.com/home/dashboard?project=get-ska-events)
(project number `558742426345`). This project existed before the experiment;
keep it for the existing Apps Script integration. Cloud Run and Artifact
Registry resources below are in `us-west1`.

## Resources created for this exercise

| Resource                            | Name / identifier                                                          | Console link                                                                                                                             | Cleanup notes                                                                                                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloud Run Job                       | `ska-training-trace`                                                       | [Job](https://console.cloud.google.com/run/jobs/details/us-west1/ska-training-trace?project=get-ska-events)                              | Delete if not reused for production. No schedule or public HTTP endpoint was created.                                                                                                 |
| Job execution                       | `ska-training-trace-cz8qf`                                                 | [Execution](https://console.cloud.google.com/run/jobs/executions/details/us-west1/ska-training-trace-cz8qf?project=get-ska-events)       | Successful diagnostic run; retain findings before deleting job/execution history.                                                                                                     |
| Artifact Registry Docker repository | `ska-diagnostics`                                                          | [Repository](https://console.cloud.google.com/artifacts/docker/get-ska-events/us-west1/ska-diagnostics?project=get-ska-events)           | Delete the repository if it remains exclusive to this exercise; otherwise delete only the trace image.                                                                                |
| Docker image                        | `us-west1-docker.pkg.dev/get-ska-events/ska-diagnostics/training-trace:v1` | [Images in repository](https://console.cloud.google.com/artifacts/docker/get-ska-events/us-west1/ska-diagnostics?project=get-ska-events) | Digest: `sha256:289498640b028fede7646904fcdf0deae2e64d3f8f9d025accb9b35b0b3cef95`. Removing a tag alone does not remove stored image data.                                            |
| Dedicated runtime service account   | `ska-training-trace@get-ska-events.iam.gserviceaccount.com`                | [Service accounts](https://console.cloud.google.com/iam-admin/serviceaccounts?project=get-ska-events)                                    | Delete after removing/replacing the job and its secret-access bindings. No service-account keys were created.                                                                         |
| Username secret (created by user)   | `ska-username`                                                             | [Secret](https://console.cloud.google.com/security/secret-manager/secret/ska-username/versions?project=get-ska-events)                   | Keep if used for production; otherwise delete secret and versions.                                                                                                                    |
| Password secret (created by user)   | `ska-password`                                                             | [Secret](https://console.cloud.google.com/security/secret-manager/secret/ska-password/versions?project=get-ska-events)                   | Keep if used for production; otherwise delete secret and versions.                                                                                                                    |
| Cloud Build                         | `357761a4-8879-4260-8b4f-8c40b253a181`                                     | [Build](https://console.cloud.google.com/cloud-build/builds;region=us-west1/357761a4-8879-4260-8b4f-8c40b253a181?project=get-ska-events) | Successful image build; history/logs are distinct from the image and uploaded source. No build trigger was created.                                                                   |
| Cloud Build source bucket           | `gs://get-ska-events_cloudbuild`                                           | [Bucket](https://console.cloud.google.com/storage/browser/get-ska-events_cloudbuild?project=get-ska-events)                              | Created/used by the build submission. Verify it has no subsequent production artifacts before deleting the whole bucket. Exact experiment objects are listed below.                   |
| Cloud Logging entries               | Job stdout/stderr, execution/system logs, build logs, audit logs           | [Logs Explorer](https://console.cloud.google.com/logs/query?project=get-ska-events)                                                      | Existing logging infrastructure was used; no custom log bucket, sink, or retention policy was created. Deleting compute resources does not automatically remove retained log entries. |

### Uploaded build-source objects

Both uploads were generated during this exercise. The first submission failed
before creating a build; the second created the successful build above.

- `gs://get-ska-events_cloudbuild/source/1792570991.699207-fc000d2a1a594949ae0ff12f91a2ab26.tgz`
- `gs://get-ska-events_cloudbuild/source/1792571030.882181-6c6562650a5846e78ea5d478ed6bfd7a.tgz`

Build uploads were allowlisted to Docker configuration, package manifests, and
`experimental/scripts/`; `.cache`, credential files, and the local authenticated session were
excluded.

### IAM bindings explicitly added

On **each** of `ska-username` and `ska-password`:

- Principal: `serviceAccount:ska-training-trace@get-ska-events.iam.gserviceaccount.com`
- Role: `roles/secretmanager.secretAccessor`
- Scope: the individual secret, not the whole project.

If retaining the secrets but retiring the diagnostic service account, remove
these bindings. The job maps the secrets' `latest` versions to environment
variables `SKA_USERNAME` and `SKA_PASSWORD`.

## APIs enabled

| API                               | Enablement during exercise                                                    | Console link                                                                                                                       | Cleanup guidance                                                        |
| --------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `run.googleapis.com`              | Enabled by agent for this exercise                                            | [Cloud Run Admin API](https://console.cloud.google.com/apis/api/run.googleapis.com/overview?project=get-ska-events)                | Disable only if no production Cloud Run workloads need it.              |
| `cloudbuild.googleapis.com`       | Enabled by agent for this exercise                                            | [Cloud Build API](https://console.cloud.google.com/apis/api/cloudbuild.googleapis.com/overview?project=get-ska-events)             | Disable only if no production builds need it.                           |
| `artifactregistry.googleapis.com` | Enabled by agent for this exercise                                            | [Artifact Registry API](https://console.cloud.google.com/apis/api/artifactregistry.googleapis.com/overview?project=get-ska-events) | Remove unused stored artifacts first; disable only if otherwise unused. |
| `secretmanager.googleapis.com`    | Already enabled when deployment inspection began, following user secret setup | [Secret Manager API](https://console.cloud.google.com/apis/api/secretmanager.googleapis.com/overview?project=get-ska-events)       | Keep if production will use the SKA credentials.                        |

Logging, Storage, IAM, and Calendar APIs were not explicitly enabled by the
agent during this exercise. Do not disable existing project APIs indiscriminately.
Disabling an API is separate from deleting its resources and stored data.

### Google-managed identities observed after API enablement

These project IAM bindings exist. Their individual creation times were not
established, so this is **not** a list of identities proven new to the exercise.
Review dependencies rather than deleting them as ordinary diagnostic accounts.

| Identity                                                               | Project role                           |
| ---------------------------------------------------------------------- | -------------------------------------- |
| `service-558742426345@serverless-robot-prod.iam.gserviceaccount.com`   | `roles/run.serviceAgent`               |
| `service-558742426345@gcp-sa-cloudbuild.iam.gserviceaccount.com`       | `roles/cloudbuild.serviceAgent`        |
| `558742426345@cloudbuild.gserviceaccount.com`                          | `roles/cloudbuild.builds.builder`      |
| `service-558742426345@gcp-sa-artifactregistry.iam.gserviceaccount.com` | `roles/artifactregistry.serviceAgent`  |
| `service-558742426345@containerregistry.iam.gserviceaccount.com`       | `roles/containerregistry.ServiceAgent` |
| `558742426345-compute@developer.gserviceaccount.com`                   | `roles/editor`                         |
| `service-558742426345@gcp-sa-pubsub.iam.gserviceaccount.com`           | `roles/pubsub.serviceAgent`            |

Review in [IAM](https://console.cloud.google.com/iam-admin/iam?project=get-ska-events).
The agent did not explicitly grant these project-level roles; the only explicit
IAM grants made were the two secret-level accessor bindings above.

## Local tooling and files

- Google Cloud CLI installed with Homebrew cask `gcloud-cli`; user authenticated
  using `gcloud auth login`. Local Google Cloud CLI credentials are separate from
  the SKA secrets and the Playwright cache.
- Playwright dependency and Chromium installed during local development.
- `.cache/training/session.json`: local authenticated SKA browser state, ignored
  by Git; remove when no longer needed. Do not include it in shared exports.
- `experimental/Dockerfile`, `.dockerignore`, `.gcloudignore`: diagnostic build packaging.
- `experimental/scripts/auth-trace.mjs`, `experimental/scripts/auth-trace.test.mjs`: redacted tracer/tests.
- `experimental/scripts/get-training.mjs`: working syllabus scraper with trace option.
- `experimental/AUTH-TRACE.md`: experiment findings; retain even if cloud resources are removed.
- `DEVELOPERS.md`: usage documentation.

## Suggested cleanup order

1. Decide whether the scraper/job and credentials will be reused in production.
2. Preserve `experimental/AUTH-TRACE.md` and any redacted logs needed for analysis.
3. Delete the diagnostic Cloud Run Job if unused. No scheduler needs removal.
4. Remove its secret IAM grants, then delete its dedicated runtime service account.
5. Delete unused secrets only if they are not needed by production.
6. Delete the trace image/repository and the two uploaded source objects; delete
   the source bucket only after checking for other artifacts.
7. Review retained logs and managed identities under existing project policies.
8. Disable only APIs that are no longer used by any workload in the project.
9. Remove local session state and optionally uninstall local tooling if unused.

This document records cleanup candidates; it does not authorize or perform deletion.

## Follow-up HTTP-only comparison (October 21, 2026)

Created to distinguish browser requirements from Apps Script HTTP/network behavior:

| Resource        | Identifier                                                                                    | Console link                                                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Cloud Run Job   | `ska-training-http-trace` (us-west1)                                                          | [Job](https://console.cloud.google.com/run/jobs/details/us-west1/ska-training-http-trace?project=get-ska-events)                         |
| Execution       | `ska-training-http-trace-7gx8x`                                                               | [Execution](https://console.cloud.google.com/run/jobs/executions/details/us-west1/ska-training-http-trace-7gx8x?project=558742426345)    |
| Docker image    | `us-west1-docker.pkg.dev/get-ska-events/ska-diagnostics/training-http:v1`                     | [Repository](https://console.cloud.google.com/artifacts/docker/get-ska-events/us-west1/ska-diagnostics?project=get-ska-events)           |
| Cloud Build     | `52500526-4ff0-4378-806b-24a44ae03309`                                                        | [Build](https://console.cloud.google.com/cloud-build/builds;region=us-west1/52500526-4ff0-4378-806b-24a44ae03309?project=get-ska-events) |
| Uploaded source | `gs://get-ska-events_cloudbuild/source/1792573094.43697-6f403faac9a6453d8d7458413192fcf8.tgz` | [Source folder](https://console.cloud.google.com/storage/browser/get-ska-events_cloudbuild/source?project=get-ska-events)                |

This job reuses the existing diagnostic service account, secrets, and repository;
no additional IAM grants, APIs, or schedules were added. Delete both diagnostic
jobs before deleting their shared service account or repository. Additional local
files are `experimental/Dockerfile.http`, `experimental/cloudbuild-http.yaml`, and
`experimental/scripts/test-training-http-cloud.mjs`.

The Apps Script experiment also adds `script.external_request` and `cloud-platform`
OAuth scopes in `appsscript.json`, subject to user authorization. Retain these
only if needed by the eventual production flow. Those OAuth scopes are separate
from project API enablement and IAM grants.

## Credential-free transport comparison (October 21, 2026)

| Resource                              | Identifier                                                                            | Console link                                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Public observation service            | `ska-transport-probe`, us-west1                                                       | [Service](https://console.cloud.google.com/run/detail/us-west1/ska-transport-probe?project=get-ska-events)                              |
| Service endpoint                      | `https://ska-transport-probe-558742426345.us-west1.run.app`                           | [Endpoint](https://ska-transport-probe-558742426345.us-west1.run.app) (only /probe accepts the synthetic cases)                         |
| Runtime service account               | `ska-transport-probe@get-ska-events.iam.gserviceaccount.com`                          | [Service accounts](https://console.cloud.google.com/iam-admin/serviceaccounts?project=get-ska-events)                                   |
| Synthetic client job                  | `ska-transport-client`, us-west1                                                      | [Job](https://console.cloud.google.com/run/jobs/details/us-west1/ska-transport-client?project=get-ska-events)                           |
| Synthetic client execution            | `ska-transport-client-s8jg2`                                                          | [Execution](https://console.cloud.google.com/run/jobs/executions/details/us-west1/ska-transport-client-s8jg2?project=get-ska-events)    |
| Probe images                          | `us-west1-docker.pkg.dev/get-ska-events/ska-diagnostics/transport-probe:v1` and `:v2` | [Repository](https://console.cloud.google.com/artifacts/docker/get-ska-events/us-west1/ska-diagnostics?project=get-ska-events)          |
| Updated HTTP comparison image         | `us-west1-docker.pkg.dev/get-ska-events/ska-diagnostics/training-http:v2`             | [Repository](https://console.cloud.google.com/artifacts/docker/get-ska-events/us-west1/ska-diagnostics?project=get-ska-events)          |
| User-Agent login comparison execution | `ska-training-http-trace-bzj5s` on the existing HTTP job                              | [Execution](https://console.cloud.google.com/run/jobs/executions/details/us-west1/ska-training-http-trace-bzj5s?project=get-ska-events) |

The public service has `allUsers` granted `roles/run.invoker` on this service
only. It has minimum instances zero, maximum instances one, and no secrets or
secret-access IAM grants. The client job uses the same credential-free account.
No additional APIs were enabled. Remove the public service and client job before
deleting their shared account. No schedule was created.

The existing HTTP comparison job was updated to image v2 and an
`APPS_SCRIPT_USER_AGENT` environment variable containing an observed User-Agent,
not a credential. It retains its existing diagnostic secret mappings.

### Additional builds and uploaded sources

| Build                                                                                                                                                                   | Purpose                                             | Source object under gs://get-ska-events_cloudbuild/source/ |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------- |
| [99659ca5-45b5-4cea-a448-974cba4eeadd](https://console.cloud.google.com/cloud-build/builds;region=us-west1/99659ca5-45b5-4cea-a448-974cba4eeadd?project=get-ska-events) | Probe v1                                            | `1792574409.132505-632a23d0e8c2479daa4054b10c887763.tgz`   |
| [bdc3de56-5bba-486d-bb38-38e69a784e44](https://console.cloud.google.com/cloud-build/builds;region=us-west1/bdc3de56-5bba-486d-bb38-38e69a784e44?project=get-ska-events) | Probe client v2, regional hostname support          | `1792574640.248324-bd283d4e98834121ad4d24960f4720c0.tgz`   |
| [1cd1d86f-3a6c-426c-9b8b-d7b15e9c80c6](https://console.cloud.google.com/cloud-build/builds;region=us-west1/1cd1d86f-3a6c-426c-9b8b-d7b15e9c80c6?project=get-ska-events) | Superseded build, cancellation requested before use | `1792574859.357693-b87eebacc1254d859b77a03a55066159.tgz`   |
| [a384168e-760d-4cbb-9b65-c97146d89aec](https://console.cloud.google.com/cloud-build/builds;region=us-west1/a384168e-760d-4cbb-9b65-c97146d89aec?project=get-ska-events) | Checked HTTP User-Agent comparison                  | `1792574965.569735-822d783335df4a098ebdd148190ba608.tgz`   |

A separate Cloud Build log bucket was also discovered during metadata review:
[558742426345.cloudbuild-logs.googleusercontent.com](https://console.cloud.google.com/storage/browser/558742426345.cloudbuild-logs.googleusercontent.com?project=get-ska-events).
It contains `log-BUILD_ID.txt` objects for builds listed in this inventory,
including the earlier Playwright and HTTP comparison builds. Clean up the
experiment's log objects if no longer needed; check for other usage before
removing the bucket. This is additional to Cloud Logging and uploaded source.

### Additional local artifacts

`experimental/TransportProbe.js`, `experimental/Dockerfile.probe`, `experimental/cloudbuild-probe.yaml`,
`experimental/scripts/request-transport-probe.mjs`, `experimental/scripts/request-transport-probe.test.mjs`,
`experimental/scripts/run-transport-comparison.mjs`, `experimental/TRANSPORT-COMPARISON.md`, and
`experimental/TRANSPORT-OBSERVATIONS.json`. The synthetic Apps Script test was uploaded to the
existing script project; it reads no SKA credentials and sends no mail.

## Header-verification follow-up (October 21, 2026)

The existing public probe was updated; no new service, account, permissions, or
APIs were created. New cleanup artifacts:

- Image: `us-west1-docker.pkg.dev/get-ska-events/ska-diagnostics/transport-probe:v3`,
  in the existing [repository](https://console.cloud.google.com/artifacts/docker/get-ska-events/us-west1/ska-diagnostics?project=get-ska-events).
- [Build 28fc6590-34a3-490b-8665-14b0443a6546](https://console.cloud.google.com/cloud-build/builds;region=us-west1/28fc6590-34a3-490b-8665-14b0443a6546?project=get-ska-events).
- Uploaded source: `gs://get-ska-events_cloudbuild/source/1792575450.3024-2d6a1f4361714b90ac16a58e1292eb22.tgz`.
- Build log: `gs://558742426345.cloudbuild-logs.googleusercontent.com/log-28fc6590-34a3-490b-8665-14b0443a6546.txt`.
- Public service revision: `ska-transport-probe-00002-p28` (same service/URL).
- [Synthetic client execution ska-transport-client-np2n9](https://console.cloud.google.com/run/jobs/executions/details/us-west1/ska-transport-client-np2n9?project=get-ska-events)
  on the existing job, used to verify the received Node header value.

`testTrainingHttpNodeHeaders` was uploaded to the existing Apps Script project.
It verifies synthetic headers first and then attempts login/extraction; it does
not send mail or add a schedule.

## Imported-session comparison (October 21, 2026)

- Temporary secret: [ska-diagnostic-news-session](https://console.cloud.google.com/security/secret-manager/secret/ska-diagnostic-news-session/versions?project=get-ska-events).
  Contains an authenticated news-session cookie and its mint timestamp. Delete
  when the experiment is finished if not needed; the test's 15-minute freshness
  check does not delete the secret or invalidate the website session.
- Added IAM grant on this secret only:
  `serviceAccount:ska-training-trace@get-ska-events.iam.gserviceaccount.com`
  has `roles/secretmanager.secretVersionAdder`. Remove this binding when retiring
  the export experiment. No new account or project-wide grant was added.
- Image: `us-west1-docker.pkg.dev/get-ska-events/ska-diagnostics/training-http:v3`
  in the existing [repository](https://console.cloud.google.com/artifacts/docker/get-ska-events/us-west1/ska-diagnostics?project=get-ska-events).
- [Build 3bb86378-850f-44c7-b1a9-544a4340ac15](https://console.cloud.google.com/cloud-build/builds;region=us-west1/3bb86378-850f-44c7-b1a9-544a4340ac15?project=get-ska-events).
- Uploaded source: `gs://get-ska-events_cloudbuild/source/1792576117.490315-6afc83f9c84443eaada532fcf67c86f9.tgz`.
- Build log: `gs://558742426345.cloudbuild-logs.googleusercontent.com/log-3bb86378-850f-44c7-b1a9-544a4340ac15.txt`.

The existing HTTP job is reused with `EXPORT_NEWS_SESSION=true` and the existing
observed User-Agent setting; secrets remain supplied at runtime. No new public
endpoint, recurring trigger, or API was created for this test.

Session-export execution:
[ska-training-http-trace-xh2wp](https://console.cloud.google.com/run/jobs/executions/details/us-west1/ska-training-http-trace-xh2wp?project=get-ska-events).
