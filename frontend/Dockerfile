FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install

COPY . .

EXPOSE 5173

# --host expõe o Vite fora do container
CMD ["bun", "run", "dev", "--host", "0.0.0.0"]
