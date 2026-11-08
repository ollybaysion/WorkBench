# grep 치트시트

grep 은 파일이나 표준 입력에서 패턴에 맞는 줄을 찾는다.

기본 문법은 BRE 이다. `-E` 를 주면 ERE 를 쓴다. 패턴은 작은따옴표로 감싸서 셸이 건드리지 않게 한다.

## 기본 꼴

```bash
grep [옵션] '패턴' 파일...
cmd | grep '패턴'
grep -rn 'TODO' src/                      # 디렉터리 재귀, 줄 번호
grep -rn --include='*.ts' 'TODO' src/     # ts 파일만
```

## 옵션

| 옵션 | 뜻 |
| --- | --- |
| `-i` | 대소문자 구분 없이 |
| `-v` | 패턴에 맞지 않는 줄 |
| `-n` | 줄 번호 표시 |
| `-c` | 맞는 줄 수만 출력 |
| `-l` `-L` | 맞는 파일 이름만 · 맞지 않는 파일 이름만 |
| `-r` `-R` | 디렉터리 재귀 (`-R` 은 심볼릭 링크도 따라간다) |
| `-w` | 단어 단위로 일치 |
| `-x` | 줄 전체가 일치 |
| `-o` | 일치한 부분만 출력 |
| `-E` | 확장 정규식 ERE |
| `-F` | 정규식 없이 문자열 그대로 |
| `-P` | Perl 정규식 (`\d`, lookahead 등) |
| `-A n` `-B n` `-C n` | 일치 줄의 뒤 · 앞 · 앞뒤 n 줄을 함께 출력 |
| `-h` `-H` | 파일 이름 숨기기 · 항상 표시 |
| `-s` | 파일 없음 · 권한 오류 메시지 숨기기 |
| `-q` | 출력 없이 종료 코드만 (스크립트 조건용) |
| `-m n` | n 번 일치하면 멈춤 |
| `-e 패턴` | 패턴 여럿 지정 (반복 가능) |
| `-f 파일` | 파일의 각 줄을 패턴으로 |
| `--color=auto` | 일치 부분에 색 |
| `--include='*.py'` | 재귀 때 이 이름의 파일만 |
| `--exclude='*.min.js'` | 재귀 때 이 이름의 파일 제외 |
| `--exclude-dir=node_modules` | 재귀 때 이 디렉터리 제외 |

## 정규식 요약

BRE 에서는 `+ ? | ( ) { }` 앞에 `\` 를 붙여야 특수 문자가 된다. ERE(`-E`) 에서는 그대로 쓴다.

| 패턴 | 뜻 |
| --- | --- |
| `.` | 아무 글자 하나 |
| `*` | 앞 항목 0 번 이상 |
| `+` `?` | 앞 항목 1 번 이상 · 0 또는 1 번 (ERE) |
| `{n}` `{n,m}` | 앞 항목 n 번 · n~m 번 (ERE) |
| `^` `$` | 줄 처음 · 줄 끝 |
| `[abc]` `[a-z]` | 글자 집합 · 범위 |
| `[^abc]` | 집합에 없는 글자 |
| `a\|b` | a 또는 b (ERE) |
| `(ab)+` | 묶음 (ERE) |
| `\b` | 단어 경계 |
| `\<` `\>` | 단어 처음 · 단어 끝 |
| `[[:digit:]]` `[[:alpha:]]` | 숫자 · 글자 |
| `[[:space:]]` `[[:upper:]]` | 공백 · 대문자 |
| `\.` `\$` | 특수 문자를 글자 그대로 |

## 자주 쓰는 한 줄

| 명령 | 뜻 |
| --- | --- |
| `grep -n 'error' app.log` | 줄 번호와 함께 찾기 |
| `grep -i -C 3 'error' app.log` | 오류 줄과 앞뒤 3 줄 |
| `grep -rn --include='*.ts' 'TODO' src/` | ts 파일만 재귀로 찾기 |
| `grep -rn --exclude-dir={node_modules,dist} 'API_KEY' .` | 디렉터리를 빼고 찾기 |
| `grep -e 'error' -e 'warn' app.log` | 패턴 여럿 (OR) |
| `grep -E 'error\|warn' app.log` | 같은 일을 ERE 로 |
| `grep 'error' app.log \| grep -v 'debug'` | 포함하고 제외 (AND NOT) |
| `grep -rl 'old_name' src/ \| xargs sed -i 's/old_name/new_name/g'` | 파일 목록을 다음 명령에 넘기기 |
| `grep -rlZ 'x' . \| xargs -0 rm` | 공백이 있는 파일 이름도 안전하게 넘기기 |
| `ps aux \| grep '[n]ginx'` | grep 자신은 결과에서 빠진다 |
| `grep -v '^$' 파일` | 빈 줄 제거 |
| `grep -v '^\s*#' 파일` | 주석 줄 제거 |
| `grep -oE '[0-9]{1,3}(\.[0-9]{1,3}){3}' access.log` | IP 주소만 뽑기 |
| `grep -oE '[0-9]{1,3}(\.[0-9]{1,3}){3}' access.log \| sort \| uniq -c \| sort -rn` | IP 별 개수 |
| `grep -c 'GET' access.log` | 맞는 줄 수 |
| `grep -o 'GET' access.log \| wc -l` | 일치 횟수 (한 줄에 여럿이면 다 센다) |
| `zgrep 'error' app.log.gz` | 압축 파일에서 찾기 |
| `grep -q 'ok' 결과.txt && echo 성공` | 조건 분기 |
| `grep -w 'main' *.c` | 단어 main 만 (domain 은 제외) |
| `grep -P '\d{4}-\d{2}-\d{2}' app.log` | Perl 정규식으로 날짜 |
| `grep -n '' 파일` | 모든 줄에 번호 붙이기 |

## rg(ripgrep) 대응

rg 는 기본으로 재귀이고 .gitignore 를 따른다. 문법은 ERE 와 비슷하다.

| grep | rg |
| --- | --- |
| `grep -rn 'TODO' src/` | `rg 'TODO' src/` (줄 번호는 기본) |
| `grep -rn --include='*.ts' 'x'` | `rg -t ts 'x'` 또는 `rg -g '*.ts' 'x'` |
| `grep -rl 'x'` | `rg -l 'x'` |
| `grep -rin 'x'` | `rg -i 'x'` |
| `grep -F 'a.b'` | `rg -F 'a.b'` |
| `grep -rn 'x' --exclude-dir=dist` | `rg 'x' -g '!dist'` |
| `grep -r 'x' . 2>/dev/null` | `rg --hidden --no-ignore 'x'` (숨김 · 무시 파일 포함) |
