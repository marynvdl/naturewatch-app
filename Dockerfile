# Base image for Python backend
FROM python:3.9 AS naturewatch-base

WORKDIR /code

COPY ./requirements.txt /code/requirements.txt
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt
COPY ./app /code/app

# Special build for automated testing of the API
FROM naturewatch-base AS naturewatch-test

COPY ./requirements-dev.txt /code/requirements-dev.txt
RUN pip install -r /code/requirements-dev.txt

# Set python path
ENV PYTHONPATH "${PYTHONPATH}:/code"

# Build Frontend on Node.js
FROM node:18 AS naturewatch-frontend

# Accept the build argument for PostHog token
ARG VITE_APP_POSTHOG_TOKEN

WORKDIR /frontend

# Install Frontend requirements
COPY ./frontend/naturewatch/package* ./
RUN npm install

# Copy Frontend source files
COPY ./frontend/naturewatch/ ./

# Compile and Minify for Production
# The VITE_APP_POSTHOG_TOKEN will be injected here by Vite during build
RUN npm run build

# Final production image
FROM naturewatch-base

# Copy the built static files to FastAPI's static serving directory
COPY --from=naturewatch-frontend /frontend/dist/ /code/app/static

# Expose the port the app runs on
EXPOSE 8080

# Set the command to run the app
ENV UVICORN_PORT=8080
ENV UVICORN_HOST="0.0.0.0"
ENTRYPOINT ["uvicorn", "app.main:app"]
