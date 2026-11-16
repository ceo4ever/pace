/**
 * 보고서 schema 검사 — JSON Schema의 작은 부분집합만 지원한다(런타임 의존성 없음):
 * type(object·array·string·number·integer·boolean), properties, required, additionalProperties: false,
 * items, minItems, maxItems, minLength, enum, pattern, minimum, maximum.
 */
export interface Schema {
  type?: "object" | "array" | "string" | "number" | "integer" | "boolean";
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: Schema;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  enum?: (string | number)[];
  pattern?: string;
  minimum?: number;
  maximum?: number;
  description?: string;
}

/** 어긋난 칸마다 "경로: 이유" 한 줄. 비면 통과. */
export function validate(schema: Schema, value: unknown, path = "$"): string[] {
  const errors: string[] = [];
  const type = typeOf(value);
  if (schema.type && !(schema.type === type || (schema.type === "number" && type === "integer"))) {
    return [`${path}: ${schema.type}여야 한다(지금 ${type})`];
  }
  if (schema.enum && !schema.enum.includes(value as string | number)) errors.push(`${path}: ${schema.enum.join("|")} 중 하나여야 한다`);
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.trim().length < schema.minLength) errors.push(`${path}: 비어 있다`);
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) errors.push(`${path}: 형식이 맞지 않다(${schema.pattern})`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: ${schema.minimum} 이상이어야 한다`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: ${schema.maximum} 이하여야 한다`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: 항목이 ${schema.minItems}개 이상이어야 한다`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: 항목이 ${schema.maxItems}개 이하여야 한다`);
    if (schema.items) value.forEach((item, i) => errors.push(...validate(schema.items!, item, `${path}[${i}]`)));
  }
  if (type === "object") {
    const object = value as Record<string, unknown>;
    // 자기 속성만 본다 — constructor·toString 같은 프로토타입 이름이 schema나 값으로 잡히지 않게.
    for (const key of schema.required ?? []) if (!Object.hasOwn(object, key) || object[key] === null) errors.push(`${path}.${key}: 필수 칸이 없다`);
    for (const [key, child] of Object.entries(object)) {
      const sub = schema.properties && Object.hasOwn(schema.properties, key) ? schema.properties[key] : undefined;
      if (sub) errors.push(...validate(sub, child, `${path}.${key}`));
      else if (schema.additionalProperties === false) errors.push(`${path}.${key}: schema에 없는 칸이다`);
    }
  }
  return errors;
}

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}
