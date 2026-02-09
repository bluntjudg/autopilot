import fs from "fs";
import path from "path";
import { callOpenAI } from "./aiClient.js";

const INTENT_PATH = "intent/personalization.md";
const DECISIONS_PATH = "data/ai_decisions.json";

/**
 * Safely read JSON file
 */
function safeReadJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf-8");
    if (!raw.trim()) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error("⚠️ Corrupt JSON detected, resetting:", filePath);
    return [];
  }
}

/**
 * Load AI decisions into a lookup map keyed by post_id
 */
function loadDecisionMap() {
  const list = safeReadJSON(DECISIONS_PATH);
  const map = {};

  for (const entry of list) {
    if (entry.post_id) {
      map[entry.post_id] = entry;
    }
  }

  return map;
}

/**
 * Persist a new AI decision
 */
function recordDecision(entry) {
  const existing = safeReadJSON(DECISIONS_PATH);
  existing.push(entry);

  fs.writeFileSync(
    DECISIONS_PATH,
    JSON.stringify(existing, null, 2)
  );
}

/**
 * Decide whether a Reddit post is relevant
 */
export async function isPostRelevant(post) {
  // 🔐 Load existing decisions
  const decisionMap = loadDecisionMap();

  // 🛑 HARD BLOCK: already reviewed → no OpenAI call
  if (decisionMap[post.post_id]) {
    const previous = decisionMap[post.post_id];

    console.log(
      `⏭️ OpenAI skipped for ${post.post_id} (${previous.decision})`
    );

    return {
      approved: previous.decision === "APPROVED",
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      }
    };
  }

  // 📄 Load intent rules
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

  // 🤖 OpenAI call (ONLY ONCE PER POST)
  const { content, usage } = await callOpenAI({
    system: systemPrompt,
    user: userPrompt
  });

  const decisionText = content.trim().toUpperCase();
  const approved = decisionText === "APPROVE";

  // 💾 Save decision immediately
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
