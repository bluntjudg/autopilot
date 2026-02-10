import fs from "fs";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const QUEUE_PATH = "data/to_comment.json";
const COMMENTED_PATH = "data/commented_posts.json";
const PROMPT_PATH = "intent/comment_prompt.md";

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

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/* ---------- CORE (FIXED) ---------- */

export async function generateCommentsForQueue({ limit = 10 } = {}) {
  console.log("\n✍️  COMMENT GENERATOR STARTED");
  console.log("=".repeat(50));

  // ✅ Read from QUEUE (not approved_posts.json)
  const queue = readJSON(QUEUE_PATH);
  const commented = readJSON(COMMENTED_PATH);

  // ✅ Build set of already commented post IDs
  const commentedIds = new Set(commented.map(c => c.post_id));

  // ✅ Find PENDING posts in the queue that haven't been commented yet
  const targets = queue.filter(
    p => p.status === "PENDING" && !commentedIds.has(p.post_id)
  );

  if (targets.length === 0) {
    console.log("📭 No PENDING posts in queue");
    return;
  }

  console.log(`📝 Found ${targets.length} PENDING posts`);
  console.log(`🎯 Generating comments for ${Math.min(limit, targets.length)} posts`);

  const template = fs.readFileSync(PROMPT_PATH, "utf-8");
  let generated = 0;

  for (const post of targets) {
    if (generated >= limit) break;

    console.log(`\n[${generated + 1}/${Math.min(limit, targets.length)}] ${post.title.substring(0, 60)}...`);

    const prompt = buildPrompt(template, post);

    // ✅ Try up to 2 times to get a comment with the website link
    let comment = null;
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      try {
        const res = await client.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.6 + (attempts * 0.2), // Increase temperature on retry
          messages: [
            {
              role: "system",
              content: "You personalize Reddit comments. You MUST include https://asimpletool.com in your reply."
            },
            {
              role: "user",
              content: prompt
            }
          ]
        });

        comment = res.choices[0].message.content.trim();

        // ✅ Check if link is included
        if (comment.includes("https://asimpletool.com")) {
          console.log(`   ✅ Comment generated (attempt ${attempts + 1})`);
          break;
        }

        console.warn(`   ⚠️  Attempt ${attempts + 1}: Link missing, retrying...`);
        attempts++;
        await sleep(1000);

      } catch (err) {
        console.error(`   ❌ API error: ${err.message}`);
        attempts++;
        if (attempts < maxAttempts) {
          await sleep(2000);
        }
      }
    }

    // ✅ If we got a valid comment, update the post in the queue
    if (comment && comment.includes("https://asimpletool.com")) {
      // Find the post in the queue and update it
      const queueIndex = queue.findIndex(p => p.post_id === post.post_id);
      
      if (queueIndex !== -1) {
        queue[queueIndex].generated_comment = comment;
        queue[queueIndex].status = "COMMENT_READY";
        queue[queueIndex].generated_at = new Date().toISOString();
        
        generated++;
        console.log(`   ✅ Status updated to COMMENT_READY`);
      }
    } else {
      console.error(`   ❌ Skipping (link missing after ${maxAttempts} attempts)`);
    }

    // ✅ Small delay between generations
    if (generated < Math.min(limit, targets.length)) {
      await sleep(1200);
    }
  }

  // ✅ Save updated queue
  writeJSON(QUEUE_PATH, queue);

  console.log("\n" + "=".repeat(50));
  console.log(`✅ Generated ${generated} comments`);
  console.log(`📊 Queue updated with COMMENT_READY status`);
  console.log("=".repeat(50));

  return generated;
}

/* ---------- COMPATIBILITY EXPORT ---------- */
export const generateCommentsOnly = generateCommentsForQueue;