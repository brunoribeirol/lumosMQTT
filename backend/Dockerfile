FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV MQTT_BROKER="mosquitto"
ENV MQTT_PORT=1883
ENV MQTT_TOPIC_MOTION="lumosMQTT/motion"

EXPOSE 5050

CMD ["python", "app.py"]