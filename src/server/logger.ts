const REDACTED_KEYS = new Set([
  'rawText',
  'audioBase64',
  'imageBase64',
  'authorization',
  'Authorization',
  'apiKey',
  'GEMINI_API_KEY',
  'token',
  'idToken',
]);

export function redactSensitiveString(input: string): string {
  return input
    .replace(/AIza[0-9A-Za-z\-_]{20,}/g, '[REDACTED_API_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9\-_.]+/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED_EMAIL]')
    .replace(/(?:\+91[\-\s]?)?[6-9]\d{4}[\-\s]?\d{5}\b/g, '[REDACTED_PHONE]');
}

export function sanitizeLogPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(payload)) {
    if (REDACTED_KEYS.has(key)) {
      safe[key] = '[REDACTED]';
    } else if (typeof val === 'string') {
      safe[key] = redactSensitiveString(val).slice(0, 240);
    } else if (typeof val === 'number' || typeof val === 'boolean' || val === null) {
      safe[key] = val;
    }
  }
  return safe;
}

export function logSafeServerEvent(event: string, payload: Record<string, unknown>): void {
  const record = {
    ts: new Date().toISOString(),
    event,
    ...sanitizeLogPayload(payload),
  };
  console.log(JSON.stringify(record));
}
