FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app

RUN useradd --create-home agent && mkdir -p /data/workspace && chown -R agent /data
USER agent

EXPOSE 8000
CMD ["python", "-m", "app.web"]
