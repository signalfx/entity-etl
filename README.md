# SignalFx Entity ETL

The SignalFx Entity ETL is a Node.js script used to:
 * extract entities like VMs, databases, load balancers, etc. from SignalFx
 * transform them into a format suitable for a target system
 * load transformed entities to the target system using HTTP requests

## Configuration Parameters

Here's a sample configuration file.

```$json
{
  "logLevel": "debug",
  "sfx": {
    "server": "https://api.signalfx.com",
    "headers": {
      "X-SF-TOKEN": "{{env.SIGNALFX_AUTH_TOKEN}}"
    },
    "entitiesTypesEndpoint": "/v2/entities/types",
    "entitiesEndpoint": "/v2/entities?type={{type}}&updatedFromMs={{updatedFromMs}}"
  },
  "output": {
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

| Parameter | Description |
| :--- | :--- |
| `logLevel` | Specifies script's log level |

## Cache

TBD

## Templates

TBD