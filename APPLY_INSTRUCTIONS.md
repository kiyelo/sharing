# React 1.1.0 적용

ZIP을 풀고 기존 저장소 루트에 모든 파일을 덮어쓴 뒤 GitHub Desktop에서 변경 사항을 확인하세요.

터미널 사용 시:

```bash
git add -A
git commit -m "feat: ship v18.4.8 full parity React 1.1.0"
git fetch origin
git push --force-with-lease origin main
```

Supabase를 사용한다면 push 전에 `supabase/README.md`의 SQL 적용 순서를 먼저 확인하세요.
