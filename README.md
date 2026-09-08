# 레몬과 깔라만씨의 · Wedding Blog Assistant

네이버 웨딩스냅/본식스냅 블로그 운영용 내부 MVP입니다.

## 이번 버전 핵심

- 키워드만 입력하면 Playwright가 `m.search.naver.com` 모바일 통합검색을 실제 브라우저로 열어 블로그 글을 위에서부터 최대 7개 자동 수집합니다.
- 자동 수집된 7개 URL의 본문/사진 수/소제목/키워드/구조를 분석합니다.
- 대표 이미지 일부를 Gemini가 함께 참고해 글별 특징과 7개 공통점을 만듭니다.
- 분석 결과는 AI 작성 전략에 자동 입력됩니다.
- 블로그 작성자는 실제 웨딩스냅 메인작가 페르소나를 유지합니다.
- 자동 수집이 실패하면 기존의 수동 URL 1~7위 입력 기능을 fallback으로 사용할 수 있습니다.
- 사진은 저장하지 않습니다.
- Gemini 우선, ChatGPT는 선택 옵션입니다.

## 로컬 실행 (VS Code)

```bash
npm install
npm run playwright:install
npm run dev
```

Windows에서 최초 한 번 `npm run playwright:install`을 실행하면 Chromium 브라우저가 설치됩니다.

`.env.example`을 `.env.local`로 복사하고 키를 입력하세요.

```env
NAVER_API_HUB_CLIENT_ID=
NAVER_API_HUB_CLIENT_SECRET=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.7-flash
GEMINI_FALLBACK_MODELS=gemini-3.6-flash,gemini-3.5-flash-lite
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-luna
DAILY_NAVER_API_LIMIT=50
DAILY_GEMINI_API_LIMIT=50
DAILY_OPENAI_API_LIMIT=50
```

## Render 배포

Playwright/Chromium 때문에 이번 버전은 일반 Node Web Service가 아니라 **Docker 배포**를 사용합니다.

프로젝트 루트에 `Dockerfile`과 `render.yaml`이 포함되어 있습니다. Render에서 Blueprint 또는 Docker Web Service로 연결한 뒤 환경변수만 입력하면 됩니다.

## 실제 검색 자동 수집이 실패할 수 있는 경우

네이버 검색 화면의 DOM 구조 변경, 자동 브라우저 접근 제한, 일시적인 검색 페이지 응답 변화 때문에 Playwright 수집이 실패할 수 있습니다. 이 경우 STEP 1의 `자동 수집이 안 될 때: URL 직접 입력`을 열어 실제 결과 URL을 붙여넣고 분석할 수 있습니다.

자동 수집 결과가 실제 화면과 다르면 자동화 결과를 정답으로 간주하지 말고 수동 URL로 교정하세요. 네이버 통합검색은 시점·환경에 따라 결과 구성이 달라질 수 있습니다.

## Playwright만 먼저 테스트하기

처음 사용하는 경우 웹앱을 실행하기 전에 아래처럼 브라우저 수집만 확인할 수 있습니다.

```bash
npm run test:naver -- "서울웨딩타워 스냅"
```

터미널에 네이버 페이지 제목과 `blog.naver.com` 링크 목록이 나오면 Playwright/Chromium 자체는 정상 동작하는 상태입니다.
