// ---------- Config / constants ----------
const API_BASE = "http://localhost:4000";
const CONTACT_STORAGE_KEY = "easylfg_default_contact";
const TOKEN_PREFIX = "easylfg_secret_";
const PAGE_SIZE = 10;

// ---------- DOM refs ----------
const els = {
  form: document.getElementById("lfgForm"),
  postsList: document.getElementById("postsList"),
  postsCount: document.getElementById("postsCount"),
  emptyState: document.getElementById("emptyState"),
  formError: document.getElementById("formError"),
  listError: document.getElementById("listError"),
  offlineBanner: document.getElementById("offlineBanner"),
  loadingState: document.getElementById("loadingState"),
  filterGame: document.getElementById("filterGame"),
  filterPlatform: document.getElementById("filterPlatform"),
  filterRegion: document.getElementById("filterRegion"),
  filterMine: document.getElementById("filterMine"),
  filterNowOnly: document.getElementById("filterNowOnly"),
  sortOrder: document.getElementById("sortOrder"),
  refreshBtn: document.getElementById("refreshBtn"),
  copySearchLinkBtn: document.getElementById("copySearchLinkBtn"),
  pagination: document.getElementById("pagination"),
  prevPageBtn: document.getElementById("prevPage"),
  nextPageBtn: document.getElementById("nextPage"),
  pageInfo: document.getElementById("pageInfo"),
  findMatchBtn: document.getElementById("findMatchBtn"),
  matchSummary: document.getElementById("matchSummary"),
  matchSummaryText: document.getElementById("matchSummaryText"),
  clearMatchBtn: document.getElementById("clearMatchBtn"),
  gameInput: document.getElementById("game"),
  ttlSelect: document.getElementById("ttl"),
  websiteHoneypot: document.getElementById("website"),
};

// ---------- App state ----------
const state = {
  posts: [],
  currentPage: 1,
  focusPostId: null,
  matchCriteria: null,
  isMatchView: false,
};

