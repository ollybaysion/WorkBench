---
name: workbench-board
description: WorkBench 작업판을 만들고 고치고, 작업판의 SQL 로 같은 데이터를 다시 조회해 분석한다. 사용자가 "작업판 만들어줘", "이 작업판에 카드 붙여줘", "이 작업판 데이터 분석해줘", "WorkBench 화면에서 보는 데이터"처럼 WorkBench 작업판 · 카드 · 변수를 말할 때 쓴다.
---

# WorkBench 작업판

WorkBench 는 Oracle 조회 카드를 4 열 격자에 놓고 함께 보는 화면이다.

- **작업판**: 카드 배치 · 변수 값 · 조회할 연결 하나를 가진다. 기능 묶음(`group`: TSUM · EVENT · INTERLOCK 같은)에 넣을 수 있다.
- **카드**: SQL 하나와 보기 하나(표 또는 그래프)를 가진다. 같은 카드를 여러 작업판에 올릴 수 있다.
- **변수**: SQL 의 바인드 `:이름` 에 들어갈 값. 작업판마다 따로 저장한다.
- **연결**: agent-db alias 를 가리킨다. 작업판의 조회 카드는 모두 그 연결로 조회한다. alias 가 없는 연결은 화면이 가짜 결과를 쓴다.

## 도구

`workbench` MCP 서버(레포의 `server/mcp.ts`)가 아래 도구를 준다.

| 도구 | 하는 일 |
| --- | --- |
| `list_boards` | 작업판 목록과 화면 링크 |
| `list_connections` | 연결 목록(id · 이름 · alias) |
| `get_board` | 작업판 하나: 변수 · 연결 alias · 카드마다 SQL · 보기 · 바인드 값 |
| `create_board` | 새 작업판. 카드를 순서대로 격자에 붙인다 |
| `add_cards` | 작업판 아래에 카드를 붙인다(새 카드 또는 `card_id` 로 보관함 카드) |
| `update_card` | 카드의 제목 · SQL · 보기 · 고르기 · 한계를 고친다 |
| `update_board` | 작업판의 제목 · 변수 값 · 연결을 바꾼다 |
| `list_snapshots` | 저장한 화면 목록(사람이 "📷 화면 저장" 으로 남긴 것) |
| `get_snapshot` | 저장한 화면 하나: 그때 변수 · 바인드 값 · 카드마다 조회 결과(열 · 행) |

개발 서버(`npm run dev`)가 켜져 있으면 열어 둔 화면이 바뀐 작업판을 바로 보인다.

## 작업판 만들기

1. 사용자에게 무엇을 볼지 묻는다: 설비 · 기간 · 센서 같은 조건, 볼 표 · 그래프.
2. `list_connections` 로 연결을 고른다. alias 가 있는 연결이 실제 DB 다.
3. 카드마다 SQL 을 쓴다. 조건 값은 리터럴 대신 바인드(`:eqp_id`)로 쓴다. 사용자가 변수 띠에서 값을 바꿔 다시 조회한다.
4. `create_board` 를 부른다. `vars` 에 바인드의 처음 값을 넣는다. 넣지 않은 바인드는 빈 값으로 변수 띠에 생긴다. 기능이 맞는 묶음이 `list_boards` 에 있으면 그 `group` 을 쓴다.
5. 돌려받은 `url` 을 사용자에게 준다.

### 카드 모양

```json
{
  "title": "센서 추이",
  "sql": "select ts, snsr_id, value from fdc_trace where eqp_id = :eqp_id and ts >= to_timestamp(:from, 'YYYY-MM-DD HH24:MI:SS') order by ts",
  "chart": { "type": "line", "x": "ts", "y": ["value"], "series": "snsr_id" },
  "picks": [{ "col": "snsr_id", "var": "sensor" }],
  "w": 4,
  "h": 2
}
```

- `chart` 를 빼면 표다.
- 크기: 폭 `w` 1~4(격자는 4 열), 높이 `h` 1~2. 그래프는 폭 2 이상, 추이 그래프는 `w: 4, h: 2` 가 읽기 좋다.
- 열 이름은 대소문자를 가리지 않는다. Oracle 이 `EQP_ID` 로 돌려줘도 `eqp_id` 로 적는다.

### 그래프 종류와 열

| type | x | y | 쓰임 |
| --- | --- | --- | --- |
| `line` · `step` · `area` · `scatter` | 시간 · 숫자 열 | 값 열들 | 추이. `series` 로 선을 나눈다 |
| `bar` · `stacked-bar` | 이름 열 | 값 열들 | 항목별 크기 |
| `histogram` | 아무 열 | 값 열 하나 | 분포 |
| `heatmap` | 가로 이름 열 | `[세로 이름 열, 값 열]` | 웨이퍼 맵 · 설비 × 시간 |
| `box` | 묶음 열 | 값 열 | 묶음별 분포 |
| `stat` | 비움 / 이름 열 / 시간 열 | 값 열들 | 숫자 타일 |

