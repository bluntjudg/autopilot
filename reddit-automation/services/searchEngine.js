import fs from "fs";
import fetch from "node-fetch";
import path from "path";

const SUBREDDITS_PATH = "config/subreddits.json";
const QUERIES_PATH = "config/queries.json";
const OUTPUT_PATH = "data/fetched_posts.json";

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function saveFetchedPosts(posts) {
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(posts, null, 2));
}

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

  for (let page = 0; page < 2; page++) { // limit pages for safety
    const url = buildSearchUrl({ subreddit, query, after });

    console.log(`🔍 Fetching: ${url}`);

    const res = await fetch(url, {
      headers: { "User-Agent": "reddit-automation-bot/1.0" }
    });

    if (!res.ok) {
      console.error(`❌ Failed ${res.status} for ${subreddit}`);
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

export async function runSearchEngine() {
  const { subreddits } = readJSON(SUBREDDITS_PATH);
  const { templates } = readJSON(QUERIES_PATH);

  const subredditList = subreddits.split(",").map(s => s.trim());
  let collectedPosts = [];

  for (const subreddit of subredditList) {
    for (const query of templates) {
      const posts = await fetchSubredditPosts(subreddit, query);
      collectedPosts.push(...posts);
    }
  }

  if (collectedPosts.length > 0) {
    saveFetchedPosts(collectedPosts);
    console.log(`✅ Saved ${collectedPosts.length} raw posts`);
  } else {
    console.log("⚠️ No posts fetched");
  }
}
