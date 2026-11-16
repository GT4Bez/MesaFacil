FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .

EXPOSE 5173

# O volume de node_modules sobrevive ao rebuild da imagem; o install na subida
# o mantém em dia com o bun.lock. --host expõe o Vite fora do container.
CMD ["sh", "-c", "bun install --frozen-lockfile && bun run dev --host 0.0.0.0"]
