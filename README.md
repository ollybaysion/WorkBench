# WorkBench

이 PC 에서 돌아가는 팀 운영 · 자동화 도구.

운영 명령을 한곳에 정리하고, 반복 업무를 **런북(워크플로우)** 으로 묶어 단계마다 자동화 도구(명령 복사, 템플릿, 체크리스트, 타이머, 링크)를 끼워 넣는 React 단일 페이지 앱입니다.
데이터는 브라우저 IndexedDB에 저장되고, JSON 내보내기/가져오기로 백업과 공유를 합니다.
작업대 카드의 Oracle 조회는 `npm run dev` 가 띄우는 agent-db 가 맡습니다.

## 주요 기능

| 모듈 | 내용 |
| --- | --- |
| 🏠 대시보드 | 진행 중인 런북(진행률), 즐겨찾기 명령 원클릭 복사, 작업대 목록, 최근 런북 실행, 백업 상태 |
| ⌘ 명령어 보관함 | `{{변수}}` 템플릿 명령. 환경 프리셋 값이 자동으로 들어감. 위험도(읽기/변경/파괴) 표시, 실행 전 체크리스트, 파괴적 명령은 모든 체크와 확인을 거쳐야 복사됨, 사용 횟수 기록 |
| 🔁 런북 | 입력 변수와 단계(명령/템플릿/체크리스트/타이머/링크)로 구성. 실행을 시작하면 진행 상황이 저장되고 실행 이력(누가, 언제, 어떤 입력)이 남음. 단계 편집기 포함 |
| 🧰 도구함 | Cron 빌더(한국어 설명), JSON ↔ YAML, Base64/URL, 시간 변환(KST/UTC/US-Pacific), 장애 보고·배포 공지 템플릿(Markdown 복사 · `.md` 받기), 정규식 테스터, UUID/비밀번호 생성기, 텍스트 Diff. 모두 브라우저 안에서만 동작 |
| 📄 치트시트 | vim · grep · sed · awk. 앱에 든 Markdown 을 읽기 전용으로 보여 줌. 절 목차, 코드 블록 복사 |
| ⚙️ 설정 | 사용자 이름, 테마(시스템/라이트/다크), 환경 프리셋(`KEY=value`), JSON 백업·가져오기(병합/교체), 시드 데이터로 초기화 |

- **Ctrl/Cmd + K**: 명령, 런북, 치트시트 통합 검색(커맨드 팔레트)
- **지식 문서**: AKG 가 진실원이다. 장애 보고 · 배포 공지는 도구함에서 Markdown 으로 만들어 AKG 에 올린다
- **환경 전환**: 사이드바에서 dev / staging / production을 고르면 명령과 런북 변수가 바뀜
- **서버 셋업 예시 데이터**: Ubuntu 22.04/24.04 기준 서버 관리 명령, "신규 서버 초기 셋업" 런북과 "서비스 배포 (Docker Compose)" 런북

## 기술 스택

- React 19 + TypeScript(strict) + Vite
- react-router-dom 7 (`HashRouter`. `file://`과 GitHub Pages에서도 라우팅됨)
- Zustand 5 (상태), Dexie 4 (IndexedDB)
- react-markdown + remark-gfm, cronstrue(한국어 로케일), js-yaml
- 린트: oxlint

## 시작하기

```bash
npm install && npm run dev
```

