-- ASIS 익명 사용 통계 — 앱이 보내는 무작위 설치 ID 만 저장한다(개인을 알아볼 정보 없음).

-- 설치 1건 = 처음 보는 설치 ID 1개. 같은 ID 가 다시 와도 늘지 않는다.
CREATE TABLE IF NOT EXISTS installs (
  id TEXT PRIMARY KEY,
  first_version TEXT NOT NULL,
  os TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 하루 사용 = (설치 ID, UTC 날짜) 1쌍. 같은 날 여러 번 켜도 1번.
CREATE TABLE IF NOT EXISTS daily_active (
  id TEXT NOT NULL,
  day TEXT NOT NULL,
  version TEXT NOT NULL,
  PRIMARY KEY (id, day)
);

CREATE INDEX IF NOT EXISTS daily_active_day ON daily_active (day);
