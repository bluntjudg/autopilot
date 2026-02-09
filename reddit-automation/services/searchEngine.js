import fs from "fs";
import fetch from "node-fetch";

const SUBREDDITS_PATH = "config/subreddits.json";
const QUERIES_PATH = "config/queries.json";
const OUTPUT_PATH = "data/fetched_posts.json";

/**
 * Safe JSON reader
 */
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

/**
 * Load existing fetched posts into a Set (disk memory)
 */
function loadExistingPostKeys() {
  const existing = readJSON(OUTPUT_PATH, []);
  const keys = new Set();

  for (const post of existing) {
    if (post.post_id) keys.add(post.post_id);
    else if (post.url) keys.add(post.url);
  }

  return { existing, keys };
}

/**
 * Append ONLY new, unique posts to fetched_posts.json
 */
function appendFreshPostsOnly(newPosts) {
  const { existing, keys } = loadExistingPostKeys();
  const fresh = [];

  for (const post of newPosts) {
    const key = post.post_id || post.url;
    if (keys.has(key)) {
      console.log(`⛔ Duplicate skipped (disk): ${key}`);
      continue;
    }
    keys.add(key);
    fresh.push(post);
  }

  if (fresh.length === 0) {
    console.log("⛔ No new unique posts found");
    return 0;
  }

  const updated = [...existing, ...fresh];
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(updated, null, 2));

  return fresh.length;
}

/**
 * Build Reddit search URL
 */
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

/**
 * Fetch posts from a subreddit + query
 */
async function fetchSubredditPosts(subreddit, query) {
  let after = null;
  let allPosts = [];

  for (let page = 0; page < 2; page++) {
    console.log(`🔍 Fetching: ${subreddit} | "${query}"`);

    const res = await fetch(
      buildSearchUrl({ subreddit, query, after }),
      { headers: { "User-Agent": "reddit-automation-bot/1.0" } }
    );

    if (!res.ok) {
      console.error(`❌ ${res.status} for r/${subreddit}`);
      break;
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
      fetched_at: new Date().toISOString()
    }));

    allPosts.push(...normalized);
    after = json?.data?.after;
    if (!after) break;
  }

  return allPosts;
}

/**
 * PURE SEARCH WORKER
 * No sleep. No rate logic. No orchestration.
 */
export async function runSearchEngine() {
  const { subreddits } = readJSON(SUBREDDITS_PATH, { subreddits: "" });
  const { templates } = readJSON(QUERIES_PATH, { templates: [] });

  const subredditList = subreddits
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  let collected = [];

  for (const subreddit of subredditList) {
    for (const query of templates) {
      const posts = await fetchSubredditPosts(subreddit, query);
      collected.push(...posts);
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
