# AI Workflow v2 - Docker image
# Ubuntu-based environment with Node.js 20.x for multi-language support
#
# Issue #177: Docker環境でのパッケージインストール可能化
# - ベースイメージを ubuntu:22.04 に変更（node:20-slim から移行）
# - Node.js 20.x を NodeSource 公式リポジトリからインストール
# - build-essential、sudo をインストール（AIエージェントが多言語環境を構築可能に）

FROM ubuntu:22.04 AS base

WORKDIR /workspace

# 基本パッケージのインストール
# - curl, ca-certificates, gnupg: Node.js リポジトリ追加に必要
# - build-essential: gcc, g++, make, libc-dev を含むビルドツール群
# - sudo: エージェントがパッケージ管理操作を実行可能にする
# - git, jq, unzip: 既存機能で使用
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
        gnupg \
        build-essential \
        sudo \
        git \
        jq \
        unzip \
    && rm -rf /var/lib/apt/lists/*

# Node.js 20.x のインストール（NodeSource 公式リポジトリ）
# NodeSource: Node.js 公式推奨のインストール方法
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Node.js バージョン確認（ビルド時に検証）
RUN node --version && npm --version

# 環境変数の設定
# AGENT_CAN_INSTALL_PACKAGES: エージェントがパッケージインストール可能であることを示すフラグ
# Docker環境では true、ローカル開発環境では未設定（デフォルト: false）
ENV AGENT_CAN_INSTALL_PACKAGES=true

# Install AWS CLI v2
RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" && \
    unzip awscliv2.zip && \
    ./aws/install && \
    rm -rf aws awscliv2.zip

# Install Pulumi CLI
RUN curl -fsSL https://get.pulumi.com | bash && \
    mv /root/.pulumi/bin/* /usr/local/bin/

# Configure Git defaults (used by init/execute commands)
RUN git config --global --add safe.directory '*' && \
    git config --global user.name "AI Workflow Bot" && \
    git config --global user.email "ai-workflow@tielec.local"

# Copy dependency manifests first (leverage Docker layer caching)
COPY package.json tsconfig.json ./

# Install Node dependencies and Codex CLI (used by CodexAgentClient)
RUN npm install \
    && npm install -g @openai/codex

# Copy the rest of the source tree (prompts, phases, etc.)
COPY . .

# Build the TypeScript sources (output placed in dist/)
RUN npm run build

# Default command opens a shell for interactive usage inside the container.
# The CLI can be executed via `npm start -- <args>` or `node dist/index.js ...`
CMD ["/bin/bash"]
