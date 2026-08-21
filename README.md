# GitHub Repositories for ChatGPT

A Brave/Chrome extension that adds a GitHub-style repository dashboard directly
below the composer on ChatGPT's new-chat page.

The dashboard:

- hides the new-chat welcome heading and dictation microphone while preserving
  the voice-mode button;
- shows seven ranked repositories in each owner column;
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
6. Save one fine-grained GitHub token with read-only repository metadata access
   for each private repository owner.
7. Open or refresh [ChatGPT](https://chatgpt.com/).

Without a token, the extension displays public repositories from the priority
owners. Because GitHub limits each fine-grained token to one resource owner,
add separate tokens for `JFWooten4`, `blocktransfer`, `WhyDRS`, `windsorUwU`,
and `am-only` to include private repositories from all five owners. Existing
single-token settings are migrated to the `JFWooten4` token field automatically.

## Ranking

Repository order uses a weighted score:

- 60% recent GitHub activity, with older activity gradually fading;
- 27% the number of times a repository was opened from this dashboard; and
- 13% how recently it was opened from this dashboard.

Usage history and GitHub tokens stay in the extension's local browser
storage. The extension does not send that data anywhere except GitHub's API when
loading repository metadata.

Press **Alt+R** on the new-chat page to focus the repository search field.
