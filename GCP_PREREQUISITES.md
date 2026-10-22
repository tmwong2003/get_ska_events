Google Cloud prerequisites
==========================

Before initializing or deploying the syllabus service on Cloud Run, configure the Google Cloud project, billing, IAM permissions, and APIs described below. These requirements apply to both personal Google accounts and managed Workspace accounts. Ordinary Apps Script execution and time-driven triggers do not require Cloud billing.

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select a project and record its project ID. In **Billing**, link an active billing account. For the initializer's billing check, grant the initializing user **Billing Account Viewer** (`roles/billing.viewer`) on that billing account if they lack billing visibility; this account-level role also exposes billing information. See [Google's billing-status permissions](https://docs.cloud.google.com/billing/docs/how-to/verify-billing-enabled). Project creation and billing enrollment remain administrator tasks; `cloudrun-init` does neither.
2. In **IAM & Admin > IAM**, confirm that the initializing user has the permissions below through existing roles or explicit grants. You do not need duplicate grants when existing roles already provide access. These bootstrap roles allow broad IAM and secret management; grant them only to the trusted operator and remove provisioning privileges when they no longer need to rerun initialization.

   | Role                                                         | Purpose                                              |
   | ------------------------------------------------------------ | ---------------------------------------------------- |
   | Service Usage Admin (`roles/serviceusage.serviceUsageAdmin`) | Enable the required APIs                             |
   | Service Account Admin (`roles/iam.serviceAccountAdmin`)      | Create and inspect runtime and build accounts        |
   | Project IAM Admin (`roles/resourcemanager.projectIamAdmin`)  | Grant the build account its project role             |
   | Secret Manager Admin (`roles/secretmanager.admin`)           | Create secrets and versions and grant runtime access |

3. Grant the deploying user **Cloud Run Source Developer** (`roles/run.sourceDeveloper`) and **Service Usage Consumer** (`roles/serviceusage.serviceUsageConsumer`) on the project. Grant **Cloud Run Admin** (`roles/run.admin`) for this target's service IAM configuration (`--no-allow-unauthenticated`). Grant **Service Account User** (`roles/iam.serviceAccountUser`) on both the runtime and build accounts so the deployer can act as them. Since these accounts do not exist before initialization, either grant that role at project scope initially or have an administrator grant it on the two accounts after `make cloudrun-init` and before deployment. Prefer account-level grants for ongoing deployment. See [Google's source-deployment IAM requirements](https://docs.cloud.google.com/run/docs/configuring/services/build-service-account).
4. In **APIs & Services > Enabled APIs & services**, ensure the following APIs are enabled for the Cloud Run project. `make cloudrun-init` enables the primary APIs it provisions; retain the supporting dependencies as well.

   | API                             | Service name                       | Purpose                                   |
   | ------------------------------- | ---------------------------------- | ----------------------------------------- |
   | Artifact Registry               | `artifactregistry.googleapis.com`  | Store built container images              |
   | Cloud Build                     | `cloudbuild.googleapis.com`        | Build the service from source             |
   | IAM                             | `iam.googleapis.com`               | Provision and manage service accounts     |
   | IAM Service Account Credentials | `iamcredentials.googleapis.com`    | Required dependency of IAM                |
   | Cloud Logging                   | `logging.googleapis.com`           | Record service logs                       |
   | Pub/Sub                         | `pubsub.googleapis.com`            | Required dependency of Cloud Build        |
   | Cloud Run                       | `run.googleapis.com`               | Deploy and configure the syllabus service |
   | Secret Manager                  | `secretmanager.googleapis.com`     | Store and retrieve SKA credentials        |
   | Service Usage                   | `serviceusage.googleapis.com`      | Enable and inspect project APIs           |
   | Cloud Storage JSON API          | `storage-api.googleapis.com`       | Required dependency of Cloud Build        |
   | Cloud Storage                   | `storage-component.googleapis.com` | Required dependency of Cloud Run          |

   For a project dedicated to this application, you may disable other APIs enabled by default if no other workloads need them. This set has been validated with Apps Script synchronization, Cloud Run source deployment, calendar access, email delivery, and authenticated syllabus retrieval. Built-in Apps Script services do not require separately enabling the Google Calendar API here; default-client `clasp` synchronization also does not require the Apps Script API enabled in this project. Keep the Apps Script API user setting enabled as described in the [README prerequisites](README.md#prerequisites).

   Review API dependencies before disabling services, and do not force cascading disablement. Disabling an API does not delete existing resources or guarantee that their charges stop. Reassess the list if you add features or change deployment tooling.

Continue with [initialization and deployment](README.md#initialize-and-deploy); the initializer handles API enablement, service accounts, and secrets, so you do not need to pre-create those resources in the Console.

Managed organizational accounts may also face service, OAuth, or organization-policy restrictions. Ask your administrator to review Google's [Apps Script service controls](https://support.google.com/a/answer/15100049), [OAuth app access controls](https://support.google.com/a/answer/7281227), and [organization policies](https://docs.cloud.google.com/resource-manager/docs/organization-policy/overview) if access fails despite the required permissions. Personal accounts need no Workspace administrator setup.
