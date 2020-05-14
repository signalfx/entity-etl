/*
 * Copyright (C) 2020 Splunk, Inc. All rights reserved.
 */

const fs = require('fs');
const path = require('path');
const handlebars = require('handlebars');
const {log} = require('./logger');

const TEMPLATES_DIR = 'templates';
const TEMPLATE_FILE_ENCODING = 'utf8';

const TARGET_BODY_TEMPLATE = 'targetBody';

function loadTemplates() {
  try {
    const templatesMap = new Map();
    const templateFiles = fs.readdirSync(TEMPLATES_DIR);
    for (const tf of templateFiles) {
      const templateName = path.parse(tf).name;
      templatesMap.set(templateName, loadTemplateFile(tf));
    }
    return templatesMap;
  } catch (e) {
    log.warn(`Failed to load templates.`, e.message);
    throw e;
  }
}

function loadTemplateFile(fileName) {
  log.debug(`Loading template ${fileName}`);
  const template = fs.readFileSync(path.join(TEMPLATES_DIR, fileName), TEMPLATE_FILE_ENCODING);
  return handlebars.compile(template);
}

function renderTemplate(templateText, context) {
  const template = handlebars.compile(templateText);
  const contextWithEnv = Object.assign({}, context, {env: process.env});
  return template(contextWithEnv);
}

module.exports = {TARGET_BODY_TEMPLATE, loadTemplates, renderTemplate};
