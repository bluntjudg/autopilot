import fs from "fs";
import { callOpenAI } from "./aiClient.js";

const FETCHED_PATH = "data/fetched_posts.json";
const DECISIONS_PATH = "data/ai_decisions.json";
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

const SEO_SYSTEM_PROMPT = `
You are classifying Reddit posts to identify beginner or intermediate SEO problems.

APPROVE posts that:
- Ask about ranking issues
- Mention indexing problems
- Mention sitemap issues
- Ask about meta tags or titles
- Mention impressions but no clicks
- Ask about keyword research basics
- Ask about on-page SEO basics

REJECT posts that:
- Are enterprise SEO discussions
- Mention log file analysis
- Mention crawl budget at scale
- Are promotional posts
- Are unrelated to SEO

Respond with only: APPROVE or REJECT
`;

async function makeAIDecision(post) {
  const userPrompt = `
Subreddit: r/${post.subreddit}
Title: ${post.title}
Content: ${post.selftext || "(no content)"}
Score: ${post.score} | Comments: ${post.num_comments}

Classify this post.
`;

  const { content } = await callOpenAI({
    system: SEO_SYSTEM_PROMPT,
    user: userPrompt
  });

  return content.trim().toUpperCase() === "APPROVE";
}

export async function runAIFilter() {
  const fetched = readJSON(FETCHED_PATH);
  const decisions = readJSON(DECISIONS_PATH);
  const queue = readJSON(QUEUE_PATH);

  const processedIds = new Set(queue.map(p => p.post_id));

  for (const post of fetched) {
    if (processedIds.has(post.post_id)) continue;

    const approved = await makeAIDecision(post);

    if (approved) {
      queue.push({
        ...post,
        status: "PENDING",
        queued_at: new Date().toISOString()
      });
    }

    decisions.push({
      post_id: post.post_id,
      decision: approved ? "APPROVED" : "REJECTED",
      decided_at: new Date().toISOString()
    });
  }

  writeJSON(QUEUE_PATH, queue);
  writeJSON(DECISIONS_PATH, decisions);
}
