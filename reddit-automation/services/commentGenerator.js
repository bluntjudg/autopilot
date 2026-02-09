import fs from "fs";
import OpenAI from "openai";
import { readJSON, writeJSON } from "./postStore.js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const APPROVED_PATH = "data/approved_posts.json";
const QUEUE_PATH = "data/to_comment.json";
const COMMENTED_PATH = "data/commented_posts.json";
const PROMPT_PATH = "intent/comment_prompt.md";

/* ---------- helpers ---------- */

function buildPrompt(template, post) {
  const body =
    post.selftext && post.selftext.trim().length > 40
      ? post.selftext.trim()
      : `The post body is short. Use the title carefully.\nTitle: ${post.title}`;

  return template
    .replace("{{subreddit}}", post.subreddit)
    .replace("{{title}}", post.title)
    .replace("{{body}}", body);
}

function buildIdSet(items) {
  return new Set(items.map(p => p.post_id));
}

/* ---------- core ---------- */

export async function generateCommentsOnly({ limit = 10 } = {}) {
  const approved = readJSON(APPROVED_PATH);
  const queue = readJSON(QUEUE_PATH);
  const commented = readJSON(COMMENTED_PATH);

  const queuedIds = buildIdSet(queue);
  const commentedIds = buildIdSet(commented);

  const template = fs.readFileSync(PROMPT_PATH, "utf-8");

  // 🔐 Only approved + not already queued + not commented
  const targets = approved.filter(
    p =>
      !queuedIds.has(p.post_id) &&
      !commentedIds.has(p.post_id)
  );

  if (targets.length === 0) {
    console.log("📭 No approved posts eligible for comment generation");
    return;
  }

  console.log(
    `✍️ Generating comments for ${Math.min(limit, targets.length)} approved posts`
  );

  let generated = 0;

  for (const post of targets) {
    if (generated >= limit) break;

    console.log(`🧠 Generating comment for: ${post.title}`);

    const prompt = buildPrompt(template, post);

    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.6,
      messages: [
        {
          role: "system",
          content:
            "You personalize Reddit comments. You must ground the reply in the post body."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });

    const comment = res.choices[0].message.content.trim();

    // HARD GUARD (unchanged)
    if (!comment.includes("https://asimpletool.com")) {
      console.warn(`⚠️ Skipping ${post.post_id} (website missing)`);
      continue;
    }

    queue.push({
      ...post,
      generated_comment: comment,
      status: "COMMENT_READY",
      generated_at: new Date().toISOString()
    });

    generated++;
    await new Promise(r => setTimeout(r, 1200));
  }

  writeJSON(QUEUE_PATH, queue);
  console.log(`✅ Generated ${generated} comments`);
}

/* ---------- COMPATIBILITY EXPORT ---------- */
export const generateCommentsForQueue = generateCommentsOnly;