// ---------- Utils ----------
const escapeHTML = (str) =>
  (str || "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const getTokenKey = (postId) => `${TOKEN_PREFIX}${postId}`;

const isMyPost = (post) => !!localStorage.getItem(getTokenKey(post.id));

/**
 * Smart title formatter for game names.
 * 1. Matches against known game list (proper capitalization).
 * 2. Otherwise runs intelligent title-casing with special rules.
 */
function formatGameName(input) {
  if (!input) return "";

  const RAW = input.trim().toLowerCase();

  // Known games with proper formatting
  const KNOWN_GAMES = {
    "left 4 dead": "Left 4 Dead",
    "left 4 dead 2": "Left 4 Dead 2",
    "valorant": "Valorant",
    "apex legends": "Apex Legends",
    "overwatch 2": "Overwatch 2",
    "diablo 2": "Diablo II",
    "diablo ii": "Diablo II",
    "diablo 3": "Diablo III",
    "diablo iii": "Diablo III",
    "diablo 4": "Diablo IV",
    "diablo iv": "Diablo IV",
    "cs2": "CS2",
    "counter strike 2": "Counter-Strike 2",
    "league of legends": "League of Legends",
    "rocket league": "Rocket League",
    "elden ring": "Elden Ring",
    "path of exile": "Path of Exile",
    "path of exile 2": "Path of Exile 2",
    "warframe": "Warframe",
    "fortnite": "Fortnite",
  };

  if (KNOWN_GAMES[RAW]) {
    return KNOWN_GAMES[RAW];
  }

  // Auto-detect Roman numerals and preserve them uppercase
  const ROMAN = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i;

  // Small words we keep lowercase unless first/last
  const SMALL_WORDS = new Set([
    "and", "or", "the", "of", "for", "in", "on", "at", "to", "vs", "with"
  ]);

  return RAW
    .split(" ")
    .map((word, idx, arr) => {
      if (ROMAN.test(word)) return word.toUpperCase();

      if (!word) return "";

      // Keep acronyms uppercase (fps, mmo, rpg)
      if (word.length <= 4 && /^[a-z]+$/.test(word) && word === word.toLowerCase()) {
        const upper = word.toUpperCase();
        if (upper.length >= 2) return upper; // FPS, MMO, LFG
      }

      if (SMALL_WORDS.has(word)) {
        // Small words become lowercase unless at start or end
        if (idx !== 0 && idx !== arr.length - 1) return word;
      }

      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}


function showError(el, msg) {
  if (!el) return;
  if (!msg) {
    el.style.display = "none";
    el.textContent = "";
  } else {
    el.style.display = "block";
    el.textContent = msg;
  }
}

function setBanner(el, show) {
  if (!el) return;
  el.style.display = show ? "block" : "none";
}

const setOffline = (isOffline) => setBanner(els.offlineBanner, isOffline);
const setLoading = (isLoading) => setBanner(els.loadingState, isLoading);

function formatTime(date) {
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeTime(date) {
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return diffMinutes + " min ago";
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return diffHours + "h ago";
  const diffDays = Math.floor(diffHours / 24);
  return diffDays + "d ago";
}

function timeRemaining(expiresAtMs) {
  const diffMs = expiresAtMs - Date.now();
  if (diffMs <= 0) return "expiring soon";
  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes < 60) return diffMinutes + " min left";
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return diffHours + "h left";
  const diffDays = Math.round(diffHours / 24);
  return diffDays + "d left";
}

function loadSavedContact() {
  try {
    const raw = localStorage.getItem(CONTACT_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed.type) {
      const typeSelect = document.getElementById("contactType");
      if (typeSelect) typeSelect.value = parsed.type;
    }
    if (parsed.value) {
      const valueInput = document.getElementById("contactValue");
      if (valueInput) valueInput.value = parsed.value;
    }
  } catch {
    // ignore
  }
}

function saveContactToLocalStorage(type, value) {
  try {
    localStorage.setItem(CONTACT_STORAGE_KEY, JSON.stringify({ type, value }));
  } catch {
    // ignore
  }
}

function getFilterValues() {
  return {
    game: (els.filterGame?.value || "").trim(),
    platform: els.filterPlatform?.value || "",
    region: els.filterRegion?.value || "",
    mine: !!els.filterMine?.checked,
    nowOnly: !!els.filterNowOnly?.checked,
    sort: els.sortOrder?.value || "newest",
  };
}

function syncURLWithFilters() {
  const params = new URLSearchParams();
  const f = getFilterValues();

  if (f.game) params.set("game", f.game);
  if (f.platform) params.set("platform", f.platform);
  if (f.region) params.set("region", f.region);
  if (f.mine) params.set("mine", "1");
  if (f.nowOnly) params.set("nowOnly", "1");
  if (f.sort && f.sort !== "newest") params.set("sort", f.sort);
  if (state.focusPostId) params.set("focus", state.focusPostId);

  const baseUrl = window.location.origin + window.location.pathname;
  const newUrl = params.toString() ? `${baseUrl}?${params}` : baseUrl;
  window.history.replaceState(null, "", newUrl);
}

function initFiltersFromURL() {
  const params = new URLSearchParams(window.location.search);

  const game = params.get("game") || "";
  const platform = params.get("platform") || "";
  const region = params.get("region") || "";
  const mine = params.get("mine") === "1";
  const nowOnly = params.get("nowOnly") === "1";
  const sort = params.get("sort") || "newest";
  const focus = params.get("focus");

  if (game && els.filterGame) els.filterGame.value = game;
  if (platform && els.filterPlatform) els.filterPlatform.value = platform;
  if (region && els.filterRegion) els.filterRegion.value = region;
  if (els.filterMine) els.filterMine.checked = mine;
  if (els.filterNowOnly) els.filterNowOnly.checked = nowOnly;
  if (els.sortOrder && els.sortOrder.querySelector(`option[value="${sort}"]`)) {
    els.sortOrder.value = sort;
  }

  state.focusPostId = focus || null;
}

// ---------- API ----------
async function fetchPosts() {
  showError(els.listError, null);
  setLoading(true);

  const res = await fetch(API_BASE + "/posts", {
    method: "GET",
    mode: "cors",
  });

  if (!res.ok) throw new Error("Failed to load posts");

  return res.json();
}

async function handleDelete(postId) {
  const tokenKey = getTokenKey(postId);
  const secretToken = localStorage.getItem(tokenKey);
  if (!secretToken) {
    alert("You can only delete posts created from this browser.");
    return;
  }

  if (!confirm("Delete this post? This cannot be undone.")) return;

  try {
    const res = await fetch(API_BASE + "/posts/" + encodeURIComponent(postId), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      mode: "cors",
      body: JSON.stringify({ secretToken }),
    });

    if (!res.ok) throw new Error("Failed to delete");

    localStorage.removeItem(tokenKey);
    await loadPosts();
  } catch (err) {
    console.error(err);
    alert("Could not delete post.");
  }
}

async function handleReport(postId) {
  try {
    const res = await fetch(
      API_BASE + "/posts/" + encodeURIComponent(postId) + "/report",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        mode: "cors",
        body: JSON.stringify({ reason: "user_report" }),
      }
    );

    if (!res.ok) throw new Error("Failed to report");

    alert("Thanks. This post has been reported.");
  } catch (err) {
    console.error(err);
    alert("Could not report post.");
  }
}

// ---------- Matching ----------
function computeMatchScore(post, criteria) {
  const norm = (s) => (s || "").toLowerCase().trim();
  let score = 0;

  if (criteria.game) {
    const gq = norm(criteria.game);
    const pg = norm(post.game);
    if (pg === gq && gq) score += 4;
    else if (pg.includes(gq) || gq.includes(pg)) score += 2;
  }

  if (criteria.platform && post.platform === criteria.platform) {
    score += 3;
  }

  if (criteria.region && (post.region || "") === criteria.region) {
    score += 2;
  }

  if (criteria.wantNowish) {
    const tw = post.timeWindow || "";
    if (tw === "Now") score += 3;
    else if (tw === "Next 1–2 hours") score += 2;
    else if (tw === "Tonight") score += 1;
  }

  let label;
  if (score >= 9) label = "🔥 Very good match";
  else if (score >= 6) label = "✅ Good match";
  else if (score >= 3) label = "⚠️ Partial match";
  else label = "No strong match";

  return { score, label };
}

// ---------- Filtering / sorting ----------
function filterAndSortPosts() {
  const filters = getFilterValues();
  let filtered = [...state.posts];

  const gameQuery = filters.game.toLowerCase();
  if (gameQuery) {
    filtered = filtered.filter((p) =>
      (p.game || "").toLowerCase().includes(gameQuery)
    );
  }
  if (filters.platform) {
    filtered = filtered.filter((p) => p.platform === filters.platform);
  }
  if (filters.region) {
    filtered = filtered.filter((p) => (p.region || "") === filters.region);
  }
  if (filters.mine) {
    filtered = filtered.filter(isMyPost);
  }
  if (filters.nowOnly) {
    filtered = filtered.filter(
      (p) => p.timeWindow === "Now" || p.timeWindow === "Next 1–2 hours"
    );
  }

  if (state.isMatchView && state.matchCriteria) {
    filtered.forEach((post) => {
      const { score, label } = computeMatchScore(post, state.matchCriteria);
      post._matchScore = score;
      post._matchLabel = label;
    });

    filtered.sort((a, b) => {
      const as = a._matchScore || 0;
      const bs = b._matchScore || 0;
      if (bs !== as) return bs - as;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

    if (els.matchSummary) {
      const parts = [];
      if (state.matchCriteria.game) parts.push(state.matchCriteria.game);
      if (state.matchCriteria.platform)
        parts.push(state.matchCriteria.platform);
      if (state.matchCriteria.region) parts.push(state.matchCriteria.region);
      if (state.matchCriteria.wantNowish) parts.push("Now / soon");

      els.matchSummary.style.display = "block";
      els.matchSummaryText.textContent =
        parts.join(" · ") || "your current filters";
    }
  } else {
    const sortValue = filters.sort;
    filtered.sort((a, b) => {
      const aCreated = a.createdAt || 0;
      const bCreated = b.createdAt || 0;
      const aExpires = a.expiresAt || Number.MAX_SAFE_INTEGER;
      const bExpires = b.expiresAt || Number.MAX_SAFE_INTEGER;
      const aGame = (a.game || "").toLowerCase();
      const bGame = (b.game || "").toLowerCase();

      switch (sortValue) {
        case "oldest":
          return aCreated - bCreated;
        case "expiresSoon":
          return aExpires - bExpires;
        case "gameAZ":
          if (aGame < bGame) return -1;
          if (aGame > bGame) return 1;
          return 0;
        case "newest":
        default:
          return bCreated - aCreated;
      }
    });

    if (els.matchSummary) els.matchSummary.style.display = "none";
  }

  return filtered;
}

// ---------- Rendering ----------
function renderPosts() {
  const posts = filterAndSortPosts();
  const total = posts.length;
  els.postsList.innerHTML = "";
  syncURLWithFilters();

  els.postsCount.textContent = total + (total === 1 ? " post" : " posts");

  if (total === 0) {
    els.emptyState.style.display = "block";
    els.pagination.style.display = "none";
    return;
  } else {
    els.emptyState.style.display = "none";
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (state.currentPage > totalPages) state.currentPage = totalPages;

  const start = (state.currentPage - 1) * PAGE_SIZE;
  const pagePosts = posts.slice(start, start + PAGE_SIZE);

  if (totalPages > 1) {
    els.pagination.style.display = "flex";
    els.pageInfo.textContent = `Page ${state.currentPage} / ${totalPages}`;
    els.prevPageBtn.disabled = state.currentPage <= 1;
    els.nextPageBtn.disabled = state.currentPage >= totalPages;
  } else {
    els.pagination.style.display = "none";
  }

  pagePosts.forEach((post) => {
    const el = document.createElement("article");
    el.className = "post";
    el.id = "post-" + post.id;
    el.tabIndex = 0;
    el.setAttribute("aria-label", "LFG post for " + (post.game || ""));

    const createdDate = new Date(post.createdAt);

    const safeGame = escapeHTML(post.game);
    const safePlatform = escapeHTML(post.platform);
    const safeRegion = escapeHTML(post.region);
    const safePlaystyle = escapeHTML(post.playstyle);
    const safeDescription = escapeHTML(post.description);
    const safeContact = escapeHTML(post.contact);
    const safeTimeWindow = escapeHTML(post.timeWindow);
    const safeMic = escapeHTML(post.mic);
    const safeGroupSize = escapeHTML(post.groupSize);
    const safeMatchLabel = escapeHTML(post._matchLabel);

    const tokenKey = getTokenKey(post.id);
    const hasToken = !!localStorage.getItem(tokenKey);
    const ttlText = post.expiresAt ? timeRemaining(post.expiresAt) : "";

    const regionChip = safeRegion
      ? `<span>Region: ${safeRegion}</span>`
      : `<span>Region: Any</span>`;

    const playstyleChip = safePlaystyle
      ? `<span>${safePlaystyle}</span>`
      : `<span>Any play style</span>`;

    const groupChip = safeGroupSize ? `<span>Need: ${safeGroupSize}</span>` : "";
    const timeChip = safeTimeWindow
      ? `<span>Playing: ${safeTimeWindow}</span>`
      : "";
    const contactChip = safeContact
      ? `<span>Contact: ${safeContact}</span>`
      : "";

    const myPostBadge = isMyPost(post)
      ? `<span class="post-badge-mine">My post</span>`
      : "";

    el.innerHTML = `
      <div class="post-main">
        <div class="post-title">
          <span class="post-game">${formatGameName(post.game)}</span>
          <span class="post-platform">${safePlatform}</span>
          ${myPostBadge}
        </div>
        <div class="post-meta">
          ${regionChip}
          ${playstyleChip}
          ${groupChip}
          ${timeChip}
          ${contactChip}
        </div>
        ${
          safeDescription
            ? `<div class="post-description">${safeDescription}</div>`
            : ""
        }
      </div>
      <div class="post-side">
        <div class="post-mic-badge ${
          post.mic === "Yes" || post.mic === "Preferred" ? "post-mic-yes" : ""
        }">
          Mic: ${safeMic}
        </div>
        <div class="post-time">
          ${relativeTime(createdDate)} · ${formatTime(createdDate)}
        </div>
        <div class="post-ttl">
          ${ttlText}
        </div>
        ${
          safeMatchLabel && safeMatchLabel !== "No strong match"
            ? `<div class="post-match">${safeMatchLabel}</div>`
            : ""
        }
        <div class="post-actions">
          <button class="secondary copy-btn" type="button" aria-label="Copy post details">
            Copy
          </button>
          <button class="secondary share-btn" type="button" aria-label="Copy link to this post">
            Link
          </button>
          <button class="secondary report-btn" type="button" aria-label="Report this post">
            Report
          </button>
          ${
            hasToken
              ? `<button class="danger delete-btn" type="button" data-id="${post.id}" aria-label="Delete this post">Delete</button>`
              : ""
          }
        </div>
      </div>
    `;

    const copyBtn = el.querySelector(".copy-btn");
    if (copyBtn && navigator.clipboard) {
      copyBtn.addEventListener("click", () => {
        const lines = [
          `${safeGame} (${safePlatform})`,
          safePlaystyle ? `Style: ${safePlaystyle}` : "",
          safeRegion ? `Region: ${safeRegion}` : "",
          safeGroupSize ? `Need: ${safeGroupSize}` : "",
          safeTimeWindow ? `Playing: ${safeTimeWindow}` : "",
          safeMic ? `Mic: ${safeMic}` : "",
          safeContact ? `Contact: ${safeContact}` : "",
          ttlText ? `TTL: ${ttlText}` : "",
          safeDescription || "",
        ].filter(Boolean);
        navigator.clipboard.writeText(lines.join("\n")).catch(() => {});
      });
    }

    const shareBtn = el.querySelector(".share-btn");
    if (shareBtn && navigator.clipboard) {
      shareBtn.addEventListener("click", () => {
        state.focusPostId = post.id;
        syncURLWithFilters();
        navigator.clipboard.writeText(window.location.href).catch(() => {});
      });
    }

    const reportBtn = el.querySelector(".report-btn");
    if (reportBtn) {
      reportBtn.addEventListener("click", () => {
        if (confirm("Report this post as inappropriate or spam?")) {
          handleReport(post.id);
        }
      });
    }

    const deleteBtn = el.querySelector(".delete-btn");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", () => handleDelete(post.id));
    }

    els.postsList.appendChild(el);
  });

  if (state.focusPostId) {
    const focusEl = document.getElementById("post-" + state.focusPostId);
    if (focusEl) {
      focusEl.classList.add("post-highlight");
      focusEl.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => focusEl.classList.remove("post-highlight"), 1500);
    }
  }
}

async function loadPosts() {
  try {
    const posts = await fetchPosts();
    state.posts = posts;
    state.currentPage = 1;
    setOffline(false);
    setLoading(false);
    renderPosts();
  } catch (err) {
    console.error(err);
    setLoading(false);
    showError(els.listError, "Could not load posts from server.");
    setOffline(!navigator.onLine);

    if (state.posts.length > 0) {
      renderPosts();
    } else {
      els.postsList.innerHTML = "";
      els.emptyState.style.display = "block";
      els.postsCount.textContent = "0 posts";
    }
  }
}

// ---------- Form submit ----------
els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(els.formError, null);

  const game = formatGameName(document.getElementById("game").value.trim());
  const platform = document.getElementById("platform").value;
  const region = document.getElementById("region").value;
  const playstyle = document.getElementById("playstyle").value;
  const groupSize = document.getElementById("groupSize").value;
  const mic = document.getElementById("mic").value || "Preferred";
  const contactType = document.getElementById("contactType").value;
  const contactValue = document.getElementById("contactValue").value.trim();
  const rememberContact = document.getElementById("rememberContact").checked;
  const timeWindow = document.getElementById("timeWindow").value;
  const ttlMinutes = parseInt(els.ttlSelect.value, 10) || 1440;
  const description = document.getElementById("description").value.trim();
  const honeypot = els.websiteHoneypot.value.trim();

  if (!game || !platform) {
    showError(els.formError, "Game and platform are required.");
    return;
  }

  if (
    contactType === "Discord" &&
    contactValue &&
    !contactValue.includes("#") &&
    !contactValue.includes("@")
  ) {
    showError(
      els.formError,
      "Discord handles usually look like name#1234 or @name."
    );
    return;
  }

  let contact = "";
  if (contactValue) {
    contact = contactType ? `${contactType}: ${contactValue}` : contactValue;
  }

  if (rememberContact && contactValue) {
    saveContactToLocalStorage(contactType, contactValue);
  }

  const payload = {
    game,
    platform,
    region,
    playstyle,
    groupSize,
    mic,
    contact,
    timeWindow,
    ttlMinutes,
    description,
    honeypot,
  };

  try {
    const res = await fetch(API_BASE + "/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      mode: "cors",
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const msg = (data && data.error) || "Failed to create post";
      throw new Error(msg);
    }

    if (data && data.id && data.secretToken) {
      localStorage.setItem(getTokenKey(data.id), data.secretToken);
    }

    els.form.reset();
    document.getElementById("mic").value = "Yes";
    document.getElementById("rememberContact").checked = true;
    els.ttlSelect.value = "1440";
    loadSavedContact();

    state.focusPostId = data && data.id ? data.id : null;
    await loadPosts();
  } catch (err) {
    console.error(err);
    showError(
      els.formError,
      err.message || "Could not create post. Is the server running?"
    );
  }
});

