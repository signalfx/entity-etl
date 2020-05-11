/*
 * Copyright (C) 2020 Splunk, Inc. All rights reserved.
 */

const fs = require('fs');
const path = require('path');
const isEqual = require('lodash.isequal');
const omit = require('lodash.omit');
const config = require('./config.json');
const {log} = require('./logger');

const SNAPSHOTS_DIR = 'data/snapshots';
const SNAPSHOT_FILE_EXT = '.json';
const SNAPSHOT_FILE_ENCODING = 'utf8';

const UPDATED_ON_MS_PROP_NAME = 'updatedOnMs';
const IGNORED_PROPS = [UPDATED_ON_MS_PROP_NAME];
const DEFAULT_CHECKPOINT = 1;

function loadSnapshot(entityTypeName, entityIdFieldName) {
  const snapshotFilePath = getSnapshotFilePath(entityTypeName);
  let snapshotMap;
  let checkpoint;
  try {
    const json = fs.readFileSync(snapshotFilePath, SNAPSHOT_FILE_ENCODING);
    const data = JSON.parse(json);
    snapshotMap = new Map(data.items);
    checkpoint = data.checkpoint;
  } catch (e) {
    log.warn(`Failed to read snapshot file (it's OK during the first run): ${snapshotFilePath}`, e.message);
    snapshotMap = new Map();
    checkpoint = DEFAULT_CHECKPOINT;
  }
  return {idField: entityIdFieldName, map: snapshotMap, checkpoint};
}

function saveSnapshot(snapshot, entityTypeName, newOrUpdatedEntities, entitiesResponse) {
  addOrUpdateEntities(snapshot, newOrUpdatedEntities);
  const now = Date.now();
  const liveSnapshotValues = [...snapshot.map].filter(([entityId, snapshotEntry]) => snapshotEntry.ttl > now);
  const checkpoint = getCheckpoint(entityTypeName, entitiesResponse, snapshot.checkpoint);
  const data = {items: liveSnapshotValues, checkpoint: checkpoint};

  const snapshotFilePath = getSnapshotFilePath(entityTypeName);
  fs.writeFileSync(snapshotFilePath, JSON.stringify(data), SNAPSHOT_FILE_ENCODING);
}

function addOrUpdateEntities(snapshot, newOrUpdatedEntities) {
  const ttl = getTtl();
  newOrUpdatedEntities
    .map(e => omit(e, IGNORED_PROPS))
    .forEach(entity => {
      const entityId = getEntityId(snapshot, entity);
      snapshot.map.set(entityId, {ttl, entity});
    });
}

function isNewOrUpdatedEntity(snapshot, entity) {
  const entityId = getEntityId(snapshot, entity);
  if (!entityId) {
    log.warn('Got entity without ID: ', entity);
    return false;
  }
  if (!snapshot.map.has(entityId)) {
    return true;
  }
  const oldSnapshotItem = snapshot.map.get(entityId);
  oldSnapshotItem.ttl = getTtl();
  return entityHasChanged(oldSnapshotItem.entity, entity);
}

function entityHasChanged(oldEntity, newEntity) {
  return !isEqual(oldEntity, omit(newEntity, IGNORED_PROPS));
}

function getEntityId(snapshot, entity) {
  return entity[snapshot.idField];
}

function getSnapshotFilePath(entityType) {
  return path.join(SNAPSHOTS_DIR, entityType + SNAPSHOT_FILE_EXT);
}

function getTtl() {
  return Date.now() + config.entitiesSnapshotTtlInHours * 60 * 60 * 1000;
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

module.exports = {loadSnapshot, saveSnapshot, isNewOrUpdatedEntity};
