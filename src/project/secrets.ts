const SECRET = [
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  /\bsk-[A-Za-z0-9_-]{20,}/,
  /\bxox[abpr]-[A-Za-z0-9-]{10,}/,
  /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/,
];
/**
 * 키워드 = 값. 값이 환경 변수 이름(대문자·숫자·_)이거나 자리표시($·<·{)면 비밀로 보지 않는다.
 * 따옴표 문자열 리터럴 값은 항상 비밀 후보다. 따옴표 없는 값은 함수 호출·멤버 접근·타입 표기처럼
 * 원문이 아닌 코드 모양(함수 호출·멤버 접근·타입 표기)이면 코드 파일(isCodeFile)에서만 오탐으로 본다.
 */
const SECRET_KV = /\b(?:password|passwd|secret|token|api[_-]?key)["']?\s*([:=]\s*)(["']?)([^\s"',}]{8,})/gi;

/** 따옴표 없는 값이 코드 표현식인가 — 코드 파일에서만 쓴다. */
function isCodeExpression(value: string, sepRaw: string): boolean {
  // 사람이 쓴 코드는 구분자 뒤에 공백이 있다 — 붙어 있는 압축본·설정 값은 계속 검사한다.
  if (sepRaw.length < 2) return false;
  const sep = sepRaw.trim();
  const v = value.replace(/^\(+/, "").replace(/[;:.,)\]]+$/, "");
  if (/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*\(/.test(v)) return true; // 함수 호출 f(…) · a.b(…)
  if (/^[a-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+$/.test(v)) return true; // 멤버 접근 deps.x
  if (sep === ":" && /^[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)*$/.test(v)) return true; // 타입 표기 TelegramSecret
  return false;
}

/** 코드 표현식 완화를 적용할 코드 파일 확장자 — 마크다운·설정·기타 파일은 적용하지 않는다. */
const CODE_FILE = /\.(?:ts|js|mjs|cjs|tsx|jsx)$/i;
export function isCodeFile(path: string): boolean {
  return CODE_FILE.test(path);
}

function isBenign(value: string, quote: string, sep: string, code: boolean): boolean {
  if (/^[A-Z][A-Z0-9_]*$/.test(value) || /^[$<{]/.test(value)) return true;
  return quote === "" && code && isCodeExpression(value, sep);
}

/** 자격증명과 구별되는 짧은 디자인 경로만 허용한다. 속성 전체를 제외하지 않는다. */
function isDesignTokenAttribute(text: string, index: number, value: string, quote: string): boolean {
  if (!/\sdata-$/.test(text.slice(Math.max(0, index - 6), index))) return false;
  if (quote !== '"' && quote !== "'") return false;
  if (value.length > 64 || /[a-z0-9]{17}/.test(value)) return false;
  // 닫는 따옴표가 같고 뒤에 속성/태그 경계가 있어야 한다. 길이를 제한해 큰 본문을 복사하지 않는다.
  const attribute = text.slice(index, index + 128).match(/^token\s*=\s*(["'])([^"']*)\1(?=\s|\/?>)/);
  if (!attribute || attribute[1] !== quote || attribute[2] !== value) return false;
  return /^(?:color|space|palette|radius|font-size|typography|shadow|font-weight|size|line-height|border-width|font|blur|angle|stop)\/[a-z0-9][a-z0-9-]{0,31}(?:\/[a-z0-9][a-z0-9-]{0,31})*$/.test(value);
}

/** code=true는 코드 파일 본문 — 따옴표 없는 함수 호출·멤버 접근·타입 표기를 원문 비밀이 아닌 표현식으로 본다. 리터럴·토큰 형태는 어느 쪽이든 잡는다. */
export function hasSecret(text: string, opts: { code?: boolean } = {}): boolean {
  if (SECRET.some((re) => re.test(text))) return true;
  for (const m of text.matchAll(SECRET_KV)) {
    if (!isBenign(m[3]!, m[2]!, m[1]!, opts.code === true) && !isDesignTokenAttribute(text, m.index!, m[3]!, m[2]!)) return true;
  }
  return false;
}


/** 비밀로 보이는 값을 [제거됨]으로 바꾼다 — 외부 콘텐츠를 저장하기 전에(pace scout). 판정 규칙은 hasSecret과 같다. */
export function redactSecrets(text: string): string {
  // END 줄이 없으면 빈 줄이나 텍스트 끝까지 지운다 — 머리만 지우면 키 본문이 남고 hasSecret도 더는 잡지 못한다.
  // 옛 암호화 PEM은 머리 줄(Proc-Type:·DEK-Info:)과 빈 줄 뒤에 본문이 오므로 그 머리 블록은 함께 넘는다. CRLF도 같다.
  let out = text.replace(
    /-----BEGIN [A-Z ]*PRIVATE KEY-----(?:[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----|(?:(?:\r?\n[A-Za-z][A-Za-z-]*:[^\r\n]*)+\r?\n[ \t]*(?=\r?\n))?[\s\S]*?(?=\r?\n[ \t]*\r?\n|$))/g,
    "[제거됨]",
  );
  for (const re of SECRET) out = out.replace(new RegExp(re.source, "g"), "[제거됨]");
  return out.replace(SECRET_KV, (match, sep: string, quote: string, value: string, offset: number, input: string) => (
    isBenign(value, quote, sep, false) || isDesignTokenAttribute(input, offset, value, quote) ? match : match.replace(value, "[제거됨]")
  ));
}
