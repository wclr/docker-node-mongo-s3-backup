FROM alpine:edge

RUN apk --no-cache add nodejs
RUN apk --no-cache add mongodb-tools 
RUN mkdir -p /aws && \
	apk -Uuv add groff less python py-pip && \
	pip install awscli && \
	apk --purge -v del py-pip && \
	rm /var/cache/apk/*

COPY run.js /run.js

ENTRYPOINT node /run.js
