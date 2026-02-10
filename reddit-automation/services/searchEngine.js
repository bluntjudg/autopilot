import fs from "fs";
import https from "https";

const SUBREDDITS_PATH = "config/subreddits.json";
const QUERIES_PATH = "config/queries.json";
const OUTPUT_PATH = "data/fetched_posts.json";
const FAILURE_PATH = "data/search_failures.json";

/* ---------------- user agents ---------------- */

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:122.0) Gecko/20100101 Firefox/122.0"
];

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

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

function nowIST() {
  return new Date()
    .toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" })
    .replace(" ", "T");
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ---------------- failure memory (FIXED) ---------------- */

function getFailureState() {
  return readJSON(FAILURE_PATH, {});
}

function recordFailure(subreddit, status, consecutiveFailures = 1) {
  const failures = getFailureState();
  const prev = failures[subreddit] || { fail_count: 0, consecutive: 0 };

  const newConsecutive = consecutiveFailures;
  const cooldownMinutes = Math.min(120, Math.pow(2, newConsecutive) * 5); // Exponential: 5, 10, 20, 40, 80, 120

  const cooldownUntil = new Date(
    Date.now() + cooldownMinutes * 60 * 1000
  )
    .toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" })
    .replace(" ", "T");

  failures[subreddit] = {
    fail_count: prev.fail_count + 1,
    consecutive: newConsecutive,
    cooldown_until: cooldownUntil,
    last_error: status,
    last_error_time: nowIST()
  };

  writeJSON(FAILURE_PATH, failures);
  console.log(`⚠️ ${subreddit} → Cooldown for ${cooldownMinutes} min (consecutive: ${newConsecutive})`);
}

function clearFailure(subreddit) {
  const failures = getFailureState();
  if (failures[subreddit]) {
    console.log(`✅ ${subreddit} → Cooldown cleared`);
    delete failures[subreddit];
    writeJSON(FAILURE_PATH, failures);
  }
}

function isSubredditCoolingDown(subreddit) {
  const failures = getFailureState();
  const entry = failures[subreddit];
  if (!entry) return false;

  const isCooling = Date.now() < new Date(entry.cooldown_until).getTime();
  
  if (isCooling) {
    const remaining = Math.ceil(
      (new Date(entry.cooldown_until).getTime() - Date.now()) / 60000
    );
    console.log(`⏳ ${subreddit} cooling down for ${remaining} more min`);
  }
  
  return isCooling;
}

function getConsecutiveFailures(subreddit) {
  const failures = getFailureState();
  return failures[subreddit]?.consecutive || 0;
}

/* ---------------- dedupe (FIXED) ---------------- */

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
    if (keys.has(key)) {
      console.log(`⛔ Duplicate skipped: ${post.title.substring(0, 50)}...`);
      continue;
    }
    keys.add(key);
    fresh.push(post);
  }

  if (fresh.length === 0) return 0;

  writeJSON(OUTPUT_PATH, [...existing, ...fresh]);
  return fresh.length;
}

/* ---------------- reddit fetch (FIXED) ---------------- */

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
 * ✅ FIXED: Fetch with retries, delays, and proper error handling
 */
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(30000) // 30 second timeout
      });

      // ✅ Handle 429 specifically
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        const waitSeconds = retryAfter ? parseInt(retryAfter) : Math.pow(2, attempt) * 10;
        
        console.warn(`⚠️ 429 Rate limit - waiting ${waitSeconds}s (attempt ${attempt}/${maxRetries})`);
        
        if (attempt < maxRetries) {
          await sleep(waitSeconds * 1000);
          continue;
        }
        
        return { ok: false, status: 429, error: "Rate limited" };
      }

      // ✅ Handle other errors
      if (!response.ok) {
        console.warn(`⚠️ HTTP ${response.status} (attempt ${attempt}/${maxRetries})`);
        
        if (attempt < maxRetries && response.status >= 500) {
          await sleep(Math.pow(2, attempt) * 2000); // Exponential backoff
          continue;
        }
        
        return { ok: false, status: response.status, error: `HTTP ${response.status}` };
      }

      // ✅ Success
      const json = await response.json();
      return { ok: true, data: json };

    } catch (err) {
      console.warn(`⚠️ Request error: ${err.message} (attempt ${attempt}/${maxRetries})`);
      
      if (attempt < maxRetries) {
        await sleep(Math.pow(2, attempt) * 2000);
        continue;
      }
      
      return { ok: false, status: 0, error: err.message };
    }
  }

  return { ok: false, status: 0, error: "Max retries exceeded" };
}

