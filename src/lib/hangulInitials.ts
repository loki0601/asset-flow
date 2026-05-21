/**
 * Korean consonant ("초성") search helpers — let users type "ㅅㅅ" to match
 * "삼성전자", "ㅎㄷ" to match "현대차" etc. Each Hangul syllable in the
 * Unicode block U+AC00 to U+D7A3 is composed deterministically as
 * (initial × 588) + (medial × 28) + final, so dividing by 588 recovers
 * the index into the 19 initial-consonant table.
 */

const INITIALS = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];

const HANGUL_SYLLABLE_START = 0xAC00;
const HANGUL_SYLLABLE_END = 0xD7A3;
const HANGUL_JAMO_START = 0x3131;
const HANGUL_JAMO_END = 0x314E;

/** Replace each Hangul syllable with its leading-consonant jamo. */
export function toInitials(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.charCodeAt(0);
    if (code >= HANGUL_SYLLABLE_START && code <= HANGUL_SYLLABLE_END) {
      const idx = Math.floor((code - HANGUL_SYLLABLE_START) / 588);
      out += INITIALS[idx];
    } else {
      out += ch;
    }
  }
  return out;
}

/** Is every character a standalone Hangul compatibility jamo? */
export function isAllInitials(input: string): boolean {
  if (!input) return false;
  for (const ch of input) {
    const code = ch.charCodeAt(0);
    if (code < HANGUL_JAMO_START || code > HANGUL_JAMO_END) return false;
  }
  return true;
}

/**
 * Returns true if `query` (must be all-initial jamo) appears as a substring
 * of `target`'s initial-consonant projection.
 *
 * Caller is expected to gate via `isAllInitials(query)` first — if the
 * query contains anything else, we early-return false so the regular
 * substring matcher in the picker can take over.
 */
export function matchesInitials(target: string, query: string): boolean {
  if (!isAllInitials(query)) return false;
  return toInitials(target).includes(query);
}
