FROM mcr.microsoft.com/playwright:v1.55.0-noble

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY package*.json ./
# TypeScript/@types are devDependencies and are required during next build.
RUN npm install --include=dev

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["sh", "-c", "npm start"]
