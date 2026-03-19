# Use the official Node.js image as base
FROM node:20-alpine

# Install ffmpeg and ffprobe (required for video thumbnail generation)
RUN apk add --no-cache ffmpeg

# Set the working directory inside the container
WORKDIR /app

# Copy package files first to install dependencies
COPY package*.json ./

# Install dependencies (including devDependencies for development)
RUN npm install

# Copy the rest of the app files
COPY . .

# Expose the port your app listens on (default for Express is 3000)
EXPOSE 3800

# Start the application (change to npm run stage or similar if needed)
CMD ["npm", "run", "start"]
