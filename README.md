# SignalFx Entity ETL

The SignalFx Entity ETL is a Node.js script which performs the following configurable steps:
 * extracts entities like VMs, databases, load balancers, etc. from SignalFx that were added or updated since the last run
 * transforms them into a format suitable for a target system
 * loads transformed entities to the target system using HTTP requests

It is recommended to schedule the script to run in intervals. See [cron](#cron) for details.

## Quick Start

Make sure to update the [config file](config.json) to match the requirements of the target system you want to use. See [Configuration Parameters](#configuration-parameters) below for details.

You can run the script either using Node.js installation on your system or using Docker container.

### Option 1: Using local Node.js installation

Prerequisites:

  * [Node.js](https://nodejs.org) 12.14.x or later installed.

  * Network connectivity to the Node Package Manager (npm) to install script's dependencies (one-time operation).

  * Network connectivity to SignalFx and the target system.

1. Install script's dependencies first.

   `npm install`

2. Run the script using one of the following modes:
   * `node app` -- processes all entity types
   * `node app awsEc2 gce` -- processes specified types only (`awsEc2` and `gce` in this case)

### Option 2: Using Docker

Prerequisites:

  * [Docker](https://docs.docker.com/get-docker/) 19.x+ installed.

  * Network connectivity to Docker Hub to build Docker image with the Entity ETL script.

  * Network connectivity to SignalFx and the target system.

1. Update [config file](config.json) - this is optional; you can provide the updated `config.json` file later too.

2. Build your own Docker image:

   `docker build -t entity-etl .`

3. Run the script in the Docker container:

   `docker run -e SIGNALFX_ACCESS_TOKEN=$TOKEN entity-etl`

   The above example assumes you have updated the `config.json` file before building the Docker image. If you want to provide an updated `config.json` after the image is built you can use the following command:

   `docker run -v $PWD/config.json:/app/config.json -e SIGNALFX_ACCESS_TOKEN=$TOKEN entity-etl`

   You can also specify a list of entity types to process:

   `docker run -v $PWD/config.json:/app/config.json -e SIGNALFX_ACCESS_TOKEN=$TOKEN entity-etl node app awsEc2 gce`

   Finally to ensure the [cached entities](#cache) are not lost when container finishes its work you may mount a volume to keep cache outside of the Docker container:

   ```
   docker run -v $PWD/config.json:/app/config.json -v $PWD/data/cache:/app/data/cache \
   -e SIGNALFX_ACCESS_TOKEN=$TOKEN entity-etl
   ```

## Configuration Parameters

| Parameter | Description | Allowed Values |
| :--- | :--- | :--- |
| `logLevel` | Script's log level. | `trace`, `debug`, `info`, `warn`, `error`, `silent` |
| `sfx.server` | SignalFx API server URL. It is shown on your [profile page](https://docs.signalfx.com/en/latest/getting-started/get-around-ui.html#profile) in SignalFx. | `https://api.<realm>.signalfx.com` |
| `sfx.headers` | List of HTTP headers attached to all requests sent to SignalFx. The `X-SF-TOKEN` is a mandatory header. Refer to the [SignalFx documentation](https://docs.signalfx.com/en/latest/admin-guide/tokens.html#working-with-access-tokens) to check how to obtain the Access Token. | Note it is possible to use environment variables in header values like this: `{{env.MY_SECRET}}` |
| `sfx.entitiesTypesEndpoint` | SignalFx API endpoint used to fetch supported entity types and associated metadata. | `/v2/entities/types` |
| `sfx.entitiesEndpoint` | SignalFx API endpoint used to fetch entities of a given type updated after given time. Please note that `{{placeholder}}` syntax denotes a template. `{{type}}` will be replaced with the actual entity type and `{{updatedFromMs}}` will be replaced with the last known entity update time. It is also possible to use environment variables here, e.g. `{{env.FIXED_UPDATED_FROM_MS}}`. | `/v2/entities?type={{type}}&updatedFromMs={{updatedFromMs}}` |
| `target.method` | Specifies HTTP method used to send transformed entities to a target system. | Any standard [HTTP method](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods) supported by the target system. |
| `target.server` | Target system server URL. | DNS name or IP address of the target system. |
| `target.headers` | List of HTTP headers attached to all requests sent to the target system. | Note it is possible to use environment variables in header values like this: `{{env.MY_SECRET}}` |
| `target.entitiesEndpoint` | Target system API endpoint used to store entities of a given type. Please note that `{{placeholder}}` syntax denotes a template. `{{type}}` will be replaced with the actual entity type and environment variables are replaced with their values here, e.g. `{{env.FIXED_UPDATED_FROM_MS}}`. | Any valid endpoint on the `target.server` that accepts transformed entities as an HTTP request body. |
| `target.maxBatchSize` | Specifies max number of entities sent to the target system in a single HTTP request. | Positive integer. Maximum value is dictated by the target system limits. |
| `entitiesCacheTtlInHours` | Entities fetched from SignalFx are cached so that the script can send only new or updated entities to the target system. This parameter specifies how long entities are kept in the cache. When entities are added, updated or retrieved from cache their TTL is updated. | Any positive integer. Recommended value: 8 hours. |

Here's a sample configuration file.

```json
{
  "logLevel": "info",
  "sfx": {
    "server": "https://api.us1.signalfx.com",
    "headers": {
      "X-SF-TOKEN": "{{env.SIGNALFX_ACCESS_TOKEN}}"
    },
    "entitiesTypesEndpoint": "/v2/entities/types",
    "entitiesEndpoint": "/v2/entities?type={{type}}&updatedFromMs={{updatedFromMs}}"
  },
  "target": {
    "method": "PUT",
    "server": "http://localhost:9090/",
    "headers": {
      "Authentication": "Bearer {{env.MY_SECRET_TOKEN}}",
      "Content-Type": "application/json"
    },
    "entitiesEndpoint": "/sample/{{type}}?jwt={{env.MY_SECRET_TOKEN}}",
    "maxBatchSize": 10000
  },
  "entitiesCacheTtlInHours": 1
}
```

## Cron

You can use tools like `cron` if you want to run the script e.g. every 15 minutes.

1. Use `crontab -e` command to edit your crontab file.
2. Enter the following line to run the script every 15 minutes:

   `*/15 * * * * cd /path/to/the/entity-etl/script && /usr/local/bin/node app > /tmp/entity-etl.log`

Due to [API limitations](#api-limitations) we recommend the script interval of 15 minutes.

## Cache

Entity ETL script stores entities fetched from SignalFx in cache files in the `data/cache` folder. Each entity type uses separate file to store cached values. Those files are maintained by the script. If you want to fetch all entities from SignalFx so that they are all pushed down to the target system feel free to remove all files in the cache folder (just make sure to keep the folder in place).

See `entitiesCacheTtlInHours` parameter description in the [Configuration Parameters](#configuration-parameters) section for additional information.

## Templates

The Entity ETL script uses [Handlebars](https://handlebarsjs.com/) templating language.

The `templates` folder contains several template files used to convert entities to a format supported by the target system. Each file is used to convert entities of a single type, e.g. `awsEc2.hbs` file is used to convert `awsEc2` entities.

The `targetBody.hbs` is a special template used to combine one or more converted entities into a single HTTP request body sent to the target system.

The provided templates are suitable for ServiceNow CMDB table API. Feel free to adapt them to your requirements.

To see what fields are available for a given entity type inspect the `/v2/entities` endpoint response. See [Entity API](#entity-api) section for details.

## Entity API

To see the list of supported entity types issue the following request:

`curl -H "X-SF-TOKEN: $SIGNALFX_ACCESS_TOKEN" https://api.us1.signalfx.com/v2/entities/types`

To see what fields are available for a given entity type inspect the response to the following request:

`curl -H "X-SF-TOKEN: $SIGNALFX_ACCESS_TOKEN" https://api.us1.signalfx.com/v2/entities?type=awsRds&updatedFromMs=1`

Note 1: We use the `curl` tool in the above examples. Feel free to use any other HTTP client.

Note 2: You may need to escape (i.e. `\&`) the ampersand character depending on the shell you use.

Note 3: The above examples assume your SignalFx API server is `api.us1.signalfx.com`. The actual value may be different - refer to your [profile page](https://docs.signalfx.com/en/latest/getting-started/get-around-ui.html#profile) in SignalFx to check the API server address.