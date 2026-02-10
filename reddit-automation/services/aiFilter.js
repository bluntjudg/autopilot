import fs from "fs";
import { callOpenAI } from "./aiClient.js";

const FETCHED_PATH = "data/fetched_posts.json";
const DECISIONS_PATH = "data/ai_decisions.json";
const APPROVED_PATH = "data/approved_posts.json";
const REJECTED_PATH = "data/rejected_posts.json";
const COMMENTED_PATH = "data/commented_posts.json";
const QUEUE_PATH = "data/to_comment.json";
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

/* ---------- DEDUPLICATION (FIXED) ---------- */

/**
 * ✅ Build complete set of posts already seen/processed
 */
function buildProcessedPostIds() {
  const processed = new Set();

  // ✅ 1. Already decided by AI
  const decisions = readJSON(DECISIONS_PATH);
  for (const d of decisions) {
    if (d.post_id) processed.add(d.post_id);
  }

  // ✅ 2. Already in queue
  const queue = readJSON(QUEUE_PATH);
  for (const q of queue) {
    if (q.post_id) processed.add(q.post_id);
  }

  // ✅ 3. Already commented
  const commented = readJSON(COMMENTED_PATH);
  for (const c of commented) {
    if (c.post_id) processed.add(c.post_id);
  }

  console.log(`📊 Total processed posts: ${processed.size}`);
  return processed;
}

/**
 * ✅ Filter out posts we've already seen
 */
function filterUnprocessedPosts(fetched) {
  const processedIds = buildProcessedPostIds();
  
  const unprocessed = fetched.filter(post => {
    if (!post.post_id) return false;
    return !processedIds.has(post.post_id);
  });

  const skipped = fetched.length - unprocessed.length;
  if (skipped > 0) {
    console.log(`⛔ Skipped ${skipped} already processed posts`);
  }

  return unprocessed;
}

/* ---------- AI DECISION (IMPROVED) ---------- */

/**
 * ✅ RELAXED approval criteria
 */
const RELAXED_SYSTEM_PROMPT = `
You are a Reddit post classifier for identifying posts where founders/builders can share their work.

APPROVE posts that:
1. Explicitly ask "What are you building?" or "Share your work"
2. Request feedback on products/projects (implies you can share yours)
3. Are "show and tell" threads or build-in-public discussions
4. Community sharing prompts like "Friday check-in"
5. Posts seeking recommendations where you could suggest your tool

REJECT posts that:
- Are purely seeking help/advice without sharing opportunity
- Are promotional posts by others
- Are questions about tools/services (not asking to share)
- Have no relevance to sharing work

Respond ONLY with one word: APPROVE or REJECT
`;

/**
 * ✅ Make AI decision with logging
 */
async function makeAIDecision(post, intentRules) {
  const userPrompt = `
INTENT RULES:
${intentRules}

POST DETAILS:
Subreddit: r/${post.subreddit}
Title: ${post.title}
Content: ${post.selftext || "(no content - title only)"}
Score: ${post.score} | Comments: ${post.num_comments}

Should this post be approved for commenting?
`;

  try {
    const { content, usage } = await callOpenAI({
      system: RELAXED_SYSTEM_PROMPT,
      user: userPrompt
    });

    const decision = content.trim().toUpperCase();
    const approved = decision === "APPROVE";

    return {
      approved,
      usage,
      raw_response: content
    };

  } catch (err) {
    console.error(`❌ AI error for ${post.post_id}: ${err.message}`);
    return {
      approved: false,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      raw_response: `ERROR: ${err.message}`
    };
  }
}

/* ---------- MAIN PIPELINE (FIXED) ---------- */

export async function runAIFilter() {
  console.log("\n🧠 AI FILTER STARTED");
  console.log("=" .repeat(50));

  // ✅ 1. Load posts
  const fetched = readJSON(FETCHED_PATH);
  if (fetched.length === 0) {
    console.log("📭 No fetched posts to filter");
    return;
  }

  console.log(`📥 Total fetched posts: ${fetched.length}`);

  // ✅ 2. Filter out already processed (saves OpenAI credits!)
  const unprocessed = filterUnprocessedPosts(fetched);
  
  if (unprocessed.length === 0) {
    console.log("✅ All posts already processed");
    return;
  }

  console.log(`🆕 New posts to evaluate: ${unprocessed.length}`);

  // ✅ 3. Load existing data
  const decisions = readJSON(DECISIONS_PATH);
  const approved = readJSON(APPROVED_PATH);
  const rejected = readJSON(REJECTED_PATH);
  const intentRules = fs.readFileSync(INTENT_PATH, "utf-8");

  // ✅ 4. Process each post
  let approvedCount = 0;
  let rejectedCount = 0;
  let totalTokens = 0;
  let errorCount = 0;

  for (let i = 0; i < unprocessed.length; i++) {
    const post = unprocessed[i];
    
    console.log(`\n[${i + 1}/${unprocessed.length}] Evaluating: ${post.title.substring(0, 60)}...`);
    console.log(`   r/${post.subreddit} | ${post.score}↑ ${post.num_comments}💬`);

    const result = await makeAIDecision(post, intentRules);

    // ✅ Track usage
    totalTokens += result.usage.total_tokens || 0;

    // ✅ Create decision entry
    const entry = {
      ...post,
      decided_at: new Date().toISOString(),
      decision: result.approved ? "APPROVED" : "REJECTED",
      ai_response: result.raw_response,
      tokens_used: result.usage.total_tokens || 0
    };

    decisions.push(entry);

    // ✅ Route to appropriate list
    if (result.approved) {
      approved.push(entry);
      approvedCount++;
      console.log(`   ✅ APPROVED`);
    } else {
      rejected.push(entry);
      rejectedCount++;
      console.log(`   ❌ REJECTED: ${result.raw_response}`);
    }

    if (result.raw_response.startsWith("ERROR:")) {
      errorCount++;
    }

    // ✅ Delay between AI calls (1-2 seconds)
    if (i < unprocessed.length - 1) {
      await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
    }
  }

  // ✅ 5. Save results
  writeJSON(DECISIONS_PATH, decisions);
  writeJSON(APPROVED_PATH, approved);
  writeJSON(REJECTED_PATH, rejected);

  // ✅ 6. Calculate cost
  const estimatedCost = (totalTokens * 0.00015) / 1000; // GPT-4 pricing

  console.log("\n" + "=".repeat(50));
  console.log("✅ AI FILTER COMPLETED");
  console.log(`📊 Evaluated: ${unprocessed.length}`);
  console.log(`✅ Approved: ${approvedCount}`);
  console.log(`❌ Rejected: ${rejectedCount}`);
  console.log(`🪙 Tokens used: ${totalTokens.toLocaleString()}`);
  console.log(`💰 Estimated cost: $${estimatedCost.toFixed(4)}`);
  if (errorCount > 0) {
    console.log(`⚠️  Errors: ${errorCount}`);
  }
  console.log("=".repeat(50) + "\n");

  return {
    evaluated: unprocessed.length,
    approved: approvedCount,
    rejected: rejectedCount,
    tokens: totalTokens,
    cost: estimatedCost
  };
}

/* ---------- BACKWARDS COMPATIBILITY ---------- */

export async function isPostRelevant(post) {
  // Old signature for compatibility
  const intentRules = fs.readFileSync(INTENT_PATH, "utf-8");
  const result = await makeAIDecision(post, intentRules);
  return result;
}