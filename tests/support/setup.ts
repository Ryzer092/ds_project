// テストは常にデモ・fixtureで動かし、有料APIを呼ばない。
process.env.SEARCH_MODE = process.env.SEARCH_MODE ?? "demo";
process.env.APP_ORIGIN = "http://localhost:3000";
process.env.ANTHROPIC_API_KEY = "";
process.env.SESSION_SIGNING_SECRET = "test-session-secret-0123456789abcdef-0123456789";
process.env.RATE_LIMIT_HASH_SECRET = "test-hash-secret-0123456789abcdef-0123456789abcd";
