#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-}"
PORT="${2:-3080}"

if [ -z "$TARGET" ]; then
  echo "Usage: npm run deploy:vps -- <user@vps_ip> [port]"
  echo "Example: npm run deploy:vps -- root@203.0.113.10 3080"
  exit 1
fi

PUBLIC_HOST="${TARGET#*@}"
SOCK="/tmp/mindora-ssh-$$"
SSH_OPTS="-o ControlMaster=auto -o ControlPath=${SOCK} -o ControlPersist=5m"
trap 'ssh -O exit -o ControlPath="${SOCK}" "${TARGET}" >/dev/null 2>&1 || true' EXIT

echo "1/3 Connecting to ${TARGET} ..."
ssh $SSH_OPTS "$TARGET" 'command -v rsync >/dev/null 2>&1 || (apt-get update && apt-get install -y rsync)'

echo "2/3 Uploading Mindora files to ${TARGET}:~/mindora ..."
rsync -avz --delete -e "ssh ${SSH_OPTS}" \
  --exclude 'node_modules' \
  --exclude 'strapi/node_modules' \
  --exclude '.next' \
  --exclude 'strapi/dist' \
  --exclude 'strapi/build' \
  --exclude 'strapi/.tmp' \
  --exclude 'strapi/.cache' \
  --exclude 'strapi/.strapi' \
  --exclude 'strapi/types/generated' \
  --exclude '.venv' \
  --exclude '.git' \
  --exclude '.env*' \
  --exclude 'cookies.txt' \
  --exclude '*.db' \
  --exclude '*.sqlite*' \
  ./ "${TARGET}:mindora/"

if [ -n "${SUPADATA_API_KEY:-}" ] || [ -n "${GEMINI_API_KEY:-}" ]; then
  {
    [ -n "${SUPADATA_API_KEY:-}" ] && printf 'SUPADATA_API_KEY=%s\n' "${SUPADATA_API_KEY}"
    [ -n "${GEMINI_API_KEY:-}" ] && printf 'GEMINI_API_KEY=%s\n' "${GEMINI_API_KEY}"
  } | ssh $SSH_OPTS "$TARGET" '
    set -euo pipefail
    mkdir -p "$HOME/mindora"
    cd "$HOME/mindora"
    umask 077
    touch .env.production
    chmod 600 .env.production
    while IFS="=" read -r key val; do
      [ -z "$key" ] && continue
      grep -v "^${key}=" .env.production > .env.production.tmp || true
      printf "%s=%s\n" "$key" "$val" >> .env.production.tmp
      mv .env.production.tmp .env.production
    done
  '
fi

echo "3/3 Building and starting Mindora container on port ${PORT} ..."
ssh $SSH_OPTS "$TARGET" \
  "PORT_ARG='${PORT}' PUBLIC_HOST='${PUBLIC_HOST}' bash -s" <<'EOF'
set -euo pipefail

cd "$HOME/mindora"

secret() { openssl rand -hex 32; }
umask 077
touch .env.production
chmod 600 .env.production

ensure_key() {
  local key="$1"
  local val="$2"
  if ! grep -q "^${key}=" .env.production; then
    printf '%s=%s\n' "$key" "$val" >> .env.production
  fi
}

ensure_key "APP_KEYS" "$(secret),$(secret)"
ensure_key "ADMIN_JWT_SECRET" "$(secret)"
ensure_key "API_TOKEN_SALT" "$(secret)"
ensure_key "TRANSFER_TOKEN_SALT" "$(secret)"
ensure_key "ENCRYPTION_KEY" "$(secret)"
ensure_key "STUDIO_TOKEN" "$(secret)"
ensure_key "OLLAMA_MODEL" "qwen2.5:3b"
ensure_key "DATA_DIR" "/data"
ensure_key "WEB_PORT" "${PORT_ARG}"

ACTIVE_PORT=$(grep '^WEB_PORT=' .env.production | cut -d= -f2 || echo "${PORT_ARG}")

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow "${ACTIVE_PORT}/tcp" >/dev/null
fi

docker compose up -d --build

echo ""
echo "Mindora is live at: http://${PUBLIC_HOST}:${ACTIVE_PORT}"
EOF

if [ -s "./cookies.txt" ]; then
  echo "Uploading local cookies.txt into mindora:/data/cookies.txt ..."
  ssh $SSH_OPTS "$TARGET" 'docker exec -i mindora sh -c "umask 077 && cat > /data/cookies.txt"' < "./cookies.txt"
  echo "Synced cookies.txt to VPS volume."
fi
