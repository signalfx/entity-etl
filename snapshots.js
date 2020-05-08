/*
 * Copyright (C) 2020 Splunk, Inc. All rights reserved.
 */

const fs = require('fs');
const path = require('path');
const log = require('loglevel');
const isEqual = require('lodash.isequal');
const omit = require('lodash.omit');
const config = require('./config.json');

const SNAPSHOTS_DIR = 'data/snapshots';
const SNAPSHOT_FILE_EXT = '.json';
const SNAPSHOT_FILE_ENCODING = 'utf8';
const IGNORED_PROPS = ['updatedOnMs'];

function loadSnapshot(entityTypeName, entityIdFieldName) {
  const snapshotFilePath = getSnapshotFilePath(entityTypeName);
  let snapshotMap;
  try {
    const data = fs.readFileSync(snapshotFilePath, SNAPSHOT_FILE_ENCODING);
    snapshotMap = new Map(JSON.parse(data));
  } catch (e) {
    log.warn(`Failed to read snapshot file (it's OK during the first run): ${snapshotFilePath}`, e.message);
    snapshotMap = new Map();
  }
  return {idField: entityIdFieldName, map: snapshotMap};
}

function saveSnapshot(snapshot, entityTypeName, newOrUpdatedEntities) {
  addOrUpdateEntities(snapshot, newOrUpdatedEntities);
  const now = Date.now();
  const liveSnapshotValues = [...snapshot.map].filter(([entityId, snapshotEntry]) => snapshotEntry.ttl > now);
  const snapshotFilePath = getSnapshotFilePath(entityTypeName);
  fs.writeFileSync(snapshotFilePath, JSON.stringify(liveSnapshotValues), SNAPSHOT_FILE_ENCODING);
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

module.exports = {loadSnapshot, saveSnapshot, isNewOrUpdatedEntity};
