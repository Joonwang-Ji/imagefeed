# 이미지피드 — 22차 작업 결과와 23차 인계 (2026-10-30, 최종: Bluesky·Wallhaven 2개)

저장소: https://github.com/Joonwang-Ji/imagefeed (main). 변경 파일을 ZIP(imagefeed-round22.zip)으로 전달 → GitHub 웹에서 같은 경로로 덮어쓰기 업로드(자동 배포). 새 파일: `tests/sources22.test.mjs`, `docs/handoff-round22.md`.
키: Pixabay, Unsplash, 카카오, 네이버, (텀블러). 원칙(바꾸지 말 것): 검색·조회 기록 서버 저장 금지(기기 안 활동 기록만), 공포·잔혹 해제 불가, 선정성 기본 블러, 사용자는 본인과 소수 지인(성인), 기독교 세계관.

## 최종 정리 (같은 날 후속)
- **Flickr 제거**: 무료 계정은 API 키를 받을 수 없음(Flickr 도움말: 키 신청은 Pro 구독자 전용). 관련 코드(소스·트렌드 베스트·주제 칩·가중치·홈 피드)를 모두 뺌.
- **Are.na 제거**: 토큰을 넣고 시험한 결과 ⚠ 에 HTTP 403(사용자 확인). v3 검색은 프리미엄 전용이고 v2 도 무료 계정에는 닫힌 것으로 판단. 관련 코드 모두 제거.
- 남은 새 소스: **Bluesky**(`BSKY_ID`+`BSKY_PASSWORD`), **Wallhaven**(키 없음). 아래 본문의 Flickr·Are.na 항목(변경·키 발급·확인 목록)은 이 결정으로 무효.
- 서비스워커 v23, 테스트 17개 파일 통과(`tests/sources22.test.mjs` 는 Bluesky·Wallhaven·제거 확인만).
- 일반 사진 보강용 대체 소스는 아직 없음(후보: Openverse OAuth 로 한도 올리기 — Openverse 는 Flickr CC 사진도 포함).

## 요청과 결정
- 소스 추가 재개. 목적: 일반 사진 품질 + 감성·트렌디 이미지. 비용: 무료 키 또는 키 없는 소스 위주(네이버·텀블러만큼 무료 크레딧이 넉넉하면 카드 등록도 가능).
- 사용자 선택: Flickr, Are.na, Bluesky, Wallhaven 모두 추가 / 키 가입 안내까지 한 번에.
- 일본 블로그(아메블로·하테나·라이브도어·노트)는 공식 무료 검색 API를 못 찾아 제외(20차에서도 보류). 사용자는 일본어로 검색하지 않으며 한글 검색어는 기존대로 영어로 자동 번역해 영어 소스에 보냄.
- Reddit: 자체 가입 중단(승인 2~4주), 키 없는 .json 403, 10/31 신규 접근 중단 보도 → 제외.
- 텀블러 "아예 안 불러와지는 검색어" 문제는 앞으로도 계속 건너뜀(사용자 결정).

## 22차에서 바뀐 것
- `src/index.js`
  - **Flickr**: `flickr.photos.search`, `safe_search` 1(블러 해제 시 2), 사진만, url_c(800px) 썸네일 → url_l(1024px) 큰 이미지, 기계 태그(taken:·geo:) 제거. 오류는 HTTP 200 `stat:"fail"` 로 와서 ⚠ 사유로 변환(키 오류=denied). 트렌드 ‘베스트’에 최근 30일(`min_upload_date`) 흥미도순 한 번 호출(태그는 날짜별 순환), 주제 칩·내 취향에도 포함.
  - **Are.na**: v2 `search/blocks` + Bearer 토큰, Image 블록만. 링크 블록 화면 캡처 제외.
  - **Bluesky**: `createSession`(앱 비밀번호) → 토큰 1시간 재사용(인스턴스 안), 만료(400/401)면 한 번 재로그인 후 재시도. `searchPosts` 100개씩, 사진이 붙은 글의 첫 사진 한 장, porn/sexual/nudity/graphic-media/gore/self-harm 라벨(글·계정) 제외. 이어 받기는 숫자 offset cursor(미검증).
  - **Wallhaven**: 키 없이 `categories=111&purity=100`(SFW만), 방향 필터는 `ratios`. 분당 45회 제한 → 15분 캐시.
