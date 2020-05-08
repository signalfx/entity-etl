/*
 * Copyright (C) 2020 Splunk, Inc. All rights reserved.
 */

const fetch = require('node-fetch');
const log = require('loglevel');
const url = require('url');

const {renderTemplate} = require('./templates');

async function sendHttpRequest(options) {
  const method = options.method || 'GET';
  const fullUrl = url.resolve(options.server, options.path);
  const headers = renderHeaders(options.headers);
  log.info(`${method} ${fullUrl}`);
  const res = await fetch(fullUrl, {method, headers, body: options.body});
  if (res.ok) {
    return res;
  }
  throw Error(`Failed to ${method} ${fullUrl} - ${res.status} ${res.statusText} ${await res.text()}`);
}

function renderHeaders(headers) {
  const result = {};
  for (const key in headers) {
    result[key] = renderTemplate(headers[key]);
  }
  return result;
}

module.exports = {sendHttpRequest};
