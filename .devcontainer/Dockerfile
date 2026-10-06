FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
    postgresql-client \
  && rm -rf /var/lib/apt/lists/*

ENV BUN_INSTALL=/usr/local/bun
ENV PATH="${BUN_INSTALL}/bin:${PATH}"
RUN curl -fsSL https://bun.sh/install | bash \
  && chmod -R a+rX /usr/local/bun

WORKDIR /workspace
