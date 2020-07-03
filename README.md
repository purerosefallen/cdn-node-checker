# cdn-node-checker

Check CDN nodes and enable/disable AliDNS records when services are available or unavailable.

## How to use

Build a Docker image from the given Dockerfile and run the container with `config.yaml` mounted on `/usr/src/app/config.yaml`.

A prebuilt docker image could be found at `nanahira/cdn-node-checker` at DockerHub or `git-registry.mycard.moe/nanahira/cdn-node-checker` at MyCard Git.

**Important: Make sure to use public DNS in the container.** You may want to use the `dns: 114.114.114.114` option in `docker-compose.yml` file.

## Config example

```yaml
aliyun:
  accessKeyId: "" # Your aliyun access key here.
  accessKeySecret: ""
  endpoint: "https://alidns.aliyuncs.com"
  apiVersion: "2015-01-09"
domain: yuzurisa.com
cdnRecords: # You may add multiple.
  - match: '^cdn-[-a-zA-Z]+$' # The matching domain records for CDN.
    port: 443 # Change this if you are using non-standard ports.
testDomains:
  - ygobbs.com # Testing sources.
  - nanahira.momobako.com
timeout: 10000
retryCount: 3
cronString: "0 * * * * *"

```
