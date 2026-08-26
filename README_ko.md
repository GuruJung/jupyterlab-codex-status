# jupyterlab-codex-status

[English](README.md)

`jupyterlab-codex-status`는 JupyterLab이 직접 소유한 터미널에서 실행 중인 Codex CLI 상태를 표시하는 JupyterLab 4 prebuilt 확장입니다. 브라우저 또는 터미널의 `jltitle` 명령으로 서버 메모리에만 유지되는 터미널 이름도 지정할 수 있습니다.

Codex 상태는 다음 세 가지입니다.

- `idle`: Codex가 입력을 기다립니다.
- `working`: Codex가 요청을 처리하고 있습니다.
- `blocked`: 확인이나 사용자 동작이 필요합니다.

Codex가 아닌 터미널은 JupyterLab 기본 아이콘을 유지합니다. 지정 이름과 상태는 터미널 탭과 Running 패널에 표시됩니다. 요청은 겹치지 않게 실행되며 연결 장애가 발생하면 마지막 값을 유지하면서 stale 가능성을 표시합니다.

## 요구사항

- Python 3.10 이상
- JupyterLab 4.4 이상, 5 미만 (`>=4.4,<5`)
- Linux 또는 macOS
- JupyterLab이 설치하는 `jupyter_server_terminals` 0.5.x와 `terminado` 0.18.x

Windows/ConPTY 및 SSH, tmux, 중첩 컨테이너 안에서 실행되는 Codex는 감지하지 않습니다.

## 설치

릴리스가 공개된 뒤에는 PyPI에서 설치합니다.

```bash
python -m pip install jupyterlab-codex-status
```

또는 export한 wheel을 설치합니다.

```bash
python -m pip install dist-export/jupyterlab_codex_status-0.1.0-py3-none-any.whl
```

이 확장을 설치·업데이트·제거한 뒤에는 JupyterLab **서버를 재시작**하고 열린 브라우저 탭을 새로고침해야 합니다. 서버 재시작은 실행 중인 터미널과 커널을 중단할 수 있으므로 적절한 유지보수 시점을 선택하세요. prebuilt 확장이므로 `jupyter lab build`와 개별 커널 재시작은 필요하지 않습니다.

프런트엔드와 서버 확장을 모두 확인합니다.

```bash
jupyter labextension list
jupyter server extension list
```

## 터미널 이름 지정

명령 팔레트 또는 터미널 context menu에서 **Rename Terminal…**을 선택합니다. 빈 값을 제출하면 지정 이름을 지웁니다. 변경은 서버 메모리에만 존재하며 다른 브라우저 세션에도 다음 poll에서 공유됩니다.

터미널에서는 다음 명령으로 전용 OSC sequence를 안전하게 출력합니다.

```bash
jltitle "training job"
jltitle --clear
```

표준 출력이 TTY가 아니면 `jltitle`은 실패합니다. 인증 token 등의 정보는 출력하지 않습니다. 마지막 브라우저 rename 또는 `jltitle` 명령이 우선하며 일반 shell OSC title은 지정 이름을 덮어쓰지 못합니다.

## 설정

JupyterLab Settings Editor에서 **Codex Terminal Status**를 선택합니다. `pollIntervalMs` 기본값은 1000ms이며 500~10000ms 범위를 허용합니다. 실패하면 1, 2, 4, 8, 16, 30초 순으로 간격을 늘리고 성공 즉시 설정한 주기로 돌아옵니다.

## Docker 개발

지원하는 모든 빌드와 자동 테스트는 종료되는 Docker Compose 서비스에서 실행됩니다. 호스트 포트를 공개하거나 저장소 전체를 bind mount하지 않습니다.

```bash
docker compose config
./compose-test.sh
./compose-test.sh smoke-test
./compose-build.sh
./compose-export.sh
```

`compose-test.sh`는 이름이 `-test`로 끝나는 서비스를 찾아 build한 뒤 `docker compose run --rm`으로 실행합니다. 패키지 산출물은 `compose-export.sh`가 `dist-export/`로 복사하기 전까지 override 가능한 `artifacts` named volume에만 보관됩니다. `ARTIFACTS_VOLUME_NAME`으로 공유 또는 격리할 volume 이름을 지정할 수 있습니다.

## 개인정보 및 보안

- API handler는 Jupyter Server 인증, base URL, XSRF 보호를 그대로 사용합니다.
- 확장은 PTY 출력을 읽기 전용으로 관찰하며 입력을 보내거나 터미널 resize 크기 결정에 참여하지 않습니다.
- 터미널 화면 history는 200줄로 제한됩니다. 제목, 화면 내용, 직전 상태는 서버 메모리에만 존재합니다.
- PTY 내용과 제목을 로그, 파일, 외부 네트워크에 기록하지 않습니다.
- 계산 한 번에 process table snapshot 한 번만 사용하며 여러 브라우저 요청은 500ms cache와 단일 in-flight 계산을 공유합니다.
- terminal subsystem이 없거나 호환되지 않으면 Jupyter Server 시작을 막지 않고 API가 HTTP 503을 반환합니다.

상태 표시는 편의 기능이며 보안 경계가 아닙니다. 플랫폼 권한 또는 프로세스 종료 race로 process 정보에 접근하지 못하면 해당 터미널은 unknown/비-Codex 상태로 표시됩니다.

## 제한사항 및 문제 해결

Codex는 이 JupyterLab 서버가 직접 소유한 PTY의 foreground process group이어야 합니다. 명령 문자열에 `codex`가 들어가는 것만으로는 감지하지 않습니다. 상태가 보이지 않으면 다음을 확인하세요.

1. 두 extension list에 enabled 항목이 표시되는지 확인합니다.
2. JupyterLab 서버를 재시작하고 브라우저를 새로고침합니다.
3. SSH, tmux 또는 별도 컨테이너가 아니라 JupyterLab 터미널에서 Codex를 직접 실행했는지 확인합니다.
4. 브라우저 network panel에서 `/jupyterlab-codex-status/api/v1/terminals`를 확인합니다. HTTP 503은 terminal subsystem이 없거나 호환되지 않는다는 뜻입니다.

기본 UI로 복구하려면 패키지를 제거하고 서버를 재시작합니다.

```bash
python -m pip uninstall jupyterlab-codex-status
```

삭제할 영구 저장 데이터나 migration은 없습니다.

## 라이선스 및 귀속

이 프로젝트는 Apache License 2.0으로 배포됩니다. Herdr Codex detection manifest version `2026.08.09.1`을 commit `7ae4b056a0ca478e584fa282c45b528134cc80c9`, Git blob `9169e10848e0b3310e53fbf4e4e66b2817886623`에 고정해 재배포합니다. 자세한 내용은 [NOTICE](NOTICE)를 확인하세요. 이 프로젝트는 OpenAI, Jupyter 또는 Herdr와 제휴하거나 그들의 보증을 받지 않습니다.

