# AI Workflow v2 - Docker image
# Node.js-based environment for running the TypeScript rewrite

FROM node:20-slim AS base

WORKDIR /workspace

# Install required system packages (git for branch operations, bash for convenience)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        git \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

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
