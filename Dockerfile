FROM docker.1panel.live/library/node:lts-slim

WORKDIR /app

COPY package.json yarn.lock src/

RUN yarn

COPY . .

EXPOSE 3000

CMD ["yarn", "start"]