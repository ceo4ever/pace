#!/usr/bin/env bash
# PACE v2 설치 (macOS · Linux)
#
#   신규 설치와 업데이트를 수행한다.
#     bash scripts/install.sh                 저장소 안에서 실행 — 이 저장소를 그대로 쓴다
#     curl -fsSL <raw URL>/scripts/install.sh | bash
#                                             저장소를 ~/.local/share/pace 에 받아 설치한다
#
#   옵션
#     --yes          확인 질문 없이 진행
#     --repo <dir>   코드 위치 지정 (기본: 스크립트가 든 저장소, 없으면 ~/.local/share/pace)
#     --ref <ref>    받을 브랜치·태그 (기본: $PACE_REF 또는 아래 DEFAULT_REF)
#     --dry-run      바꿀 내용만 보여 줌
set -euo pipefail

REPO_URL="${PACE_REPO_URL:-https://github.com/ceo4ever/pace.git}"
DEFAULT_REF="main"
REF="${PACE_REF:-$DEFAULT_REF}"
REPO=""
YES=0
DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --yes) YES=1 ;;
    --repo) REPO="$2"; shift ;;
    --ref) REF="$2"; shift ;;
    --no-profile) ;;  # 이전 버전 호환 — 설치는 더 이상 프로필을 만들지 않는다
    --dry-run) DRY_RUN=1 ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "알 수 없는 옵션: $1" >&2; exit 2 ;;
  esac
  shift
done

info() { printf '\033[1m▸ %s\033[0m\n' "$*"; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# 질문은 터미널(/dev/tty)로 받는다 — curl | bash처럼 표준입력이 파이프여도 된다.
# 터미널이 없으면(에이전트 셸, CI, PACE_NO_TTY=1) 묻지 않고 "아니오"로 본다.
has_tty() {
  [ -z "${PACE_NO_TTY:-}" ] && { : < /dev/tty; } 2>/dev/null
}

ask() {
  [ "$YES" = 1 ] && return 0
  if ! has_tty; then
    echo "  확인할 터미널이 없습니다. 진행하려면 --yes 를 붙여 다시 실행하세요." >&2
    return 1
  fi
  local answer=""
  printf '%s [y/N] ' "$1" > /dev/tty
  read -r answer < /dev/tty || true
  [ "$answer" = "y" ] || [ "$answer" = "Y" ]
}

# ── 1. 사전 확인 ──────────────────────────────────────────────
command -v node >/dev/null 2>&1 || fail "Node.js 24 이상이 필요합니다. macOS: brew install node · 그 외: https://nodejs.org"
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)' \
  || fail "Node.js 24 이상이 필요합니다 (현재 $(node --version)). macOS: brew upgrade node"

# ── 2. 코드 위치 ──────────────────────────────────────────────
if [ -z "$REPO" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
  if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/../bin/pace.ts" ]; then
    REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
  else
    REPO="${PACE_REPO:-$HOME/.local/share/pace}"
  fi
fi

if [ -f "$REPO/bin/pace.ts" ]; then
  if [ -d "$REPO/.git" ] && [ "$REPO" = "${PACE_REPO:-$HOME/.local/share/pace}" ] && [ "$DRY_RUN" = 0 ]; then
    git -C "$REPO" fetch --quiet origin "$REF" && git -C "$REPO" checkout --quiet "$REF" && git -C "$REPO" pull --quiet --ff-only origin "$REF" \
      || fail "코드 업데이트에 실패했습니다: $REPO ($REF)"
  fi
else
  command -v git >/dev/null 2>&1 || fail "git이 필요합니다. macOS: xcode-select --install"
  [ "$DRY_RUN" = 1 ] && fail "미리보기는 코드가 있어야 합니다 (--repo 지정)"
  mkdir -p "$(dirname "$REPO")"
  git clone --quiet --branch "$REF" "$REPO_URL" "$REPO"
fi

PACE=(node "$REPO/bin/pace.ts")

# ── 3. 기존 PACE 설치 판별 ──────────────────────────────────
MIGRATE=()
RESULT="설치"
if [ -f "$HOME/.pace/install.json" ]; then RESULT="업데이트"; fi
# ── 4. 설치 ──────────────────────────────────────────────────
if [ "$DRY_RUN" = 1 ]; then
  "${PACE[@]}" install ${MIGRATE[@]+"${MIGRATE[@]}"} --dry-run
  exit 0
fi
# 성공하면 결과 한 줄만 보인다. 실패하면 설치기 출력을 그대로 보여 준다.
if ! LOG="$(PACE_FROM_SCRIPT=1 "${PACE[@]}" install ${MIGRATE[@]+"${MIGRATE[@]}"} 2>&1)"; then
  printf "%s\n" "$LOG" >&2
  fail "설치에 실패했습니다."
fi

# ── 5. PATH ──────────────────────────────────────────────────
case ":$PATH:" in
  *":$HOME/.pace/bin:"*) ;;
  *)
    case "${SHELL:-}" in
      */zsh) RC="$HOME/.zshrc" ;;
      */bash) RC="$HOME/.bashrc" ;;
      *) RC="$HOME/.profile" ;;
    esac
    LINE='export PATH="$HOME/.pace/bin:$PATH"'
    if ! grep -qsF "$LINE" "$RC"; then
      printf '\n# PACE\n%s\n' "$LINE" >> "$RC"
    fi
    ;;
esac

NOTICE=""
if [[ "$LOG" == *"[pace-old-cleanup]"* ]]; then NOTICE=" · 이전 설치본 정리 실패: 수동 확인"; fi
printf '\033[1;32m✓ PACE %s %s 완료%s\033[0m\n' "$("${PACE[@]}" --version)" "$RESULT" "$NOTICE"
