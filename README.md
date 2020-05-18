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
| `sfx.entitiesEndpoint` | SignalFx API endpoint used to fetch entities of a given type updated after given time. Please note this is a template: `{{type}}` is replaced with actual entity type and `{{updatedFromMs}}` is replaced with last known entity update time. It is also possible to use environment variables here, e.g. `{{env.FIXED_UPDATED_FROM_MS}}`. | `/v2/entities?type={{type}}&updatedFromMs={{updatedFromMs}}` |
| `target.method` | Specifies HTTP method used to send transformed entities to a target system. | Any standard [HTTP method](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods) supported by the target system. |
| `target.server` | Target system server URL. | DNS name or IP address of the target system. |
| `target.headers` | List of HTTP headers attached to all requests sent to the target system. | Note it is possible to use environment variables in header values like this: `{{env.MY_SECRET}}` |
| `target.entitiesEndpoint` | Target system API endpoint used to store entities of a given type. Please note this is a template: `{{type}}` is replaced with actual entity type and environment variables are replaced with their values here, e.g. `{{env.FIXED_UPDATED_FROM_MS}}`. | Any valid endpoint on the `target.server` that accepts transformed entities as an HTTP request body. |
| `target.maxBatchSize` | Specifies max number of entities sent to the target system in a single HTTP request. | Any positive integer. |
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

### Usage

To see what fields are available for a given entity type inspect the response to the following request:

`curl -H "X-SF-TOKEN: $SIGNALFX_ACCESS_TOKEN" https://api.us1.signalfx.com/v2/entities/types`

To see a list of supported entity types issue the following request:

`curl -H "X-SF-TOKEN: $SIGNALFX_ACCESS_TOKEN" https://api.us1.signalfx.com/v2/entities?type=awsRds&updatedFromMs=1589782151936&updatedToMs=1589792151936`

Supported query parameters:
* `type` - required. Examples: awsEC2, azureVm. Complete list of currently supported types is returned by `/entities/types` endpoint.
* `updatedToMs` - optional. Default: current time in milliseconds.
* `updatedFromMs` - optional. Default: current time in milliseconds minus 15 minutes.

Note 1: We use the `curl` tool in the above examples. Feel free to use any other HTTP client.

Note 2: You may need to escape (i.e. `\&`) the ampersand character depending on the shell you use.

Note 3: The above examples assume your SignalFx API server is `api.us1.signalfx.com`. The actual value may be different - refer to your [profile page](https://docs.signalfx.com/en/latest/getting-started/get-around-ui.html#profile) in SignalFx to check the API server address.

### HTTP Responses and troubleshooting
* 200 HTTP OK

Returns the list of entities of requested type and the information if the results are partial. 
In the latter case, the client should repeat the request and specify a narrower time range (sample etl implementation implements this behavior).

Sample response:
```json
{
  "items": [
    {
      "AWSUniqueId": "i-0123456789abcdefg_us-west-2_123456789123",
      "aws_account_id": "123456789123",
       "aws_architecture": "x86_64",
       "aws_availability_zone": "us-west-2c",
       "aws_hypervisor": "xen",
       "aws_image_id": "ami-087c2c50437d0b80d",
       "aws_instance_id": "i-0123456789abcdefg",
       "aws_instance_type": "t3a.medium",
       "aws_launch_time": "Tue Feb 18 18:14:10 UTC 2020",
       "aws_private_dns_name": "ip-111–11-1-11.us-west-2.compute.internal",
       "aws_region": "us-west-2",
       "aws_reservation_id": "r-123456789abcdefg",
       "aws_root_device_type": "ebs",
       "aws_state": "{Code: 80,Name: stopped}",
       "aws_state_reason": "{Code: Client.UserInitiatedShutdown,Message: Client.UserInitiatedShutdown: User initiated shutdown}",
       "aws_tag_Name": "sample-test",
       "updatedOnMs": 1582304819692
     },
     {
       "AWSUniqueId": "i-0123456789abcdefh_us-east-2_123456789123",
       "aws_account_id": "123456789123",
       "aws_architecture": "x86_64",
       "aws_availability_zone": "us-east-2b",
       "aws_hypervisor": "xen",
       "aws_image_id": "ami-0307f7ccf6ea35750",
       "aws_instance_id": "i-123456789abcdefh",
       "aws_instance_type": "c4.large",
       "aws_launch_time": "Fri Mar 22 16:18:01 UTC 2019",
       "aws_private_dns_name": "ip-10-0-100-100.us-east-2.compute.internal",
       "aws_region": "us-east-2",
       "aws_reservation_id": "r-0123456789abcdefh",
       "aws_root_device_type": "ebs",
       "aws_state": "{Code: 16,Name: running}",
       "aws_tag_Name": "Sample ECS host",
       "aws_tag_aws_autoscaling_groupName": "Sample-ecs-host-ECSAutoScalingGroup-ABCDEFGHIJKLM",
       "aws_tag_aws_cloudformation_logical-id": "ECSAutoScalingGroup",
       "aws_tag_aws_cloudformation_stack-id": "arn:aws:cloudformation:us-east-2:123456789123:stack/Sample-ecs-host/abcdefgh-1234-5678-9012-a1b2c3d4e5f6",
       "aws_tag_aws_cloudformation_stack-name": "Sample-ecs-host",
       "updatedOnMs": 1582320323006
     }
    ],
   "partialResults": false
 }

```
* 400 HTTP Bad request

The most likely reason is an unsupported value of a type query parameter.

Sample response:
```json
{
  "code": 400,
  "message": "{\"error\": \"Invalid value of the query param 'type'\""
}
```

* 401 HTTP Unauthorized

The token that has been used to issue the request is invalid. Please note [the difference between User API Token and Access Token](https://github.com/bgola-signalfx/entity-etl).
Valid organization-level access token should be used for the execution of the sample script.
Make sure that the etl script is pointing to the correct [SignalFx realm](https://developers.signalfx.com/#realms-in-endpoints).

Sample response: 

```html
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html;charset=utf-8"/>
  <title>Error 401 Unauthorized</title>
</head>
<body><h2>HTTP ERROR 401 Unauthorized</h2>
<table>
  ...
</table>

</body>
</html>
```

* 403 HTTP Forbidden


The entity API is enabled by SignalFx per customer's request. 
The following message means that the API is not enabled in the current organization. 

```json
{
  "error": "The requested endpoint is not enabled in your organization."
}
```

Please contact SignalFx support for enablement of the feature in the selected organization.

### Limitations
* Please note that the entities data may be available with a delay which is dependent on current load on SignalFx system.
The sample implementation accounts for the delay.
* Depending on the source of the data, the updates of the metadata may be extracted by SignalFx with a delay. 
For example, for sources based on cloud providers' APIs, the usual pull interval is 15 minutes. 
