# 데이터 스키마 설계 (v1)

> `src/lib/schema.ts`가 기준(source of truth). 이 문서는 그 요약/설계 노트이며,
> 타입이 바뀌면 이 문서도 같이 갱신한다.

## 0. 원칙

1. **사용자별 데이터 격리** — 모든 사용자 데이터는 `userId` 키로 네임스페이스됨. A 사용자가 B 사용자 데이터를 볼 수 없다.
2. **앱 내 저장** — 사용자 자산·계좌·대출·노후 목표·거래 등은 클라이언트(WebView/브라우저) 안에서만 보관한다. 서버로 전송하지 않는다.
3. **서버는 시세만 제공** — 종목 카탈로그, 현재가, 일일 변동, 가격 히스토리. 사용자 식별 없이 호출.
4. **기본 사용자 시드** — 첫 실행 시 `loki0601 / loki0601` 계정을 자동 생성하고 로그인된 상태로 시작. 추후 사용자 등록·로그인 UI 추가.

## 1. 저장소 전략

### 클라이언트 (사용자 데이터)
- 1차: `localStorage` (구현 단순). 키는 모두 `assetflow:user:{userId}:{collection}` 패턴으로 사용자 격리.
- 한 사용자의 전체 데이터가 수 MB를 넘어가기 시작하면 IndexedDB로 마이그레이션 (래퍼 추상화로 영향 최소화).
- 한 키에 하나의 컬렉션 JSON 배열을 저장 (`accounts`, `holdings`, ...).

### 서버 (시세 데이터)
- 별도 인증 없이 GET 가능한 read-only endpoint.
- 현재는 mock JSON으로 시작, 추후 외부 시세 API로 교체.
- 클라이언트는 30초~5분 단위로 stale-while-revalidate 캐시.

### 키 스페이스
```
assetflow:session                       → Session { currentUserId: string | null }
assetflow:users                         → User[]            (계정 목록)
assetflow:user:{userId}:profile         → UserProfile
assetflow:user:{userId}:members         → FamilyMember[]
assetflow:user:{userId}:accounts        → Account[]
assetflow:user:{userId}:holdings        → Holding[]
assetflow:user:{userId}:transactions    → Transaction[]
assetflow:user:{userId}:loans           → Loan[]
assetflow:user:{userId}:retirementTargets → RetirementTarget[]
assetflow:user:{userId}:settings        → UserSettings

# 서버 캐시 (사용자 무관)
assetflow:market:catalog                → MarketAsset[]
assetflow:market:price:{symbol}         → { price, dailyChangePct, updatedAt }
assetflow:market:history:{symbol}:{range} → number[]
```

> 별도의 "연금" 컬렉션은 없다. 퇴직/개인연금 원금은 `Account`/`Holding`에서
> 자동 집계하고, 공적연금(국민연금)만 `RetirementTarget`에 사용자가 직접
> 입력한 예상 월 수령액을 저장한다 — §2.7 참고.

## 2. 엔티티

ID는 모두 `cuid2` (이미 의존성에 포함). 날짜는 ISO-8601 문자열.

### 2.1 인증 / 사용자

```ts
interface User {
  id: string;                  // 내부 식별자
  username: string;            // 'loki0601'
  passwordHash: string;        // argon2 해시 (현재는 평문 비교로 시작, TODO: argon2)
  createdAt: string;
}

interface Session {
  currentUserId: string | null;
}

interface UserProfile {
  userId: string;
  displayName: string;         // 표시 이름 (기본 '나')
  tier?: string;                // 'Premium Member' 등, optional
}

interface UserSettings {
  userId: string;
  notifications: boolean;
  aggregateHoldings: boolean;  // 대시보드 Holdings 모아보기
  theme: 'light' | 'dark';
}
```

### 2.2 가족 구성원

```ts
interface FamilyMember {
  id: string;
  userId: string;
  name: string;                 // '나', '배우자', '첫째'
  birthYear?: number;           // YYYY. 있으면 노후 페이지가 현재 나이 +
                                 // 국민연금 수령 개시일을 자동 계산. 없으면
                                 // RetirementTarget.currentAge로 대체.
  createdAt: string;
}
```

