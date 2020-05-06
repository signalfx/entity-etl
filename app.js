/*
 * Copyright (C) 2020 Splunk, Inc. All rights reserved.
 */

const log = require('loglevel');

const {sendHttpRequest} = require('./http');
const {getCheckpoints, updateCheckpoints} = require('./checkpoints');
const {loadTemplates, renderTemplate, COMBINED_OUTPUT_TEMPLATE} = require('./templates');

const config = require('./config.json');

log.setLevel(config.logLevel);

async function main() {
  try {
    const templates = loadTemplates();
    const checkpoints = getCheckpoints();
    const entityTypes = await fetchEntityTypes();

    for (const et of entityTypes) {
      const typeName = et.name;
      if (!templates.has(typeName)) {
        log.warn(`No transform file for "${typeName}" entities. All skipped.`);
        continue;
      }
      const entities = await fetchEntities(typeName, checkpoints[typeName]);
      const transformedEntities = transform(entities, templates.get(typeName));
      await send(transformedEntities, typeName, templates.get(COMBINED_OUTPUT_TEMPLATE));
      updateCheckpoints(typeName, checkpoints, entities);
    }
  } catch (e) {
    log.error('Fatal error.', e);
  }
}

async function fetchEntityTypes() {
  const res = await sendHttpRequest({server: config.sfx.server, path: config.sfx.entitiesTypesEndpoint, headers: config.sfx.headers});
  return res.json();
}

async function fetchEntities(type, checkpoint) {
  const updatedFrom = Number.isInteger(checkpoint) ? checkpoint - config.sfx.checkpointOverlapInSeconds * 1000 : '';
  const pathAndQuery = renderTemplate(config.sfx.entitiesEndpoint, {type, updatedFrom});

  const res = await sendHttpRequest({server: config.sfx.server, path: pathAndQuery, headers: config.sfx.headers});
  const entities = await res.json();

  log.debug(`Fetched ${entities.length} entities.`);
  return entities;
}

function transform(entities, templateFn) {
  return entities.map(entity => templateFn({entity}))
}

async function send(transformedEntities, type, combinedOutputTemplateFn) {
  const pathAndQuery = renderTemplate(config.output.entitiesEndpoint, {type});
  const {method, headers} = config.output;
  const res = await sendHttpRequest({
    method,
    server: config.output.server,
    path: pathAndQuery,
    body: combinedOutputTemplateFn({entities: transformedEntities.slice(0, 23)}),
    headers
  });
  log.debug(`Transformed entities sent successfully (${res.status} ${res.statusText})`);
}

main().then(() => log.debug('All done.'));
