# Project Process – End-to-End Flow

This document defines the exact execution flow of the Reddit Automation Pipeline.
It is the single source of truth for system behavior.

---

## Stage 1: Search Engine

- Read subreddit list (comma-separated) from configuration
- Build Reddit `/search.json` endpoints
- Apply query templates and custom queries
- Sort by relevance and recency
- Fetch posts in JSON format

Output:
- Raw Reddit posts saved to `data/fetched_posts.json`

No filtering or AI is used in this stage.

---

## Stage 2: Raw Storage + Duplicate Check

- Load raw posts from `fetched_posts.json`
- Load previously commented posts from `commented_posts.json`
- Compare post IDs / permalinks
- Remove posts that were already commented on

Output:
- New, unprocessed posts passed to the next stage

This stage prevents repeated commenting.

---

## Stage 3: AI Intent & Context Filtering

- Load personalization rules from `intent/personalization.md`
- Send post title + content to OpenAI
- Evaluate relevance based on intent and context
- Decide whether the post is suitable for engagement

Additional actions:
- Record OpenAI token usage
- Calculate estimated API cost
- Append usage data to `openai_usage.json`

Output:
- AI-approved posts only

---

## Stage 4: Queue Creation

- Normalize AI-approved posts
- Add required metadata (URL, subreddit, timestamps)
- Push posts into a FIFO queue

Storage:
- `data/to_comment.json`

No intelligence or AI logic exists here.

---

## Stage 5: Playwright Automation

- Read posts from `to_comment.json`
- Apply human-like delays
- Open Reddit using existing logged-in session
- Navigate to post
- Submit comment automatically
- Handle errors and retries safely

This stage does not perform searching, filtering, or AI decisions.

---

## Stage 6: Commented Post Tracking

- After successful comment submission:
  - Record post ID
  - Record subreddit and URL
  - Record timestamp
- Append data to `commented_posts.json`

This file is immutable and used for deduplication.

---

## Common System Rules

### Rate Limiting & Delays
- 1–2 minute delay between fetching and commenting
- 3–5 minute delay between comments
- 15-minute break before restarting the search cycle

All delays are randomized within bounds.

---

### Scheduling & Looping
- The system runs continuously
- Stops only when the user stops it
- Refresh cycle ensures new posts are fetched

---

### Recording & Auditability
- All Reddit activity is logged
- All OpenAI usage is logged
- No silent or untracked actions

---

## Final Note

This system is designed as a pipeline, not a collection of scripts.
Each stage is isolated, stateful, and replaceable.
