'use strict';

function applyNatural(pipeline) {
  return pipeline
    .normalise()
    .sharpen({ sigma: 0.5 });
}

module.exports = { applyNatural };
