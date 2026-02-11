FROM docker.io/nginx:stable-alpine
COPY dist/envirometrics/olpe/rainhazardmap/ /usr/share/nginx/html/
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
