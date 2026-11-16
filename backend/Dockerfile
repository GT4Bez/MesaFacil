FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .

EXPOSE 3001

# O volume de node_modules sobrevive ao rebuild da imagem; o install na subida
# o mantém em dia com o bun.lock.
CMD ["sh", "-c", "bun install --frozen-lockfile && bun run dev"]
