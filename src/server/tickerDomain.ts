/**
 * Best-effort `symbol → company website domain` resolver.
 *
 * Used by the brand-icon manifest builder + /api/icons/logo proxy. The
 * domain is then handed to a public logo CDN (Clearbit's free endpoint)
 * to fetch the company's mark, which the client re-colours to the active
 * theme via CSS mask-image.
 *
 * Resolution order:
 *   1. Hand-curated `DOMAIN_OVERRIDES` — for catalogs where the leading-
 *      word heuristic gets the wrong answer (e.g. KR chaebols whose
 *      catalog name is Korean, US tickers whose marketed name diverges
 *      from the legal entity).
 *   2. Catalog company name → strip suffix → leading word → "{slug}.com".
 *      Covers most US S&P names automatically.
 *   3. null when nothing plausible can be derived.
 */

interface NameInput {
  symbol: string;
  name: string;
}

export function tickerDomain(input: NameInput): string | null {
  const override = DOMAIN_OVERRIDES[input.symbol];
  if (override) return override;
  // KR ETF brand prefix → issuer domain. The catalog name's leading
  // token (KODEX/TIGER/...) is the brand; every fund under that brand
  // belongs to the same asset-manager, so reusing the issuer's logo
  // gives the whole shelf a coherent look (and saves the user from
  // staring at hundreds of monogram tiles).
  const etfDomain = etfIssuerDomain(input);
  if (etfDomain) return etfDomain;
  if (!input.name) return null;
  const slug = leadingSlug(stripLegalSuffix(input.name));
  if (!slug || slug.length < 3) return null;
  return `${slug}.com`;
}

function etfIssuerDomain(input: NameInput): string | null {
  if (!input.symbol.startsWith('KRX:') || !input.name) return null;
  const head = input.name.trim().split(/\s+/)[0]?.toUpperCase() ?? '';
  return ETF_BRAND_DOMAIN[head] ?? null;
}

const ETF_BRAND_DOMAIN: Record<string, string> = {
  KODEX: 'samsungfund.com',
  TIGER: 'tigeretf.com',
  KOSEF: 'kbam.co.kr',
  SOL: 'sh.kbsec.com',
  ACE: 'acepia.com',
  HANARO: 'nhamundi.com',
  RISE: 'kbam.co.kr',
  KBSTAR: 'kbam.co.kr',
  ARIRANG: 'hanwhafund.co.kr',
  PLUS: 'hanwhafund.co.kr',
  TIMEFOLIO: 'timefolio.co.kr',
  KOACT: 'kyobosec.co.kr',
};

function leadingSlug(name: string): string {
  const head = name.split(/\s+/)[0] ?? '';
  return head.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function stripLegalSuffix(name: string): string {
  let out = name.replace(/\s*\([^)]+\)\s*$/, '').trim();
  out = out
    .replace(
      /[,]?\s+(Class [A-Z]( Common Stock)?( New)?|Common Stock|Inc\.?|Corp\.?|Corporation|Co\.?|Co\., Ltd\.?|Ltd\.?|Limited|Plc|LLC|N\.V\.|S\.A\.|S\.p\.A\.|AG|SE|ADR|American Depositary Shares?( - .+)?|Ordinary Shares?( - .+)?|New York Registry Shares?|Holdings?|The|S&P 500)$/gi,
      '',
    )
    .trim();
  return out;
}

