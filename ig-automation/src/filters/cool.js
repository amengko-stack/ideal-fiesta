'use strict';

function applyCool(pipeline) {
  return pipeline
    .modulate({ brightness: 1.02, saturation: 0.95 })
    .recomb([
      [0.90,  0.00,  0.05],
      [0.00,  1.00,  0.00],
      [0.05,  0.05,  1.15],
    ]);
}

module.exports = { applyCool };
