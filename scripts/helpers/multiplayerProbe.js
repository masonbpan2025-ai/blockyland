export function reachedRegistration(text, errors = []) {
  return errors.length === 0 && /\/(?:reg(?:ister)?|login)\b/i.test(text)
    && !/disconnected|connection failed|failed to connect|connection timed out/i.test(text);
}
