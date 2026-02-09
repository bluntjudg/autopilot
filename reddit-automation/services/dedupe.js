import { readJSON } from "./postStore.js";

const COMMENTED_POSTS_PATH = "data/commented_posts.json";
const FETCHED_POSTS_PATH = "data/fetched_posts.json";
const AI_DECISIONS_PATH = "data/ai_decisions.json";

/**
 * Build a Set of all post IDs already seen
 * across the entire system lifecycle
 */
function buildSeenPostSet() {
  const seen = new Set();

  const commented = readJSON(COMMENTED_POSTS_PATH);
  const fetched = readJSON(FETCHED_POSTS_PATH);
  const aiDecisions = readJSON(AI_DECISIONS_PATH);

  for (const p of commented) {
    const key = p.post_id || p.url;
    if (key) seen.add(key);
  }

  for (const p of fetched) {
    const key = p.post_id || p.url;
    if (key) seen.add(key);
  }

  for (const p of aiDecisions) {
    if (p.post_id) seen.add(p.post_id);
  }

  return seen;
}

/**
 * Filters out posts that were already seen
 * (fetched, AI-reviewed, or commented)
 */
export function filterDuplicatePosts(posts) {
  const seenPostIds = buildSeenPostSet();

  const freshPosts = posts.filter(post => {
    const key = post.post_id || post.url;

    if (!key) return false;

    if (seenPostIds.has(key)) {
      console.log(`⛔ Duplicate post skipped early: ${key}`);
      return false;
    }

    return true;
  });

  return freshPosts;
}
