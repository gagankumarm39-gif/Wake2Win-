# Wake2Win 🏆⏰

Premium web app that helps students **wake up on time, stay disciplined and study consistently** using AI. Built for NEET, JEE, UPSC, SSC, GATE, CAT and Boards aspirants.

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · Framer Motion · Supabase (Auth + PostgreSQL) · Serwist PWA · Vitest

## Features

1. **AI Wake-Up Alarm** — multiple alarms; dismissal requires solving 2–4 exam MCQs correctly. Wrong answer → a new question is generated.
2. **AI Question Generator** — fresh MCQs by exam / subject / chapter / difficulty.
3. **Free AI with silent fallback** — Gemini free API → OpenRouter free models → built-in local question bank. The user never sees an error.
4. **Smart Pomodoro** — 25/45/60/90/120 min focus, 5/10/15 min breaks, auto-cycling with sounds and motivational quotes.
5. **Study Analytics** — daily/weekly/monthly time, streaks, wake-up success rate, alarm completion %, accuracy, average solving time (Recharts).
6. **AI Study Assistant** — streaming (token-by-token) chat with Markdown, LaTeX math and highlighted code; persistent conversation history (search, pin, rename, delete, 👍/👎) with rolling-summary memory for long chats; quizzes, explanations, hints, weak-topic recommendations, revision questions, daily challenge, motivation.
7. **Gamification** — XP, coins, badges, levels, daily/weekly missions, leaderboard, achievements.
8. **Focus Mode** — fullscreen minimal timer, wallpapers, ambient sounds (rain, forest, library, white noise).
9. **Reminders** — water, stretch, revision, sleep, mock test.
10. **Profile & Onboarding** — exam, target rank/college, study hours, wake-up goal, theme.

### Anti-cheating (web-standard, honest)

- Fullscreen lock during the alarm challenge (`src/hooks/use-anti-cheat.ts`)
- App-switch / tab-switch detection → challenge pauses and restarts with **new** questions
- Randomized question and answer order on every attempt
- 20–30 s time limit per question; new question after any wrong answer
- Copy / selection / context menu disabled during the challenge
- `FLAG_SECURE` screenshot prevention is available only in the Android TWA wrapper
- Suspicious behavior (frequent app switches, repeated failures) is logged to `suspicious_events` and surfaced in analytics
- ⚠️ The app makes **no claims** of blocking Android system features (Circle to Search, Google Lens, Gemini) — standard apps cannot disable them.

## Project structure

```
├── middleware.ts                  # Supabase session refresh + route protection
├── next.config.mjs                # Serwist PWA + security headers
├── public/manifest.json           # Installable PWA manifest
├── supabase/migrations/           # PostgreSQL schema (RLS on every table)
└── src/
    ├── app/
    │   ├── layout.tsx, page.tsx   # Root layout + landing
    │   ├── offline/               # Offline fallback page
    │   ├── sw.ts                  # Service worker (offline timers/alarms)
    │   └── api/questions/generate # AI MCQ endpoint (auth-gated)
    ├── hooks/use-anti-cheat.ts    # Alarm challenge lock mode
    ├── lib/
    │   ├── ai/                    # providers.ts, question-generator.ts, local bank
    │   ├── supabase/              # browser + server clients
    │   └── utils.ts               # cn(), shuffle(), levelFromXp()
    └── types/index.ts             # Shared domain types
```

## Database schema

See [`supabase/migrations/0001_initial_schema.sql`](supabase/migrations/0001_initial_schema.sql):

`profiles` · `alarms` · `alarm_events` · `suspicious_events` · `question_bank` · `question_attempts` · `pomodoro_sessions` · `badges` / `user_badges` · `missions` / `user_missions` · `reminders` · `leaderboard` (view)

Chat history lives in [`supabase/migrations/0003_chat_history.sql`](supabase/migrations/0003_chat_history.sql): `conversations` (title, pin, rolling `summary` + `summarized_count` for long-chat memory) · `messages` (role, content, producing `model`, `liked`). Run every file in `supabase/migrations/` in order.

All user tables enforce **Row Level Security** (`auth.uid() = user_id`). A trigger auto-creates a profile on signup.

## Environment variables

Copy `.env.example` → `.env.local`:

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Server-only admin key |
| `GEMINI_API_KEY` | optional | Free Gemini API (primary AI) |
| `OPENROUTER_API_KEY` | optional | OpenRouter free models (secondary AI) |
| `OPENROUTER_MODEL` | optional | Single OpenRouter model id |
| `OPENROUTER_MODELS` | optional | Comma-separated model list tried in order (overrides `OPENROUTER_MODEL`) |
| `NEXT_PUBLIC_APP_URL` | ✅ | Canonical app URL |

## Local development

```bash
npm install
cp .env.example .env.local   # fill in Supabase keys
npm run dev
```

## Deployment (Vercel + Supabase)

1. Create a Supabase project → run each file in `supabase/migrations/` (0001 → 0003) in the SQL editor, in order.
2. Enable **Email** and **Google** providers in Supabase Auth; set the redirect URL to `https://YOUR_DOMAIN/auth/callback`.
3. Import the repo into Vercel, add all env vars, deploy.
4. Verify PWA installability with Lighthouse (manifest + service worker are pre-configured).

## Testing

```bash
npm run typecheck   # strict TS
npm run lint        # ESLint (next config)
npm test            # Vitest unit tests
```

Suggested coverage: question generator fallback chain (mock fetch failures → local bank), option shuffling correctness, XP/level math, anti-cheat hook events, RLS policies via Supabase test helpers.
