# 20차 인수인계
## 바뀐 것
- 서버: naverblog / wpcom / tumblr 소스, /api/og (og:image 찾기, SSRF 차단), 카카오 블로그 og:"view".
- 클라이언트: 카드 출처 축약(SHORT), 뷰어 제목 폴백(제목→태그→사이트→소스명), og 카드 해석(ogResolve, 동시 4), 뷰어 og 업그레이드(4초 제한), 스크롤 중 classify/balance 보류, 맞춤 피드 개선(4개·flat 0.6·검색어 무작위 시작).
- CSS: backdrop-filter 전부 제거, 카드 태그 작게.
- relevance.bias: naverblog/wpcom/tumblr 추가. sw v19. 테스트 tests/blog2.test.mjs 추가.
## 미검증(배포 후 확인)
- 네이버 블로그 글 페이지에서 og:image 가 실제로 나오는지, WordPress/Tumblr 실제 응답 모양.
- 스크롤 끊김이 줄었는지(실기기), 맞춤 피드가 다양해졌는지.
## 보류
- 진단 패널(점수·시간 표시), 화면 밖 이미지 해제, 전역 유사도 재정렬·MMR, 일본 블로그 소스.
## 키
- Tumblr: https://www.tumblr.com/oauth/apps → Consumer Key → Cloudflare 비밀 변수 TUMBLR_KEY.
