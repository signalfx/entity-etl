FROM node:12-alpine

RUN mkdir /app
WORKDIR /app

ADD package.json .
ADD package-lock.json .

RUN npm install

COPY . .
COPY crontab /etc/crontabs/root

CMD ["node", "app"]
