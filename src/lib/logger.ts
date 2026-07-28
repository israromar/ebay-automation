type LogFields = Record<string, unknown>;

const REDACT_KEYS = /token|password|secret|cookie|authorization|credential|apikey|api_key/i;

function redact(fields?: LogFields): LogFields | undefined {
  if (!fields) return fields;
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = REDACT_KEYS.test(k) ? "[REDACTED]" : v;
  }
  return out;
}

export function logInfo(message: string, fields?: LogFields) {
  console.log(JSON.stringify({ level: "info", message, ...redact(fields), ts: new Date().toISOString() }));
}

export function logWarn(message: string, fields?: LogFields) {
  console.warn(JSON.stringify({ level: "warn", message, ...redact(fields), ts: new Date().toISOString() }));
}

export function logError(message: string, fields?: LogFields) {
  console.error(JSON.stringify({ level: "error", message, ...redact(fields), ts: new Date().toISOString() }));
}
