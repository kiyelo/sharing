# Supabase 적용 순서 — React 1.3.0

## 새 Supabase 프로젝트

1. SQL Editor에서 `schema.sql` 전체 실행
2. 이어서 `migrations/20260721_full_parity.sql` 전체 실행
3. Authentication에서 사용할 로그인 방식을 활성화
4. GitHub 저장소 Secrets에 다음 두 값을 등록
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
5. GitHub Actions를 다시 실행

## 기존 프로젝트

기존 `schema.sql`을 이미 적용했다면 `migrations/20260721_full_parity.sql`만 실행합니다. 마이그레이션은 `if not exists`와 정책 재생성을 사용합니다.

## 추가되는 출시용 데이터

- `circles.invite_code`
- `circle_members.position`
- `profiles.preferences`
- `task_read_receipts`
- `completion_events`
- `tasks.completed_position`
- 변경 시 읽음 영수증 무효화 트리거
- `join_circle_by_code(...)` RPC

## 보안

- 모든 공개 테이블은 RLS를 사용합니다.
- 개인 할 일은 소유자만 접근합니다.
- 끼리 데이터는 구성원만 접근합니다.
- 끼리 수정·삭제 권한은 소유자 정책을 따릅니다.
- 읽음 상태는 본인 행만 쓰고 읽습니다.
- 브라우저에는 Publishable Key만 사용합니다. Secret Key와 DB 비밀번호를 저장소나 `.env`에 넣지 마세요.
