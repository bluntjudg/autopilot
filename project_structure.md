reddit-automation/
│
├── config/
│   ├── subreddits.json          # user-controlled (comma-separated list)
│   ├── queries.json             # search templates & custom queries
│   ├── timing.json              # rate limits, delays, breaks
│
├── intent/
│   ├── personalization.md       # admin-controlled AI intent & context
│
├── data/
│   ├── fetched_posts.json       # stage 1 raw output
│   ├── to_comment.json          # stage 4 queue
│   ├── commented_posts.json     # stage 6 final record
│   ├── openai_usage.json        # AI cost & token ledger
│
├── services/
│   ├── searchEngine.js          # stage 1 (Reddit JSON search)
│   ├── postStore.js             # save/load JSON safely
│   ├── dedupe.js                # stage 2 duplicate checks
│   ├── aiClient.js              # OpenAI wrapper + cost tracking
│   ├── aiFilter.js              # stage 3 intent filtering
│   ├── queueManager.js          # stage 4 queue creation
│   ├── scheduler.js             # rate limits & looping logic
│
├── playwright/
│   ├── login.js                 # one-time manual login
│   ├── commenter.js             # stage 5 automation worker
│
├── auth/
│   ├── state.json               # saved Reddit session
│
├── utils/
│   ├── logger.js                # structured logs
│   ├── sleep.js                 # human-like delays
│
├── index.js                     # main orchestrator (entry point)
├── .env                         # OpenAI keys only
├── package.json
└── README.md
