#Sample Dockerfile for NodeJS Apps

FROM node:24.18.0

ENV NODE_ENV=production

WORKDIR /app

COPY ["package.json", "package-lock.json*", "./"]

RUN npm install --production --dangerously-allow-all-scripts

COPY . .

EXPOSE 8080

CMD [ "node", "index.js" ]