// Curated overrides — catalog name → domain mismatches that the leading-
// word heuristic gets wrong. Add aggressively when a logo doesn't render
// for a high-traffic symbol.
const DOMAIN_OVERRIDES: Record<string, string> = {
  // US big-caps where the legal name diverges from the brand
  'NASDAQ:GOOG': 'google.com',
  'NASDAQ:GOOGL': 'google.com',
  'NASDAQ:META': 'meta.com',
  'NASDAQ:AAPL': 'apple.com',
  'NASDAQ:MSFT': 'microsoft.com',
  'NASDAQ:AMZN': 'amazon.com',
  'NASDAQ:TSLA': 'tesla.com',
  'NASDAQ:NVDA': 'nvidia.com',
  'NASDAQ:NFLX': 'netflix.com',
  'NASDAQ:UBER': 'uber.com',
  'NASDAQ:PLTR': 'palantir.com',
  'NASDAQ:ADBE': 'adobe.com',
  'NASDAQ:CSCO': 'cisco.com',
  'NASDAQ:CMCSA': 'comcast.com',
  'NASDAQ:INTC': 'intel.com',
  'NASDAQ:AVGO': 'broadcom.com',
  'NASDAQ:ABT': 'abbott.com',
  'NASDAQ:PEP': 'pepsico.com',
  'NASDAQ:KO': 'coca-cola.com',
  'NASDAQ:V': 'visa.com',
  'NASDAQ:MA': 'mastercard.com',
  'NASDAQ:VZ': 'verizon.com',
  'NASDAQ:PYPL': 'paypal.com',
  'NASDAQ:SBUX': 'starbucks.com',
  'NASDAQ:MCD': 'mcdonalds.com',
  'NASDAQ:NKE': 'nike.com',
  'NASDAQ:DIS': 'disney.com',
  'NYSE:DIS': 'disney.com',
  'NYSE:WMT': 'walmart.com',
  'NYSE:JNJ': 'jnj.com',
  'NYSE:JPM': 'jpmorganchase.com',
  'NYSE:BAC': 'bankofamerica.com',
  'NYSE:WFC': 'wellsfargo.com',
  'NYSE:GS': 'goldmansachs.com',
  'NYSE:MS': 'morganstanley.com',
  'NYSE:XOM': 'exxonmobil.com',
  'NYSE:CVX': 'chevron.com',
  'NYSE:BRK.A': 'berkshirehathaway.com',
  'NYSE:BRK.B': 'berkshirehathaway.com',
  'NYSE:HD': 'homedepot.com',
  'NYSE:UNH': 'unitedhealthgroup.com',
  'NYSE:PG': 'pg.com',
  'NYSE:T': 'att.com',
  'NYSE:F': 'ford.com',
  'NYSE:GE': 'ge.com',
  'NYSE:IBM': 'ibm.com',
  'NYSE:ORCL': 'oracle.com',
  'NYSE:DELL': 'dell.com',
  'NYSE:CRM': 'salesforce.com',
  'NYSE:PFE': 'pfizer.com',
  'NYSE:MRK': 'merck.com',
  'NYSE:LLY': 'lilly.com',
  'NYSE:ABBV': 'abbvie.com',
  'NYSE:TMO': 'thermofisher.com',
  'NYSE:UPS': 'ups.com',
  'NYSE:CAT': 'caterpillar.com',
  'NYSE:BA': 'boeing.com',
  'NYSE:LMT': 'lockheedmartin.com',

  // KR chaebols (catalog name is Korean → heuristic can't help). The
  // full KOSPI-200 mapping lives further down; this block covers the
  // very-top-of-mind names whose ticker codes most users recognise.
  'KRX:005930': 'samsung.com',
  'KRX:005380': 'hyundai.com',
  'KRX:000270': 'kia.com',
  'KRX:003550': 'lgcorp.com',
  'KRX:035420': 'naver.com',
  'KRX:035720': 'kakaocorp.com',
  'KRX:000660': 'skhynix.com',
  'KRX:055550': 'shinhan.com',
  'KRX:105560': 'kbfg.com',
  'KRX:086790': 'hanagroup.co.kr',

  // Crypto (own websites)
  'CRYPTO:BTC': 'bitcoin.org',
  'CRYPTO:ETH': 'ethereum.org',
  'CRYPTO:SOL': 'solana.com',
  'CRYPTO:XRP': 'ripple.com',
  'CRYPTO:DOGE': 'dogecoin.com',
  'CRYPTO:LTC': 'litecoin.org',
  'CRYPTO:BCH': 'bitcoincash.org',
  'CRYPTO:ADA': 'cardano.org',
  'CRYPTO:DOT': 'polkadot.network',
  'CRYPTO:TRX': 'tron.network',

  // KR ETF issuers (most ETFs share their issuer's brand). The ETF
  // prefix matcher in tickerDomain() handles most of these
  // automatically; entries below pin codes whose catalog name doesn't
  // start with a recognised brand prefix.
  'KRX:069500': 'samsungfund.com', // KODEX 200
  'KRX:133690': 'samsungfund.com', // KODEX 200 TR
  'KRX:069660': 'kosef.co.kr',

  // KOSPI 200 majors — catalog name is in Korean, so the leading-word
  // heuristic can't derive a domain. Adding ticker overrides routes
  // each through the existing favicon pipeline (icon.horse → Google s2).
  'KRX:005935': 'samsung.com', // 삼성전자우
  'KRX:373220': 'lgensol.com', // LG에너지솔루션
  'KRX:005490': 'posco.com', // POSCO홀딩스
  'KRX:003670': 'poscofuturem.com', // 포스코퓨처엠
  'KRX:047050': 'poscointl.com', // 포스코인터내셔널
  'KRX:051910': 'lgchem.com', // LG화학 (was lgcorp.com — wrong)
  'KRX:066570': 'lge.com', // LG전자 (was lg.com — wrong)
  'KRX:034220': 'lgdisplay.com', // LG디스플레이
  'KRX:011070': 'lginnotek.com', // LG이노텍
  'KRX:032640': 'uplus.co.kr', // LG유플러스
  'KRX:006400': 'samsungsdi.com', // 삼성SDI
  'KRX:010130': 'koreazinc.co.kr', // 고려아연
  'KRX:012330': 'mobis.com', // 현대모비스
  'KRX:086280': 'glovis.net', // 현대글로비스
  'KRX:003490': 'koreanair.com', // 대한항공
  'KRX:329180': 'hyundai-trans.com', // 현대트랜시스
  'KRX:064350': 'hyundai-rotem.com', // 현대로템
  'KRX:000720': 'hdec.kr', // 현대건설
  'KRX:267250': 'hyundai-heavy.com', // HD현대중공업
  'KRX:042700': 'hanmisemi.com', // 한미반도체
  'KRX:128940': 'hanmi.co.kr', // 한미약품
  'KRX:000100': 'yuhan.co.kr', // 유한양행
  'KRX:000810': 'samsungfire.com',
  'KRX:032830': 'samsunglife.com',
  'KRX:010140': 'samsungshi.com', // 삼성중공업
  'KRX:028050': 'samsungeng.com', // 삼성엔지니어링
  'KRX:009150': 'samsungsem.co.kr', // 삼성전기
  'KRX:207940': 'samsungbiologics.com',
  'KRX:068270': 'celltrion.com',
  'KRX:091990': 'celltrionhc.com', // 셀트리온헬스케어
  'KRX:326030': 'skbiopharm.com', // SK바이오팜
  'KRX:086520': 'ecopro.co.kr', // 에코프로
  'KRX:247540': 'ecoprobm.co.kr', // 에코프로비엠
  'KRX:196170': 'alteogen.com',
  'KRX:145020': 'hugel.co.kr',
  'KRX:138930': 'bnkfg.com', // BNK금융지주
  'KRX:138040': 'meritzfin.com', // 메리츠금융지주
  'KRX:316140': 'woorifg.com', // 우리금융지주
  'KRX:024110': 'ibk.co.kr', // 기업은행
  'KRX:015760': 'kepco.co.kr', // 한국전력
  'KRX:036460': 'kogas.or.kr', // 한국가스공사
  'KRX:267260': 'hd-hyundaielectric.com', // HD현대일렉트릭
  'KRX:034730': 'sk.com',
  'KRX:017670': 'sktelecom.com',
  'KRX:030200': 'kt.com',
  'KRX:055490': 'kt.com',
  'KRX:251270': 'netmarble.com',
  'KRX:036570': 'ncsoft.com', // 엔씨소프트
  'KRX:263750': 'pearlabyss.com', // 펄어비스
  'KRX:293490': 'kakaogames.com',
  'KRX:323410': 'kakaobank.com',
  'KRX:377300': 'kakaopay.com',
  'KRX:053800': 'ahnlab.com', // 안랩
  'KRX:035900': 'jype.com', // JYP
  'KRX:041510': 'smentertainment.com', // SM엔터
  'KRX:352820': 'hybecorp.com', // 하이브
  'KRX:122870': 'ygfamily.com', // YG엔터
  'KRX:028260': 'samsungc.com', // 삼성물산
  'KRX:000150': 'doosan.com', // 두산
  'KRX:034020': 'doosanenerbility.com', // 두산에너빌리티
  'KRX:042670': 'doosanbobcat.com', // 두산밥캣
  'KRX:009830': 'hanwhasolutions.com', // 한화솔루션
  'KRX:047810': 'hanwhaaerospace.com', // 한화에어로스페이스
  'KRX:042660': 'hanwhaocean.com', // 한화오션
  'KRX:280360': 'lotte.co.kr', // 롯데웰푸드
  'KRX:005300': 'lottechilsung.co.kr', // 롯데칠성
  'KRX:023530': 'lotteshopping.com', // 롯데쇼핑
  'KRX:069960': 'ehyundai.com', // 현대백화점
  'KRX:004170': 'shinsegae.com', // 신세계
  'KRX:139480': 'emart.com',
  'KRX:282330': 'bgfretail.com',
  'KRX:097950': 'cj.net', // CJ제일제당
  'KRX:001040': 'cj.net', // CJ
  'KRX:271560': 'orionworld.com', // 오리온
  'KRX:271940': 'kt-skylife.co.kr',
  'KRX:008770': 'shillahotels.com', // 호텔신라
  'KRX:161390': 'hankooktire.com',
  'KRX:011200': 'hmm21.com', // HMM
  'KRX:011170': 'lottechem.com', // 롯데케미칼
  'KRX:010120': 'ls-electric.com', // LS ELECTRIC
  'KRX:006260': 'lsis.co.kr', // LS
  'KRX:010060': 'oci.co.kr',
  'KRX:051600': 'koreazinc.co.kr',
  'KRX:081660': 'fila.com', // 휠라
  'KRX:108670': 'lgchem.com',
  'KRX:002790': 'amorepacific.com', // 아모레G
  'KRX:090430': 'amorepacific.com', // 아모레퍼시픽 (was duplicate)
  'KRX:051900': 'lghnh.com', // LG생활건강 (was duplicate)
  'KRX:089860': 'lotterental.com',
};
