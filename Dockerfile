FROM nginx:alpine

COPY README.md /usr/share/nginx/html/index.html

EXPOSE 80
