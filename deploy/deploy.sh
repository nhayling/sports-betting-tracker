#!/bin/sh
# Deploys the tracker to its server over SSH, the same steps as docs/deploy.md.
#
#   npm run deploy          check for stale files, copy the code, rebuild and restart
#   npm run deploy:sync     copy the code only
#   npm run deploy:build    rebuild and restart only
#   npm run deploy:stale    list files on the server that are no longer in the repo (deletes nothing)
#   npm run deploy:logs     the app's last 30 log lines
#
# The server is the SSH host `sports-better` in folder `sports-better/`; set DEPLOY_HOST
# (e.g. user@server) and DEPLOY_DIR to deploy somewhere else.
set -eu

HOST="${DEPLOY_HOST:-sports-better}"
DIR="${DEPLOY_DIR:-sports-better}"
cd "$(dirname "$0")/.."

# One SSH connection for the whole run, so the key's passphrase is asked for once.
SSH="ssh -o ControlMaster=auto -o ControlPath=/tmp/sports-better-deploy-%C -o ControlPersist=120"
EXCLUDES="--exclude node_modules --exclude dist --exclude .env --exclude downloaded --exclude .claude --exclude .agents --exclude .codex --exclude .cursor --exclude .impeccable"

sync() {
  echo "Copying the code to $HOST:$DIR/"
  # shellcheck disable=SC2086
  rsync -az -e "$SSH" $EXCLUDES ./ "$HOST:$DIR/"
}

build() {
  echo "Rebuilding and restarting on $HOST"
  $SSH "$HOST" "cd $DIR && docker compose up -d --build"
  # Caddy only reads its Caddyfile on start, and rsync swaps the file rather than editing it, so a
  # running Caddy keeps the old one. Restart it (a second or two offline) only when the file changed.
  $SSH "$HOST" "cd $DIR && (docker compose exec -T caddy cat /etc/caddy/Caddyfile | cmp -s - deploy/Caddyfile || (echo 'Caddyfile changed: restarting Caddy' && docker compose restart caddy))"
}

# rsync never removes files, so a file deleted from the repo stays on the server and still gets
# built. This lists them (server backups, *.sql, are left out) without touching anything.
stale() {
  # shellcheck disable=SC2086
  rsync -azn --delete -e "$SSH" $EXCLUDES --exclude '*.sql' ./ "$HOST:$DIR/" | sed -n 's/^deleting //p'
}

logs() {
  $SSH "$HOST" "cd $DIR && docker compose logs --tail 30 app"
}

case "${1:-all}" in
  all)
    leftover="$(stale)"
    if [ -n "$leftover" ]; then
      echo "These files are on the server but no longer in the repo, and would break or bloat the build:"
      echo "$leftover" | sed 's/^/  /'
      echo "Remove them on the server, or run npm run deploy:sync and npm run deploy:build to deploy anyway."
      exit 1
    fi
    sync
    build
    echo "Deployed. Check it with: npm run deploy:logs"
    ;;
  sync) sync ;;
  build) build ;;
  stale)
    leftover="$(stale)"
    if [ -n "$leftover" ]; then echo "$leftover"; else echo "No stale files on the server."; fi
    ;;
  logs) logs ;;
  *)
    echo "Usage: deploy.sh [all|sync|build|stale|logs]" >&2
    exit 2
    ;;
esac
