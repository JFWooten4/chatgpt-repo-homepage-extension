const DEFAULT_OWNER_ORDER = ["JFWooten4", "blocktransfer", "WhyDRS", "stellar"];
const REPOSITORIES_PER_PAGE = 100;

function githubHeaders(token) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function fetchGitHub(url, token) {
  const response = await fetch(url, { headers: githubHeaders(token) });

  if (!response.ok) {
    let detail = "";

    try {
      const payload = await response.json();
      detail = payload.message ? `: ${payload.message}` : "";
    } catch {
      // GitHub occasionally returns an empty body for network-level errors.
    }

    if (response.status === 401) {
      throw new Error(`GitHub rejected the saved token${detail}`);
    }

    if (response.status === 403) {
      throw new Error(`GitHub API access is unavailable or rate-limited${detail}`);
    }

    throw new Error(`GitHub returned ${response.status}${detail}`);
  }

  return response.json();
}

function normalizeRepository(repository) {
  return {
    id: repository.id,
    name: repository.name,
    fullName: repository.full_name,
    url: repository.html_url,
    description: repository.description || "",
    isPrivate: Boolean(repository.private),
    isFork: Boolean(repository.fork),
    isArchived: Boolean(repository.archived),
    pushedAt: repository.pushed_at || repository.updated_at,
    updatedAt: repository.updated_at,
    language: repository.language || "",
    stars: repository.stargazers_count || 0,
    owner: {
      login: repository.owner.login,
      avatarUrl: repository.owner.avatar_url,
      type: repository.owner.type,
    },
  };
}

async function loadAccessibleRepositories(token) {
  const repositories = [];

  for (let page = 1; ; page += 1) {
    const url = new URL("https://api.github.com/user/repos");
    url.searchParams.set("affiliation", "owner,collaborator,organization_member");
    url.searchParams.set("direction", "desc");
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(REPOSITORIES_PER_PAGE));
    url.searchParams.set("sort", "updated");

    const batch = await fetchGitHub(url.toString(), token);
    repositories.push(...batch);

    if (batch.length < REPOSITORIES_PER_PAGE) {
      break;
    }
  }

  return repositories;
}

async function loadPublicOwnerRepositories(owner, token) {
  const repositories = [];

  for (let page = 1; ; page += 1) {
    const url = new URL(`https://api.github.com/users/${encodeURIComponent(owner)}/repos`);
    url.searchParams.set("direction", "desc");
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(REPOSITORIES_PER_PAGE));
    url.searchParams.set("sort", "updated");

    const batch = await fetchGitHub(url.toString(), token);
    repositories.push(...batch);

    if (batch.length < REPOSITORIES_PER_PAGE) {
      break;
    }
  }

  return repositories;
}

async function loadPublicRepositories(ownerOrder, token = "") {
  const ownerRepositories = await Promise.all(
    ownerOrder.map((owner) => loadPublicOwnerRepositories(owner, token)),
  );
  return ownerRepositories.flat();
}

async function repositoryPayload() {
  const settings = await chrome.storage.local.get({
    githubToken: "",
    ownerOrder: DEFAULT_OWNER_ORDER,
  });
  const ownerOrder = Array.isArray(settings.ownerOrder) && settings.ownerOrder.length
    ? settings.ownerOrder
    : DEFAULT_OWNER_ORDER;
  const token = settings.githubToken.trim();
  let repositories;

  if (token) {
    repositories = await loadAccessibleRepositories(token);
    const accessibleOwners = new Set(
      repositories.map((repository) => repository.owner.login.toLowerCase()),
    );
    const missingPriorityOwners = ownerOrder.filter(
      (owner) => !accessibleOwners.has(owner.toLowerCase()),
    );
    const priorityRepositories = await loadPublicRepositories(missingPriorityOwners, token);
    repositories.push(...priorityRepositories);
  } else {
    repositories = await loadPublicRepositories(ownerOrder);
  }

  return {
    mode: token ? "authenticated" : "public",
    ownerOrder,
    repositories: repositories.map(normalizeRepository),
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "load-repositories") {
    repositoryPayload()
      .then((payload) => sendResponse({ ok: true, ...payload }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "open-options") {
    chrome.runtime.openOptionsPage();
  }

  return false;
});
