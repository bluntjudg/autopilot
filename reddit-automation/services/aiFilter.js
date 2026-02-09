import fs from "fs";
import { callOpenAI } from "./aiClient.js";

const FETCHED_PATH = "data/fetched_posts.json";
const DECISIONS_PATH = "data/ai_decisions.json";
const APPROVED_PATH = "data/approved_posts.json";
const REJECTED_PATH = "data/rejected_posts.json";
const INTENT_PATH = "intent/personalization.md";

/* ---------- helpers ---------- */

function readJSON(path) {
  if (!fs.existsSync(path)) return [];
  const raw = fs.readFileSync(path, "utf-8");
  if (!raw.trim()) return [];
  return JSON.parse(raw);
}

function writeJSON(path, data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

/* ---------- CORE PIPELINE ---------- */

export async function runAIFilter() {
  console.log("🧠 AI Filter running (batch)");

  const fetched = readJSON(FETCHED_PATH);
  if (fetched.length === 0) {
    console.log("📭 No fetched posts");
    return;
  }

  const decisions = readJSON(DECISIONS_PATH);
  const approved = readJSON(APPROVED_PATH);
  const rejected = readJSON(REJECTED_PATH);

  const decidedIds = new Set(decisions.map(d => d.post_id));
  const intentRules = fs.readFileSync(INTENT_PATH, "utf-8");

  let approvedCount = 0;
  let rejectedCount = 0;

  for (const post of fetched) {
    if (!post.post_id || decidedIds.has(post.post_id)) continue;

    const systemPrompt = `
You are a strict Reddit post classifier.

Approve ONLY posts that explicitly ask people to share
what they are building or working on.

Respond ONLY with:
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

    try {
      const { content } = await callOpenAI({
        system: systemPrompt,
        user: userPrompt
      });

      const decision = content.trim().toUpperCase();
      const approvedFlag = decision === "APPROVE";

      const entry = {
        ...post,
        decided_at: new Date().toISOString(),
        decision: approvedFlag ? "APPROVED" : "REJECTED"
      };

      decisions.push(entry);

      if (approvedFlag) {
        approved.push(entry);
        approvedCount++;
      } else {
        rejected.push(entry);
        rejectedCount++;
      }

    } catch (err) {
      console.warn(`⚠️ AI failed for ${post.post_id}`);
    }
  }

  writeJSON(DECISIONS_PATH, decisions);
  writeJSON(APPROVED_PATH, approved);
  writeJSON(REJECTED_PATH, rejected);

  console.log(
    `✅ AI Filter done → Approved: ${approvedCount}, Rejected: ${rejectedCount}`
  );
}
