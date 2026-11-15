/** Move the painting's cloud pigment, leaving its foreground silhouettes in place.
 * The narrow central strip is clear sky throughout the animated altitude range.
 * It supplies the same painted grain and blue gradient underneath drifting clouds.
 */
export const SKY_DRIFT_GLSL = `
uniform float uCloudTime;
uniform float uCloudMotion;

float cloudPigment(vec3 color) {
  float brightness = dot(color, vec3(.2126, .7152, .0722));
  float warmWhite = smoothstep(-.18, -.015, color.r - color.b);
  float bright = smoothstep(.43, .68, brightness);
  // Sunlit palm leaves are warm too, but their blue channel stays much darker.
  float notFoliage = smoothstep(.29, .49, min(color.r, min(color.g, color.b)));
  return warmWhite * bright * notFoliage;
}

vec3 driftPaintedClouds(vec2 uv, vec3 original) {
  // The falloff ends above the mountain ridge and never touches river or village.
  float altitude = smoothstep(.475, .565, uv.y);
  float foreground = smoothstep(.21, .43, min(original.r, min(original.g, original.b)));
  float sky = altitude * foreground * uCloudMotion;
  if (sky < .001) return original;

  float speed = mix(.0010, .00165, smoothstep(.54, .96, uv.y));
  vec2 source = vec2(fract(uv.x - uCloudTime * speed), uv.y);
  vec3 cloud = texture2D(uBackdrop, source).rgb;
  float pigment = cloudPigment(cloud);

  // Repeated fine brush grain avoids a flat synthetic blue fill or stretched bands.
  vec2 clearUv = vec2(.483 + fract(uv.x * 3.71 + uv.y * .11) * .035, uv.y);
  vec3 clearSky = texture2D(uBackdrop, clearUv).rgb;
  // Keep the original wide sky grain; only fill pixels vacated by a cloud.
  vec3 cleared = mix(original, clearSky, smoothstep(.02, .32, cloudPigment(original)));
  vec3 movingSky = mix(cleared, cloud, pigment);
  // Ease into the separated layer on load; thereafter the wind never reverses.
  sky *= smoothstep(0.0, 3.0, uCloudTime);
  return mix(original, movingSky, sky);
}
`;
