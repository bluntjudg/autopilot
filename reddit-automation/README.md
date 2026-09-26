# reddit-automation (self-promotion track)

Runs on a dedicated Chrome instance (CDP port 9222). This is the half of the pipeline that's allowed to mention the product.

## What it actually targets

- Monitors 30 subreddits (r/startups, r/SaaS, r/indiehackers, r/buildinpublic, r/microsaas, r/SaaSSolopreneurs, r/EntrepreneurRideAlong, and 23 more, see `config/subreddits.json`).
- Searches each one for 5 query templates: "what are you building", "saas ideas", "today I built", "looking for feedback", "side project".
- Before anything gets commented on, a GPT-4o-mini approval step (`services/aiFilter.js`) checks the post against `intent/personalization.md`, which only approves posts that **explicitly** invite people to share what they're building (e.g. "What are you building??", "build in public", a weekly check-in thread). Founder stories, indirect promo, and plain advice requests are rejected even if they're topically related. Verified by reading the approval prompt directly.

## How the link gets written in

`intent/comment_prompt.md` has a hard rule for the product link: it can never end a sentence or be followed by punctuation, it has to flow straight into a lowercase word ("...built https://asimpletool.com after running into the same issue"). The generator (`services/commentGenerator.js`) checks the model's output for the literal string `https://asimpletool.com`, and if it's missing, retries once more at a higher temperature before giving up on that post.

## Human-like posting

`playwright/commenter.js` connects to an already-logged-in Chrome tab over CDP (not the Reddit API) and types the generated comment via `page.keyboard.type(..., { delay: 28 })`, then submits with Ctrl+Enter. `services/searchEngine.js` waits a randomized delay between subreddits pulled from a 4-tier distribution (55% chance 40-85s, 25% chance 85-150s, 15% chance 17-40s, 5% chance 150-300s), plus 3-5 minutes between actual comments and a 15-minute break per full cycle. Failed subreddit fetches get an exponential-backoff cooldown (2^n x 5 minutes, capped at 120).

## Cost tracking caveat

`services/aiFilter.js` estimates OpenAI spend as `total_tokens * 0.00015 / 1000` and labels it "GPT-4 pricing" in a comment, but the code actually calls `gpt-4o-mini`. Current gpt-4o-mini pricing is $0.15/1M input tokens and $0.60/1M output tokens, so blending all tokens at the input rate undercounts real spend, especially on generation calls which are mostly output tokens. The dollar figure this logs is a lower bound, not the actual bill.
