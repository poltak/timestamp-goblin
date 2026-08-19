# Chrome Web Store publishing

The `Publish Chrome Web Store` workflow runs when a push to `master` changes a
version-bearing package file. It checks that all version values match and that
the manifest version is new. It then runs the test and build checks, creates
`timestamp-goblin.zip`, and submits it to the Chrome Web Store with the Chrome
Web Store API v2.

The workflow uses GitHub OIDC and Google Workload Identity Federation. It does
not use a downloaded service-account JSON key.

## One-time Google Cloud setup

Use a Google Cloud project that you control. The project ID is a short string
such as `my-extension-release`, not the numeric project number.

1. Open [Google Cloud Console](https://console.cloud.google.com/), select the
   project, and enable **Chrome Web Store API** in **APIs & Services** →
   **Library**.
2. In the same **APIs & Services** → **Library** page, also enable these APIs:
   **Identity and Access Management (IAM) API**, **Security Token Service API**,
   and **IAM Service Account Credentials API**. Workload Identity Federation
   uses these APIs to exchange the GitHub OIDC token and impersonate the
   service account.
3. Open **IAM & Admin** → **Service Accounts**, select the project, and create
   a service account. Use a name such as `timestamp-goblin-publisher`.
4. Copy the service account email. It has this form:
   `timestamp-goblin-publisher@PROJECT_ID.iam.gserviceaccount.com`.
5. Open **IAM & Admin** → **Workload Identity Pools**, or open the [Workload
   Identity Pools page](https://console.cloud.google.com/iam-admin/workload-identity-pools),
   and click **Create pool** (also labelled **New workload provider and pool**).
   Under **Create an identity pool**:
    - Name: `github-actions` (the name is also the pool ID).
    - Description: for example, `GitHub Actions for timestamp-goblin`.
    - Click **Continue**.
6. Configure the provider:
    - Select provider: **OpenID Connect (OIDC)**.
    - Provider name: `timestamp-goblin`.
    - Provider ID: `timestamp-goblin`.
    - Issuer URL: `https://token.actions.githubusercontent.com/`.
    - Audiences: **Default audience**.
    - Click **Continue**.
7. Under **Configure provider attributes**, add these mappings:

    ```text
    google.subject=assertion.sub
    attribute.repository=assertion.repository
    attribute.repository_owner=assertion.repository_owner
    attribute.ref=assertion.ref
    ```

8. Under **Attribute conditions**, enter:

    ```text
    assertion.repository == 'poltak/timestamp-goblin' && assertion.ref == 'refs/heads/master'
    ```

    This allows only the `master` workflow from this repository. Click **Save**
    to create the pool and provider.

9. Open the new provider's details and copy its **resource name**. It looks
   like:
   `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_ID/providers/PROVIDER_ID`.
   The provider resource name uses the numeric project number, not the project
   ID.
10. Allow the repository to impersonate the service account:
    - Return to **Workload Identity Pools** and select the `github-actions` pool.
    - Click **Grant access**.
    - Select **Grant access using Service Account impersonation**.
    - Select `timestamp-goblin-publisher` in the service-account list.
    - Select **Only identities matching the filter**.
    - Set **Attribute name** to `repository`.
    - Set **Attribute value** to `poltak/timestamp-goblin`.
    - Click **Save**, then **Dismiss**.

    This grants the service account the **Workload Identity User** role for
    this repository. The service account does not need a broad Google Cloud
    project role for this workflow.

    If the service account is in a different project and is not listed, open
    **IAM & Admin** → **Service Accounts**, select it, click **Manage access** →
    **Add principal**, add this principal set, and select **Workload Identity
    User**:

    ```text
    principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_ID/attribute.repository/poltak/timestamp-goblin
    ```

    Use the workload-pool project number in this principal, even though the
    GitHub variable `CWS_PROJECT_ID` uses the project ID.

The service account must be linked to the Chrome Web Store publisher account in
the next section. See Google's [service-account setup guide](https://developer.chrome.com/docs/webstore/service-accounts)
for the current Chrome Web Store requirements.

## One-time Chrome Web Store setup

1. Open the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. In the top-right publisher selector, select the publisher that owns
   Timestamp Goblin.
3. Open **Account** in the dashboard's left menu and add the service account
   email. The email must be exactly the email created in Google Cloud.
   Chrome currently permits only one service account for each publisher. If you
   do not see the service-account section, check the selected publisher and
   confirm that your account owns or administers it.
4. Open **Publisher** → **Settings** and find the publisher ID. This is the
   value for `CWS_PUBLISHER_ID`; it is not the extension ID.
5. The Timestamp Goblin extension ID is:

    ```text
    amhjjgahmkpgmppkkddkcjflgkbhnfhj
    ```

    This is the value for `CWS_EXTENSION_ID`. For another item, read the ID from
    the final part of its Chrome Web Store item URL or from the item's dashboard
    page.

## GitHub repository variables

Open the GitHub repository and go to **Settings** → **Secrets and variables** →
**Actions** → **Variables** → **New repository variable**. Add these five
repository variables. They are configuration values, not secrets. The workflow
does not require a JSON key or a GitHub secret.

| Variable              | Where to find the value                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CWS_PROJECT_ID`      | Google Cloud Console → project selector or **Project info**. Copy **Project ID**, not **Project number**.                                                                 |
| `CWS_WIF_PROVIDER`    | Google Cloud Console → **IAM & Admin** → **Workload Identity Federation** → the pool → the OIDC provider. Copy the complete **resource name**, starting with `projects/`. |
| `CWS_SERVICE_ACCOUNT` | Google Cloud Console → **IAM & Admin** → **Service Accounts**. Copy the service account **email address**.                                                                |
| `CWS_PUBLISHER_ID`    | Chrome Web Store Developer Dashboard → **Publisher** → **Settings**. Copy the publisher ID shown for the selected publisher.                                              |
| `CWS_EXTENSION_ID`    | Use `amhjjgahmkpgmppkkddkcjflgkbhnfhj` for Timestamp Goblin. Otherwise copy the item ID from the item URL or dashboard.                                                   |

The `CWS_WIF_PROVIDER` value must be the full resource name. Do not add
`https://`, and do not use the service account email in this variable.

If the repository is renamed, moved to another owner, or the workflow branch
changes, update the OIDC provider's attribute condition and the principal set
binding. Otherwise Google will reject the GitHub token.

## Version and review rules

Chrome requires a manifest version with one to four dot-separated integers. Each
part must be from `0` to `65535`, with no leading zeroes, and the complete
version cannot be all zero. The workflow also requires the version in all of
these locations to match:

- `src/manifest.json`
- `package.json`
- `package-lock.json` top-level `version`
- `package-lock.json` `packages[""].version`

The current manifest version must be greater than the version before the push.
This comparison also works when one push contains multiple commits. An equal
version is a successful no-op. A lower version fails the job. The Chrome Web
Store also rejects a version that is not greater than the published version.

The publish request uses `DEFAULT_PUBLISH`. Chrome Web Store review can take
some time. A successful workflow means that the item was submitted; it does not
mean that review finished. The workflow does not change the item's visibility.
The existing visibility setting in the Developer Dashboard remains in effect.

## Check a release or recover from a failure

After pushing a version bump, open the repository's **Actions** tab and select
the `Publish Chrome Web Store` run. The version gate, tests, package build,
upload, and publish steps show separate results. The upload step polls for up
to five minutes when the API reports that the upload is still in progress.

Common recovery steps:

- **Missing variable or authentication failure:** check all five repository
  variables, the provider resource name, the OIDC condition, the principal-set
  binding, and the service-account email added in the Chrome Web Store
  dashboard.
- **Version mismatch:** update all four version locations and commit them
  together. Do not edit only the manifest.
- **Equal version:** this is an intentional skip. Increase the version for a
  new store upload.
- **Upload or API failure:** read the response in the failed step and check the
  item's status in the Developer Dashboard. A run can be re-run from GitHub
  after a transient network or Google API error. If the upload succeeded but
  publishing failed, confirm the item state in the dashboard before retrying
  so that the same version is not submitted twice.

The workflow uses these Chrome Web Store API v2 endpoints:

- [Upload](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/media/upload)
- [Fetch upload status](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/fetchStatus)
- [Publish](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/publish)

Read the [Chrome Web Store API guide](https://developer.chrome.com/docs/webstore/using-api)
for the current API behavior and review states.
