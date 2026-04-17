.PHONY: install dev api web build test check start docker-build docker-up docker-up-proxy docker-down clean

install:
	npm install

dev:
	npm run dev

api:
	npm run dev:api

web:
	npm run dev:web

build:
	npm run build

test:
	npm test

check:
	npm run check

start:
	npm start

docker-build:
	npm run docker:build

docker-up:
	npm run docker:up

docker-up-proxy:
	npm run docker:up:proxy

docker-down:
	npm run docker:down

clean:
	rm -rf dist