### 2.3 계좌

```ts
type AccountType = '국내증권' | '미국증권' | '가상자산' | '금';
// 자산 카탈로그/포트폴리오 필터의 단일 분류축. 계좌 자체엔 저장하지 않고
// institution → lib/institutions.ts를 통해 허용 카테고리를 도출한다.

interface Account {
  id: string;
  userId: string;
  memberId: string;             // FamilyMember.id
  institution: string;          // lib/institutions.ts의 INSTITUTIONS 정식 명칭
  name: string;                 // 사용자가 붙인 별칭 ('메인', 'ISA', '장기투자')
  createdAt: string;
}
```

> 잔액은 저장하지 않는다. `balance = sum(holdings × currentPrice) + cash transactions` 로 파생.

### 2.4 자산 마스터 (서버) / 카탈로그 마이그레이션

```ts
type AssetCategory = AccountType; // Account 카테고리와 동일 축을 공유

interface MarketAsset {
  symbol: string;                // 'KRX:005930', 'NASDAQ:AAPL', 'BTC:KRW'
  name: string;                  // '삼성전자', 'Apple Inc.'
  nameKo?: string;                // 해외 자산의 한글 표기 ('애플'). 없으면 name 사용
  category: AssetCategory;
  currency: 'KRW' | 'USD';       // 표시 통화 변환용
  currentPrice: number;
  dailyChange: number;
  dailyChangePct: number;
  deprecated?: boolean;           // true면 신규 매수 피커에서 제외, 기존 보유는 "단종" 표시 유지
  updatedAt: string;
}

interface PriceHistory {
  symbol: string;
  range: '1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL';
  points: number[];
}

// 서버가 내려주는 카탈로그 변경 지시. 클라이언트는 순서대로 적용해
// 로컬 미러 + 사용자 데이터를 서버와 일관되게 유지한다.
type CatalogMigrationOp =
  | { kind: 'noop' }
  | { kind: 'rename_symbol'; from: string; to: string }
  | { kind: 'deprecate'; symbol: string }
  | { kind: 'split'; symbol: string; ratio: number }
  | { kind: 'merge'; from: string; to: string; ratio: number };

interface CatalogMigration {
  version: string;
  appliedAt: string;
  op: CatalogMigrationOp;
}

interface CatalogResponse {
  version: string;
  assets: MarketAsset[];
  migrations: CatalogMigration[];
}
```

### 2.5 보유 종목 (Holding)

```ts
interface Holding {
  id: string;
  userId: string;
  accountId: string;           // 어느 계좌에 보유
  symbol: string;               // MarketAsset.symbol 참조
  quantity: number;
  avgPrice: number;              // 평균 매입가 (KRW 환산)
  createdAt: string;
  updatedAt: string;
}
```

> 평가금액·수익률은 파생값:
> - `valuation = quantity × currentPrice`
> - `profit = (currentPrice - avgPrice) × quantity`
> - `profitPct = (currentPrice - avgPrice) / avgPrice × 100`

### 2.6 거래 내역 (Transaction)

```ts
type TransactionType = 'buy' | 'sell' | 'deposit' | 'withdraw' | 'dividend';

interface Transaction {
  id: string;
  userId: string;
  accountId: string;
  symbol?: string;              // buy/sell/dividend에서만
  type: TransactionType;
  quantity?: number;            // buy/sell
  price?: number;                 // 1주 체결 가격
  amount: number;                 // 총 체결/입출금 금액 (KRW)
  fee?: number;                   // 수수료
  avgCostAtSale?: number;         // sell 체결 시점의 평단(원화) 스냅샷 —
                                   // 실현손익 표시용. 기능 도입 이후 sell만 보유.
  occurredAt: string;             // 거래 시각
  memo?: string;
}
```

> 매수/매도 시 Holding의 quantity, avgPrice를 트랜잭션 기반으로 재계산.
> 평단 = (이전 평단 × 이전 수량 + 신규 단가 × 신규 수량) / 합계 수량

### 2.7 대출

