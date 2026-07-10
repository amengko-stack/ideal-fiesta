'use strict';

function applyWarm(pipeline) {
  return pipeline
    .modulate({ brightness: 1.05, saturation: 1.15 })
    .recomb([
      [1.10,  0.05,  0.00],
      [0.00,  1.00,  0.00],
      [-0.05, 0.00,  0.90],
    ]);
}

module.exports = { applyWarm };
