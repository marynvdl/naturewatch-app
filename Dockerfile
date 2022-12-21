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

# Combine this all into a production container
FROM globewatch-base

ENV UVICORN_PORT=8080
ENV UVICORN_HOST="0.0.0.0"
ENTRYPOINT ["uvicorn", "app.main:app"]