```ts
type LoanMethod = '원리금균등상환' | '원금균등상환' | '만기일시상환';
type LoanStatus = '상환 중' | '완료' | '연체';

interface Loan {
  id: string;
  userId: string;
  memberId: string;              // 차주
  name: string;                   // '우리 주택담보대출'
  bank: string;
  totalAmount: number;             // 원금
  remainingAmount: number;         // 잔액 (계약 기준)
  repaid?: number;                  // 상환 버튼으로 낸 누적 추가 상환액.
                                     // remainingAmount에서 차감. 옛 데이터는 없음 → 0.
  method: LoanMethod;
  rate: number;                     // 연이율 (%)
  startDate: string;
  maturityDate: string;
  paymentDay: number;               // 매월 N일
  monthlyEst: number;               // 이번 달 예상 납부
  status: LoanStatus;
  createdAt: string;
}
```

### 2.8 노후 목표 (RetirementTarget)

연금은 더 이상 별도 엔티티가 아니다. 공적/퇴직/개인 3종은 각각
독립적으로 켜고 끌 수 있는 토글이며, `RetirementTarget` 한 row에 다 들어있다.

```ts
type PensionCategory = 'public' | 'corporate' | 'personal';

interface RetirementTarget {
  id: string;
  userId: string;
  memberId: string;               // 구성원별 목표
  targetAge: number;
  currentAge: number;
  targetMonthly: number;          // 오늘 구매력 기준 목표 월 수령액.
                                   // inflationAdjustEnabled=true면 수령 개시
                                   // 시점까지 inflationRate로 매년 불려서 비교.

  // 공적연금 (국민연금) — 수동 입력. NPS "예상연금 조회" 값을 사용자가 직접 입력.
  publicEnabled?: boolean;
  publicMonthly?: number;
  publicStartAge?: number;        // 기본 65

  // 퇴직연금 (DC/DB만. IRP는 개인연금으로 분류) — 원금은 보유 계좌에서 자동 집계.
  corporateEnabled?: boolean;
  corporateStartAge?: number;     // 기본 55
  corporateYears?: number;        // 기본 10
  corporateAnnualRate?: number;   // 기본 0.04

  // 개인연금 (연금저축 + IRP) — 원금은 보유 계좌에서 자동 집계.
  personalEnabled?: boolean;
  personalStartAge?: number;      // 기본 55
  personalYears?: number;         // 기본 20
  personalAnnualRate?: number;    // 기본 0.04

  // 물가상승 반영 토글
  inflationAdjustEnabled?: boolean; // 기본 true
  inflationRate?: number;           // 기본 0.025
}

// 노후 페이지가 화면에 뿌리는 파생 뷰. 저장되지 않음 (RetirementTarget +
// Account/Holding에서 매 렌더 계산).
interface RetirementProfile {
  name: string;
  targetAge: number;
  currentAge: number;
  targetMonthly: number;
  expectedMonthly: number;
}
```

> 퇴직/개인연금의 "원금"은 `Account.institution`으로 연금 계좌를 식별해
> 해당 계좌의 `Holding`을 평가금액으로 합산한 값이다(수동 등록 없음).
> 계산은 `src/lib/retirementPlanning.ts`(`pensionPrincipalForMember`,
> `buildProjection`)에 있다.

## 3. 관계 다이어그램 (텍스트)

```
User (1) ──┬── (N) FamilyMember
           ├── (N) Account ──┐
           ├── (N) Loan      │
           ├── (N) RetirementTarget
           └── UserSettings  │
                             │
FamilyMember (1) ────────────┘  (memberId 외래키로 묶임)

Account (1) ── (N) Holding ── symbol → MarketAsset
Account (1) ── (N) Transaction

MarketAsset (1) ── (N) Holding (read-only reference)
RetirementTarget + Account/Holding ──(계산)──> RetirementProfile (비저장)
```

## 4. 파생값 계산 위치

UI에서 표시하는 거의 모든 합계/비율은 저장된 원본에서 파생한다:

