# AI Workflow v2 - Docker image
# Node.js-based environment for running the TypeScript rewrite

FROM node:20-slim AS base

WORKDIR /workspace

# Install required system packages (git for branch operations, bash for convenience)
# sudo: エージェントが実行時に追加パッケージをインストールできるようにする（Issue #558）
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        git \
        ca-certificates \
        curl \
        jq \
        unzip \
        gnupg \
        sudo \
        python3 \
        python3-pip \
        python3-venv \
        golang-go \
        default-jdk \
        ruby \
        ruby-dev \
    && rm -rf /var/lib/apt/lists/*

# Grant node user passwordless sudo access
# エージェント（node ユーザー）が apt-get 等でパッケージをインストール可能にする
RUN echo 'node ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/node && \
    chmod 0440 /etc/sudoers.d/node

# Install GitHub CLI (gh)
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Install AWS CLI v2 (multi-arch support)
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then \
        AWS_CLI_URL="https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip"; \
    else \
        AWS_CLI_URL="https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip"; \
    fi && \
    curl "$AWS_CLI_URL" -o "awscliv2.zip" && \
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
# Codex CLI install is best-effort to support multi-arch builds (Issue #706)
RUN npm install \
    && (npm install -g @openai/codex@latest || echo "WARNING: Codex CLI install failed (continuing without Codex)") \
    && (codex --version || echo "WARNING: Codex CLI not available on this platform")

# Copy the rest of the source tree (prompts, phases, etc.)
COPY . .

# Build the TypeScript sources (output placed in dist/)
RUN npm run build

# Environment hint for agents
# When true, agents can install additional packages as needed
ENV AGENT_CAN_INSTALL_PACKAGES=true

# Default command opens a shell for interactive usage inside the container.
# The CLI can be executed via `npm start -- <args>` or `node dist/index.js ...`
CMD ["/bin/bash"]
