# GitHub Repositories for ChatGPT

A Brave/Chrome extension that adds a GitHub-style repository dashboard directly
below the composer on ChatGPT's new-chat page, with optional ChatGPT interface
tweaks.

The dashboard:

- shows seven ranked repositories in each owner column;
- labels owner columns with their GitHub profile display names;
- starts with no accounts configured, so every installation is personal to its
  user;
- loads public repositories for any configured GitHub users or organizations;
- optionally hides the dictation microphone, compacts the new-chat heading, or
  skips ChatGPT's external-site confirmation dialog;
- adds columns for any other repository owners the connected account can access;
- pins important repositories at the top of their user or organization column;
- searches across every loaded repository; and
- combines recent repository activity with locally tracked opening frequency to
  personalize the order.

## Install

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome or `brave://extensions` in Brave.
3. Turn on **Developer mode**.
4. Select **Load unpacked** and choose this repository's folder.
5. In the settings page that opens, add a fine-grained GitHub token, public
   repository owners, or both.
6. Open or refresh [ChatGPT](https://chatgpt.com/).

Without a token, the extension displays public repositories from the owners
entered in Extension options. With one or more tokens, it also displays every
repository those tokens can access. Token labels are local identifiers;
repository access comes from each token's GitHub settings. Tokens and repository
owners can be added, removed, or reordered at any time. Existing single-token
settings are migrated automatically. Use a fine-grained token with read-only
access to only the repository metadata the extension should display.

The external-site warning bypass is opt-in. When enabled, the extension clicks
ChatGPT's **Open link** confirmation automatically, so external destinations open
without the extra confirmation step.

## Pins

Select **Pin** beside any repository on the dashboard or in search results to
keep it visible at the top of its owner column. Pinned repositories remain
visible even when an owner has more than seven repositories. Open Extension
options to drag pins into a preferred order, move them with the arrow buttons,
or remove them.

## Ranking

Unpinned repository order uses a weighted score:

- 60% recent GitHub activity, with older activity gradually fading;
- 27% the number of times a repository was opened from this dashboard; and
- 13% how recently it was opened from this dashboard.

Usage history and GitHub tokens stay in the extension's local browser
storage. The extension does not send that data anywhere except GitHub's API when
loading repository metadata.

Press **Alt+R** on the new-chat page to focus the repository search field.

## License

This project is licensed under the GNU Affero General Public License v3.0. See [LICENSE](LICENSE).
