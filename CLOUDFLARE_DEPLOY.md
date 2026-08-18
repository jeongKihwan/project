# Cloudflare 배포

## 1. Cloudflare 리소스 생성

```bash
npx wrangler login
npx wrangler d1 create review-insight-db
npx wrangler r2 bucket create review-insight-uploads
```

첫 명령의 브라우저 로그인 후 D1 생성 결과에서 `database_id`를 복사해 `wrangler.toml`의 `REPLACE_WITH_CLOUDFLARE_D1_DATABASE_ID`를 바꿉니다.

## 2. DB 생성

```bash
npm run db:migrate:remote
```

## 3. Production Secret 등록

Cloudflare Dashboard의 `Workers & Pages > review-insight > Settings > Variables and Secrets`에 아래 값을 Secret으로 추가합니다.

```text
SESSION_SECRET
PAYMENT_PROVIDER=toss
TOSS_CLIENT_KEY
TOSS_SECRET_KEY
AI_API_KEY
TURNSTILE_SITE_KEY
TURNSTILE_SECRET
```

`TOSS_CLIENT_KEY`, `TURNSTILE_SITE_KEY`는 공개 식별값이지만 같은 화면의 일반 Variable로 등록해도 됩니다. `TOSS_SECRET_KEY`, `AI_API_KEY`, `SESSION_SECRET`, `TURNSTILE_SECRET`는 반드시 Secret입니다.

## 4. 배포

```bash
npm run deploy
```

배포 결과의 `*.workers.dev` 주소에서 회원가입, 분석, 테스트 결제를 확인합니다.

## 5. 운영 도메인·결제

Workers 프로젝트의 `Settings > Domains & Routes`에서 Custom Domain을 추가합니다. Toss 성공·실패 URL도 새 도메인으로 변경합니다.

```text
https://YOUR_DOMAIN/payment-success.html
https://YOUR_DOMAIN/payment-fail.html
```

Toss 라이브 키는 테스트 결제 전체 검증 뒤에만 설정합니다.
