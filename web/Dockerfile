# Use specific Node.js version 22.6.0
FROM node:22.6.0-alpine

# Set working directory in container
WORKDIR /app

# Copy package files first (for better caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy ALL other files and folders (except those in .dockerignore)
COPY . .

# Expose the port your Express app runs on
EXPOSE 3000

# Command to start your application
CMD ["npm", "start"]