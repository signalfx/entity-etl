/*
 * Copyright (C) 2020 Splunk, Inc. All rights reserved.
 */

const fs = require('fs');
const path = require('path');
const isEqual = require('lodash.isequal');
const omit = require('lodash.omit');
const config = require('./config.json');
const {log} = require('./logger');

const CACHE_DIR = 'data/cache';
const CACHE_FILE_EXT = '.json';
const CACHE_FILE_ENCODING = 'utf8';

const UPDATED_ON_MS_PROP_NAME = 'updatedOnMs';
const IGNORED_PROPS = [UPDATED_ON_MS_PROP_NAME];
const DEFAULT_CHECKPOINT = 1;

function loadCache(entityTypeName, entityIdFieldName) {
  const cacheFilePath = getCacheFilePath(entityTypeName);
  let cacheMap;
  let checkpoint;
  try {
    const json = fs.readFileSync(cacheFilePath, CACHE_FILE_ENCODING);
    const data = JSON.parse(json);
    cacheMap = new Map(data.items);
    checkpoint = data.checkpoint;
  } catch (e) {
    log.warn('No cache file found or failed to read the file. This should happen only during the first execution of the script.', e.message);
    cacheMap = new Map();
    checkpoint = DEFAULT_CHECKPOINT;
  }
  return {idField: entityIdFieldName, map: cacheMap, checkpoint};
}

function saveCache(cache, entityTypeName) {
  const data = {items: [...cache.map], checkpoint: cache.checkpoint};

  const cacheFilePath = getCacheFilePath(entityTypeName);
  fs.writeFileSync(cacheFilePath, JSON.stringify(data), CACHE_FILE_ENCODING);
}

function updateCache(cache, entityTypeName, newOrUpdatedEntities, entitiesResponse) {
  addOrUpdateEntities(cache, newOrUpdatedEntities);
  const now = Date.now();
  for (let [entityId, cacheItem] of cache.map.entries()) {
    if (cacheItem.ttl < now) {
      cache.map.delete(entityId);
    }
  }
  cache.checkpoint = getCheckpoint(entityTypeName, entitiesResponse, cache.checkpoint);
}

function addOrUpdateEntities(cache, newOrUpdatedEntities) {
  const ttl = getTtl();
  newOrUpdatedEntities
    .map(e => omit(e, IGNORED_PROPS))
    .forEach(entity => {
      const entityId = getEntityId(cache, entity);
      cache.map.set(entityId, {ttl, entity});
    });
}

function isNewOrUpdatedEntity(cache, entity) {
  const entityId = getEntityId(cache, entity);
  if (!entityId) {
    log.debug('Got entity without ID: ', entity);
    return false;
  }
  if (!cache.map.has(entityId)) {
    return true;
  }
  const oldCacheItem = cache.map.get(entityId);
  oldCacheItem.ttl = getTtl();
  return entityHasChanged(oldCacheItem.entity, entity);
}

function entityHasChanged(oldEntity, newEntity) {
  return !isEqual(oldEntity, omit(newEntity, IGNORED_PROPS));
}

function getEntityId(cache, entity) {
  return entity[cache.idField];
}

function getCacheFilePath(entityType) {
  return path.join(CACHE_DIR, entityType + CACHE_FILE_EXT);
}

function getTtl() {
  return Date.now() + config.entitiesCacheTtlInHours * 60 * 60 * 1000;
}

function getCheckpoint(entityTypeName, entitiesResponse, prevCheckpoint) {
  const entities = entitiesResponse.items;
  if (!Array.isArray(entities) || (entities.length === 0)) {
    log.debug(`Cannot update checkpoint for ${entityTypeName} type as no entities were found.`);
    return prevCheckpoint;
  }

  let newCheckpoint = entities
    .map(item => item[UPDATED_ON_MS_PROP_NAME])
    .sort((a, b) => b - a)[0];
  if (!Number.isInteger(newCheckpoint)) {
    log.warn(`Cannot update checkpoint for ${entityTypeName} type - ${UPDATED_ON_MS_PROP_NAME} field is missing or invalid.`);
    return prevCheckpoint;
  }

  if (entitiesResponse.partialResults && newCheckpoint === prevCheckpoint) {
    newCheckpoint++;
    log.warn(`Cannot make progress (new checkpoint == previous checkpoint). Bumping new checkpoint by 1ms to ${newCheckpoint}`);
  }
  return newCheckpoint;
}

module.exports = {loadCache, saveCache, updateCache, isNewOrUpdatedEntity, getCacheFilePath};
