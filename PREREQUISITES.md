Prerequisites for the Google Cloud Run syllabus service
========================================================

The Get NorCal SKA Events application has a number of Google Cloud Platform (GCP) prerequisites for deploying the Google Cloud Run syllabus service, including configuring a Google Cloud project, enabling billing, granting IAM permissions, and enabling APIs described below. These prerequisites apply to the Google Cloud project used to deploy the syllabus service, whether you access it with a personal Google Account or a Google Workspace account managed by an organization. They do not apply to ordinary Apps Script execution or time-driven triggers.

In this guide, an unqualified account means a Google Account; we identify service accounts, billing accounts, and SKA accounts explicitly.

The same account can initialize and deploy the service. If you use separate accounts, the initializing account (or an IAM administrator) must grant the CLI deployer account the permissions in steps 5 through 7 below.

Initialize the prerequisites as follows:

1. Create or select a Google Cloud project in [Google Cloud Console](https://console.cloud.google.com/) and record its project ID.
2. Link an active billing account in **Billing**. Grant the initializing account the **Billing Account Viewer** (`roles/billing.viewer`) role on the billing account if it lacks billing visibility. See the Google documentation on [billing-status permissions](https://docs.cloud.google.com/billing/docs/how-to/verify-billing-enabled) for more information.
3. Confirm in **IAM & Admin > IAM** that the initializing account has the permissions below through existing roles or explicit grants. You do not need duplicate grants when existing roles already provide access. These bootstrap roles allow broad IAM and secret management; assign them only to the trusted operator's account and remove provisioning privileges when they no longer need to rerun initialization.

   | Role                                                         | Purpose                                              |
   | ------------------------------------------------------------ | ---------------------------------------------------- |
   | Service Usage Admin (`roles/serviceusage.serviceUsageAdmin`) | Enable the required APIs                             |
   | Service Account Admin (`roles/iam.serviceAccountAdmin`)      | Create and inspect runtime and build accounts        |
   | Project IAM Admin (`roles/resourcemanager.projectIamAdmin`)  | Grant the build account its project role             |
   | Secret Manager Admin (`roles/secretmanager.admin`)           | Create secrets and versions and grant runtime access |

4. Enable the following APIs for the Cloud Run project in **APIs & Services > Enabled APIs & services**.

   | API                             | Service name                       | Purpose                                                                           |
   | ------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------- |
   | Artifact Registry               | `artifactregistry.googleapis.com`  | Store built container images                                                      |
   | Cloud Build                     | `cloudbuild.googleapis.com`        | Build the service from source                                                     |
   | IAM                             | `iam.googleapis.com`               | Provision and manage service accounts                                             |
   | IAM Service Account Credentials | `iamcredentials.googleapis.com`    | Generates short-lived service-account credentials; disabling it also disables IAM |
   | Cloud Logging                   | `logging.googleapis.com`           | Record service logs                                                               |
   | Pub/Sub                         | `pubsub.googleapis.com`            | Required dependency of Cloud Build                                                |
   | Cloud Run                       | `run.googleapis.com`               | Deploy and configure the syllabus service                                         |
   | Secret Manager                  | `secretmanager.googleapis.com`     | Store and retrieve SKA credentials                                                |
   | Service Usage                   | `serviceusage.googleapis.com`      | Enable and inspect project APIs                                                   |
   | Cloud Storage JSON API          | `storage-api.googleapis.com`       | Required dependency of Cloud Build                                                |
   | Cloud Storage                   | `storage-component.googleapis.com` | Required dependency of Cloud Run                                                  |

   For a project dedicated to this application, you may disable other APIs enabled by default if no other workloads need them. We have validated this set with Apps Script synchronization, Cloud Run source deployment, calendar access, e-mail delivery, and authenticated syllabus retrieval. Enable the Apps Script API in your Apps Script user settings before running `make clasp-init` or synchronizing sources. This user-level setting is separate from enabling APIs in the Google Cloud project; see the [README prerequisites](README.md#prerequisite-configuration).

   Review API dependencies before disabling services, and do not force cascading disablement. Disabling an API does not delete existing resources or guarantee that their charges stop. Reassess the list if you add features or change deployment tooling.

5. Grant the CLI deployer account the **Cloud Run Source Developer** (`roles/run.sourceDeveloper`) and **Service Usage Consumer** (`roles/serviceusage.serviceUsageConsumer`) roles on the project.
6. Grant the CLI deployer account the **Cloud Run Admin** (`roles/run.admin`) role to enable deployment of the private service and configuration of the service IAM policy (including `--no-allow-unauthenticated`).
7. Grant the CLI deployer account the **Service Account User** (`roles/iam.serviceAccountUser`) role on both the runtime and build service accounts so the deployer can attach the runtime account to the Cloud Run service and the build account to the source build. If these accounts do not yet exist, an administrator can grant the CLI deployer this role at project scope before initialization; this grants access to all service accounts in the project. After `make cloudrun-init`, ask an administrator to replace that grant with account-level grants on only the runtime and build service accounts. Alternatively, an administrator can grant the role on those two accounts after initialization and before deployment. See [Google's source-deployment IAM requirements](https://docs.cloud.google.com/run/docs/configuring/services/build-service-account).

Google Workspace accounts managed by an organization may have service, OAuth, or organization-policy restrictions. Ask your administrator to review the Google documentation on [Apps Script service controls](https://support.google.com/a/answer/15100049), [OAuth app access controls](https://support.google.com/a/answer/7281227), and [organization policies](https://docs.cloud.google.com/resource-manager/docs/organization-policy/overview) if access fails despite the required permissions. Personal Google Accounts need no Workspace administrator setup.
