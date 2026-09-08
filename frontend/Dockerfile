# Build the app once, then serve the compiled, minified output.
# The dev server was ~5x heavier over the wire and recompiled on every request.
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 5173
CMD ["npm", "run", "preview"]
