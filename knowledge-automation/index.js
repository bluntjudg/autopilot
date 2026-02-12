import fs from "fs";
import { runSearchEngine } from "./services/searchEngine.js";
import { readJSON } from "./services/postStore.js";
import { filterAlreadyCommented } from "./services/dedupe.js";
import { isPostRelevant } from "./services/aiFilter.js";
import { buildCommentQueue } from "./services/queueManager.js";
import { generateCommentsForQueue } from "./services/commentGenerator.js";

const FETCHED_POSTS_PATH = "data/fetched_posts.json";
const LOOP_USAGE_PATH = "data/loop_usage.json";

/* ------------------ helpers ------------------ */

function safeReadJSON(path) {
  try {
    if (!fs.existsSync(path)) return [];
    const raw = fs.readFileSync(path, "utf-8");
    if (!raw.trim()) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function recordLoopUsage(entry) {
  const existing = safeReadJSON(LOOP_USAGE_PATH);
  existing.push(entry);
  fs.writeFileSync(LOOP_USAGE_PATH, JSON.stringify(existing, null, 2));
}

/* ------------------ stage runners ------------------ */

async function runStages1to4() {
  const loopStartedAt = new Date().toISOString();

  console.log("🚀 Stage 1: Search Engine");
  await runSearchEngine();

  console.log("🧹 Stage 2: Deduplication");
  const rawPosts = readJSON(FETCHED_POSTS_PATH);
  const freshPosts = filterAlreadyCommented(rawPosts);
  console.log(`📊 Fresh posts: ${freshPosts.length}`);

  console.log("🧠 Stage 3: AI Approval");

  let evaluated = 0;
  let approvedCount = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  const approvedPosts = [];

  for (const post of freshPosts) {
    const { approved, usage } = await isPostRelevant(post);

    evaluated++;
    promptTokens += usage.prompt_tokens;
    completionTokens += usage.completion_tokens;

    if (approved) {
      approvedCount++;
      approvedPosts.push(post);
    }
  }

  const totalTokens = promptTokens + completionTokens;
  const estimatedCostUSD = totalTokens * 0.0000006;

  console.log("📊 LOOP SUMMARY");
  console.log(`• Evaluated : ${evaluated}`);
  console.log(`• Approved  : ${approvedCount}`);
  console.log(`• Tokens    : ${totalTokens}`);
  console.log(`• Cost USD  : $${estimatedCostUSD.toFixed(6)}`);

  recordLoopUsage({
    loop_started_at: loopStartedAt,
    loop_ended_at: new Date().toISOString(),
    posts_evaluated: evaluated,
    posts_approved: approvedCount,
    total_tokens: totalTokens,
    estimated_cost_usd: estimatedCostUSD
  });

  console.log("📥 Stage 4: Building queue");
  buildCommentQueue(approvedPosts);
}

/* ------------------ main ------------------ */

(async () => {
  const args = process.argv.slice(2);
  const stageArg = args.find(a => a.startsWith("--stage="));
  const stage = stageArg ? stageArg.split("=")[1] : null;

  try {
    // -------- STAGE 5A ONLY --------
    if (stage === "5a") {
      console.log("✍️ Stage 5A: Generating comments");
      await generateCommentsForQueue({ batchSize: 5 });
      console.log("✅ Comment generation completed");
      process.exit(0);
    }

    // -------- STAGE 1–4 ONLY --------
    if (stage === "1-4") {
      await runStages1to4();
      process.exit(0);
    }

    // -------- DEFAULT: FULL PIPELINE UP TO 5A --------
    await runStages1to4();

    console.log("✍️ Stage 5A: Generating comments");
    await generateCommentsForQueue({ batchSize: 5 });

    console.log("🏁 Pipeline completed (up to Stage 5A)");
    process.exit(0);

  } catch (err) {
    console.error("❌ Pipeline failed");
    console.error(err);
    process.exit(1);
  }
})();