- `public/relevance.js`: 소스별 가중치 배수 — Flickr 한글 0.55/영어 1(고유명사 0.8), Are.na 0.45/0.7, Bluesky 0.45/0.6, Wallhaven 0.4/0.7.
- `public/app.js`: 소스 이름표, 홈 맞춤 피드 소스(`FY_SRC`)에 flickr·arena 추가.
- 서비스워커 v22, README·wrangler.toml 안내 갱신.

## 키·토큰 발급 (Cloudflare → Settings → Runtime variables and secrets, Secret 으로)
- `FLICKR_KEY`: flickr.com/services/apps/create → Apply for a Non-Commercial Key → 앱 이름·용도(개인용 이미지 검색 앱) 입력 → Key 복사(Secret 은 불필요).
- `ARENA_TOKEN`: are.na 가입 → 설정의 개인 액세스 토큰(are.na/developers/personal-access-tokens) 생성 → 토큰 복사.
- `BSKY_ID` + `BSKY_PASSWORD`: bsky.app 가입 → 설정 → Privacy and Security → App Passwords → 새 앱 비밀번호 생성(본 비밀번호 아님). BSKY_ID 는 `내아이디.bsky.social` 형태의 핸들.
- Wallhaven: 키 없음.

## 검증
- 새 `tests/sources22.test.mjs`(설정 노출·locked, Flickr 매핑·오류, Are.na 필터·토큰, Bluesky 로그인 재사용·만료 재시도·라벨 제외·로그인 실패 사유, Wallhaven 매핑·SFW·방향, 베스트 Flickr) 포함 17개 테스트 파일 모두 통과.
- 일부러 Bluesky 라벨 필터를 끄면 해당 테스트가 실패함을 확인.
- **이 환경은 외부 인터넷이 막혀 네 소스 모두 실제 응답은 미확인**(공식 문서·제3자 자료 기준 모의 응답).

## 배포 후 확인할 것
1. 소스 선택 목록에 새 소스가 보이는지(키 없는 것은 설정에서 ‘키를 등록하면 쓸 수 있는 소스’로 보임). 영어 검색어(예: moon)로 각 소스 단독 검색 → ⚠ 사유 확인.
2. Flickr: 사진이 선명한지, 트렌드 ‘베스트’에 Flickr 사진이 섞이는지.
3. Are.na: 서버(Cloudflare) 주소가 방화벽에 막히면 ⚠ 에 denied/403 — 그러면 소스 제거를 권장.
4. Bluesky: 로그인 성공 여부, 2쪽 이후(더 보기)가 이어지는지(offset cursor 가정), 사진 외 불쾌한 이미지가 보이면 제목과 함께 알려 주기(라벨 목록·소스 가중치 조정). 앱 비밀번호 로그인 한도가 있으니 하루 로그인은 몇 번 안 되도록 토큰 재사용 중.
5. Wallhaven: 분당 45회 제한 때문에 ⚠ limit 이 가끔 뜰 수 있음. 일반 사진 검색에는 약함(가중치 낮춤).
6. 전체 소스 검색에서 새 소스가 너무 많거나 적게 섞이는지(`relevance.js bias`, `FLOOR_BIAS`).

## 알려진 한계·조정 포인트
- Flickr 검색 결과는 최대 4,000장(화면의 50쪽 상한 안쪽이라 도달하지 않음).
- Bluesky·Are.na 는 제목·태그가 약해서 관련도 판정이 ‘판단 불가’로 나오는 경우가 많음 → 소스 순위 의존.
- Bluesky 는 SNS 라 개인 얼굴 사진이 섞일 수 있음. Wallhaven 은 SFW 만.
- 텀블러 미해결 항목은 계속 스킵.

## 남은 후보
- 보드 공유 내보내기, 기기 간 북마크 동기화(B1), 내 취향 피드 색·톤 반영, 관심사 이름 편집·고정.
- 실기기 확인 이월: 살색 오탐, 14차 뉴스 필터, 17차 맞춤 피드 품질, 18차 전체화면.
