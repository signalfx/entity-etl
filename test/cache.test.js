/*
 * Copyright (C) 2020 Splunk, Inc. All rights reserved.
 */

const fs = require('fs');
const {describe, it, before} = require('mocha');
const {expect} = require('chai');
const {log} = require('../logger');
const {loadCache, saveCache, updateCache, isNewOrUpdatedEntity, getCacheFilePath} = require('../cache');

describe('cache', () => {

  before(() => {
    log.setLevel('SILENT');
  });

  it('shall return empty cache when cache file does not exist', () => {
    const cache = loadCache('dummy', 'id');
    expect(cache).to.be.ok;
    expect(cache.checkpoint).to.equal(1);
    expect(cache.map).to.be.ok;
    expect(cache.map.size).to.equal(0);
  });

  describe('operations', () => {

    const testStartTime = Date.now();
    const cache = loadCache('t1', 'id');
    const allEntities = [{id: 1, x: 11, updatedOnMs: 10}, {id: 2, x: 12, updatedOnMs: 20}, {id: 3, x: 13, updatedOnMs: 30}];
    const entitiesResponse = {items: allEntities, partialResults: false};

    it('shall save & load cache', () => {
      const entityType = 't1';
      updateCache(cache, entityType, allEntities, entitiesResponse);
      saveCache(cache, entityType);

      try {
        const loadedCache = loadCache(entityType, 'id');
        expect(loadedCache.checkpoint).to.equal(cache.checkpoint);
        expect(loadedCache.map.size).to.equal(cache.map.size);
      } finally {
        fs.unlinkSync(getCacheFilePath(entityType));
      }
    });

    it('shall add entities to cache', () => {
      updateCache(cache, 't1', allEntities, entitiesResponse);

      expect(cache.checkpoint).to.equal(30);
      expect(cache.map.size).to.equal(3);
      expect([...cache.map].map(([k, v]) => [k, v.entity])).to.deep.equal([
        [1, {id: 1, x: 11}],
        [2, {id: 2, x: 12}],
        [3, {id: 3, x: 13}],
      ]);
      [...cache.map.values()].forEach(v => expect(v.ttl).to.be.gte(testStartTime));
    });

    it('shall bump checkpoint by 1ms when partial results are returned and checkpoint stays the same', () => {
      entitiesResponse.partialResults = true;
      updateCache(cache, 't1', allEntities, entitiesResponse);

      expect(cache.checkpoint).to.equal(31);
    });

    it('shall detect new and updated entities', () => {
      updateCache(cache, 't1', allEntities, entitiesResponse);

      const entities = [
        {id: 1, x: 11, updatedOnMs: 11}, // no change, just updatedOnMs changed
        {id: 2, x: 24, updatedOnMs: 21}, // x changed --> updated
        {id: 3, x: 13, updatedOnMs: 30}, // no change at all
        {id: 4, x: 14, updatedOnMs: 40}]; // new entity

      const newOrUpdated = entities.filter(e => isNewOrUpdatedEntity(cache, e));

      expect(newOrUpdated).to.deep.equal([entities[1], entities[3]]);
    });
  });

});
