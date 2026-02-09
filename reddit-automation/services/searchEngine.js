import fs from "fs";
import fetch from "node-fetch";

const SUBREDDITS_PATH = "config/subreddits.json";
const QUERIES_PATH = "config/queries.json";
const OUTPUT_PATH = "data/fetched_posts.json";
const FAILURE_PATH = "data/search_failures.json";

/* ---------------- helpers ---------------- */

function readJSON(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf-8");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJSON(path, data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

/**
 * IST timestamp (Asia/Kolkata)
 * Format: YYYY-MM-DDTHH:mm:ss
 */
function nowIST() {
  return new Date()
    .toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" })
    .replace(" ", "T");
}

/* ---------------- failure memory ---------------- */

function getFailureState() {
  return readJSON(FAILURE_PATH, {});
}

function recordFailure(subreddit, status) {
  const failures = getFailureState();
  const prev = failures[subreddit] || { fail_count: 0 };

  const failCount = prev.fail_count + 1;
  const cooldownMinutes = Math.min(60, failCount * 10);

  const cooldownUntil = new Date(
    Date.now() + cooldownMinutes * 60 * 1000
  )
    .toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" })
    .replace(" ", "T");

  failures[subreddit] = {
    fail_count: failCount,
    cooldown_until: cooldownUntil,
    last_error: status
  };

  writeJSON(FAILURE_PATH, failures);
}

function clearFailure(subreddit) {
  const failures = getFailureState();
  if (failures[subreddit]) {
    delete failures[subreddit];
    writeJSON(FAILURE_PATH, failures);
  }
}

function isSubredditCoolingDown(subreddit) {
  const failures = getFailureState();
  const entry = failures[subreddit];
  if (!entry) return false;

  return Date.now() < new Date(entry.cooldown_until).getTime();
}

/* ---------------- dedupe ---------------- */

function loadExistingPostKeys() {
  const existing = readJSON(OUTPUT_PATH, []);
  const keys = new Set();

  for (const post of existing) {
    if (post.post_id) keys.add(post.post_id);
    else if (post.url) keys.add(post.url);
  }

  return { existing, keys };
}

function appendFreshPostsOnly(newPosts) {
  const { existing, keys } = loadExistingPostKeys();
  const fresh = [];

  for (const post of newPosts) {
    const key = post.post_id || post.url;
    if (keys.has(key)) continue;
    keys.add(key);
    fresh.push(post);
  }

  if (fresh.length === 0) return 0;

  writeJSON(OUTPUT_PATH, [...existing, ...fresh]);
  return fresh.length;
}

/* ---------------- reddit fetch ---------------- */

function buildSearchUrl({ subreddit, query, after }) {
  const base = `https://www.reddit.com/r/${subreddit}/search.json`;
  const params = new URLSearchParams({
    q: query,
    restrict_sr: "1",
    sort: "new",
    t: "day",
    limit: "25"
  });

  if (after) params.set("after", after);
  return `${base}?${params.toString()}`;
}

async function fetchSubredditPosts(subreddit, query) {
  let after = null;
  let allPosts = [];

  for (let page = 0; page < 2; page++) {
    const res = await fetch(
      buildSearchUrl({ subreddit, query, after }),
      { headers: { "User-Agent": "reddit-automation-bot/1.0" } }
    );

    if (!res.ok) {
      recordFailure(subreddit, res.status);
      throw new Error(`HTTP ${res.status}`);
    }

    const json = await res.json();
    const children = json?.data?.children || [];

    const normalized = children.map(c => ({
      post_id: c.data.id,
      subreddit,
      title: c.data.title,
      author: c.data.author,
      url: `https://www.reddit.com${c.data.permalink}`,
      selftext: c.data.selftext,
      created_utc: c.data.created_utc,
      score: c.data.score,
      num_comments: c.data.num_comments,
      fetched_at: nowIST()
    }));

    allPosts.push(...normalized);
    after = json?.data?.after;
    if (!after) break;
  }

  clearFailure(subreddit);
  return allPosts;
}

/* ---------------- public API ---------------- */

export async function runSearchEngine() {
  const { subreddits } = readJSON(SUBREDDITS_PATH, { subreddits: "" });
  const { templates } = readJSON(QUERIES_PATH, { templates: [] });

  const subredditList = subreddits
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  let collected = [];

  for (const subreddit of subredditList) {
    if (isSubredditCoolingDown(subreddit)) {
      console.log(`⏳ Skipping ${subreddit} (cooldown active)`);
      continue;
    }

    for (const query of templates) {
      try {
        const posts = await fetchSubredditPosts(subreddit, query);
        collected.push(...posts);
      } catch (err) {
        console.warn(`⚠️ ${subreddit} failed: ${err.message}`);
        break;
      }
    }
  }

  if (collected.length === 0) {
    console.log("⚠️ Search completed — no posts fetched");
    return;
  }

  const added = appendFreshPostsOnly(collected);

  console.log(
    `✅ Search completed — ${added} new posts added (out of ${collected.length})`
  );
}
