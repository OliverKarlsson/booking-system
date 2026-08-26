FROM node:20.9.0-alpine

RUN mkdir -p /app/node_modules && chown -R node:node /app

WORKDIR /app

COPY --chown=node:node package*.json /app

USER node

RUN npm install

COPY --chown=node:node . .

RUN npm run build

CMD [ "npm", "start" ]
