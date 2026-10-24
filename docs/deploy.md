# Running the tracker on a server

One server runs the tracker, Postgres and HTTPS (Caddy) with Docker Compose.
Each person has their own login. Notifications are private to it. Bets are
shared through the Social tab: a person's friends, and anyone on the tracker
who follows them, see their picks, odds and results. Dollar amounts are shown
as if every bet were Island Luck's $5 minimum unless that person shares the
real ones, and the leaderboard shows their record in units.

## What you need

- A small Linux server with Docker and the Compose plugin, ports 80 and 443 open.
- A hostname pointing at it (DNS A record). Without a domain, use
  `<server-ip-with-dashes>.sslip.io`, e.g. `203-0-113-7.sslip.io`.
  HTTPS is required: the extension only talks to `https://` trackers (or localhost).

## First deploy

From your Mac, copy the project to the server:

```sh
rsync -az --exclude node_modules --exclude dist --exclude .env --exclude downloaded \
  ./ user@server:sports-better/
```

On the server:

```sh
cd sports-better
cp deploy/server.env.example .env
# edit .env: set DOMAIN, and POSTGRES_PASSWORD from `openssl rand -hex 24`
docker compose up -d --build
docker compose logs -f app        # "tracker listening" when ready
```

Database migrations run on every start.

## Moving to a new domain

The tracker's address is stored in three places on people's devices: the
extension's settings, each phone's userscript install link, and the home-screen
web app. To move without breaking them, serve both addresses for a while:

1. Point the new domain's DNS (A record, and AAAA if the server has IPv6) at the server.
2. In the server's `.env`, set `DOMAIN=<new>` and `OLD_DOMAINS=<old>`, then
   `docker compose up -d`. Caddy gets a certificate for each.
3. Phone sync moves itself: the next time a userscript checks for updates (from
   the old address, which still answers) it gets a copy pointing at the new one.
4. Extensions keep syncing to the old address. Each person opens the popup,
   changes Tracker URL to the new address and signs in again (the new address
   needs its own permission, and the browser asks for it).
5. Web app sign-ins are per address: everyone signs in again at the new one, and
   re-adds it to their home screen on a phone.
6. Once everyone has moved (`npm run deploy:logs` shows no more requests to the
   old host), clear `OLD_DOMAINS` and `docker compose up -d` again.

## Accounts

During the beta, anyone can ask to join at `https://<DOMAIN>/#join` (also
linked from the sign-in screen). They pick a username, email and password and
can say who they are; the account then waits for approval and can't sign in.
Each request shows in `npm run deploy:logs` as `[access] …`. To see and answer them:

```sh
docker compose exec app npm run access -w @sports-better/api                        # waiting requests, and accounts with no email
docker compose exec app npm run access -w @sports-better/api -- approve <username>  # they can sign in now
docker compose exec app npm run access -w @sports-better/api -- decline <username>  # deletes the request
```

Nothing emails them either way yet, so tell them yourself.

To let someone in without waiting for approval, send them an invite link:

```sh
docker compose exec app npm run invite -w @sports-better/api
# https://<DOMAIN>/#invite=…   Works once, for 7 days (-- --days 30 to change).
```

They open it, pick their own username, email and password, and are signed in.

Emails are optional for accounts made before they were asked for: those people
see a reminder to add one under Account. Anyone can sign in with their username
or their email. Emails aren't verified yet (there's no way to send mail).

To reset a forgotten password (or create a login directly), run this and type
the new password. It signs that person out of every browser and extension:

```sh
docker compose exec app npm run user -w @sports-better/api -- <username>
```

## Extension

1. Open the extension popup → Settings.
2. Tracker URL `https://<DOMAIN>`, then the username and password → **Sign in**.
   The browser asks once for permission to reach that site.
3. Open My Bets on Island Luck. Bets sync to the signed-in account.

Signing in re-sends every bet the extension has already captured, so your
existing bets move to the server without doing anything else.

To give someone the extension, zip the folder and have them unzip it and use
**Load unpacked** at `chrome://extensions` (or `brave://extensions`) with
Developer mode on:

```sh
cd apps && zip -r ../island-luck-sync.zip extension -x 'extension/test/*' 'extension/package.json'
```

## Phone sync (no computer)

Island Luck's mobile site can sync too, through a userscript manager:
"Userscripts" (App Store) for Safari on iPhone, or Firefox with Violentmonkey
on Android. In the tracker, open **Phone sync**, create your install link and
tap it in that browser. The link and the installed script carry a sign-in
token for your account, so each person creates their own.

Resetting a password with `npm run user` revokes these tokens too; install
again afterwards.

## Bringing over older bets

If the extension no longer holds some of your history, import a saved
`history.json` response (in Island Luck's own shape) into your account:

```sh
docker compose cp island-luck-history.raw.json app:/tmp/history.json
docker compose exec app npm run import -w @sports-better/api -- /tmp/history.json --user noah
```

## Updating and backups

From your own machine, `npm run deploy` does the update in one go: it lists files on the server that are no longer in the repo (and stops if there are any), copies the code, then rebuilds and restarts. `deploy:sync`, `deploy:build`, `deploy:stale` and `deploy:logs` run one step each. Point it at your server with `DEPLOY_HOST=user@server` (and `DEPLOY_DIR` if the folder isn't `sports-better`).

```sh
# update: rsync again, then
docker compose up -d --build

# backup
docker compose exec db pg_dump -U postgres sports_better > backup.sql
```

## Local development

`TRACKER_API_KEY` is gone. Apply the new migration to your local database with
`npm run db:migrate -w @sports-better/api`; existing bets go to the oldest
user. Sign in on the web page and in the extension with a login from
`npm run user -w @sports-better/api -- <username>` or an invite link.
