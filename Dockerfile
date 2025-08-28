FROM node:lts-slim

# ARG https_proxy http://192.168.1.100:7890
# ARG http_proxy http://192.168.1.100:7890

COPY . /app

WORKDIR /app

RUN corepack enable
RUN corepack install -g yarn
RUN yarn install --immutable
RUN yarn build

EXPOSE 3000
CMD ["node", "dist/index.js" ,"--server"]