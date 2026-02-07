import fs from "fs";
import { callOpenAI } from "./aiClient.js";

const INTENT_PATH = "intent/personalization.md";
const DECISIONS_PATH = "data/ai_decisions.json";

function safeReadJSON(path) {
  try {
    if (!fs.existsSync(path)) return [];
    const raw = fs.readFileSync(path, "utf-8");
    if (!raw.trim()) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error("⚠️ Corrupt JSON detected, resetting:", path);
    return [];
  }
}

function recordDecision(entry) {
  const existing = safeReadJSON(DECISIONS_PATH);
  existing.push(entry);
  fs.writeFileSync(DECISIONS_PATH, JSON.stringify(existing, null, 2));
}

export async function isPostRelevant(post) {
  const intentRules = fs.readFileSync(INTENT_PATH, "utf-8");

const systemPrompt = `
You are a strict Reddit post classifier.

Approve ONLY posts that explicitly ask people to share
what they are building or working on.

If the post is not a direct invitation to share work,
you MUST reject it.

Respond with ONLY:
APPROVE or REJECT
`;

  const userPrompt = `
INTENT RULES:
${intentRules}

POST:
Title: ${post.title}
Content: ${post.selftext || "(no content)"}
Subreddit: ${post.subreddit}

Decision:
`;

  const { content, usage } = await callOpenAI({
    system: systemPrompt,
    user: userPrompt,
    purpose: "intent_filter",
    metadata: {
      post_id: post.post_id,
      subreddit: post.subreddit
    }
  });

  const decision = content.trim().toUpperCase();
  const approved = decision === "APPROVE";

  recordDecision({
    timestamp: new Date().toISOString(),
    post_id: post.post_id,
    subreddit: post.subreddit,
    title: post.title,
    decision: approved ? "APPROVED" : "REJECTED"
  });

  return {
    approved,
    usage
  };
}
