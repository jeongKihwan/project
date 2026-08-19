# 리뷰인사이트 MVP

## 실행

```bash
cp .env.example .env
npm run dev
```

`http://localhost:3000`에서 실행됩니다. Node.js 22.5 이상이 필요합니다. 내장 SQLite를 사용하므로 별도 패키지 설치가 필요 없습니다.

## 현재 결제 모드

Cloudflare 운영 환경은 Paddle provider를 사용합니다. `PADDLE_MODE=sandbox`에서는 실제 청구 없이 전체 결제 흐름을 검증합니다. Paddle 승인 후 라이브 client-side token, 라이브 price ID, 라이브 webhook secret과 `PADDLE_MODE=live`를 함께 적용하면 실결제가 활성화됩니다. 카드번호와 CVC는 Paddle만 처리하며 이 서버에 저장하지 않습니다.

플랜은 FREE 1회, Starter 월 10회, Growth 월 50회, Pro 월 200회입니다. FREE 결과는 서버에서 미리보기만 반환하며 전체 분석 JSON은 한 번만 DB에 저장합니다. 서명된 Paddle 구독 웹훅으로 유료 플랜이 활성화되면 기존 분석을 다시 실행하지 않고 전체 결과를 반환합니다.

필수 Paddle 값이 모두 준비되기 전에는 요금제 버튼이 `결제 승인 대기 중`으로 비활성화됩니다. `/api/config`의 `paymentReady`로 배포 환경의 결제 준비 상태를 확인할 수 있습니다.

Price ID는 `PADDLE_STARTER_PRICE_ID`, `PADDLE_GROWTH_PRICE_ID`, `PADDLE_PRO_PRICE_ID` 개별 Secret 등록을 권장합니다. 기존 `PADDLE_PRICE_IDS` JSON도 호환됩니다.

기존 유료 구독의 플랜 변경은 새 Checkout을 만들지 않고 `PADDLE_API_KEY`로 Paddle Subscription API를 호출합니다. Sandbox API Key에는 `subscription.write` 권한이 필요하며, DB 플랜과 분석 한도는 서명된 `subscription.updated` Webhook이 도착한 뒤 갱신됩니다.

## 테스트

```bash
npm test
npx wrangler deploy --dry-run
```

Paddle 환경·가격 매핑, 웹훅 서명 검증, 위변조 차단을 자동 검사합니다.

로컬 통합 서버를 실행한 뒤 아래 명령으로 FREE 분석, 잠금, 결제, 플랜 활성화, 재로그인 유지, 중복 웹훅, 플랜 변경·취소, 동시요청 차단을 검증합니다.

```bash
npm run test:subscription-flow
```

AI 결과는 감정 비율, 장점·불만 TOP 5, 판매 행동 및 개선 제안, 상품 개선 우선순위, 상세페이지 문구, FAQ로 구성됩니다. 각 항목은 근거 리뷰가 확인된 경우에만 표시됩니다. 리뷰가 300개를 넘으면 전체에서 균등 표본 300개를 분석하고 화면에 전체 수와 실제 분석 수를 구분해 표시합니다.

## 보안 원칙

- 이메일과 비밀번호만 가입에 사용합니다.
- CSV에서는 `댓글` 열만 분석에 사용합니다.
- 이메일, 전화번호, 주민번호, 카드번호, 주소 형태 데이터는 AI 분석 전 마스킹합니다.
- 분석과 결제 원장은 Cloudflare D1에 기록합니다.
- 결제 이벤트 ID와 구독 ID의 유니크 제약으로 중복 Webhook 처리를 막습니다.
- Paddle의 서명된 결제·구독 웹훅, 서버 Price ID 매핑, 실제 billing period를 확인한 뒤 플랜을 활성화합니다.
- 분석 사용량은 D1의 원자적 예약으로 관리하며 localStorage를 권한 판단에 사용하지 않습니다.
- `wrangler.toml`의 `keep_vars = true`로 Cloudflare Dashboard에서 등록한 Secret을 후속 배포에서도 유지합니다.
