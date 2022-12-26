FROM python:3.9 AS globewatch-base

WORKDIR /code

COPY ./requirements.txt /code/requirements.txt

RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

COPY ./app /code/app

# Special build for automated testing of the API
FROM globewatch-base AS globewatch-test

COPY ./requirements-dev.txt /code/requirements-dev.txt
RUN pip install -r /code/requirements-dev.txt

# Set python path
ENV PYTHONPATH "${PYTHONPATH}:/code"

# Build Frontend on node
FROM node:18 AS globewatch-frontend

WORKDIR /frontend

# Install Frontend requirements
COPY ./frontend/globewatch/package* ./
RUN npm install

# Copy Frontend source files
COPY ./frontend/globewatch/ ./

# Compile and Minify for Production
RUN npm run build

# Combine this all into a production container
FROM globewatch-base

# Copy the built static files to FastAPI's static serving directory
COPY --from=globewatch-frontend /frontend/dist/ /code/app/static

ENV UVICORN_PORT=8080
ENV UVICORN_HOST="0.0.0.0"
ENTRYPOINT ["uvicorn", "app.main:app"]
