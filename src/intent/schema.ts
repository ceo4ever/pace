/**
 * 기능·화면 설계 데이터용 최소 JSON Schema 검사기(런타임 의존성 없음).
 * 지원: type · required · properties · additionalProperties(false 또는 schema) · items · enum · pattern · minItems · maxItems · minLength · maxLength ·
 * minimum · maximum · $ref(#/definitions/…) · oneOf. 모르는 키워드는 조용히 무시하지 않고 오류로 돌려준다.
 */
export type Schema = {
  type?: string | string[];
  required?: string[];
  properties?: Record<string, Schema>;
  additionalProperties?: boolean | Schema;
  items?: Schema;
  enum?: unknown[];
  pattern?: string;
  minItems?: number;
  minLength?: number;
  maxLength?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  $ref?: string;
  oneOf?: Schema[];
  definitions?: Record<string, Schema>;
  description?: string;
  [extra: `x-${string}`]: unknown;
};

export interface SchemaError {
  path: string;
  message: string;
}

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

function typeMatches(expected: string, actual: string): boolean {
  return expected === actual || (expected === "number" && actual === "integer");
}

const KEYWORDS = new Set(["type", "required", "properties", "additionalProperties", "items", "enum", "pattern", "minItems", "maxItems", "minLength", "maxLength", "minimum", "maximum", "$ref", "oneOf", "definitions", "description"]);
const own = (object: object | undefined, key: string) => object !== undefined && Object.hasOwn(object, key);

export function validate(value: unknown, schema: Schema, root: Schema = schema, path = "$"): SchemaError[] {
  const unknown = Object.keys(schema).filter((k) => !KEYWORDS.has(k) && !k.startsWith("x-"));
  if (unknown.length > 0) return [{ path, message: `지원하지 않는 schema 키워드: ${unknown.join(", ")}` }];
  if (schema.$ref) {
    const name = /^#\/definitions\/(.+)$/.exec(schema.$ref)?.[1];
    const target = name && own(root.definitions, name) ? root.definitions![name] : undefined;
    if (!target) return [{ path, message: `schema 참조를 찾을 수 없다: ${schema.$ref}` }];
    return validate(value, target, root, path);
  }
  if (schema.oneOf) {
    const results = schema.oneOf.map((s) => validate(value, s, root, path));
    const passed = results.filter((r) => r.length === 0).length;
    if (passed === 1) return [];
    if (passed > 1) return [{ path, message: "oneOf 중 여러 개에 맞는다" }];
    return results.reduce((best, r) => (r.length < best.length ? r : best));
  }
  const errors: SchemaError[] = [];
  const actual = typeOf(value);
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeMatches(t, actual))) return [{ path, message: `${types.join("|")}이어야 한다 (지금 ${actual})` }];
  }
  if (schema.enum && !schema.enum.some((e) => e === value)) errors.push({ path, message: `다음 중 하나여야 한다: ${schema.enum.join(", ")}` });
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push({ path, message: `${schema.minLength}자 이상이어야 한다` });
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push({ path, message: `${schema.maxLength}자 이하여야 한다` });
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) errors.push({ path, message: `형식이 다르다: ${schema.pattern}` });
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push({ path, message: `${schema.minimum} 이상이어야 한다` });
    if (schema.maximum !== undefined && value > schema.maximum) errors.push({ path, message: `${schema.maximum} 이하여야 한다` });
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push({ path, message: `항목이 ${schema.minItems}개 이상이어야 한다` });
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push({ path, message: `항목이 ${schema.maxItems}개 이하여야 한다` });
    if (schema.items) value.forEach((item, i) => errors.push(...validate(item, schema.items!, root, `${path}[${i}]`)));
  }
  if (actual === "object") {
    const object = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!own(object, key)) errors.push({ path: `${path}.${key}`, message: "빠졌다" });
    for (const [key, item] of Object.entries(object)) {
      const sub = own(schema.properties, key) ? schema.properties![key] : undefined;
      if (sub) errors.push(...validate(item, sub, root, `${path}.${key}`));
      else if (schema.additionalProperties === false) errors.push({ path: `${path}.${key}`, message: "정의되지 않은 칸이다" });
      else if (typeof schema.additionalProperties === "object") errors.push(...validate(item, schema.additionalProperties, root, `${path}.${key}`));
    }
  }
  return errors;
}
