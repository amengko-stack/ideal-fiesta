'use strict';

function applyMatte(pipeline) {
  return pipeline
    .linear(0.85, 15)
    .modulate({ saturation: 0.8 });
}

module.exports = { applyMatte };
