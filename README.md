# HL Grid Bot

Terminal de grid trading pour challenge Propr. En V1, le write path live passe par Propr; Hyperliquid sert de référence
market data.

## Configuration

Configure the Propr execution profile in `.env`:

```bash
PROPR_ACTIVE_ENV=live # beta | live

PROPR_BETA_API_KEY=
PROPR_BETA_API_URL=
PROPR_BETA_WS_URL=

PROPR_LIVE_API_KEY=
PROPR_LIVE_API_URL=
PROPR_LIVE_WS_URL=
PROPR_LIVE_ACCOUNT_ID=urn:prp-account:...

DATABASE_URL=file:./data/hl_grid_bot.sqlite
```

Local simulation uses SQLite and does not need Propr credentials. Propr credentials are server-only and must not be
prefixed with `NEXT_PUBLIC_`.

## Local Test Mode With Docker

This is the recommended setup for the first real tests from a local PC. It runs:

- `app`: Next.js UI and API on `http://localhost:3000`
- `worker`: permanent Propr reconciliation and safety loop
- `hl-grid-bot-data`: Docker volume containing the SQLite database

Start:

```bash
npm run docker:local:up
```

Watch logs:

```bash
npm run docker:local:logs
```

Stop:

```bash
npm run docker:local:down
```

Reset local Docker state, including bots/orders/fills:

```bash
docker compose -f docker-compose.local.yml down -v
```

Do not run another local `npm run start` on port `3000` at the same time as Docker.

## Local Non-Docker Mode

Run the web app:

```bash
npm run build
npm run start -- --hostname 0.0.0.0
```

In another terminal, run the Propr worker:

```bash
npm run worker:propr
```

## Vercel Status

The repo can be adapted for Vercel UI/demo hosting, but Vercel alone is not the correct runtime for real trading yet:

- SQLite is local file storage; Vercel serverless filesystem is ephemeral and not shared.
- `worker:propr` is a long-running process; Vercel Functions/Cron are request-based and duration-limited.

For production-style deployment, use:

- Vercel for the Next.js UI/API.
- Managed Postgres/Turso/Supabase/Neon for persistence.
- A VPS/Railway/Fly/Render worker running `npm run worker:propr` permanently against the same database.

## Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Current Safety Model

- Propr readiness must pass before challenge deployment.
- Deploy opens a preview modal before sending entry orders.
- The worker reconciles fills and adds reduce-only exits.
- The safety stop closes exposure if the internal daily stop floor is reached.
- The global kill switch cancels Propr orders and attempts reduce-only market closes.

## Deployment Path

First test locally with Docker. Then migrate persistence away from SQLite before splitting UI to Vercel and worker to a
VPS/service.
