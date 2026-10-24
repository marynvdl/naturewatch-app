# Base image for Python backend
FROM python:3.9 AS naturewatch-base

WORKDIR /code

# Upgrade pip/setuptools and install base dependencies
COPY ./requirements.txt /code/requirements.txt
RUN pip install --no-cache-dir --upgrade pip setuptools \
 && pip install --no-cache-dir -r /code/requirements.txt

# Copy application code
COPY ./app /code/app

# Special build for automated testing of the API
FROM naturewatch-base AS naturewatch-test

COPY ./requirements-dev.txt /code/requirements-dev.txt
RUN pip install -r /code/requirements-dev.txt

# Set python path
ENV PYTHONPATH "${PYTHONPATH}:/code"

# Build Frontend on Node.js
# Tailwind's native package requires Node 20 or newer. Node 18 skips that
# package on ARM, which is what the Fly builder uses.
FROM node:22 AS naturewatch-frontend

# Accept the build argument for PostHog token
ARG VITE_APP_POSTHOG_TOKEN
# Places page. Names only; the values come from the deploy environment.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

WORKDIR /frontend

# Install Frontend requirements
COPY ./frontend/naturewatch/package* ./
RUN npm ci

# Copy Frontend source files
COPY ./frontend/naturewatch/ ./

# The VITE_* values are injected here by Vite during the build.
ENV VITE_APP_POSTHOG_TOKEN=$VITE_APP_POSTHOG_TOKEN
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
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
