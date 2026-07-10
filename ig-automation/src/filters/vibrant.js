'use strict';

function applyVibrant(pipeline) {
  return pipeline.modulate({ brightness: 1.02, saturation: 1.6, hue: 0 });
}

module.exports = { applyVibrant };
