/*
 * Copyright (C) 2020 Splunk, Inc. All rights reserved.
 */

const fs = require('fs');
const {describe, it, before} = require('mocha');
const {expect} = require('chai');
const {log} = require('../logger');
const {TARGET_BODY_TEMPLATE, loadTemplates, renderTemplate} = require('../templates');

describe('templates', () => {

  before(() => {
    log.setLevel('SILENT');
  });

  it('shall load templates', () => {
    const templates = loadTemplates();
    expect(templates).to.be.ok;
    expect(templates.size).to.equal(6);
    expect(templates).to.have.keys([TARGET_BODY_TEMPLATE, 'awsEc2', 'awsRds', 'awsElb', 'azureVm', 'gce']);
  });

  it('shall render pre-loaded template', () => {
    const templates = loadTemplates();
    const entity = {
      aws_arn: 'arn-1',
      AWSUniqueId: 'awsuid-2',
      aws_create_time: '2020-05-12T12:34:56.123Z',
      aws_tag_Name: 'name-3',
      type: "ELB"
    };
    const expectedObject = {
      cmdb_ci: 'arn-1',
      asset: 'awsuid-2',
      install_date: '2020-05-12T12:34:56.123Z',
      name: 'name-3',
      type: 'ELB'
    };
    const templateFn = templates.get('awsElb');
    const json = templateFn({entity});
    expect(JSON.parse(json)).to.deep.equal(expectedObject);
  });

  it('shall render arbitrary template', () => {
    process.env.foo = 'bar';
    expect(renderTemplate('name={{name}}&foo={{env.foo}}', {name: 'snow'})).to.equal('name=snow&foo=bar');
  });

});
