FROM golang:1.25-alpine AS build
RUN go install github.com/aabluedragon/dosbox-ipx-server/jsdos-relay@latest

FROM alpine:3.22
COPY --from=build /go/bin/jsdos-relay /usr/local/bin/jsdos-relay
EXPOSE 9001
CMD ["jsdos-relay", "-port", "9001"]
