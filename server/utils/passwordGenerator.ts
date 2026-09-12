import crypto from 'crypto';

/**
 * Unambiguous character sets excluding visually confusing characters:
 * - '0' and 'O' (zero and capital O)
 * - '1', 'l', and 'I' (one, lowercase L, capital I)
 * - 'o' (lowercase o)
 * 
 * This prevents reading and typing errors when students or teachers read printed credential cards.
 */
const UPPERCASE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // 24 chars
const LOWERCASE_CHARS = 'abcdefghjkmnpqrstuvwxyz'; // 23 chars
const DIGIT_CHARS = '23456789';                     // 8 chars
const ALL_UNAMBIGUOUS_CHARS = UPPERCASE_CHARS + LOWERCASE_CHARS + DIGIT_CHARS; // 55 chars

/**
 * Generates a cryptographically secure random password suitable for students.
 * - Guaranteed at least 1 uppercase, 1 lowercase, and 1 digit
 * - Excludes all ambiguous characters (0, O, 1, l, I, o)
 * - Cryptographically secure randomness via crypto.randomInt
 * - Default length is 8 characters (~46.4 bits of entropy)
 */
export function generateSecureStudentPassword(length = 8): string {
  if (length < 6) {
    throw new Error('Student password length must be at least 6 characters.');
  }

  // Ensure mandatory character diversity
  const chars: string[] = [
    UPPERCASE_CHARS[crypto.randomInt(0, UPPERCASE_CHARS.length)],
    LOWERCASE_CHARS[crypto.randomInt(0, LOWERCASE_CHARS.length)],
    DIGIT_CHARS[crypto.randomInt(0, DIGIT_CHARS.length)],
  ];

  // Fill remaining characters from the combined set
  for (let i = chars.length; i < length; i++) {
    chars.push(ALL_UNAMBIGUOUS_CHARS[crypto.randomInt(0, ALL_UNAMBIGUOUS_CHARS.length)]);
  }

  // Fisher-Yates shuffle using cryptographically secure random numbers
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}

/**
 * Validates that a password satisfies minimum complexity requirements.
 */
export function isSufficientPassword(password: string): boolean {
  if (!password || typeof password !== 'string' || password.length < 6) {
    return false;
  }
  // Reject trivial sequential or common passwords
  const forbidden = ['123456', '12345678', 'password', 'admin123', 'student', '000000'];
  if (forbidden.includes(password.toLowerCase())) {
    return false;
  }
  return true;
}
