FROM node:buster-slim
RUN apt update && apt -y install python3 && rm -rf /var/lib/apt/lists/*
WORKDIR /usr/src/app
COPY ./package*.json ./
RUN npm ci
COPY . ./
RUN npm run build

CMD ["npm", "run", "start"]
