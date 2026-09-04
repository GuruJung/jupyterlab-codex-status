---
feature_id: 20260904-github-private-repository-bootstrap
title: "GitHub private 저장소 연결과 유지보수 기본 설정"
feature_type: standard
current_spec_path: docs/dev-plans/current-spec.md
---

# Tracked Feature Spec

## 요약

현재 Git 이력과 `main` 브랜치를 비공개 GitHub 저장소 `GuruJung/jupyterlab-codex-status`에 게시하고, 이를 로컬 `origin`으로 연결한다. 기존 애플리케이션 동작은 바꾸지 않으며 CI, 의존성 관리, 최소 권한과 보안 설정을 유지보수 가능한 기본 상태로 만든다.

## 요구사항 및 제외 사항

- GitHub 저장소는 `private`, 기본 브랜치는 `main`, 최초 게시 브랜치는 `main`만으로 한다.
- 기존 커밋 이력을 보존하고 로컬 `origin`은 HTTPS URL `https://github.com/GuruJung/jupyterlab-codex-status.git`을 사용한다.
- push와 pull request에서 기존 전체 CI가 실행되며, workflow `GITHUB_TOKEN` 권한은 `contents: read`로 제한한다.
- npm, Python, GitHub Actions 의존성을 주 1회 점검하도록 Dependabot을 구성하고 vulnerability alerts와 automated security fixes를 활성화한다. Dependabot은 기본 브랜치의 `.github/dependabot.yml`로 관리한다. ([GitHub Dependabot 문서](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/configure-version-updates))
- 저장소 설명과 topics를 설정하고 Issues는 활성화한다. 중복 문서 기능인 Wiki·Projects·Discussions는 비활성화하며 PR 병합 후 브랜치 자동 삭제를 활성화한다.
- 애플리케이션 API, 패키지 동작, 버전, 배포 산출물에는 변화가 없다.
- 릴리스/태그 생성, PyPI·GitHub Packages 게시, Pages, collaborator 추가, PR·이슈 템플릿, CODEOWNERS, 로컬 feature 브랜치 게시, 공개 저장소 전환은 제외한다.
- GitHub Free 개인 계정의 private 저장소에는 ruleset 강제를 적용하지 않는다. 현재 플랜에서 private ruleset은 지원되지 않는다. ([GitHub ruleset 지원 범위](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets))
- 대상 저장소나 `origin`이 실행 시점에 예상과 다르게 존재하면 덮어쓰지 않고 중단한다. 원격 생성 후 후속 단계가 실패하면 저장소를 자동 삭제하지 않고 안전하게 재개한다.

## Current Spec Impact

**Add** — `docs/dev-plans/current-spec.md`에 다음 현재 의도를 한국어로 추가한다.

- 프로젝트의 canonical GitHub 원격은 private `GuruJung/jupyterlab-codex-status`이며 기본 브랜치는 `main`이다.
- push/PR CI, 최소 권한 Actions, 주간 Dependabot과 GitHub 의존성 보안 설정을 유지한다.
- 기존 Codex 상태 판정 의도와 제품 동작은 변경하지 않는다.

현재 문서가 이미 한국어이므로 유지된 내용은 의미와 언어를 그대로 보존한다.

## 사용자 결정

- **공개 범위:** GitHub 저장소를 private으로 만든다. 별도 이유는 제시하지 않았다.
- **저장소 이름:** `jupyterlab-codex-status`를 선택했다. 별도 이유는 제시하지 않았다.
- **정비 수준:** CI 보안 강화, Dependabot, 기본 보안·저장소 설정을 포함하는 “유지보수 기본형”을 선택했다. 별도 이유는 제시하지 않았다.
- **브랜치 게시:** 최초에는 `main`만 게시한다. 별도 이유는 제시하지 않았다.
- **인증 작업 위치:** GitHub 로그인 상태를 샌드박스 내부에서 확정할 수 없으므로 GitHub 인증·네트워크 작업은 샌드박스 밖에서 수행하도록 요청했다.

## 인수 조건

1. `GuruJung/jupyterlab-codex-status`가 private 저장소이며 기본 브랜치가 `main`이다.
2. `origin`이 해당 HTTPS URL을 가리키고 원격 `main`의 SHA가 통합된 로컬 `main`과 같다.
3. 사용자 소유의 과거 feature 브랜치는 최초 원격 게시 대상에 포함되지 않는다.
4. push로 시작된 CI의 Compose validation과 전체 compatibility matrix가 모두 성공한다.
5. Actions 기본 권한과 workflow 권한이 read-only이고, 외부 Action은 검증된 전체 commit SHA로 고정된다.
6. Dependabot이 npm, pip, github-actions 생태계를 주간 점검하도록 구성된다.
7. vulnerability alerts와 automated security fixes가 활성화된다.
8. 비밀 키·GitHub token 등 고신뢰 자격 증명 패턴이 추적 파일이나 게시할 전체 이력에서 발견되지 않는다.
9. 애플리케이션 코드, 공개 API, 패키지 버전과 런타임 동작은 변경되지 않는다.
