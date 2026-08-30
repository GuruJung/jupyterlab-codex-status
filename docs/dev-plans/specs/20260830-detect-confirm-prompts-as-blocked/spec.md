---
feature_id: 20260830-detect-confirm-prompts-as-blocked
title: Press enter to confirm 선택 화면 blocked 판정
feature_type: standard
current_spec_path: docs/dev-plans/current-spec.md
---

# Tracked Feature Spec

## 목적

Codex가 선택 확인 화면에서 사용자 입력을 기다릴 때 JupyterLab 터미널 상태를 `blocked`로 판정한다. 특히 화면의 유효 영역에 `Press enter to confirm`으로 시작하는 줄이 있으면, OSC 제목이 작업 중 또는 유휴 상태를 나타내더라도 사용자 입력 대기 상태가 우선해야 한다.

## 사용자 결정

- 화면의 마지막 프롬프트 마커 이후 영역에서, 대소문자를 구분하지 않고 줄 시작의 공백을 허용한 `Press enter to confirm` 문구를 감지한다.
- 해당 줄의 뒤쪽 문구는 판정 조건에 포함하지 않는다. 따라서 `or esc to go back` 등 suffix가 달라져도 `blocked`로 판정한다.
- 과거 출력이나 줄 중간에 등장한 같은 문구는 blocker로 판정하지 않는다.
- transcript viewer의 `q to quit` 화면은 기존 skip 동작을 유지한다.
- Herdr에서 vendoring한 `codex.toml`은 바이트 단위로 유지하고, 프로젝트 소유 supplemental 규칙으로 기능을 확장한다.
- 기본 detector는 vendor 규칙과 supplemental 규칙을 결합하지만, 명시적으로 custom manifest를 주입한 detector에는 supplemental 규칙을 자동으로 섞지 않는다.
- supplemental 규칙 파일의 로드 또는 파싱 실패는 숨기거나 vendor-only로 fallback하지 않고 명시적인 오류로 드러낸다.
- 이 변경은 코드에만 통합한다. 현재 실제 JupyterLab 환경에는 새 버전을 설치하지 않고 서버도 재시작하지 않는다.

## 의미적 인수 조건

1. 마지막 프롬프트 마커 이후 유효 영역에 줄 시작 기준 `Press enter to confirm`이 있으면 상태가 `blocked`다.
2. 판정은 대소문자를 구분하지 않고 선행 공백을 허용하며, 뒤따르는 문구 유무나 내용에 의존하지 않는다.
3. 같은 문구가 줄 중간에 있거나 마지막 프롬프트 마커 이전의 과거 출력에만 있으면 `blocked`로 오판하지 않는다.
4. transcript viewer의 `q to quit` 화면은 기존 skip 판정을 유지한다.
5. 실제 입력 blocker 판정은 OSC 기반 working/idle 판정보다 우선한다.
6. 기본 detector만 supplemental 규칙을 사용하고, 명시적으로 주입된 custom manifest의 동작은 격리된다.
7. supplemental 규칙을 읽거나 파싱할 수 없으면 detector 초기화 또는 로드가 명시적으로 실패한다.
8. 배포 wheel에는 supplemental 규칙이 포함되며, vendor manifest 버전과 내용은 기존 상태를 유지한다.
9. 영어와 한국어 README에 vendor 규칙을 보존하면서 프로젝트 supplemental 규칙을 적용한다는 구조가 설명된다.
10. 패키지 버전은 `0.1.3`으로 일관되게 갱신된다.
11. 빌드와 검증은 기존 Docker Compose 워크플로에서 성공한다.
12. 코드 통합과 배포 산출물 export까지만 수행하며, 실제 JupyterLab 설치 버전과 실행 중인 서버는 변경하지 않는다.

## Current Spec Impact

`docs/dev-plans/current-spec.md`가 아직 없으므로 구현 브랜치에서 최초 생성한다. 이 기능에 관한 현재 시스템 의도만 기록하며, 기존 제품 동작에 대한 별도의 의도는 추정하거나 소급 작성하지 않는다.
