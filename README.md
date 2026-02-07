# Reddit Automation Pipeline (AI-Driven Engagement)

## Overview

This project is a fully automated Reddit engagement system designed to:

- Discover relevant Reddit posts using Reddit’s JSON search
- Filter posts using AI-based intent and context understanding
- Comment on selected posts using Playwright
- Track all Reddit activity and OpenAI API usage for cost analysis

The system runs continuously until the user stops it.

---

## Core Principles

- Configuration-driven automation
- Strict rate limiting and human-like delays
- AI-based relevance filtering (not keyword spam)
- Persistent state and historical records
- Transparent OpenAI cost tracking

---

## Pipeline Stages

1. Search Engine (Reddit JSON)
2. Raw Post Storage + Duplicate Check
3. AI Intent & Context Filtering
4. Comment Queue Creation
5. Playwright Commenting
6. Commented Post Tracking

---

## Human Interaction

Human input is required only for:

- Updating subreddit lists (comma-separated)
- Performing one-time Reddit login via Playwright

All other actions are fully automated.

---

## Configuration

### Subreddits
`config/subreddits.json`

### Search Queries
`config/queries.json`

### Timing & Rate Limits
`config/timing.json`

---

## AI Intent Control

AI behavior is controlled through:

`intent/personalization.md`

This file defines:
- Target audience
- Engagement intent
- Context and relevance rules
- Commenting tone

Only admins should modify this file.

---

## Data Storage

| File | Purpose |
|-----|--------|
| `data/fetched_posts.json` | Raw Reddit search output |
| `data/to_comment.json` | AI-approved comment queue |
| `data/commented_posts.json` | Posts already commented |
| `data/openai_usage.json` | OpenAI token & cost ledger |

All data files are append-only.

---

## Security

- OpenAI API keys are stored only in `.env`
- No credentials are committed to the repository
- Reddit login is handled manually and stored locally

---

## How to Run

1. Run Playwright login once to save Reddit session
2. Start the orchestrator (`index.js`)
3. The system runs continuously until stopped

---

## Disclaimer

This project is intended for responsible automation and experimentation.
Always respect Reddit’s platform rules and rate limits.
