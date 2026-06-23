# asset-flow — 작업 지침

## 1. TDD가 기본 원칙 (예외 없음)

**모든 기능 추가·버그 수정·리팩터링은 테스트가 먼저다.**

순서:
1. **실패하는 테스트 작성** — 의도한 동작을 검증하는 테스트를 먼저 짠다. 이 테스트는 처음에 반드시 실패해야 한다(레드).
2. **테스트를 통과시키는 최소한의 코드 작성** — 과한 구현 금지. 테스트만 통과하면 된다(그린).
3. **리팩터링** — 테스트가 통과한 상태를 유지하면서 코드를 정리한다.

규칙:
- 새 기능을 추가할 때 테스트 없이 코드부터 짜지 않는다.
- 버그를 고칠 때는 그 버그를 재현하는 테스트를 먼저 추가하고, 그 테스트를 통과시키는 식으로 수정한다.
- UI 컴포넌트도 예외 아님: 동작(상태 변화, 분기 로직)이 있는 컴포넌트는 vitest로 테스트, 사용자 흐름은 playwright로 테스트.
- 순수 유틸 함수·도메인 로직(`src/server/domain/`, `src/lib/`)은 vitest로 단위 테스트.
- mock data 변경처럼 타입만 있는 변경은 typecheck로 충분 — 단, 그 데이터를 가공하는 함수가 있다면 그 함수는 테스트 필요.

테스트 위치:
- 단위 테스트: 대상 파일 옆 `*.test.ts` 또는 `tests/unit/`
- e2e: `tests/e2e/`

명령:
- `pnpm test` — vitest 실행
- `pnpm typecheck` — 타입 검사

## 2. 코드 스타일

- TypeScript strict. `any` 금지, 필요하면 `unknown` 후 narrowing.
- 컴포넌트는 함수형, default export 또는 named export 일관되게.
- Tailwind 클래스에서 색상은 `brand-*` 토큰만 사용 (raw hex 금지). 새 색은 `tailwind.config.ts`에 추가.
- 클라이언트 상태가 없는 컴포넌트는 서버 컴포넌트로 둔다 (`'use client'` 없이).
- 도메인 로직과 UI 분리: 계산은 `src/server/domain/` 또는 `src/lib/`에, 표시는 컴포넌트에.

## 3. 데이터 흐름

- 현재는 mock data (`src/lib/mock.ts`) 기반. UI 우선 구현 후 DB로 전환.
- 서버 전용 코드(`src/server/`)는 브라우저 번들에 포함되면 안 됨. API route handler에서만 import.
- Drizzle 스키마 변경 시 `pnpm db:generate`로 마이그레이션 생성.

## 4. 배포 / 안드로이드

- 외부 접속: `https://assetflow.elkavio.com` (Cloudflare Tunnel → 127.0.0.1:3500).
- 안드로이드 앱은 Capacitor live mode (`server.url` = 위 도메인). 같은 URL이 외부 웹과 앱 모두에 서빙됨.
- APK 재빌드는 네이티브 의존성·플러그인이 바뀔 때만 필요. UI/페이지 변경엔 불필요.

### 4.1 모든 코드 수정은 production 외부 배포까지 반영해야 한다

dev 서버(`pnpm dev`)는 개발 중에만 사용하고, 사용자가 외부에서 보는 결과는 **항상 production 서버**가 서빙해야 한다. 코드 수정이 끝나면 무조건 다음 순서를 실행한다:

1. `pnpm typecheck && pnpm test` 통과 확인
2. 현재 실행 중인 production/dev 서버 중단
3. `pnpm build` (production 빌드)
4. `pnpm start` (백그라운드 실행)
5. `curl -s -o /dev/null -w "%{http_code}\n" https://assetflow.elkavio.com/<해당 페이지>`로 200 확인 + 변경된 컨텐츠가 응답에 포함되는지 grep으로 확인
6. 텔레그램으로 사용자에게 반영 완료 보고

dev 서버만 띄워둔 상태로 작업을 끝내면 사용자가 "수정해도 외부에 반영이 안 된다"고 한다 — 이건 dev/prod 차이가 아니라 빌드가 안 됐기 때문이다.

### 4.2 캐시 무효화

`next.config.ts`의 `headers()`가 다음을 강제한다:
- HTML/페이지: `Cache-Control: no-store, must-revalidate` — 절대 캐시하지 않음
- `/_next/static/*`: `public, max-age=31536000, immutable` — 콘텐츠 해시가 붙어있어 안전하게 영구 캐시

이 정책 덕분에 production 재빌드 시 새 chunk 해시가 부여되고 HTML이 새 해시를 참조하므로 자동으로 캐시 무효화된다. Capacitor WebView도 이 헤더를 따른다.

따로 캐시 버스팅 쿼리(`?_v=...`)나 service worker 회피 코드를 넣지 말 것. 헤더 정책이 그 일을 한다.

## 5. 작업 흐름

- 변경 전: 관련 파일을 읽고 기존 패턴을 따른다.
- 변경 후: `pnpm typecheck && pnpm test` 통과 확인.
- 새 의존성 추가는 신중하게 — 이유를 분명히 한다.

### 5.1 코드를 수정하면 항상 커밋 & 푸시한다 (예외 없음)

작업이 끝나면 **무조건** 변경사항을 커밋하고 `main`에 푸시한다. 사용자가 매번 따로 요청하지 않아도 기본 동작이다.

순서:
1. `pnpm typecheck && pnpm test` 통과 + production 반영(§4.1) 확인
2. `git add -A && git commit` (의미 있는 한국어 메시지)
3. `git push`

커밋·푸시 없이 작업을 끝내지 않는다.
