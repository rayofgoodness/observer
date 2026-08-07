#!/usr/bin/env bash
#
# Деплой observer на RPi. Викликається self-hosted GitHub Actions runner'ом
# (.github/workflows/deploy.yml) при пуші в main, або вручну:
#
#   ./scripts/deploy.sh
#
# Прод і робоча директорія — одна папка, тому скрипт відмовляється працювати,
# якщо в дереві є незакомічені зміни: затирати чиюсь незбережену роботу
# автодеплоєм не можна.
set -euo pipefail

APP_DIR="${APP_DIR:-/home/pi/Projects/observer-app}"
SERVICE="${SERVICE:-observer-api}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3040/dashboard}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"
LOCK_FILE="${LOCK_FILE:-/tmp/observer-deploy.lock}"

# /usr/bin перший: systemd стартує сервіс через /usr/bin/node, тож білдимо тим
# самим node, а не тим, що nvm підсовує в інтерактивний шел.
export PATH="/usr/bin:/bin:/usr/local/bin:/home/pi/.bun/bin"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m!!! %s\033[0m\n' "$*" >&2; exit 1; }

# Один деплой за раз — паралельні прогони затопчуть один одного на білді.
exec 9>"$LOCK_FILE"
flock -n 9 || die "інший деплой уже виконується ($LOCK_FILE)"

cd "$APP_DIR"

command -v bun >/dev/null || die "bun не знайдено в PATH"

log "Стан робочого дерева"
if [[ -n "$(git status --porcelain)" ]]; then
  git status --short
  die "у робочому дереві є незакомічені зміни — деплой скасовано.
    Закомить або прибери їх (git stash), потім перезапусти workflow."
fi

PREV_SHA="$(git rev-parse HEAD)"
log "Поточний коміт: $PREV_SHA"

log "Тягну origin/main"
git fetch --prune origin main
git merge --ff-only origin/main

NEW_SHA="$(git rev-parse HEAD)"
if [[ "$NEW_SHA" == "$PREV_SHA" ]]; then
  log "Нових комітів немає — пересобираю з поточного стану"
else
  log "Оновлено: $PREV_SHA -> $NEW_SHA"
  git --no-pager log --oneline "$PREV_SHA..$NEW_SHA"
fi

build() {
  log "Залежності: api"
  (cd "$APP_DIR/api" && bun install --frozen-lockfile)

  log "Залежності: admin-ui"
  (cd "$APP_DIR/admin-ui" && bun install --frozen-lockfile)

  # admin-ui першою: її build робить vue-tsc -b, тобто заодно тайпчекає консоль.
  # Якщо впаде — падаємо ДО рестарту сервісу, старий dist лишається живим.
  log "Білд: admin-ui"
  (cd "$APP_DIR/admin-ui" && bun run build)

  log "Тести: api"
  (cd "$APP_DIR/api" && bun run test)

  log "Білд: api"
  (cd "$APP_DIR/api" && bun run build)

  log "Міграції"
  (cd "$APP_DIR/api" && bun run migrate)
}

restart_and_check() {
  log "Рестарт $SERVICE"
  sudo systemctl restart "$SERVICE"

  log "Health-check $HEALTH_URL (до ${HEALTH_TIMEOUT}s)"
  local deadline=$((SECONDS + HEALTH_TIMEOUT))
  while ((SECONDS < deadline)); do
    # -s без -S: поки сервіс піднімається, curl законно фейлиться — не шумимо.
    # /dashboard віддає 302 (редірект на логін) — для curl -f це успіх, і цього
    # досить: Nest піднявся і роутинг живий. Окремого /health у застосунку немає.
    if curl -fs -o /dev/null --max-time 5 "$HEALTH_URL"; then
      log "Сервіс відповідає"
      return 0
    fi
    sleep 2
  done
  return 1
}

build

if restart_and_check; then
  log "Деплой успішний: $(git rev-parse --short HEAD)"
  exit 0
fi

# Білд пройшов, але новий код не піднявся — вертаємо прод на попередній коміт.
printf '\n\033[1;31m!!! health-check провалився — відкочуюсь на %s\033[0m\n' "$PREV_SHA" >&2
journalctl -u "$SERVICE" -n 40 --no-pager || true

git reset --hard "$PREV_SHA"
build
if restart_and_check; then
  die "деплой $NEW_SHA провалив health-check; прод відкочено на $PREV_SHA"
fi

die "деплой провалився І відкат на $PREV_SHA теж не піднявся — потрібне ручне втручання"
