# Use Node.js LTS
FROM node:20-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy package files first
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the app
COPY . .

# Expose port
EXPOSE 3008

# Run the server from root app.js
CMD ["node", "app.js"]

