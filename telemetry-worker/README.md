# telemetry-worker — ASIS 익명 설치·사용자 수 집계

앱(`src/main/telemetry/usagePing.ts`)이 하루 한 번 보내는 익명 신호를 받아
설치 수와 기간별 사용자 수를 센다. 랜딩(`landing/src/download/hook/useInstallStats.ts`)이
`/v1/stats` 를 읽어 "지금까지 N명이 설치 · 이번 달 M명이 사용 중" 으로 보여 준다.

## 무엇을 저장하나

| 값         | 설명                                                             |
| ---------- | ---------------------------------------------------------------- |
| 설치 ID    | 앱이 처음 실행될 때 만든 무작위 UUID. 개인·기기를 알아볼 수 없다 |
| 앱 버전    | 예: `0.8.1`                                                      |
| macOS 버전 | 예: `macOS 26.3`                                                 |
| 날짜       | UTC 기준 하루 단위                                               |

IP·계정·파일·화면 내용은 저장하지 않는다. 앱 설정의 "익명 사용 통계 보내기" 를 끄면 보내지 않는다.

## API

| 요청                                | 동작                                                                |
| ----------------------------------- | ------------------------------------------------------------------- |
| `POST /v1/ping` `{id, version, os}` | 처음 보는 id 면 설치 1건, (id, 오늘) 이 처음이면 하루 사용 1건      |
| `GET /v1/stats`                     | `{installs, baseline, activeToday, active7d, active30d}` (5분 캐시) |

`baseline`(wrangler.toml `INSTALLS_BASELINE`)은 집계 시작 전 누적 추정치다 —
GitHub 릴리스 `.dmg` 다운로드에서 릴리스당 기본 2회를 뺀 합(2026-11 기준 85).

## 처음 배포

```bash
cd telemetry-worker
npx wrangler login                       # 브라우저에서 Cloudflare 계정 승인
npx wrangler d1 create asis-telemetry    # 출력된 database_id 를 wrangler.toml 에 넣는다
npx wrangler d1 execute asis-telemetry --remote --file=./schema.sql
npx wrangler deploy                      # 출력된 workers.dev 주소를 앱·랜딩 TELEMETRY_URL 에 맞춘다
```

## 숫자 보기

```bash
curl https://<배포 주소>/v1/stats
npx wrangler d1 execute asis-telemetry --remote \
  --command "SELECT first_version, COUNT(*) FROM installs GROUP BY first_version"
```

## 테스트

로직은 `src/handler.ts` 에 의존성 없이 있고, 루트 `pnpm test` 가 `node:sqlite` 로
실제 SQL 까지 검증한다 (`tests/telemetry-worker.test.mts`).
