# GitHub Repositories for ChatGPT

A Brave/Chrome extension that adds a GitHub-style repository dashboard directly
below the composer on ChatGPT's new-chat page.

The dashboard:

- hides the new-chat welcome heading and dictation microphone while preserving
  the voice-mode button;
- shows seven ranked repositories in each owner column;
- labels owner columns with their GitHub profile display names;
- starts with `JFWooten4`, `blocktransfer`, `WhyDRS`, `stellar`, `windsorUwU`,
  and `am-only`;
- fills a priority owner from its public repositories when it is not part of the
  connected account's GitHub affiliations;
- adds columns for any other repository owners the connected account can access;
- searches across every loaded repository; and
- combines recent repository activity with locally tracked opening frequency to
  personalize the order.

## Install in Brave

1. Open `brave://extensions`.
2. Turn on **Developer mode**.
3. Select **Load unpacked**.
4. Choose this `brave/chatgpt-repositories` folder.
5. Open the extension's **Details**, then select **Extension options**.
6. Add any fine-grained GitHub tokens needed for private repositories. Each
   token only needs read-only repository metadata access.
7. Open or refresh [ChatGPT](https://chatgpt.com/).

Without a token, the extension displays public repositories from the priority
owners entered in Extension options. Add a separate fine-grained token for each
resource owner whose private repositories should appear. Token labels are only
local identifiers; repository access comes from each token's GitHub settings.
Both token rows and priority owners can be added, removed, or reordered. Existing
single-token settings are migrated automatically.

## Ranking

Repository order uses a weighted score:

- 60% recent GitHub activity, with older activity gradually fading;
- 27% the number of times a repository was opened from this dashboard; and
- 13% how recently it was opened from this dashboard.

Usage history and GitHub tokens stay in the extension's local browser
storage. The extension does not send that data anywhere except GitHub's API when
loading repository metadata.

Press **Alt+R** on the new-chat page to focus the repository search field.
