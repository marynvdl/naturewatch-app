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

# Build Frontend on node
FROM node:18 AS naturewatch-frontend

WORKDIR /frontend

# Install Frontend requirements
COPY ./frontend/naturewatch/package* ./
RUN npm install

# Copy Frontend source files
COPY ./frontend/naturewatch/ ./

# Make the build argument available as an environment variable
ENV VITE_APP_POSTHOG_TOKEN $VITE_APP_POSTHOG_TOKEN

# Compile and Minify for Production
RUN npm run build

# Combine this all into a production container
FROM naturewatch-base

# Copy the built static files to FastAPI's static serving directory
COPY --from=naturewatch-frontend /frontend/dist/ /code/app/static

ENV UVICORN_PORT=8080
ENV UVICORN_HOST="0.0.0.0"
ENTRYPOINT ["uvicorn", "app.main:app"]
