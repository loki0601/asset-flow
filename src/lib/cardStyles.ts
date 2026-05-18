/**
 * Shared typography/sizing tokens for list-item cards.
 *
 * Used by HoldingCard, LoanAccountCard, PensionCard. Editing values here
 * propagates to every card list — keep the cards visually consistent.
 *
 * Cards still own their *content layout* (different sections, footers, etc).
 * These tokens cover the recurring primitives only:
 * - icon "chip" size
 * - main title (e.g. 종목명, 은행명, 연금 상품명)
 * - small uppercase sublabel
 * - inline numeric value
 */
export const card = {
  /** Square icon chip on the left of a card row (40×40). */
  iconBox: 'w-10 h-10 rounded-2xl flex items-center justify-center shrink-0',

  /** Card main title — bank name, ticker, pension product name. */
  title: 'text-sm font-black text-brand-ink leading-tight',

  /** Small uppercase sub-label above or below the title. */
  subLabel: 'text-[10px] font-bold text-brand-sage uppercase tracking-tighter',

  /** Right-aligned primary value (price, balance). */
  value: 'text-sm font-black text-brand-ink',

  /** Secondary inline text (e.g. "남은 금액" label inside a card). */
  smallLabel: 'text-[10px] font-bold text-gray-400 uppercase',
} as const;
