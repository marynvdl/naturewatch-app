# Nature Watch app

`marynvdl/naturewatch-app` is the master repository. It holds the web app, the map catalogue, the database schema, and the work parcels. `marynvdl/naturewatch-analysis` publishes rasters and map tiles. It is usually checked out beside this repo at `../naturewatch-analysis`. If it is not, a file there is not available locally.

The app is Vue 3 with TypeScript, Tailwind 4 and reka-ui components (`components.json`), Lucide icons, Pinia, Mapbox GL JS, FastAPI, and Supabase. Do not introduce another UI framework or switch the map away from Mapbox unless the task says to.

## Where a fact lives

Write each fact once.

- `docs/blueprint.md`: database tables, bucket object paths, and how the app reads layers.
- `docs/user/`: what a person using the web app needs. `using-the-map.md` is the controls. `data.md` is what each layer shows and where it stops.
- `docs/parcels/`: the active work. `docs/archive/sooty-earth-roadmap.md` is the 20 October 2026 plan. Steps 1–6 were carried out. Do not add tasks to it.
- `docs/pipelines.md` in naturewatch-analysis: how a dataset becomes published objects, including transformations, cloud costs, and scripts. Do not copy that procedure into this repo.
- `cookbook/recipes/` in naturewatch-analysis: the hand-edited layer catalog. The map reads `frontend/naturewatch/src/catalog/layers.json`. The app does not read STAC.
- The step README in naturewatch-analysis: how to run that step, and what the run cost.
- `README.md` here: the development commands.

## Parcels and tasks

A parcel in `docs/parcels/` lists tasks in order. Each task points at one `docs/tasks/<file>.md` in this repo, for both repos. The task file names the repo that does the work. `/task <file>` starts a task and `/archive-task <file>` files it after merge.

- A task marked for naturewatch-app is done in this repo.
- A task marked for naturewatch-analysis is done in `../naturewatch-analysis`, from this session. Read `../naturewatch-analysis/CLAUDE.md` first and follow it there: branch from `main`, its cost rules, one pull request into `main`. Run git there with `git -C ../naturewatch-analysis`.
- A task that touches both repos gets one branch and one pull request in each. Link each pull request from the other.
- Do the named task only. Do not start the next task until that one is finished.

## Direction

If you are not at least 90% sure which direction to take, ask before doing the work. Ask with a few concrete options, then wait. A small choice inside an agreed direction does not need a question. A file name, matching a pattern already in the repo, and wording are examples.

Plan a task before changing code, and wait for the plan to be approved.

## Secrets

Never commit, push, or paste a key or token. That includes a service-account JSON key, a private key, an API token, a password, and the contents of a GitHub secret or `.env` file. A workflow names a secret as `${{ secrets.SECRET_NAME }}`. A service-account email and a secret's name are identifiers. If a secret value is already in the repo, do not repeat it. Tell the user so it can be rotated.

## Git and releases

Branch from `develop` and merge back through a pull request. `develop` is protected. Do not push commits straight to `develop` or `main`.

`develop` deploys Fly app `naturewatch`. `main` deploys Fly app `naturewatch-demo` (naturewatch.space). Feature work merges into `develop` only. Do not open or merge a pull request from `develop` into `main` until a production release is explicitly requested.

Before a pull request, run the relevant local tests. For catalog or frontend changes, run the catalog vitest suite (`cd frontend/naturewatch && npx vitest run src/catalog`). After opening the pull request, do not wait for GitHub Actions. Report the pull request and the required checks. Do not treat it as ready to merge until those checks have passed.

Do not commit unrelated files. Do not add AI or tool attribution to commits or pull requests.

## Billable work

Inspect workflow triggers before pushing. Explain billable processing, cloud provisioning, or a production deploy and get approval before starting it. After an authorized Earth Engine or Batch submission, record the task id, output, status check, and how to cancel it, then return. Do not wait in the chat for the job.
