# 현재 시스템 명세

## 문서 범위

이 문서는 durable feature spec 체계에서 새로 결정된 현재 시스템 의도만 권위 있는 내용으로 기록한다. 이 체계 도입 이전의 제품 의도는 추정하거나 소급해 기술하지 않는다.

## Codex 사용자 입력 대기 판정

- 기본 Codex 상태 detector는 변경하지 않은 Herdr vendor manifest와 프로젝트 소유 supplemental manifest의 규칙을 priority 순으로 함께 평가한다.
- 명시적으로 custom manifest를 주입한 detector는 주입된 규칙만 평가한다.
- 마지막 프롬프트 마커 이후 유효 영역에서 대소문자를 구분하지 않고 선행 공백을 허용해 줄 시작의 `Press enter to confirm`을 발견하면, suffix와 OSC idle/working 제목에 관계없이 `blocked`로 판정한다.
- 과거 출력, 줄 중간의 같은 문구, transcript viewer의 `q to quit` 화면은 이 supplemental blocker로 판정하지 않는다.
- supplemental manifest를 읽거나 파싱하지 못하면 vendor-only 동작으로 fallback하지 않고 명시적으로 실패한다.

결정 근거와 인수 조건은 [feature spec](specs/20260830-detect-confirm-prompts-as-blocked/spec.md)에 기록되어 있다.