| 표시 값 | 계산식 |
|---|---|
| 대시보드 총 잔액 | `Σ holding.quantity × asset.currentPrice` + `Σ cash balance` |
| 일간 변동 | `Σ holding.quantity × asset.dailyChange` |
| 포트폴리오 비중 | 카테고리별 평가금액 / 총 평가금액 |
| 종목 평가손익 | `(currentPrice − avgPrice) × quantity` |
| 대출 전체 잔액 | `Σ loan.remainingAmount − loan.repaid` |
| 상환률 | `(totalAmount − remainingAmount) / totalAmount` |
| 노후 예상 월수령액 | 공적(수동 입력) + 퇴직/개인(보유 계좌 원금 자동 집계 → 연금화) 중 활성화된 토글만 합산 |
| 노후 목표 달성률 | `expectedMonthly / targetMonthly × 100` |

## 5. 마이그레이션 / 시드

### 첫 실행 시
1. `assetflow:users`가 없으면 빈 배열 + 기본 사용자 추가:
   ```ts
   { id: cuid(), username: 'loki0601', passwordHash: 'loki0601', createdAt: now }
   ```
2. `assetflow:session.currentUserId`를 그 사용자 id로 설정
3. 그 사용자의 모든 컬렉션을 빈 배열로 초기화
4. `UserSettings`는 디폴트 (`notifications:true`, `aggregateHoldings:false`, `theme:'light'`)
5. `FamilyMember` 1개: `{ name: '나' }`

### 스키마 버전
- `assetflow:schemaVersion = 1` 저장. 향후 변경 시 마이그레이션 함수로 업그레이드.

## 6. 인증 (현재 단계)

- 로그인 UI 없음. `currentUserId`가 항상 시드된 `loki0601`.
- 추후 추가:
  - `/login` 페이지
  - argon2 해시 비교
  - 다중 사용자 전환 UI (설정 페이지)
  - 사용자별 데이터는 이미 격리되어 있어 전환만으로 분리됨

## 7. 보안 메모

- localStorage는 동일 도메인 코드라면 접근 가능. 단말 자체 침해엔 취약.
- 비밀번호는 절대 평문 저장하지 않는다 → argon2 해시 (1차 구현에선 stub).
- 시세 API는 사용자 식별자를 보내지 않는다 (symbol만 전송).
- 추후 옵션: WebCrypto의 SubtleCrypto로 민감 컬렉션 AES-GCM 암호화 (사용자 비밀번호 파생 키).

## 8. 관리 진입점 (UX 흐름)

설정 페이지가 모든 사용자 데이터의 입력 허브 역할을 한다.

```
설정 →
  · 계좌 관리      (/settings/accounts)
  · 가족 구성원 관리 (/settings/members)
  · 대출 관리      (/settings/loans)
  · 노후 관리      (/settings/retirement)
      └ 구성원별 RetirementTarget 설정. 공적연금만 수동 입력,
        퇴직/개인연금은 보유 계좌에서 자동 집계 (수동 등록 UI 없음).
  · Preferences (알림 / 테마)
```

각 관리 페이지는 동일 패턴:
- 그룹 헤더 + 카드 리스트 + `+ 추가` CTA
- 카드 탭 → 상세/편집 모달
- + 추가 → 입력 모달 (계좌 추가 모달과 동일 톤)

대출/노후 목표에서 `memberId`는 가족 구성원 셀렉트로 입력한다.

## 9. 다음 구현 단계 (제안)

1. `src/lib/schema.ts` — 위 타입 정의
2. `src/lib/storage.ts` — 키 빌더, JSON get/set, scope helper
3. `src/lib/repos.ts` — 컬렉션별 CRUD 함수
4. `src/lib/auth.ts` — 사용자 시드, 현재 사용자 가져오기, 로그인 stub
5. `src/lib/market.ts` — 시세 mock (서버 측 데이터)
6. `src/hooks/*` — `useCurrentUser`, `useAccounts`, `useHoldings`, ... 클라이언트 훅
7. 기존 mock import를 위 hook 호출로 교체 (페이지별 점진적)
8. TDD: repos와 파생 계산 함수에 단위 테스트 작성
