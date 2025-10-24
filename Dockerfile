FROM node:20-alpine

# Create app directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY src ./src

# Create data directory
RUN mkdir -p /data

# Expose port
EXPOSE 3000

# Start app
CMD ["node", "src/app.js"]
