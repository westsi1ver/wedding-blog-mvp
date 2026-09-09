FROM mcr.microsoft.com/playwright:v1.55.0-noble

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY package*.json ./
RUN npm install

COPY . .

RUN ls -la lib

RUN npm run build

EXPOSE 3000

CMD ["sh", "-c", "npm start"]
