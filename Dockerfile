# syntax=docker/dockerfile:1

FROM mcr.microsoft.com/playwright:v1.62.1-noble AS dependencies

ENV VIRTUAL_ENV=/opt/jupyterlab-codex-status-venv \
    PATH=/opt/jupyterlab-codex-status-venv/bin:$PATH \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /work

RUN apt-get update && \
    apt-get install --no-install-recommends -y python3-venv && \
    rm -rf /var/lib/apt/lists/*

RUN python3 -m venv "$VIRTUAL_ENV" && \
    pip install --no-cache-dir \
      'jupyterlab==4.4.0' \
      'jupyter-server>=2,<3' \
      'jupyter-server-terminals>=0.5,<0.6' \
      'hatchling>=1.26' \
      'hatch-nodejs-version>=0.3.2' \
      'hatch-jupyter-builder>=0.9.1' \
      'psutil>=5.9' \
      'pyte>=0.8.2' \
      'pytest>=8.3' \
      'pytest-asyncio>=0.24' \
      'pytest-cov>=5' \
      'ruff>=0.12' \
      'build>=1.2' \
      'twine>=6'

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --ignore-scripts; else npm install --ignore-scripts; fi

FROM dependencies AS source
COPY . .

FROM source AS test
CMD ["bash", "-c", "python -m pytest -q && ruff check jupyterlab_codex_status tests && npm run test:unit && npm run lint"]

FROM source AS package
CMD ["bash", "scripts/build-package.sh"]
