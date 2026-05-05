import uvicorn

from agent.config import settings


def main() -> None:
    print(f"agent starting on port {settings.port}")
    uvicorn.run("agent.server:app", host="0.0.0.0", port=settings.port, reload=False)


if __name__ == "__main__":
    main()
