# 데이터 스키마 설계 (v1)

## 0. 원칙

1. **사용자별 데이터 격리** — 모든 사용자 데이터는 `userId` 키로 네임스페이스됨. A 사용자가 B 사용자 데이터를 볼 수 없다.
2. **앱 내 저장** — 사용자 자산·계좌·대출·연금·거래 등은 클라이언트(WebView/브라우저) 안에서만 보관한다. 서버로 전송하지 않는다.
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
assetflow:session                       → { currentUserId: string | null }
assetflow:users                         → User[]            (계정 목록)
assetflow:user:{userId}:profile         → UserProfile
assetflow:user:{userId}:members         → FamilyMember[]
assetflow:user:{userId}:accounts        → Account[]
assetflow:user:{userId}:holdings        → Holding[]
assetflow:user:{userId}:transactions    → Transaction[]
assetflow:user:{userId}:loans           → Loan[]
assetflow:user:{userId}:pensions        → Pension[]
assetflow:user:{userId}:retirementTargets → RetirementTarget[]
assetflow:user:{userId}:settings        → UserSettings

# 서버 캐시 (사용자 무관)
assetflow:market:catalog                → MarketAsset[]
assetflow:market:price:{symbol}         → { price, dailyChangePct, updatedAt }
assetflow:market:history:{symbol}:{range} → number[]
```

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

interface UserProfile {
  userId: string;
  displayName: string;         // 표시 이름 (기본 '나')
  tier?: string;               // 'Premium Member' 등, optional
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
  name: string;                // '나', '배우자', '첫째'
  isSelf: boolean;             // 본인 식별 (한 명만 true)
  createdAt: string;
}
```

### 2.3 계좌

```ts
type AccountType =
  | '한국증권' | '미국증권'
  | '개인연금' | 'IRP' | '퇴직연금'
  | '코인거래소' | '금' | '은행';

interface Account {
  id: string;
  userId: string;
  memberId: string;            // FamilyMember.id
  type: AccountType;
  institution: string;         // '키움증권'
  number?: string;             // 표시용 (마스킹 권장)
  createdAt: string;
}
```

> 잔액은 저장하지 않는다. `balance = sum(holdings × currentPrice) + cash transactions` 로 파생.

### 2.4 자산 마스터 (서버)

```ts
type AssetCategory = '국내주식' | '해외주식' | '연금성주식' | '비트코인' | '금';

interface MarketAsset {
  symbol: string;              // 'KRX:005930', 'NASDAQ:AAPL', 'BTC:KRW'
  name: string;                // '삼성전자', '애플'
  category: AssetCategory;
  currency: 'KRW' | 'USD';     // 표시 통화 변환용
  currentPrice: number;
  dailyChange: number;
  dailyChangePct: number;
  updatedAt: string;
}

interface PriceHistory {
  symbol: string;
  range: '1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL';
  points: number[];
}
```

### 2.5 보유 종목 (Holding)

```ts
interface Holding {
  id: string;
  userId: string;
  accountId: string;           // 어느 계좌에 보유
  symbol: string;              // MarketAsset.symbol 참조
  quantity: number;
  avgPrice: number;            // 평균 매입가 (KRW 환산)
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
  symbol?: string;             // buy/sell/dividend에서만
  type: TransactionType;
  quantity?: number;           // buy/sell
  price?: number;              // 1주 체결 가격
  amount: number;              // 총 체결/입출금 금액 (KRW)
  fee?: number;                // 수수료
  occurredAt: string;          // 거래 시각
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
  memberId: string;            // 차주
  name: string;                // '우리 주택담보대출'
  bank: string;
  totalAmount: number;         // 원금
  remainingAmount: number;     // 잔액
  method: LoanMethod;
  rate: number;                // 연이율 (%)
  startDate: string;
  maturityDate: string;
  paymentDay: number;          // 매월 N일
  monthlyEst: number;          // 이번 달 예상 납부
  status: LoanStatus;
  createdAt: string;
}
```

> 향후 상환 트랜잭션 도입 시 `remainingAmount`도 파생값으로 전환 검토.

### 2.8 연금

