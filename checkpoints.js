/*
 * Copyright (C) 2020 Splunk, Inc. All rights reserved.
 */

const fs = require('fs');
const log = require('loglevel');

const CHECKPOINTS_FILE = 'checkpoints.json';
const CHECKPOINTS_FILE_ENCODING = 'utf8';
const UPDATED_ON_MS_PROP_NAME = 'sf_updatedOnMs';

function getCheckpoints() {
  try {
    const data = fs.readFileSync(CHECKPOINTS_FILE, CHECKPOINTS_FILE_ENCODING);
    return JSON.parse(data);
  } catch (e) {
    log.warn(`Failed to read ${CHECKPOINTS_FILE} file.`, e.message);
    return {};
  }
}

function updateCheckpoints(type, checkpoints, entities) {
  if (!Array.isArray(entities) || (entities.length === 0)) {
    log.debug(`Cannot update checkpoint for "${type}" type as no entities were found.`);
    return;
  }
  checkpoints[type] = entities
    .map(item => item[UPDATED_ON_MS_PROP_NAME])
    .sort((a, b) => b - a)[0];
  fs.writeFileSync(CHECKPOINTS_FILE, JSON.stringify(checkpoints, null, 2), CHECKPOINTS_FILE_ENCODING);
}

module.exports = {getCheckpoints, updateCheckpoints};
