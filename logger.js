/*
 * Copyright (C) 2020 Splunk, Inc. All rights reserved.
 */

const log = require('loglevel');

const LOG_LEVEL_NAME_MIN_LENGTH = 6;
const LOG_LEVEL_NAME_MAX_LENGTH = 6;

function setupLogger(logLevel) {
  log.setLevel(logLevel);
  installPrefixPlugin();
}

function installPrefixPlugin() {
  const originalFactory = log.methodFactory;
  log.methodFactory = function (methodName, logLevel, loggerName) {
    const rawMethod = originalFactory(methodName, logLevel, loggerName);
    const levelName = methodName.toUpperCase().padEnd(LOG_LEVEL_NAME_MIN_LENGTH).substring(0, LOG_LEVEL_NAME_MAX_LENGTH);

    return function () {
      const messages = [new Date().toISOString(), levelName, ...arguments];
      rawMethod.apply(undefined, messages);
    };
  };
  log.setLevel(log.getLevel());
}

module.exports = {setupLogger, log};
