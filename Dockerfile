FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY pyproject.toml /app/
RUN pip install --no-cache-dir .
COPY . /app

CMD ["uvicorn", "internal.app:app", "--host", "0.0.0.0", "--port", "8000"]
