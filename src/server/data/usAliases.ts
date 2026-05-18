/**
 * Korean aliases for popular US-listed tickers. Values are the canonical
 * Korean names as used by Naver Finance / 한경 / 매경 — short and recognisable.
 * Catalog build merges these into MarketAsset.nameKo so the client can show
 * "애플" instead of "Apple Inc." on cards/list/detail headers.
 *
 * Add new entries here; no migration needed (the field is additive, missing
 * symbols simply fall back to the English name).
 */

export const US_ALIASES: Record<string, string> = {
  // Tech mega-caps
  'NASDAQ:AAPL': '애플',
  'NASDAQ:MSFT': '마이크로소프트',
  'NASDAQ:GOOGL': '알파벳 A',
  'NASDAQ:GOOG': '알파벳 C',
  'NASDAQ:AMZN': '아마존',
  'NASDAQ:META': '메타 플랫폼스',
  'NASDAQ:NVDA': '엔비디아',
  'NASDAQ:TSLA': '테슬라',
  'NASDAQ:AVGO': '브로드컴',
  'NASDAQ:NFLX': '넷플릭스',
  'NASDAQ:ORCL': '오라클',
  'NASDAQ:ADBE': '어도비',
  'NASDAQ:CSCO': '시스코',
  'NASDAQ:INTC': '인텔',
  'NASDAQ:AMD': 'AMD',
  'NASDAQ:QCOM': '퀄컴',
  'NASDAQ:TXN': '텍사스 인스트루먼츠',
  'NASDAQ:CRM': '세일즈포스',
  'NASDAQ:SHOP': '쇼피파이',
  'NASDAQ:PLTR': '팔란티어',
  'NASDAQ:UBER': '우버',
  'NASDAQ:ABNB': '에어비앤비',
  'NASDAQ:PYPL': '페이팔',
  'NASDAQ:SBUX': '스타벅스',
  'NASDAQ:COST': '코스트코',
  'NASDAQ:PEP': '펩시코',
  'NASDAQ:KO': '코카콜라',
  'NASDAQ:MCD': '맥도날드',
  'NASDAQ:NKE': '나이키',
  'NASDAQ:DIS': '월트 디즈니',
  'NASDAQ:V': '비자',
  'NASDAQ:MA': '마스터카드',
  'NASDAQ:JPM': 'JP모간 체이스',
  'NASDAQ:BAC': '뱅크 오브 아메리카',
  'NASDAQ:WFC': '웰스파고',
  'NASDAQ:GS': '골드만 삭스',
  'NASDAQ:BRK.B': '버크셔 해서웨이 B',

  // Healthcare
  'NASDAQ:JNJ': '존슨앤드존슨',
  'NASDAQ:UNH': '유나이티드헬스',
  'NASDAQ:PFE': '화이자',
  'NASDAQ:LLY': '일라이 릴리',
  'NASDAQ:MRK': '머크',
  'NASDAQ:ABBV': '애브비',
  'NASDAQ:AMGN': '암젠',
  'NASDAQ:GILD': '길리어드 사이언스',
  'NASDAQ:MDLZ': '몬델리즈 인터내셔널',

  // ETFs commonly held by Korean investors
  'NASDAQ:QQQ': '인베스코 QQQ 트러스트',
  'NASDAQ:SPY': 'SPDR S&P 500',
  'NASDAQ:VOO': '뱅가드 S&P 500',
  'NASDAQ:VTI': '뱅가드 전체 미국 주식',
  'NASDAQ:SOXX': '아이셰어즈 반도체',
  'NASDAQ:SMH': '반에크 반도체',
  'NASDAQ:ARKK': '아크 이노베이션',
  'NASDAQ:ARKX': '아크 스페이스 익스플로레이션',
  'NASDAQ:ARKG': '아크 게놈 레볼루션',
  'NASDAQ:ARKQ': '아크 자율기술·로보틱스',
  'NASDAQ:ARKW': '아크 차세대 인터넷',
  'NASDAQ:ARKF': '아크 핀테크 이노베이션',
  'NASDAQ:TQQQ': '프로셰어즈 울트라프로 QQQ',
  'NASDAQ:SQQQ': '프로셰어즈 울트라프로 숏 QQQ',
  'NASDAQ:GLD': 'SPDR 골드',
  'NASDAQ:TLT': '아이셰어즈 20년 이상 국채',
};

export function aliasFor(symbol: string): string | undefined {
  return US_ALIASES[symbol];
}
