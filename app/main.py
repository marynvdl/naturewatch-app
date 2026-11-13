from pathlib import PurePosixPath

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException
import uvicorn


class SpaStaticFiles(StaticFiles):
    """Serve the built frontend, and index.html for app routes such as /signin.

    A missing path with a file extension, such as /assets/x.js, stays a 404.
    """

    async def get_response(self, path, scope):
        try:
            return await super().get_response(path, scope)
        except HTTPException as error:
            if error.status_code != 404 or PurePosixPath(path).suffix:
                raise
            return await super().get_response("index.html", scope)


app = FastAPI()
api = FastAPI(openapi_prefix="/api",
              title="Project NatureWatch",
              description="Project NatureWatch",
              version="0.1.0")


app.mount("/api", api)
app.mount("/", SpaStaticFiles(directory="app/static", html=True, check_dir=False), name="static")


@api.get("/health")
async def health():
    return {"message": "Health OK"}


def main():
    port = 8080
    print(f"Serving API on port {port}")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")


if __name__ == "__main__":
    main()