```ts
type PensionCategory = 'public' | 'corporate' | 'personal';

interface PensionBase {
  id: string;
  userId: string;
  memberId: string;
  category: PensionCategory;
  type: string;                // '국민연금', 'DC형 퇴직연금', '연금저축계좌'
  title: string;               // 상품명
  institution?: string;
  createdAt: string;
}

interface PublicPension extends PensionBase {
  category: 'public';
  monthlyAmount: number;       // 예상 월 수령액
  payPeriod: string;           // '156개월 납부 중'
  startYear: string;           // '2051년 수령 예정'
}

interface CorporatePension extends PensionBase {
  category: 'corporate';
  totalValue: number;
  yield: number;               // 연 수익률
}

interface PersonalPension extends PensionBase {
  category: 'personal';
  totalValue: number;
  annualContribution: number;
  taxBenefit: number;
}

type Pension = PublicPension | CorporatePension | PersonalPension;
```

### 2.9 노후 목표

```ts
interface RetirementTarget {
  id: string;
  userId: string;
  memberId: string;            // 구성원별 목표
  targetAge: number;
  currentAge: number;          // 또는 birthYear로 보관 → 자동 계산
  targetMonthly: number;       // 목표 월 수령액
}
```

> `expectedMonthly`는 해당 구성원의 모든 Pension에서 합산해 파생.

## 3. 관계 다이어그램 (텍스트)

```
User (1) ──┬── (N) FamilyMember
           ├── (N) Account ──┐
           ├── (N) Loan      │
           ├── (N) Pension   │
           ├── (N) RetirementTarget
           └── UserSettings  │
                             │
FamilyMember (1) ────────────┘  (memberId 외래키로 묶임)

Account (1) ── (N) Holding ── symbol → MarketAsset
Account (1) ── (N) Transaction

MarketAsset (1) ── (N) Holding (read-only reference)
```

## 4. 파생값 계산 위치

UI에서 표시하는 거의 모든 합계/비율은 저장된 원본에서 파생한다:

| 표시 값 | 계산식 |
|---|---|
| 대시보드 총 잔액 | `Σ holding.quantity × asset.currentPrice` + `Σ cash balance` |
| 일간 변동 | `Σ holding.quantity × asset.dailyChange` |
| 포트폴리오 비중 | 카테고리별 평가금액 / 총 평가금액 |
| 종목 평가손익 | `(currentPrice − avgPrice) × quantity` |
| 대출 전체 잔액 | `Σ loan.remainingAmount` |
| 상환률 | `(totalAmount − remainingAmount) / totalAmount` |
| 노후 예상 월수령액 | 가족별 연금 합산 (corporate/personal은 연금화 가정 필요 → 우선은 public만) |
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
5. `FamilyMember` 1개: `{ name: '나', isSelf: true }`

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
  · 계좌 관리      (이미 있음, /settings/accounts)
  · 가족 구성원 관리 (신규, /settings/members)
  · 대출 관리      (신규, /settings/loans)
  · 노후 관리      (신규, /settings/retirement)
      └ 노후 목표 + 연금 목록을 한 페이지에서 관리
  · Preferences (알림 / 테마)
```

각 관리 페이지는 동일 패턴:
- 그룹 헤더 + 카드 리스트 + `+ 추가` CTA
- 카드 탭 → 상세/편집 모달
- + 추가 → 입력 모달 (계좌 추가 모달과 동일 톤)

대출/연금에서 `memberId`는 가족 구성원 셀렉트로 입력한다.

## 9. 다음 구현 단계 (제안)

1. `src/lib/schema.ts` — 위 타입 정의
2. `src/lib/storage.ts` — 키 빌더, JSON get/set, scope helper
3. `src/lib/repos/*` — 컬렉션별 CRUD 함수
4. `src/lib/auth.ts` — 사용자 시드, 현재 사용자 가져오기, 로그인 stub
5. `src/lib/market.ts` — 시세 mock (서버 측 데이터)
6. `src/hooks/*` — `useCurrentUser`, `useAccounts`, `useHoldings`, ... 클라이언트 훅
7. 기존 mock import를 위 hook 호출로 교체 (페이지별 점진적)
8. TDD: repos와 파생 계산 함수에 단위 테스트 작성
