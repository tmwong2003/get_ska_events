FROM node:22-bookworm
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci && npx playwright install --with-deps chromium
COPY experimental/scripts/ ./experimental/scripts/
CMD ["node", "experimental/scripts/get-training.mjs", "--month", "12", "--year", "2026", "--fresh-login", "--headless", "--trace-auth"]
