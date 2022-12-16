from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import uvicorn

app = FastAPI()
api = FastAPI(openapi_prefix="/api",
              title="Project GlobeWatch",
              description="Project GlobeWatch",
              version="0.1.0")


app.mount("/api", api)
app.mount("/", StaticFiles(directory="app/static", html=True, check_dir=False), name="static")


@api.get("/health")
async def health():
    return {"message": "Health OK"}


def main():
    port = 8080
    print(f"Serving API on port {port}")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")



if __name__ == "__main__":
    main()
