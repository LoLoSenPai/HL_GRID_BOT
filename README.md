# HL Grid Bot

Terminal de grid trading pour challenge Propr. En V1, l'execution live passe uniquement par l'API Propr live. Le compte
peut etre un challenge paper Propr, mais l'API cible reste `https://api.propr.xyz/v1`.

## Configuration

Variables serveur dans `.env`:

```bash
PROPR_API_KEY=
PROPR_API_URL=https://api.propr.xyz/v1
PROPR_WS_URL=wss://api.propr.xyz/ws
PROPR_ACCOUNT_ID=HRjAbEbasfZ1

DATABASE_URL=file:/app/data/hl_grid_bot.sqlite
PROPR_WORKER_INTERVAL_MS=10000
APP_PORT=3000
```

`PROPR_ACCOUNT_ID` accepte le suffixe court (`HRjAbEbasfZ1`) ou l'URN complet renvoye par Propr
(`urn:prp-account:HRjAbEbasfZ1`).

`PROPR_API_KEY` ne doit jamais etre prefixe par `NEXT_PUBLIC_`. Un exemple sans secret est disponible dans
`env.vps.example`.

## Local Docker

Ce mode lance l'UI/API Next.js et le worker Propr sur le PC local:

```bash
npm run docker:local:up
npm run docker:local:logs
npm run docker:local:stop
```

La base SQLite locale Docker vit dans le volume `hl-grid-bot-data`.

## VPS Docker

Sur VPS, utiliser `docker-compose.prod.yml`. Il lance:

- `app`: UI/API Next.js sur `APP_PORT` (`3000` par defaut).
- `worker`: reconciliation Propr, WebSocket Propr et safety loop.
- `./data`: dossier persistant contenant `hl_grid_bot.sqlite`.

Commandes:

```bash
npm run docker:prod:up
npm run docker:prod:logs
npm run docker:prod:stop
```

Ne pas faire tourner le worker local et le worker VPS en meme temps sur le meme `PROPR_ACCOUNT_ID`.

## Copier l'etat local vers le VPS

Pour garder les bots/orders/fills existants, copier la base SQLite locale au lieu de repartir de zero.

Sur le PC local:

```bash
npm run docker:local:stop
docker compose -f docker-compose.local.yml run --rm --no-deps -v ${PWD}/data:/backup app sh -c "cp -a /app/data/. /backup/"
```

Ensuite envoyer le repo et le dossier `data/` sur le VPS, puis creer `.env` depuis `env.EXAMPLE`.

Sur le VPS:

```bash
docker compose -f docker-compose.prod.yml up --build -d
curl http://127.0.0.1:3000/api/health
docker compose -f docker-compose.prod.yml logs -f app worker
```

Une fois le VPS verifie, garder le Docker local stoppe. Les ordres Propr deja ouverts restent chez Propr; le worker VPS
reprend la reconciliation a partir de la base copiee.

## Production Notes

- Mettre un reverse proxy HTTPS devant `APP_PORT` si le terminal doit etre partage via un domaine.
- Sauvegarder regulierement le dossier `data/`, surtout avant une mise a jour.
- Verifier `/settings` apres deploiement: auth Propr, challenge actif, account id et worker running.
- Le bouton kill switch reste la procedure d'urgence cote UI.

## Checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```
