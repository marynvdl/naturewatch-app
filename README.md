# Project GlobeWatch App


- [Project GlobeWatch App](#project-globewatch-app)
  - [Required environment variables](#required-environment-variables)
  - [Deployment](#deployment)
    - [Create the app on Fly.io](#create-the-app-on-flyio)
    - [Set required secrets](#set-required-secrets)
    - [Verify Fly.io configuration file](#verify-flyio-configuration-file)
    - [Deploy application](#deploy-application)
  - [Tests](#tests)
  - [Development](#development)
    - [Backend](#backend)
    - [Frontend](#frontend)


## Required environment variables
```bash
APP_xxx = 1234
```

## Deployment

### Create the app on [Fly.io](https://fly.io)

In the root folder with the Dockerfile, execute:

```bash
flyctl apps create globewatch-app
flyctl ips allocate-v4
```

### Set required secrets

Set the required environment variables as Fly.io secrets

```bash
flyctl secrets set -a globewatch-app APP_xxx="1234"
```

### Verify Fly.io configuration file

Then we can create an fly.io configuration file. See `fly.toml` for more details.


### Deploy application

It's [recommended](https://community.fly.io/t/erro-0605-cant-add-file-some-file-to-tar-io-read-write-on-closed-pipe/3513/7) to have `buildkit` enabled. This is the newer, more efficient way to build Docker images. To enable it, just make sure `DOCKER_BUILDKIT` is set to any value in your shell environment:

```bash
export DOCKER_BUILDKIT=true
```


After all this actions you shall be able to deploy the application with next command:

```bash
flyctl deploy
```

This command will automatically build and deploy the docker container with web app, and after that it will launch it in cloud.

## Tests

To run Unit Tests with a coverage report:
```bash
pytest -m unittest --cov=app --cov-report=term-missing app/tests -vv
```

To run Integration tests:
```bash
pytest -m integration -vv app/tests
```

## Development

### Backend

The backend is a python webserver based on FastAPI.

A `.vscode` directory is included for development in VSCode. You can use the launch configurations to run the app.

Here are a few commands to get you started, assuming you are developing in a Linux environment.
```bash
# Make sure you are running Python 3.x
python -V # e.g. returns `Python 3.8.10`

# Create a virtual environment called '.venv'
python -m venv .venv

# Activate the virtual environment
source .venv/bin/activate

# Install the project's development dependencies
pip install -r app/requirements-dev.txt
```

### Frontend

The recommended IDE setup is [Visual Studio Code](https://code.visualstudio.com/) + [Volar extension](https://marketplace.visualstudio.com/items?itemName=Vue.volar).

Make sure you have an up-to-date version of [Node.js](https://nodejs.org/en/) installed:

```bash
node -v && npm -v
# e.g. returns:
# v18.12.1
# 8.19.2
```

Install the dependencies, then run the dev server:
```bash
cd frontend/globewatch
npm install
npm run dev
```


*For future reference, the Vue project was initialised with these commands:*
```bash
npm init vue@latest
cd globewatch
npm install
npm run lint
npm install --save mapbox-gl
npm run dev
```