import { readJSON } from "./postStore.js";

const COMMENTED_POSTS_PATH = "data/commented_posts.json";

/**
 * Filters out posts that were already commented on
 */
export function filterAlreadyCommented(posts) {
  const commented = readJSON(COMMENTED_POSTS_PATH);

  const commentedIds = new Set(
    commented.map(p => p.post_id || p.url)
  );

  const freshPosts = posts.filter(post => {
    const key = post.post_id || post.url;
    return !commentedIds.has(key);
  });

  return freshPosts;
}
