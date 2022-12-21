# Project GlobeWatch App

## Required environment variables
```bash
APP_xxx = 1234
```

## Tests

To run Unit Tests with a coverage report:
```bash
pytest -m unittest --cov=app --cov-report=term-missing app/tests -vv
```

To run Integration tests:
```bash
pytest -m integration -vv app/tests
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