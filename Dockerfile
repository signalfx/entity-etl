FROM node:12-alpine

RUN mkdir /app
WORKDIR /app

ADD package.json .
ADD package-lock.json .

RUN npm install

COPY . .

CMD ["node", "app"]
