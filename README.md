# cdn-node-checker

Check CDN nodes and update AliDNS records.

## How to use

Build a Docker image from the given Dockerfile and run the container with `config.yaml` mounted on `/usr/src/app/config.yaml`.

A prebuilt docker image could be found at `nanahira/cdn-node-checker` at DockerHub or `git-registry.mycard.moe/nanahira/cdn-node-checker` at MyCard Git.

**Important: Make sure to use public DNS in the container.** You may want to use the `dns: 114.114.114.114` option in `docker-compose.yml` file.
