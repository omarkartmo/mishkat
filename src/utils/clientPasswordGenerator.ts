/**
 * Client-side cryptographically secure random password generator for students.
 * Uses the Web Crypto API (window.crypto.getRandomValues).
 * Excludes ambiguous characters (0, O, 1, l, I, o) to prevent reading and typing errors on printed cards.
 */

const UPPERCASE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // 24 chars (no I, O)
const LOWERCASE_CHARS = 'abcdefghjkmnpqrstuvwxyz'; // 23 chars (no l, o)
const DIGIT_CHARS = '23456789';                     // 8 chars (no 0, 1)
const ALL_CHARS = UPPERCASE_CHARS + LOWERCASE_CHARS + DIGIT_CHARS; // 55 chars

export function generateRandomStudentPassword(length = 8): string {
  const randomValues = new Uint32Array(length + 10);
  window.crypto.getRandomValues(randomValues);

  // Guarantee at least 1 uppercase, 1 lowercase, and 1 digit
  const chars: string[] = [
    UPPERCASE_CHARS[randomValues[0] % UPPERCASE_CHARS.length],
    LOWERCASE_CHARS[randomValues[1] % LOWERCASE_CHARS.length],
    DIGIT_CHARS[randomValues[2] % DIGIT_CHARS.length],
  ];

  for (let i = 3; i < length; i++) {
    chars.push(ALL_CHARS[randomValues[i] % ALL_CHARS.length]);
  }

  // Fisher-Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomValues[length + i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}