`stat`(숫자 타일)은 x 열에 따라 셋으로 나뉜다.

- **x 비움**: y 열마다 타일 하나. 값은 첫 행. 한 행짜리 요약 쿼리(`select count(*) as lot_cnt, max(status) as status …`)에 쓴다.
- **이름 열**: 행마다 타일 하나. 값이 글자(RUN · FAULT)면 글자를 크게 보인다.
- **시간 열**: 시리즈마다 타일 하나. 마지막 값 · 작은 추이선 · 처음 대비 변화를 보인다.

선 그래프만 쓰는 칸:

- `phase`: 구간 열(STEP 같은). 값이 바뀌는 x 에 세로 선과 이름을 그린다.
- `band`: 강조 구간 열. 값이 있는 x 를 칠한다.
- `focus`: 변수 이름. 그 변수 값과 이름이 같은 시리즈만 진하게, 나머지는 회색으로 깐다.

### 고르기와 한계

- `picks`: 표 행 · 타일 · 히트맵 칸을 누르면 열 `col` 의 값을 변수 `var` 에 넣는다. 다른 카드가 그 변수로 다시 조회한다. 예: 웨이퍼 목록에서 누르면 `:wafer` 가 바뀐다.
- `limits`: 행마다 읽는 관리 한계 열 `lcl` · `ucl` 과 견줄 값 열 `value`. 범위를 넘은 행 · 타일을 표시하고 선 그래프에 선을 그린다.

### 바인드 값

변수 값은 모두 글자로 Oracle 에 간다. 날짜 · 시각 열과 견줄 때는 SQL 에서 바꾼다.

```sql
where ts >= to_timestamp(:from, 'YYYY-MM-DD HH24:MI:SS')
```

형식 글자는 변수 값 모양과 같아야 한다. 맞지 않으면 `ORA-01843 not a valid month` 가 난다.

## 작업판 데이터 분석하기

사람이 "저장한 화면", "아까 본 그 결과"를 말하면 저장한 화면을 쓴다. 다시 조회하지 않으므로 사람이 본 데이터와 같다.

1. `list_snapshots` 로 고른다(`board_id` 로 좁힌다).
2. `get_snapshot` 으로 카드마다 열 · 행을 받는다. 행이 많으면 `card_id` 로 카드 하나씩, `max_rows` 를 늘려 받는다(끝 1000).

저장한 화면이 없으면 다시 조회한다. 열어 둔 화면의 결과는 파일에 남지 않는다.

1. `get_board` 로 작업판을 읽는다.
2. `connection.alias` 를 확인한다. `null` 이면 화면이 가짜 결과를 쓰는 연결이다. 사용자에게 알리고 멈춘다.
3. 카드마다 agent-db MCP 의 `run_query` 에 `db` = `connection.alias`, `sql` = 카드의 `sql`, `binds` = 카드의 `binds` 를 넘긴다. 화면과 같은 행을 받는다(agent-db 의 행 상한 1000).
4. 결과를 분석한다. 더 볼 것이 있으면 `add_cards` 로 작업판에 카드를 붙여 사용자가 화면에서 함께 보게 한다.

## 지켜야 할 것

- 작업판 · 카드를 지우는 도구는 없다. 지우기는 사용자가 화면에서 한다.
- `update_card` 는 그 카드를 올린 모든 작업판에 반영된다. 한 작업판만 바꾸려면 새 카드를 만든다.
- SQL 은 읽기(select)만 쓴다. agent-db 연결은 읽기 전용이다.
- 비밀번호 · 토큰은 다루지 않는다. 접속 정보는 agent-db 의 `connections.json` 이 가진다.

## MCP 서버가 없을 때

저장 폴더(`WORKBENCH_DATA`, 기본 `~/.workbench/data`)의 JSON 파일을 직접 읽는다. 쓰기는 MCP 도구로만 한다(파일 모양 · 격자 규칙을 도구가 지킨다).

- `boards/<id>.json`: `title` · `cells`(`cardId` · `x` · `y` · `w` · `h`) · `vars` · `connId`
- `cards/<id>.json`: `title` · `sql` · `view` · `picks` · `limits`
- `snapshots/<id>.json`: `title` · `boardId` · `vars` · `conn` · `cells` · `cards` · `results`(카드 id → 결과)
- `connections/<id>.json`: `name` · `alias`
