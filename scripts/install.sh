#!/usr/bin/env bash
# PACE v2 설치 (macOS · Linux)
#
#   bash scripts/install.sh                      이 체크아웃을 설치
#   curl -fsSL <raw URL>/scripts/install.sh | bash 최신 공개 정식 릴리즈를 설치
#
#   옵션
#     --repo <dir>   기존 로컬 소스 위치
#     --ref <ref>    원격 소스의 태그·브랜치·커밋 (PACE_REF도 사용 가능)
#     --dry-run      로컬 소스에서 바꿀 내용만 표시
#     --yes, --no-profile  이전 버전 호환
set -euo pipefail

REF="${PACE_REF:-}"
REPO=""
DRY_RUN=0

fail() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --repo|--ref)
      [ "$#" -ge 2 ] && [ -n "$2" ] || fail "$1 값을 지정하세요."
      if [ "$1" = --repo ]; then REPO="$2"; else REF="$2"; fi
      shift
      ;;
    --yes|--no-profile) ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help)
      printf '%s\n' 'PACE 설치 [--repo <dir>] [--ref <ref>] [--dry-run] [--yes]' \
        '로컬 소스가 없으면 최신 공개 정식 릴리즈를 받습니다.'
      exit 0
      ;;
    *) printf '알 수 없는 옵션: %s\n' "$1" >&2; exit 2 ;;
  esac
  shift
done

# ── 1. 사전 확인 ──────────────────────────────────────────────
command -v node >/dev/null 2>&1 || fail "Node.js 24 이상이 필요합니다. macOS: brew install node · 그 외: https://nodejs.org"
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)' \
  || fail "Node.js 24 이상이 필요합니다 (현재 $(node --version)). macOS: brew upgrade node"

# ── 2. 코드 위치 ──────────────────────────────────────────────
if [ -z "$REPO" ] && [ -f "${BASH_SOURCE[0]:-}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [ -f "$SCRIPT_DIR/../bin/pace.ts" ]; then
    REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
  fi
fi

if [ -z "$REPO" ]; then
  [ "$DRY_RUN" = 0 ] || fail "미리보기는 로컬 소스가 필요합니다 (--repo 지정)."
  command -v curl >/dev/null 2>&1 || fail "원격 설치에는 curl이 필요합니다."
  STAGE="$(mktemp -d "${TMPDIR:-/tmp}/pace-release.XXXXXXXX")" || fail "릴리즈 임시 폴더를 만들지 못했습니다."
  trap 'rm -rf -- "$STAGE"' EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  curl --disable --fail --silent --show-error --proto '=https' --max-time 30 --max-filesize 1048576 \
    --output "$STAGE/install-release.mjs" \
    https://raw.githubusercontent.com/ceo4ever/pace/main/scripts/install-release.mjs \
    || fail "릴리즈 설치 도구 다운로드에 실패했습니다."
  SOURCE_NAME="$(node "$STAGE/install-release.mjs" "$STAGE" "$REF")" || exit 1
  REPO="$STAGE/$SOURCE_NAME"
fi

[ -f "$REPO/bin/pace.ts" ] || fail "PACE 소스를 찾을 수 없습니다: $REPO (--repo 확인)"
PACE=(node "$REPO/bin/pace.ts")

# ── 3. 기존 PACE 설치 판별 ──────────────────────────────────
RESULT="설치"
if [ -f "$HOME/.pace/install.json" ]; then RESULT="업데이트"; fi

# ── 4. 설치 ──────────────────────────────────────────────────
if [ "$DRY_RUN" = 1 ]; then
  "${PACE[@]}" install --dry-run
  exit 0
fi
VERSION="$("${PACE[@]}" --version)" || fail "소스에서 PACE 버전을 확인하지 못했습니다."
# 성공하면 결과 한 줄만 보인다. 실패하면 설치기 출력을 그대로 보여 준다.
if ! LOG="$(PACE_FROM_SCRIPT=1 "${PACE[@]}" install 2>&1)"; then
  printf '%s\n' "$LOG" >&2
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
printf '\033[1;32m✓ PACE %s %s 완료%s\033[0m\n' "$VERSION" "$RESULT" "$NOTICE"
