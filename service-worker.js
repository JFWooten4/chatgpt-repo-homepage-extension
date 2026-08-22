importScripts("token-vault.js");

const DEFAULT_OWNER_ORDER = [];
const REPOSITORIES_PER_PAGE = 100;
const ownerProfileCache = new Map();

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

function normalizeRepository(repository, ownerProfiles) {
  const ownerProfile = ownerProfiles.get(repository.owner.login.toLowerCase());

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
      displayName: ownerProfile?.displayName || repository.owner.login,
      avatarUrl: repository.owner.avatar_url,
      type: repository.owner.type,
    },
  };
}

function loadOwnerProfile(login, token) {
  const key = login.toLowerCase();
  if (ownerProfileCache.has(key)) return ownerProfileCache.get(key);

  const profileRequest = fetchGitHub(
    `https://api.github.com/users/${encodeURIComponent(login)}`,
    token,
  )
    .then((profile) => ({
      displayName: profile.name?.trim() || profile.login || login,
    }))
    .catch(() => ({ displayName: login }));

  ownerProfileCache.set(key, profileRequest);
  return profileRequest;
}

async function loadOwnerProfiles(repositories, token = "") {
  const owners = new Map();

  for (const repository of repositories) {
    const login = repository.owner.login;
    owners.set(login.toLowerCase(), login);
  }

  const profiles = await Promise.all(
    [...owners].map(async ([key, login]) => [key, await loadOwnerProfile(login, token)]),
  );
  return new Map(profiles);
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
  const [settings, tokens] = await Promise.all([
    chrome.storage.local.get({ ownerOrder: DEFAULT_OWNER_ORDER }),
    TokenVault.loadTokens(),
  ]);
  const ownerOrder = Array.isArray(settings.ownerOrder)
    ? settings.ownerOrder.filter((owner) => typeof owner === "string" && owner.trim())
    : DEFAULT_OWNER_ORDER;
  let repositories;

  if (tokens.length) {
    const authenticatedRepositories = await Promise.all(
      tokens.map(async ({ label, token }, index) => {
        try {
          return await loadAccessibleRepositories(token);
        } catch (error) {
          throw new Error(`${label || `Token ${index + 1}`}: ${error.message}`);
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

  const ownerProfiles = await loadOwnerProfiles(repositories, tokens[0]?.token);

  return {
    mode: tokens.length ? "authenticated" : "public",
    ownerOrder,
    repositories: repositories.map((repository) => (
      normalizeRepository(repository, ownerProfiles)
    )),
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

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") {
    chrome.runtime.openOptionsPage();
  }

  // Updating from a plaintext-storage version migrates saved tokens immediately.
  if (reason === "update") {
    void TokenVault.loadTokens().catch((error) => {
      console.warn("GitHub token migration failed:", error);
    });
  }
});

// Also migrate on worker startup so an interrupted update migration is retried.
void TokenVault.loadTokens().catch((error) => {
  console.warn("GitHub token vault initialization failed:", error);
});
