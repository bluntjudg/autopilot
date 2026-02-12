import fs from "fs";

const APPROVED_PATH = "data/approved_posts.json";
const QUEUE_PATH = "data/to_comment.json";

function readJSON(path) {
  if (!fs.existsSync(path)) return [];
  const raw = fs.readFileSync(path, "utf-8");
  if (!raw.trim()) return [];
  return JSON.parse(raw);
}

function writeJSON(path, data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

export function buildCommentQueue() {
  const approved = readJSON(APPROVED_PATH);
  const queue = readJSON(QUEUE_PATH);

  const queuedIds = new Set(queue.map(p => p.post_id));
  let added = 0;

  for (const post of approved) {
    if (queuedIds.has(post.post_id)) continue;

    queue.push({
      post_id: post.post_id,
      subreddit: post.subreddit,
      title: post.title,
      url: post.url,
      author: post.author,
      created_utc: post.created_utc,
      score: post.score,
      num_comments: post.num_comments,
      queued_at: new Date().toISOString(),
      status: "PENDING"
    });

    added++;
  }

  if (added > 0) {
    writeJSON(QUEUE_PATH, queue);
  }

  console.log(`📥 Queue updated → ${added} new posts`);
  return added;
}
