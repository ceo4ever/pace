// 비밀 제거 — 봇 토큰 등 채널 비밀이 로그·상태·송신 본문에 남지 않게 한다 (P035 T05).
// 전제(명시): 제거 대상 비밀은 자기 봇 토큰과 봇 토큰 형태뿐이며 둘 다 공백·줄바꿈을 포함하지 않는다.
// 공백을 포함할 수 있는 패턴을 더하려면 별도 처리가 필요하므로 목록에 공백이 있으면 생성 오류로 막는다.

export const REDACTED = "[비밀 제거됨]";

/** 봇 토큰 형태: 숫자 6자리 이상 + ':' + 영숫자·_·- 30자 이상 */
export const TOKEN_SHAPE = /[0-9]{6,}:[A-Za-z0-9_-]{30,}/g;
export const TOKEN_SHAPE_ONE = /[0-9]{6,}:[A-Za-z0-9_-]{30,}/;

export type Redactor = (text: string) => string;

export function makeRedactor(secrets: string[] = []): Redactor {
  const known = secrets.filter((s) => s.length >= 8);
  for (const s of known) if (/\s/.test(s)) throw new Error("비밀 값에는 공백·줄바꿈이 있을 수 없다(redact 전제)");
  return (text: string): string => {
    let out = text;
    for (const s of known) if (out.includes(s)) out = out.split(s).join(REDACTED);
    return out.replace(TOKEN_SHAPE, REDACTED);
  };
}

export function hasTokenShape(text: string): boolean {
  return TOKEN_SHAPE_ONE.test(text);
}

/** 값·객체 키 전체에 redact를 적용한 사본 — 키가 겹치면 순번을 붙여 구분한다 */
export function redactDeep(value: unknown, redact: Redactor): unknown {
  if (typeof value === "string") return redact(value);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, redact));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      let key = redact(k);
      if (key !== k && Object.prototype.hasOwnProperty.call(out, key)) {
        let n = 2;
        while (Object.prototype.hasOwnProperty.call(out, `${key}#${n}`)) n++;
        key = `${key}#${n}`;
      }
      out[key] = redactDeep(v, redact);
    }
    return out;
  }
  return value;
}