브라우저에서 터미널에 표시된 주소(기본 <http://localhost:5173>)를 엽니다. 처음 실행하면 예시(시드) 데이터가 들어갑니다.

### 빌드

```bash
npm run build      # dist/ 에 정적 파일 생성
npm run preview    # 빌드 결과 미리보기
npm run lint
```

### Oracle 조회 (agent-db)

작업대 카드의 SQL 은 [agent-db-plugin](https://github.com/ollybaysion/agent-db-plugin) 이 Oracle 에서 읽기 전용으로 돌립니다.
`npm run dev` · `npm run preview` 가 agent-db MCP 서버를 자식 프로세스로 띄우고, 화면은 같은 주소의 `/__agentdb/*` 로 SQL 을 넘깁니다.

1. 회사 PC(WSL)는 Windows 쪽 Node 로 agent-db 를 띄웁니다. 기본 명령은 `node.exe C:/tools/agent-db/server.mjs` 입니다.
   다른 명령은 `AGENT_DB_COMMAND` · `AGENT_DB_SERVER` 환경 변수로 바꿉니다.
   예: `AGENT_DB_COMMAND=node AGENT_DB_SERVER=~/work/claude-plugins/agent-db-plugin/dist/server.mjs npm run dev`
2. 설정 › DB 연결 맨 위에서 agent-db 상태와 alias 목록을 확인합니다.
3. 연결마다 **agent-db alias** 를 고르고 **연결 테스트**를 누릅니다. alias 가 없는 연결은 가짜 결과를 씁니다.

- alias · 접속 문자열 · 비밀번호(`passwordEnv`)는 agent-db 의 `connections.json` 이 가집니다. WorkBench 는 alias 이름만 저장합니다.
- 읽기 전용 울타리 · 표 허용/차단 · 감사 기록은 agent-db 가 합니다. 행은 1000 까지 받고, 잘리면 카드에 "N 행에서 잘림"을 보입니다.
- 통로는 같은 출처 화면의 요청만 받습니다(`Origin` 검사 + `x-workbench` 머리). 빌드한 `dist/index.html` 을 파일로 열면 통로가 없어 가짜 결과를 씁니다.
- 변수 띠 값은 글자로 넘어갑니다. DATE 열과 비교할 때는 `TO_DATE(:from, 'YYYY-MM-DD HH24:MI')` 처럼 모양을 적으세요.

`dist/`는 정적 파일만 담고 있어 어디에나 올릴 수 있습니다(GitHub Pages, 사내 웹서버, S3 등).
`base: './'`와 HashRouter를 쓰고 번들을 일반 스크립트(IIFE)로 만들기 때문에 `dist/index.html`을 파일로 바로 열어도 동작합니다.

## 데이터 저장 · 백업 · 팀 공유

- **저장 위치**: 브라우저의 IndexedDB(`workbench` DB). 서버로는 아무것도 보내지 않습니다. 브라우저 데이터를 지우면 함께 지워지므로 정기적으로 백업하세요.
- **백업**: 사이드바 하단 또는 설정의 **JSON 내보내기**를 누르면 `workbench-backup-YYYY-MM-DD.json`이 내려받아지고 마지막 백업 시각이 기록됩니다. 대시보드에서 백업 상태를 확인할 수 있습니다.
- **복원 / 가져오기**: 설정 → **JSON 가져오기**
  - *병합*: 같은 ID는 파일 내용으로 덮어쓰고 나머지는 유지합니다.
  - *교체*: 기존 데이터를 모두 지우고 파일 내용으로 바꿉니다.
- **팀 공유 방법**: 내보낸 JSON을 이 저장소의 `data/` 폴더에 커밋하고, 팀원은 파일을 받아 **가져오기(병합)** 합니다. 변경 이력과 리뷰는 Git으로 관리합니다.
- **시드 데이터**: 첫 실행 때만 들어갑니다. 이미 사용 중인 브라우저에서 새 예시(서버 셋업 등)를 보려면 설정 → **시드 데이터로 초기화**를 누르세요. 기존 데이터는 모두 삭제되니 먼저 백업하세요.

## 폴더 구조

```text
WorkBench/
├─ index.html
├─ vite.config.ts            # base './', IIFE 번들(file:// 지원)
├─ public/favicon.svg
└─ src/
   ├─ main.tsx               # 진입점
   ├─ App.tsx                # HashRouter, 라우트, 초기화, 테마 적용
   ├─ index.css              # 디자인 시스템(라이트/다크 토큰, 컴포넌트 클래스)
   ├─ types.ts               # 엔티티 타입
   ├─ db.ts                  # Dexie 스키마
   ├─ store.ts               # Zustand 스토어(CRUD, 설정, 내보내기/가져오기)
   ├─ lib/
   │  ├─ template.ts         # {{var}} 추출/치환
   │  ├─ util.ts             # 날짜, 복사, 다운로드, 파서
   │  ├─ cheatsheets.ts      # 치트시트 목록(cheatsheets/*.md 를 번들에 넣음)
   │  └─ seed.ts             # 한국어 예시 데이터(서버 셋업 포함)
   ├─ components/
   │  ├─ Layout.tsx          # 사이드바, 환경 선택, 토스트
   │  ├─ CommandPalette.tsx  # Ctrl+K 검색
   │  ├─ Markdown.tsx        # Markdown 렌더링, 코드 복사, 위키 링크
   │  ├─ Topbar.tsx          # 페이지 상단 바, 검색 버튼
   │  ├─ backup.ts           # JSON 백업
   │  └─ vars.ts             # 명령 변수 초기값, 위험도 라벨
   └─ pages/
      ├─ Dashboard.tsx
      ├─ Cheatsheet.tsx
      ├─ Commands.tsx
      ├─ Runbooks.tsx
      ├─ Toolbox.tsx
      └─ Settings.tsx
```
