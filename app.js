/*
 * Copyright (C) 2020 Splunk, Inc. All rights reserved.
 */

const path = require('path');
const {setupLogger, log} = require('./logger');
const {sendHttpRequest} = require('./http');
const {loadCache, saveCache, updateCache, isNewOrUpdatedEntity} = require('./cache');
const {loadTemplates, renderTemplate, COMBINED_OUTPUT_TEMPLATE} = require('./templates');

const config = require('./config.json');

async function main() {
  setupLogger(config.logLevel);
  showUsageIfNeeded();
  try {
    const templates = loadTemplates();
    const entityTypes = await getEntityTypes();

    for (const entityType of entityTypes) {
      const typeName = entityType.name;
      if (!templates.has(typeName)) {
        log.warn(`No template file for ${typeName} entities. All skipped.`);
        continue;
      }
      await handleEntityType(entityType, templates);
    }
  } catch (e) {
    log.error('Fatal error.', e);
  }
}


async function handleEntityType(entityType, templates) {
  const typeName = entityType.name;
  const cache = loadCache(typeName, entityType.uniqueIdField);
  let entitiesResponse;
  do {
    entitiesResponse = await fetchEntities(typeName, cache.checkpoint);
    const newOrUpdatedEntities = entitiesResponse.items.filter(e => isNewOrUpdatedEntity(cache, e));

    log.info(`Fetched ${entitiesResponse.items.length} ${typeName} entities of which ${newOrUpdatedEntities.length} is new or updated.`);

    const transformedEntities = transform(newOrUpdatedEntities, templates.get(typeName));
    await send(transformedEntities, typeName, templates.get(COMBINED_OUTPUT_TEMPLATE));

    updateCache(cache, typeName, newOrUpdatedEntities, entitiesResponse);
    saveCache(cache, typeName);
  } while (entitiesResponse.partialResults);
}

function showUsageIfNeeded() {
  const scriptArgs = process.argv.slice(2);
  if (scriptArgs.some(arg => arg.includes('-h'))) {
    const scriptName = path.basename(process.argv[1]);
    console.log(`Usage: ${scriptName} [entityType1] [...entityTypeN]`);
    console.log(`To process all entity types do not specify any args: ${scriptName}`);
    console.log(`To process selected types only provide a space delimited list: ${scriptName} awsEc2 gce azureVm`);
    process.exit(0);
  }
}

async function getEntityTypes() {
  const scriptArgs = process.argv.slice(2);
  const predicate = scriptArgs.length === 0 ? () => true : et => scriptArgs.includes(et.name);
  const allTypes = await fetchEntityTypes();
  const requestedTypes = allTypes.filter(predicate);
  log.info('Fetching the following entity types:', requestedTypes.map(t => t.name).join(', '));
  return requestedTypes;
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

async function send(entities, type, combinedOutputTemplateFn) {
  if (entities.length === 0) {
    return;
  }
  const pathAndQuery = renderTemplate(config.output.entitiesEndpoint, {type});
  const {method, headers} = config.output;

  const maxBatchSize = config.output.maxBatchSize;
  const batchCount = Math.ceil(entities.length / maxBatchSize);
  log.info(`Got ${entities.length} entity(ies) in ${batchCount} batch(es) to send`);

  for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
    log.debug(`Sending batch ${batchIndex + 1} out of ${batchCount}`);
    const entityBaseIndex =  batchIndex * maxBatchSize;
    const res = await sendHttpRequest({
      method,
      server: config.output.server,
      path: pathAndQuery,
      body: combinedOutputTemplateFn({entities: entities.slice(entityBaseIndex, entityBaseIndex + maxBatchSize)}),
      headers
    });
    await res.text(); // wait for the request to be fully processed
    log.debug(`Batch sent successfully (${res.status} ${res.statusText})`);
  }
}

main().then(() => log.debug('All done.'));
