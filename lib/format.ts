export function asString(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

export function asNumber(value: unknown) {
  const text = asString(value);
  if (text === null) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}
