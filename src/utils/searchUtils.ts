/**
 * Arabic Text Normalization and Fast Multi-field Search Helpers
 */

export function normalizeArabicText(str: string | undefined | null): string {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    // Remove Arabic diacritics / tashkeel (fatha, damma, kasra, sukun, shadda, tanween)
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    // Normalize Alefs (أ, إ, آ, ٱ, etc. -> ا)
    .replace(/[أإآٱ]/g, 'ا')
    // Normalize Taa Marbuta and Haa (ة -> ه)
    .replace(/ة/g, 'ه')
    // Normalize Yaa and Alef Maksura (ى, ئ -> ي)
    .replace(/[ىئ]/g, 'ي')
    // Normalize Waw with Hamza (ؤ -> و)
    .replace(/ؤ/g, 'و')
    // Strip redundant punctuation/spaces
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks if target string contains the query string with Arabic normalization
 */
export function matchesArabicQuery(target: string | undefined | null, query: string): boolean {
  if (!query || !query.trim()) return true;
  if (!target) return false;
  
  const normTarget = normalizeArabicText(target);
  const normQuery = normalizeArabicText(query);

  // Direct normalized substring match
  if (normTarget.includes(normQuery)) return true;

  // Multi-word token matching (all words in query must appear in target)
  const queryTokens = normQuery.split(' ').filter(Boolean);
  if (queryTokens.length > 0) {
    const allTokensMatch = queryTokens.every((token) => {
      if (normTarget.includes(token)) return true;
      // If token starts with "ال" (Arabic definite article), try matching without "ال"
      if (token.startsWith('ال') && token.length > 3 && normTarget.includes(token.substring(2))) {
        return true;
      }
      // If word in target starts with "ال", match against stripped target words
      const targetTokens = normTarget.split(' ').map(t => t.startsWith('ال') && t.length > 3 ? t.substring(2) : t);
      if (targetTokens.some(tt => tt.includes(token))) return true;
      return false;
    });

    if (allTokensMatch) return true;
  }

  return false;
}
