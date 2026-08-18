# 리뷰인사이트 MVP

## 실행

```bash
cp .env.example .env
npm run dev
```

`http://localhost:3000`에서 실행됩니다. Node.js 22.5 이상이 필요합니다. 내장 SQLite를 사용하므로 별도 패키지 설치가 필요 없습니다.

## 현재 결제 모드

Cloudflare 운영 환경은 Paddle provider를 사용합니다. `PADDLE_MODE=sandbox`에서는 실제 청구 없이 전체 결제 흐름을 검증합니다. Paddle 승인 후 라이브 client-side token, 라이브 price ID, 라이브 webhook secret과 `PADDLE_MODE=live`를 함께 적용하면 실결제가 활성화됩니다. 카드번호와 CVC는 Paddle만 처리하며 이 서버에 저장하지 않습니다.

필수 Paddle 값이 모두 준비되기 전에는 요금제 버튼이 `결제 승인 대기 중`으로 비활성화됩니다. `/api/config`의 `paymentReady`로 배포 환경의 결제 준비 상태를 확인할 수 있습니다.

## 테스트

```bash
npm test
npx wrangler deploy --dry-run
```

Paddle 환경·가격 매핑, 웹훅 서명 검증, 위변조 차단을 자동 검사합니다.

## 보안 원칙

- 이메일과 비밀번호만 가입에 사용합니다.
- CSV에서는 `댓글` 열만 분석에 사용합니다.
- 이메일, 전화번호, 주민번호, 카드번호, 주소 형태 데이터는 AI 분석 전 마스킹합니다.
- 분석과 결제 원장은 Cloudflare D1에 기록합니다.
- 결제 ID는 유니크 제약으로 크레딧 중복 지급을 막습니다.
- Paddle의 서명된 `transaction.completed` 웹훅과 서버의 price ID 매핑을 모두 확인한 뒤 크레딧을 지급합니다.
- `wrangler.toml`의 `keep_vars = true`로 Cloudflare Dashboard에서 등록한 Secret을 후속 배포에서도 유지합니다.
