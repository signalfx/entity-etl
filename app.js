/*
 * Copyright (C) 2020 Splunk, Inc. All rights reserved.
 */

const {setupLogger, log} = require('./logger');
const {sendHttpRequest} = require('./http');
const {loadSnapshot, saveSnapshot, isNewOrUpdatedEntity} = require('./snapshots');
const {loadTemplates, renderTemplate, COMBINED_OUTPUT_TEMPLATE} = require('./templates');

const config = require('./config.json');

async function main() {
  setupLogger(config.logLevel);
  try {
    const templates = loadTemplates();
    const entityTypes = await getEntityTypes();

    for (const entityType of entityTypes) {
      const typeName = entityType.name;
      if (!templates.has(typeName)) {
        log.warn(`No template file for ${typeName} entities. All skipped.`);
        continue;
      }
      await handleEntityType(entityType, typeName, templates);
    }
  } catch (e) {
    log.error('Fatal error.', e);
  }
}

async function handleEntityType(entityType, typeName, templates) {
  let entitiesResponse;
  do {
    const snapshot = loadSnapshot(typeName, entityType.uniqueIdField);

    entitiesResponse = await fetchEntities(typeName, snapshot.checkpoint);
    const newOrUpdatedEntities = entitiesResponse.items.filter(e => isNewOrUpdatedEntity(snapshot, e));
    log.info(`Fetched ${entitiesResponse.items.length} ${typeName} entities of which ${newOrUpdatedEntities.length} is new or updated.`);

    const transformedEntities = transform(newOrUpdatedEntities, templates.get(typeName));
    await send(transformedEntities, typeName, templates.get(COMBINED_OUTPUT_TEMPLATE));

    saveSnapshot(snapshot, typeName, newOrUpdatedEntities, entitiesResponse);
  } while (entitiesResponse.partialResults);
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
  const updatedFromMs = Number.isInteger(checkpoint) ? checkpoint : 1;
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
