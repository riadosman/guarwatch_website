FROM python:3.11-slim
WORKDIR /app
RUN pip install --no-cache-dir fastapi "uvicorn[standard]" websockets httpx python-dotenv pydantic
COPY relay/ relay/
EXPOSE 8765
CMD ["uvicorn", "relay.main:app", "--host", "0.0.0.0", "--port", "8765"]
