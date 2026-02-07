import fs from "fs";

const QUEUE_PATH = "data/to_comment.json";

/**
 * Build the comment queue from AI-approved posts
 */
export function buildCommentQueue(posts) {
  const queue = posts.map(post => ({
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
  }));

  fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2));

  return queue.length;
}