// ---------- Filters / controls ----------
function resetMatchView() {
  state.matchCriteria = null;
  state.isMatchView = false;
  if (els.matchSummary) els.matchSummary.style.display = "none";
}

function onFiltersChanged() {
  state.currentPage = 1;
  resetMatchView();
  renderPosts();
}

[els.filterGame, els.filterPlatform, els.filterRegion].forEach((el) => {
  el.addEventListener("input", onFiltersChanged);
  el.addEventListener("change", onFiltersChanged);
});

if (els.filterMine) {
  els.filterMine.addEventListener("change", () => {
    state.currentPage = 1;
    resetMatchView();
    renderPosts();
  });
}

if (els.filterNowOnly) {
  els.filterNowOnly.addEventListener("change", () => {
    state.currentPage = 1;
    resetMatchView();
    renderPosts();
  });
}

if (els.sortOrder) {
  els.sortOrder.addEventListener("change", () => {
    state.currentPage = 1;
    resetMatchView();
    renderPosts();
  });
}

if (els.prevPageBtn && els.nextPageBtn) {
  els.prevPageBtn.addEventListener("click", () => {
    if (state.currentPage > 1) {
      state.currentPage--;
      renderPosts();
    }
  });

  els.nextPageBtn.addEventListener("click", () => {
    state.currentPage++;
    renderPosts();
  });
}

