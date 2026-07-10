'use strict';
const { applyWarm }    = require('./warm');
const { applyCool }    = require('./cool');
const { applyVibrant } = require('./vibrant');
const { applyMatte }   = require('./matte');
const { applyNatural } = require('./natural');

const FILTERS = { warm: applyWarm, cool: applyCool, vibrant: applyVibrant, matte: applyMatte, natural: applyNatural };

function applyFilter(pipeline, filterName) {
  const fn = FILTERS[filterName] || FILTERS.natural;
  return fn(pipeline);
}

module.exports = { applyFilter, FILTER_NAMES: Object.keys(FILTERS) };
