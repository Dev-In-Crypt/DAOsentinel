# Runbook · Telegram alerts go-live

Telegram delivery is fully implemented (`src/lib/telegram.ts`, `/api/telegram/webhook`,
`/api/telegram/setup`, the "Connect Telegram" flow on `/settings`) but stays a
graceful no-op until a bot token exists — `telegramConfigured()` returns
`false` and the Settings page shows "Telegram alerts are coming soon" instead
of a connect button. This is the checklist to flip it live. **No secret
values are written down here** — only which env vars to set and where.

## 1. Create the bot

1. Open a chat with [@BotFather](https://t.me/BotFather) on Telegram.
2. `/newbot` → follow the prompts (display name, then a unique `@username`
   ending in `bot`).
3. BotFather replies with an API token. Keep it — it becomes
   `TELEGRAM_BOT_TOKEN` in step 2. Note the `@username` too (without the
   `@`) — it becomes `TELEGRAM_BOT_USERNAME`.

## 2. Set environment variables

Set these in the production environment (wherever the app's other secrets
already live, e.g. the hosting provider's project settings — same place as
`DATABASE_URL` / `CRON_SECRET`):

| Var | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | the token from BotFather |
| `TELEGRAM_BOT_USERNAME` | the bot's `@username`, without the `@` |
| `TELEGRAM_WEBHOOK_SECRET` | any strong random string you generate yourself (e.g. `openssl rand -hex 32`) — **required**; the webhook fails closed with a 503 if the token is set but this isn't (`src/app/api/telegram/webhook/route.ts`) |

Redeploy (or restart the running instance) so the new env vars are picked up
— Next.js reads `process.env` at process start, not per-request.

## 3. Register the webhook (one-off, run once per bot token)

```bash
curl "https://www.daosentinel.xyz/api/telegram/setup" -H "Authorization: Bearer $CRON_SECRET"
```

This calls `setWebhook()` (`src/lib/telegram.ts`), which registers
`https://www.daosentinel.xyz/api/telegram/webhook` with Telegram and passes
`TELEGRAM_WEBHOOK_SECRET` as the `secret_token` Telegram will echo back on
every update. Expect `{"ok":true,"detail":"..."}`. Re-run this any time the
bot token or app URL changes — Telegram remembers the webhook until you
overwrite or delete it.

## 4. Verify end-to-end

1. Load `/settings` while logged in — the Telegram section should now show
   a **Connect Telegram →** button instead of "coming soon" (this flips
   automatically once `TELEGRAM_BOT_USERNAME` is set — no code change).
2. Click it → opens `https://t.me/<bot>?start=<token>` → tap **Start** in
   Telegram.
3. Bot should reply `✅ Linked!...`. Back on `/settings`, the section should
   now show **Connected** with the linked `chat` id.
4. Send `/stop` in the chat → bot confirms alerts paused; `/settings` should
   reflect it as disconnected on next load.
5. Trigger a real alert (or wait for the next whale/swing/quorum event on a
   DAO you've watchlisted) and confirm it arrives in the chat — this is the
   only step that isn't just wiring-verification; it exercises
   `notifier.ts`'s Telegram branch for real.

## Rollback

Unset `TELEGRAM_BOT_TOKEN` (or set it back to empty) to instantly revert to
the no-op state — every code path already guards on `telegramConfigured()` /
`botUsername()`, so no other change is needed. Existing linked `chatId`s stay
in the `users` table and resume working the moment the token is restored.

## See also

- `docs/specs/` — feature specs for the rest of the notification stack
  (Discord, email, RSS/Atom, ICS calendar).
- `src/lib/telegram.ts` — the account-linking design (stateless HMAC token,
  no separate short-lived code store) is explained in the file header.