if (els.refreshBtn) {
  els.refreshBtn.addEventListener("click", () => {
    resetMatchView();
    loadPosts();
  });
}

if (els.copySearchLinkBtn && navigator.clipboard) {
  els.copySearchLinkBtn.addEventListener("click", () => {
    syncURLWithFilters();
    navigator.clipboard.writeText(window.location.href).catch(() => {});
  });
}

if (els.findMatchBtn) {
  els.findMatchBtn.addEventListener("click", () => {
    const filters = getFilterValues();
    state.matchCriteria = {
      game: filters.game,
      platform: filters.platform,
      region: filters.region,
      wantNowish: filters.nowOnly,
    };
    state.isMatchView = true;
    state.currentPage = 1;
    renderPosts();
  });
}

if (els.clearMatchBtn) {
  els.clearMatchBtn.addEventListener("click", () => {
    resetMatchView();
    state.currentPage = 1;
    renderPosts();
  });
}

// ---------- Autocomplete helpers ----------
function autocompleteFromDatalist(inputEl, datalistId) {
  const list = document.getElementById(datalistId);
  if (!list || !inputEl) return;

  const raw = inputEl.value.trim();
  if (!raw) return;

  const value = raw.toLowerCase();
  let bestMatch = null;

  for (const opt of list.options) {
    const optValue = (opt.value || "").trim();
    if (!optValue) continue;

    const lower = optValue.toLowerCase();
    if (lower.startsWith(value)) {
      if (!bestMatch || optValue.length < bestMatch.length) {
        bestMatch = optValue;
      }
    }
  }

  if (bestMatch) inputEl.value = bestMatch;
}

