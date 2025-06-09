# syntax=docker/dockerfile:1
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1

CMD ["python", "manage.py", "migrate"]
# После миграций запускаем сервер
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"] 