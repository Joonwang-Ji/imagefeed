# 13차 인계
- 트렌드 주제: 구글 트렌드 KR RSS(`realTrends`) + 규칙 필터(NEWSY/hardBlocked/adult/offTopic) + Workers AI 시각 주제 선별. 실패 시 데이터랩·계절 주제로 폴백. **이 환경은 외부망이 막혀 실제 RSS를 못 받아 봄** → 배포 후 트렌드 칩에 실제 검색어가 나오는지, 연예인·사건이 섞이지 않는지 확인 필요(`REAL_TRENDS_URL` 로 주소 교체 가능).
- 내 취향: g=mine / g=all&mine=a,b,c. 서버는 주제어별 topicPhotos 를 병렬로 받아 번갈아 섞음(`minePhotos`). 클라이언트 `mineTopics()`.
- ☆: 보드 없음 + [보드 선택] 토스트 버튼. toast(t, ms, act).
- Masonry: 이미지 로드 후 비율 확정 시 balLater(), place() 에서 c._m 지정.
- 12차 이월: 살색 오탐 보정은 실기기 확인 대기.
- 후보: 내 취향 피드에 색·톤 반영, 취향 주제어 개수·무작위 비율 조정, 실제 트렌드가 시시하면 AI 선별 프롬프트 조정.
