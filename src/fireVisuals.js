// Procedural cutout flame, evaluated only on fire vertices in the shared emitter batch.
// No texture uploads, particle allocations, or additional world draw calls.
export const fireFragment = `
vec4 animatedFlame(vec2 uv, float time) {
  float y = uv.y;
  float sway = sin(y * 8.0 - time * 3.5) * .06 * y;
  float x = uv.x + sway;
  float tongues = sin(x * 21.0 + time * 2.1) * .09
                + sin(x * 37.0 - time * 3.7 + y * 5.0) * .045;
  float width = .46 * pow(max(1.0 - y, 0.0), .65);
  float edge = width - abs(x - .5) + tongues * y;
  float shape = smoothstep(-.025, .035, edge) * (1.0 - smoothstep(.86, 1.0, y));
  float turbulence = sin(x * 27.0 + y * 17.0 - time * 7.0) * sin(y * 23.0 - time * 5.0);
  float heat = clamp((1.0 - y) * .9 + edge * .8 + turbulence * .09, 0.0, 1.0);
  vec3 color = mix(vec3(1.0, .025, .002), vec3(1.0, .32, .008), smoothstep(.05, .45, heat));
  color = mix(color, vec3(1.0, .85, .14), smoothstep(.4, .8, heat));
  color = mix(color, vec3(1.0, .97, .65), smoothstep(.78, 1.0, heat));
  // Detached rising embers in the transparent area above the flame tips.
  float sparkY = fract(time * .65 + .17);
  float sparkX = .5 + sin(time * 2.0) * .21;
  float spark = (1.0 - smoothstep(.009, .028, length((uv - vec2(sparkX, sparkY)) * vec2(1.0, .7)))) * smoothstep(.55,.8,sparkY);
  return vec4(mix(color, vec3(1.0,.65,.08), spark), max(shape, spark));
}
`;
