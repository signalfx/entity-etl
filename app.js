/*
 * Copyright (C) 2020 Splunk, Inc. All rights reserved.
 */

const log = require('loglevel');

const {sendHttpRequest} = require('./http');
const {loadCheckpoint, saveCheckpoint} = require('./checkpoints');
const {loadSnapshot, saveSnapshot, isNewOrUpdatedEntity} = require('./snapshots');
const {loadTemplates, renderTemplate, COMBINED_OUTPUT_TEMPLATE} = require('./templates');

const config = require('./config.json');

async function main() {
  log.setLevel(config.logLevel);
  try {
    const templates = loadTemplates();
    const entityTypes = await getEntityTypes();

    for (const entityType of entityTypes) {
      const typeName = entityType.name;
      if (!templates.has(typeName)) {
        log.warn(`No template file for ${typeName} entities. All skipped.`);
        continue;
      }
      const checkpoint = loadCheckpoint(typeName);
      const snapshot = loadSnapshot(typeName, entityType.uniqueIdField);

      const entities = await fetchEntities(typeName, checkpoint);
      const newOrUpdatedEntities = entities.filter(e => isNewOrUpdatedEntity(snapshot, e));
      log.debug(`Fetched ${entities.length} ${typeName} entities of which ${newOrUpdatedEntities.length} is new or updated.`);

      const transformedEntities = transform(newOrUpdatedEntities, templates.get(typeName));
      await send(transformedEntities, typeName, templates.get(COMBINED_OUTPUT_TEMPLATE));

      saveSnapshot(snapshot, typeName, newOrUpdatedEntities);
      saveCheckpoint(typeName, entities);
    }
  } catch (e) {
    log.error('Fatal error.', e);
  }
}

async function getEntityTypes() {
  const scriptArgs = process.argv.slice(2);
  const predicate = scriptArgs.length === 0 ? () => true : et => scriptArgs.includes(et.name);
  const entityTypes = await fetchEntityTypes();
  return entityTypes.filter(predicate);
}

async function fetchEntityTypes() {
  const res = await sendHttpRequest({server: config.sfx.server, path: config.sfx.entitiesTypesEndpoint, headers: config.sfx.headers});
  return res.json();
}

async function fetchEntities(type, checkpoint) {
  const updatedFromMs = Number.isInteger(checkpoint) ? checkpoint - config.sfx.checkpointOverlapInSeconds * 1000 : 1;
  const pathAndQuery = renderTemplate(config.sfx.entitiesEndpoint, {type, updatedFromMs});

  const res = await sendHttpRequest({server: config.sfx.server, path: pathAndQuery, headers: config.sfx.headers});
  return res.json();
}

function transform(entities, templateFn) {
  return entities.map(entity => templateFn({entity}))
}

async function send(transformedEntities, type, combinedOutputTemplateFn) {
  if (transformedEntities.length === 0) {
    return;
  }
  const pathAndQuery = renderTemplate(config.output.entitiesEndpoint, {type});
  const {method, headers} = config.output;
  const res = await sendHttpRequest({
    method,
    server: config.output.server,
    path: pathAndQuery,
    body: combinedOutputTemplateFn({entities: transformedEntities}),
    headers
  });
  log.debug(`Transformed entities sent successfully (${res.status} ${res.statusText})`);
}

main().then(() => log.debug('All done.'));
