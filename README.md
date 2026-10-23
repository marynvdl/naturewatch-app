# Nature Watch app

Map interface for Nature Watch. Data processing lives in [`marynvdl/naturewatch-analysis`](https://github.com/marynvdl/naturewatch-analysis). How the two fit together is the [blueprint](docs/blueprint.md).

| Read this | For |
| --- | --- |
| [Using the map](docs/user/using-the-map.md) | What the timeline, colours, and year fallback do |
| [Data notes](docs/user/data.md) | What each published layer shows, and its limits |
| [Blueprint](docs/blueprint.md) | Database tables, bucket paths, and how the app reads layers |
| [Sooty Earth roadmap](docs/sooty-earth-roadmap.md) | Agreed steps for the next release. The public site stays on `main` until that release is requested |

## Development workflow

Create `feature/…` and `bugfix/…` branches from `develop`, and merge them back with a pull request.

A release is a pull request from `develop` into `main`. Tag the GitHub release from `main`, then open a pull request that syncs that merge commit back into `develop`. The latest tagged release is v1.1.3.

Pushing to `develop` deploys the Fly app `naturewatch`. Pushing to `main` deploys `naturewatch-demo` (naturewatch.space). Both deploys run only after the Test suite in [`.github/workflows/fly.yml`](.github/workflows/fly.yml). `fly.toml` names the test app; the production app name is only in the workflow.

## Tests

Backend tests run from the repository root, with the dependencies in `requirements-dev.txt` (there is no `app/requirements-dev.txt`):

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
pytest -m unittest --cov=app --cov-report=term-missing app/tests -vv
pytest -m integration -vv app/tests
```

The GitHub workflow runs those pytest commands inside Docker (`docker compose up -d --build`, service `naturewatch-test`), then the catalog tests:

```bash
cd frontend/naturewatch
npm ci
npx vitest run src/catalog
```

## Frontend

Needs Node.js 18.14.2 or newer (`engines` in `frontend/naturewatch/package.json`).

```bash
cd frontend/naturewatch
npm install
npm run dev
```

Copy `frontend/naturewatch/.env.example` to `.env` in that folder. The places page reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Leave them blank and the page says the store is not configured. Do not commit the anon key, and do not put the service-role key in the frontend.

Use `http://localhost` for the dev server. The tile bucket’s browser rules allow that host.

| Command | Script |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run clean` | Clear the Vite cache |
| `npm run type-check` | `vue-tsc` |
| `npm run lint` | ESLint and Prettier |
| `npm run lint:style` | Stylelint and Prettier |
| `npm run test:unit` | Vitest |
| `npm run test:coverage` | Vitest with coverage |
| `npm run build` | Type-check and production build |
| `npm run build-only` | Production build without the type-check |
| `npm run build:analyze` | Bundle analyzer |
| `npm run build:clean` | Delete `dist` |
| `npm run preview` | Serve the production build |

There is no `npm test` or `npm run coverage` script.

## Backend

FastAPI (`app/main.py`). A `.vscode` launch configuration is included. Dependabot opens weekly npm pull requests against `develop`.

## Analysis docs

Fire export and tile steps are documented in the analysis repository (`gee/README.md` and `README.md` on its `main` branch). As of `ec9746c`, `README.md` still says to create fire GeoTIFFs with `fire_exportFirms.ipynb`, while `gee/README.md` and `gee/fire/export_fire.py` are the export that the Fire export workflow runs. This checkout of the analysis repo is not `main`, so that README was not edited here.
