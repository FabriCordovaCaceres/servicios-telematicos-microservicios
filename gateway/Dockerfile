
FROM node:26-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

EXPOSE 6001

CMD ["npm", "run", "start"]
