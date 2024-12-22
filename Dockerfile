FROM docker.1panel.live/library/node:lts-slim

COPY . /koishi-registry

WORKDIR /koishi-registry

RUN corepack enable

RUN yarn

EXPOSE 3000

CMD ["yarn", "scan"]