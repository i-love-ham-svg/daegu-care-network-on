# 대구 통합돌봄네트워크 ON

운영: https://daegu-care.oconia.co.kr/ · GitHub Pages `main /docs`

`src/app.js`와 `src/styles.css`가 서비스 원본이며, `docs`는 배포 결과물이다. 기존 브라우저 데이터 키와 회원사 ID를 유지한다. 개인 후원 내역·관리 화면·로컬 등록 항목에는 공개 공유 주소를 만들지 않는다.

## SNS 썸네일

공유 가능한 모든 화면은 `src/social-covers.json`에 개별 제목, 사진, 출처를 가진다. 실사진을 배경으로 핵심 제목을 크게 표시하며, AI 이미지나 단색 로고 이미지를 공유 썸네일로 사용하지 않는다. 다른 지역·분야의 사진을 참고할 때는 그 맥락을 표시한다. 변경 금지 사진은 가공하지 않는다. 기관 자체 사진을 확보하면 해당 기관의 사진으로 교체한다.

공통·카카오톡·링크드인·X·네이버·밴드·인스타그램 피드·스토리/릴스·유튜브의 9가지 규격을 생성한다. 채널별 이미지는 각 콘텐츠의 공유 창에서 저장할 수 있다. 공개 콘텐츠에는 해시 없는 HTML 주소와 정적인 OG/Twitter 메타 태그를 제공한다. 카카오톡·링크드인·X에는 해당 규격 이미지를 담은 별도 공유 페이지도 제공한다. 인스타그램과 유튜브는 저장한 JPG를 게시물 작성 시 첨부한다.

공유 아이콘의 기본·호버·누름 배경은 항상 투명하게 유지하고 터치 영역과 키보드 초점 표시는 보존한다.

## 빌드와 검증

Node.js와 Pillow가 설치된 Python을 사용한다. Codex의 번들 런타임에도 포함되어 있다.

```text
node scripts/social-catalog.cjs
python scripts/render-social.py
node scripts/build.cjs
node scripts/verify-social.cjs
node scripts/preview.cjs
```

새 콘텐츠 추가 시 `src/social-covers.json`에 제목과 실사진을 먼저 등록한다. 사진 원본은 `docs/media`에 보관하고 앱의 `photoData`에도 출처와 이용 조건을 등록한다. 새 이미지를 생성한 뒤 빌드·검증한다. 점검 결과와 전체 비교 이미지는 `output/verification/social`에 저장한다.

공유 플랫폼이 이전 미리보기를 캐시할 수 있으므로 새 썸네일에는 내용에 따른 파일명을 사용한다. 이미 전송된 SNS 메시지의 캐시 교체와 실제 SNS 게시물 업로드는 별도의 플랫폼 작업이다.

## 참고한 디자인 자료

- [YouTube 공식 썸네일 및 제목 팁](https://support.google.com/youtube/answer/12340300?hl=ko): 정확한 주제, 읽기 쉬운 글자, 단순한 구성.
- [아임웹의 릴스 크리에이터 사례](https://stibee.com/api/v1.0/emails/share/EwfjcJzoQPuy_Lt7WAVVj_HbCuxTuho): 헤로키·독나이프·드브르베의 실제 사진과 짧은 메시지 조합.
- [푸르메재단의 당사자 콘텐츠 사례](https://purme.org/board/story/7788), [굿네이버스 포토에세이](https://www.goodneighbors.kr/2024/photoessay.gn): 실제 경험과 사람을 중심으로 주제를 전하는 표지.

외부 사례의 이미지를 복제하지 않고, 기존 사용자 제공 현장 사진과 출처가 확인된 실제 사례 사진으로 구현했다.
