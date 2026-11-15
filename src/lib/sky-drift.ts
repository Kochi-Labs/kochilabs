/** Advect cloud pigment only inside a verified, foliage-free part of the plate.
 * Colour alone cannot distinguish cream clouds from sunlit palm fronds. Both
 * destination and source therefore stay within conservative spatial sky bounds.
 */
export const SKY_DRIFT_GLSL = `
uniform float uCloudTime;
uniform float uCloudMotion;

float cloudPigment(vec3 color) {
  float brightness = dot(color, vec3(.2126, .7152, .0722));
  float warmWhite = smoothstep(-.18, -.015, color.r - color.b);
  float bright = smoothstep(.43, .68, brightness);
  float notFoliage = smoothstep(.29, .49, min(color.r, min(color.g, color.b)));
  return warmWhite * bright * notFoliage;
}

vec2 openSkyBounds(float height) {
  // The left palm reaches furthest into the upper sky; the right palm occupies
  // the outer fifth. These bounds include a safety margin beyond every frond.
  float left = mix(.24, .35, smoothstep(.63, .82, height));
  float right = mix(.84, .82, smoothstep(.60, .80, height));
  return vec2(left, right);
}

float openSkyMask(vec2 point) {
  vec2 bounds = openSkyBounds(point.y);
  float sides = smoothstep(bounds.x, bounds.x + .035, point.x)
    * (1.0 - smoothstep(bounds.y - .035, bounds.y, point.x));
  // The mountain ridge and all shoreline crowns are below this line.
  return sides * smoothstep(.565, .615, point.y);
}

vec3 driftPaintedClouds(vec2 uv, vec3 original) {
  float sky = openSkyMask(uv) * uCloudMotion;
  // Do not clear, recolour, or sample-offset foreground pixels at all.
  if (sky <= 0.0) return original;

  float speed = mix(.0010, .00165, smoothstep(.54, .96, uv.y));
  vec2 bounds = openSkyBounds(uv.y);
  float span = bounds.y - bounds.x;
  // Wrap within the clean-sky band instead of across the whole image, where a
  // left-hand palm would eventually drift into the centre of the composition.
  float cycle = fract((uv.x - bounds.x - uCloudTime * speed) / span);
  vec2 source = vec2(bounds.x + cycle * span, uv.y);
  vec3 cloud = texture2D(uBackdrop, source).rgb;
  float pigment = cloudPigment(cloud) * openSkyMask(source);

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
