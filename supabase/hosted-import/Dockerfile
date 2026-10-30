FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        python3 \
        python3-gdal \
        python3-psycopg \
        python3-pyproj \
        python3-shapely \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1

WORKDIR /app
COPY import_wdpa.py /app/import_wdpa.py

CMD ["python3", "-u", "/app/import_wdpa.py"]
