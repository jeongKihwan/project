# Cloudflare 배포

## 1. Cloudflare 리소스 생성

```bash
npx wrangler login
npx wrangler d1 create review-insight-db
```

첫 명령의 브라우저 로그인 후 D1 생성 결과에서 `database_id`를 복사해 `wrangler.toml`의 `REPLACE_WITH_CLOUDFLARE_D1_DATABASE_ID`를 바꿉니다.

원본 CSV는 Worker 메모리에서 개인정보 정제·분석 후 폐기하므로 R2에 저장하지 않습니다.

## 2. DB 생성

```bash
npm run db:migrate:remote
```

## 3. Production Secret 등록

Cloudflare Dashboard의 `Workers & Pages > review-insight > Settings > Variables and Secrets`에 아래 값을 Secret으로 추가합니다.

```text
SESSION_SECRET
PADDLE_CLIENT_TOKEN
PADDLE_WEBHOOK_SECRET
OPENAI_API_KEY
TURNSTILE_SECRET
```

`PADDLE_CLIENT_TOKEN`은 브라우저 공개 토큰이지만 운영 편의를 위해 Secret으로 등록해도 됩니다. `PADDLE_WEBHOOK_SECRET`, `OPENAI_API_KEY`, `SESSION_SECRET`, `TURNSTILE_SECRET`는 반드시 Secret입니다.

`wrangler.toml`의 일반 Variable은 아래처럼 사용합니다.

```text
PAYMENT_PROVIDER=paddle
PADDLE_MODE=sandbox
PADDLE_PRICE_IDS={"starter":"pri_...","growth":"pri_...","pro":"pri_..."}
ENVIRONMENT=production
```

Paddle Sandbox에서 일회성 상품 가격 3개를 만든 뒤 각 `pri_` 값을 `PADDLE_PRICE_IDS`에 넣습니다. 테스트 완료 후 라이브 토큰·price ID·웹훅 secret을 등록할 때만 `PADDLE_MODE=live`로 변경합니다. Sandbox와 Live 값을 섞으면 서버가 결제를 차단합니다.

Paddle 알림 목적지 URL:

```text
https://review-insight.jkh7531.workers.dev/api/webhooks/paddle
```

이 목적지에서 `transaction.completed` 이벤트를 활성화합니다.

## 4. 배포

```bash
npm run deploy
```

배포 결과의 `*.workers.dev` 주소에서 회원가입, 분석, 테스트 결제를 확인합니다.

## 5. 운영 도메인·결제

Workers 프로젝트의 `Settings > Domains & Routes`에서 Custom Domain을 추가합니다. Paddle의 승인 도메인과 기본 결제 링크도 새 도메인으로 변경합니다.

```text
https://YOUR_DOMAIN/payment-success.html
https://YOUR_DOMAIN/payment.html
```
