# Lightweight shader mode

Press ESC and select **Lightweight Shader: ON/OFF**. The preference is saved locally; the default is OFF. Changes take effect immediately.

ON enables dynamic sun and nearby block-light shadows, warmer sunlight, detailed skies and sunsets, animated water with sky/cloud reflections, bloom, depth-based atmospheric haze, screen-space sun shafts, foliage sway, and wind-driven rain. Foliage sway respects the system reduced-motion preference. The hand and HUD remain sharp.

The performance budget is one scene render plus two fullscreen passes. The scene target is capped near 1.25 million pixels and 1600 pixels wide; bloom and shafts run at quarter width and height. Sun shadows use a 1024 map, only the nearest block light casts point shadows, and shadow refresh is capped at 30 Hz. OFF releases the post-processing targets and uses simpler sky and water shading. Actual frame rates depend on hardware, world complexity, and render distance.

Reflections approximate the sky, clouds, and sun rather than mirroring nearby structures. Volumetric lighting uses depth-occluded screen-space sun shafts rather than expensive 3D ray marching. Motion comes from water, vegetation, clouds, and weather; no motion blur is applied.

Validation: `node --test tests/lightweightShader.test.js`; browser preview at `/tests/shader-effects.html` supports ESC toggling, day/sunset/night, and rain.
