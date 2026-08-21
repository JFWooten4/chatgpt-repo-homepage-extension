const DEFAULT_OWNER_ORDER = [
  "JFWooten4",
  "blocktransfer",
  "WhyDRS",
  "stellar",
  "windsorUwU",
  "am-only",
];
const REQUIRED_TRAILING_OWNERS = ["windsorUwU", "am-only"];
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

function ownerOrderWithRequiredOwners(ownerOrder) {
  const requiredKeys = new Set(
    REQUIRED_TRAILING_OWNERS.map((owner) => owner.toLowerCase()),
  );
  const result = ownerOrder.filter((owner) => !requiredKeys.has(owner.toLowerCase()));
  const stellarIndex = result.findIndex((owner) => owner.toLowerCase() === "stellar");
  result.splice(
    stellarIndex >= 0 ? stellarIndex + 1 : result.length,
    0,
    ...REQUIRED_TRAILING_OWNERS,
  );
  return result;
}

function configuredTokens(settings) {
  const ownerTokens = Array.isArray(settings.githubTokens)
    ? settings.githubTokens
      .filter((entry) => (
        entry
        && typeof entry.owner === "string"
        && typeof entry.token === "string"
      ))
      .map(({ owner, token }) => ({ owner: owner.trim(), token: token.trim() }))
      .filter(({ owner, token }) => owner && token)
    : [];

  if (!ownerTokens.length && settings.githubToken.trim()) {
    ownerTokens.push({ owner: "JFWooten4", token: settings.githubToken.trim() });
  }

  const seenTokens = new Set();
  return ownerTokens.filter(({ token }) => {
    if (seenTokens.has(token)) return false;
    seenTokens.add(token);
    return true;
  });
}

function uniqueRepositories(repositories) {
  const seenRepositories = new Set();
  return repositories.filter((repository) => {
    const key = repository.full_name.toLowerCase();
    if (seenRepositories.has(key)) return false;
    seenRepositories.add(key);
    return true;
  });
}

async function repositoryPayload() {
  const settings = await chrome.storage.local.get({
    githubToken: "",
    githubTokens: [],
    ownerOrder: DEFAULT_OWNER_ORDER,
  });
  const storedOwnerOrder = Array.isArray(settings.ownerOrder) && settings.ownerOrder.length
    ? settings.ownerOrder
    : DEFAULT_OWNER_ORDER;
  const ownerOrder = ownerOrderWithRequiredOwners(storedOwnerOrder);
  const ownerTokens = configuredTokens(settings);
  let repositories;

  if (ownerTokens.length) {
    const authenticatedRepositories = await Promise.all(
      ownerTokens.map(async ({ owner, token }) => {
        try {
          return await loadAccessibleRepositories(token);
        } catch (error) {
          throw new Error(`${owner}: ${error.message}`);
        }
      }),
    );
    repositories = uniqueRepositories(authenticatedRepositories.flat());
    const accessibleOwners = new Set(
      repositories.map((repository) => repository.owner.login.toLowerCase()),
    );
    const missingPriorityOwners = ownerOrder.filter(
      (owner) => !accessibleOwners.has(owner.toLowerCase()),
    );
    const priorityRepositories = await loadPublicRepositories(missingPriorityOwners);
    repositories.push(...priorityRepositories);
    repositories = uniqueRepositories(repositories);
  } else {
    repositories = await loadPublicRepositories(ownerOrder);
  }

  return {
    mode: ownerTokens.length ? "authenticated" : "public",
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