/**
 * ✅ FIXED: Fetch subreddit posts with proper pacing and error handling
 */
async function fetchSubredditPosts(subreddit, query) {
  let after = null;
  let allPosts = [];
  let consecutiveFailures = getConsecutiveFailures(subreddit);

  for (let page = 0; page < 2; page++) {
    // ✅ Add delay between requests (3-5 seconds)
    if (page > 0) {
      const delayMs = 3000 + Math.random() * 2000;
      console.log(`⏱️  Waiting ${Math.round(delayMs/1000)}s before next page...`);
      await sleep(delayMs);
    }

    const url = buildSearchUrl({ subreddit, query, after });
    
    console.log(`🔍 Fetching r/${subreddit} "${query}" (page ${page + 1}/2)`);

    const result = await fetchWithRetry(url, {
      headers: {
        "User-Agent": randomUA(),
        "Accept": "application/json"
      }
    });

    // ✅ Handle failure without crashing
    if (!result.ok) {
      consecutiveFailures++;
      recordFailure(subreddit, result.error, consecutiveFailures);
      
      // Don't throw - just return what we have so far
      console.warn(`⚠️ Stopped at page ${page + 1} due to: ${result.error}`);
      break;
    }

    // ✅ Success - reset consecutive failures
    if (consecutiveFailures > 0) {
      clearFailure(subreddit);
      consecutiveFailures = 0;
    }

    const children = result.data?.data?.children || [];

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
    after = result.data?.data?.after;
    
    if (!after) {
      console.log(`✅ No more pages for r/${subreddit}`);
      break;
    }
  }

  return allPosts;
}

/* ---------------- public API ---------------- */

export async function runSearchEngine() {
  console.log("\n🔍 SEARCH ENGINE STARTED");
  console.log("=" .repeat(50));

  const { subreddits } = readJSON(SUBREDDITS_PATH, { subreddits: "" });
  const { templates } = readJSON(QUERIES_PATH, { templates: [] });

  const subredditList = subreddits
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  console.log(`📊 Subreddits: ${subredditList.length}`);
  console.log(`📊 Queries: ${templates.length}`);

  let totalCollected = 0;
  let totalAdded = 0;
  let skippedCount = 0;

  for (let i = 0; i < subredditList.length; i++) {
    const subreddit = subredditList[i];
    
    console.log(`\n[${i + 1}/${subredditList.length}] r/${subreddit}`);

    // ✅ Skip if cooling down
    if (isSubredditCoolingDown(subreddit)) {
      skippedCount++;
      continue;
    }

    for (const query of templates) {
      try {
        const posts = await fetchSubredditPosts(subreddit, query);
        
        if (posts.length > 0) {
          totalCollected += posts.length;
          const added = appendFreshPostsOnly(posts);
          totalAdded += added;
          
          console.log(`📥 Collected ${posts.length}, Added ${added} new posts`);
        } else {
          console.log(`📭 No posts found`);
        }

        // ✅ Delay between queries (2-4 seconds)
        if (templates.indexOf(query) < templates.length - 1) {
          const delayMs = 2000 + Math.random() * 2000;
          await sleep(delayMs);
        }

      } catch (err) {
        console.error(`❌ Unexpected error for r/${subreddit}: ${err.message}`);
        // Don't break - continue to next query
      }
    }

    // ✅ Delay between subreddits (5-7 seconds)
    if (i < subredditList.length - 1) {
      const delayMs = 5000 + Math.random() * 2000;
      console.log(`⏱️  Waiting ${Math.round(delayMs/1000)}s before next subreddit...`);
      await sleep(delayMs);
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("✅ SEARCH ENGINE COMPLETED");
  console.log(`📊 Total collected: ${totalCollected}`);
  console.log(`📊 New posts added: ${totalAdded}`);
  console.log(`📊 Subreddits skipped (cooldown): ${skippedCount}`);
  console.log("=".repeat(50) + "\n");
}