function attachAutocomplete(inputEl) {
  if (!inputEl) return;
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      autocompleteFromDatalist(inputEl, "gameSuggestions");
    }
  });
  inputEl.addEventListener("blur", () => {
    autocompleteFromDatalist(inputEl, "gameSuggestions");
  });
}

attachAutocomplete(els.gameInput);
attachAutocomplete(els.filterGame);

// ---------- Quick presets ----------
const presetsContainer = document.querySelector(".quick-presets");
if (presetsContainer) {
  presetsContainer.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-preset]");
    if (!btn) return;

    const preset = btn.getAttribute("data-preset");
    const platformEl = document.getElementById("platform");
    const playstyleEl = document.getElementById("playstyle");
    const timeWindowEl = document.getElementById("timeWindow");
    const groupSizeEl = document.getElementById("groupSize");
    const descEl = document.getElementById("description");

    if (!els.gameInput || !platformEl || !descEl) return;

    switch (preset) {
      case "l4d2":
        els.gameInput.value = "Left 4 Dead 2";
        platformEl.value = "PC";
        playstyleEl.value = "Story / Campaign";
        groupSizeEl.value = "+2";
        timeWindowEl.value = "Tonight";
        descEl.value =
          "L4D2 on PC, Expert campaign. Need 2 chill players, mic preferred, NA evenings.";
        break;
      case "poe-farm":
        els.gameInput.value = "Path of Exile";
        platformEl.value = "PC";
        playstyleEl.value = "Grinding / Farming";
        groupSizeEl.value = "+3";
        timeWindowEl.value = "Now";
        descEl.value =
          "PoE mapping on PC, chill loot farm, mic optional, NA.";
        break;
      case "d4-night":
        els.gameInput.value = "Diablo IV";
        platformEl.value = "PC";
        playstyleEl.value = "Grinding / Farming";
        groupSizeEl.value = "Full group";
        timeWindowEl.value = "Tonight";
        descEl.value =
          "D4 night grind, Helltides / NM dungeons, relaxed group, mic preferred.";
        break;
      case "valo-ranked":
        els.gameInput.value = "Valorant";
        platformEl.value = "PC";
        playstyleEl.value = "Competitive / Ranked";
        groupSizeEl.value = "Full group";
        timeWindowEl.value = "Next 1–2 hours";
        descEl.value =
          "Valorant ranked 5-stack, gold/plat range, comms required, no toxicity.";
        break;
    }
  });
}

// ---------- Connectivity ----------
window.addEventListener("online", () => {
  setOffline(false);
  loadPosts();
});

window.addEventListener("offline", () => setOffline(true));

// ---------- Init ----------
initFiltersFromURL();
loadSavedContact();
loadPosts();
