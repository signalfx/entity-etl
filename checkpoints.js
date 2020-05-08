/*
 * Copyright (C) 2020 Splunk, Inc. All rights reserved.
 */

const fs = require('fs');
const path = require('path');
const log = require('loglevel');

const CHECKPOINTS_DIR = 'data/checkpoints';
const CHECKPOINT_FILE_EXT = '.dat';
const CHECKPOINT_FILE_ENCODING = 'utf8';
const UPDATED_ON_MS_PROP_NAME = 'updatedOnMs';

function loadCheckpoint(entityTypeName) {
  const checkpointFilePath = getCheckpointFilePath(entityTypeName);
  try {
    const data = fs.readFileSync(checkpointFilePath, CHECKPOINT_FILE_ENCODING);
    return Number.parseInt(data, 10);
  } catch (e) {
    log.warn(`Failed to read checkpoint file (it's OK during the first run): ${checkpointFilePath}`, e.message);
    return undefined;
  }
}

function saveCheckpoint(entityTypeName, entities) {
  if (!Array.isArray(entities) || (entities.length === 0)) {
    log.debug(`Cannot update checkpoint for ${type} type as no entities were found.`);
    return;
  }

  const checkpoint = entities
    .map(item => item[UPDATED_ON_MS_PROP_NAME])
    .sort((a, b) => b - a)[0];
  if (!Number.isInteger(checkpoint)) {
    log.warn(`Cannot update checkpoint for ${type} type - ${UPDATED_ON_MS_PROP_NAME} field is missing or invalid.`);
    return;
  }

  const checkpointFilePath = getCheckpointFilePath(entityTypeName);
  fs.writeFileSync(checkpointFilePath, checkpoint, CHECKPOINT_FILE_ENCODING);
}

function getCheckpointFilePath(entityTypeName) {
  return path.join(CHECKPOINTS_DIR, entityTypeName + CHECKPOINT_FILE_EXT);
}

module.exports = {loadCheckpoint, saveCheckpoint};
