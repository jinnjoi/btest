# syntax=docker/dockerfile:1
FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --loglevel verbose

COPY . .

EXPOSE 3000

CMD ["npm", "start"] 