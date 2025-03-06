FROM node:lts
WORKDIR /app
COPY dist/services/rasterfari-tileserver-wms-companion/ /app
# Clear npm cache to avoid "Tracker idealTree already exists" error, then install production dependencies
RUN npm cache clean --force && npm install --production 
EXPOSE 3000
CMD ["node", "main.js"]