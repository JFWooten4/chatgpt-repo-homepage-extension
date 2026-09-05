# GitHub App setup

Issue #17 replaces normal personal-access-token setup with a GitHub App connection.
The quick MVP in `feature/github-app-linking-mvp` uses GitHub's device flow so the
browser extension never contains a GitHub App client secret or private key.

## Create the GitHub App

1. Open GitHub **Settings → Developer settings → GitHub Apps → New GitHub App**.
2. Give the app a name and a normal public homepage URL.
3. Under **Identifying and authorizing users**, enable **Device Flow**. The
   device-flow MVP does not need a callback URL, and **Request user authorization
   (OAuth) during installation** can stay off.
4. Leave expiring user authorization tokens enabled so access tokens rotate.
5. Under **Repository permissions**, set **Metadata** to **Read-only** and leave
   every other repository, organization, and account permission at **No access**.
6. Disable the webhook if the app does not otherwise need one.
7. Under **Where can this GitHub App be installed?**, choose **Any account** if
   you want the same app installable on both your personal account and your
   organizations. Choose **Only on this account** only if that single owner is
   sufficient.
8. Create the app, then copy its public **Client ID** and note its app slug from
   `https://github.com/apps/<app-slug>`.

Do not copy a client secret or private key into this repository or the extension.
Neither is needed by this device-flow MVP.

## Configure the extension

1. Reload the unpacked extension from this branch.
2. Open **Full settings → GitHub App → Developer setup**.
3. Paste the public GitHub App **Client ID** and **app slug**.
4. Select **Install / select repositories** and install the app on the desired
   personal account or organization, choosing all or only selected repositories.
5. Select **Connect GitHub**. GitHub opens a device-verification page; enter the
   code shown by the extension.

After authorization, the extension stores the GitHub App user access token and
refresh token encrypted with AES-GCM using a non-extractable browser key. Legacy
personal access tokens are cleared after a successful GitHub App connection.

## Production follow-up

GitHub recommends an authorization-code flow with PKCE rather than device flow
for browser-based public clients. A polished production version can move the code
exchange and refresh operation behind a small backend callback while keeping the
same Connect / Disconnect UI and repository-permission model.
