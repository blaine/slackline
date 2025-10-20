# syntax=docker/dockerfile:1
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Copy project metadata and install dependencies first for better caching
COPY pyproject.toml README.md /app/
COPY src /app/src

RUN pip install .

EXPOSE 8080

CMD ["gunicorn", "slackline.bot:create_flask_app()", "--bind", "0.0.0.0:8080"]
