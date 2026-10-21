// <hypo-3d> renderer: the A2 hypothalamus as a cleared-tissue specimen block in real-time 3-D.
//
// Pipeline (all same-origin, no textures by URL, no postprocessing stack):
//   1. block back faces → rtB (view depth): how far each ray travels through the tissue
//   2. everything solid (cells, fornix, vessels, pituitary, sella, shadow) → rtO (MSAA, + depth)
//   3. canvas: rtO copied, then the block's front faces composite the tissue volume over it —
//      Beer–Lambert haze measured from the cut face to the first solid surface (so structures
//      fade with their real depth), a soft depth blur, in-volume glows (KNDy burst, the heat-loss
//      centre's drive, the flash) integrated along each ray, cut-face speckle, painted cut anatomy,
//      wet specular — then halos on moving signal packets.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Mesh, InstancedMesh, Group, Object3D, Color, Vector3, Matrix4, Quaternion, Euler,
  BufferGeometry, Float32BufferAttribute, InstancedBufferGeometry, InstancedBufferAttribute, PlaneGeometry, SphereGeometry, CylinderGeometry,
  MeshPhysicalMaterial, MeshStandardMaterial, MeshBasicMaterial, ShaderMaterial, ShaderChunk,
  DirectionalLight, HemisphereLight, WebGLRenderTarget, DepthTexture, HalfFloatType, RedFormat, NearestFilter,
  PMREMGenerator, ExtrudeGeometry, Shape, Vector2, CanvasTexture, RepeatWrapping, SRGBColorSpace,
  BackSide, FrontSide, DoubleSide, NoBlending, CustomBlending, OneFactor, OneMinusSrcAlphaFactor, AddEquation,
  NeutralToneMapping, PCFShadowMap,
} from "three";
import * as AN from "./hypo3d-anatomy.js";
import { blobGeo, tubeGeo, mergeGeos, creaseNormals, closedLoop, sweepGeo } from "./hypo3d-geo.js";
import { makeRng, along, kndyOf } from "./hypo3d-model.js";

const W = AN.W;
const KR = 9.2; // KNDy soma radius (drawn; A2 uses 7.5 on a smaller canvas). Size *changes* come from the model.
const MR = 8.0; // heat-loss neuron radius (drawn)
const V3 = (p) => new Vector3(p[0] - AN.CX, AN.CY - p[1], p[2] || 0);
const wpts = (pts) => pts.map((p) => W(p[0], p[1], p[2] || 0));
const lin = (hex) => new Color(hex); // three converts sRGB hex to linear working space

// ---------------------------------------------------------------- palette (A2 figure.css, Cream theme)
const PAL = {
  tissueA: "#f8e6e9", tissueB: "#e7b9c3", frost: "#fdf4f3", edge: "#b07f8a", speck: "#8a5a8e",
  white: "#fbf3ee", vessel: "#c94c5e", gland: "#ecc8cf", ant: "#e3a6b6", stalk: "#e9c1ca", me: "#eac4cc",
  bone: "#efe4d1", boneCut: "#f7f0e3", mamm: "#ecccd2",
  kndy: "#8e2f88", kndyCore: "#f4cdf0", kndyGlow: "#c2189b", nkb: "#d01aa5", axon: "#9b4794",
  mn: "#138a63", mnCore: "#c8f0df", rec: "#0b5c41", recOff: "#c3a2a8", hot: "#e0731e", heat: "#f08a32",
  estro: "#c98a00", out: "#3f9a76",
};

// ---------------------------------------------------------------- physical tissue material with a subsurface feel
// Wrap lighting adds a reddened band past the terminator, plus a little back-light through thin
// parts; an optional view-facing "core" glow reads as a lit nucleus inside a translucent cell.
const PHYS_PARS = ShaderChunk.lights_physical_pars_fragment.replace(
  "reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );",
  `reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );
  #ifdef USE_SSS
  {
    float nlr = dot( geometryNormal, directLight.direction );
    float wrapNL = saturate( ( nlr + uSssWrap ) / ( 1.0 + uSssWrap ) );
    float band = max( wrapNL - saturate( nlr ), 0.0 );
    float back = pow( saturate( dot( geometryViewDir, - directLight.direction ) ), 4.0 ) * uSssBack;
    reflectedLight.directDiffuse += directLight.color * ( band + back ) * BRDF_Lambert( uSssColor );
  }
  #endif`,
);
const SSS_PATCHED = PHYS_PARS !== ShaderChunk.lights_physical_pars_fragment;

// procedural micro-relief (object space, resolution independent): uBump = height in world units
const NBUMP_PARS = /* glsl */ `
#ifdef USE_NBUMP
varying vec3 vNPos;
float nb_hash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float nb_noise( vec3 x ) {
  vec3 i = floor( x ); vec3 f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( nb_hash( i ), nb_hash( i + vec3( 1, 0, 0 ) ), f.x ), mix( nb_hash( i + vec3( 0, 1, 0 ) ), nb_hash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( nb_hash( i + vec3( 0, 0, 1 ) ), nb_hash( i + vec3( 1, 0, 1 ) ), f.x ), mix( nb_hash( i + vec3( 0, 1, 1 ) ), nb_hash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
float nb_fbm( vec3 p ) { return 0.55 * nb_noise( p ) + 0.3 * nb_noise( p * 2.07 + 1.3 ) + 0.15 * nb_noise( p * 4.3 + 3.1 ); }
vec3 nb_perturb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir ) {
  vec3 vSigmaX = dFdx( surf_pos ); vec3 vSigmaY = dFdy( surf_pos );
  vec3 R1 = cross( vSigmaY, surf_norm ); vec3 R2 = cross( surf_norm, vSigmaX );
  float fDet = dot( vSigmaX, R1 ) * faceDir;
  vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
  return normalize( abs( fDet ) * surf_norm - vGrad );
}
#endif`;

function physMat(o) {
  const m = new MeshPhysicalMaterial({
    color: o.color,
    roughness: o.roughness ?? 0.5,
    metalness: 0,
    clearcoat: o.clearcoat ?? 0,
    clearcoatRoughness: o.clearcoatRoughness ?? 0.3,
    sheen: o.sheen ?? 0,
    sheenColor: o.sheenColor ?? "#ffffff",
    sheenRoughness: o.sheenRoughness ?? 0.5,
    emissive: o.emissive ?? "#000000",
    emissiveIntensity: o.emissiveIntensity ?? 1,
    flatShading: !!o.flatShading,
    envMapIntensity: o.env ?? 1,
    side: o.side ?? FrontSide,
  });
  if (o.bumpMap) {
    m.bumpMap = o.bumpMap;
    m.bumpScale = o.bumpScale ?? 1;
  }
  const U = {
    uSssColor: { value: lin(o.sss || "#000000") },
    uSssWrap: { value: o.sssWrap ?? 0.5 },
    uSssBack: { value: o.sssBack ?? 0 },
    uCoreColor: { value: lin(o.core || "#000000") },
    uCoreAmt: { value: o.coreAmt ?? 0 },
    uCorePow: { value: o.corePow ?? 2 },
    uBump: { value: o.bump ?? 0 },
    uBumpFreq: { value: o.bumpFreq ?? 0.2 },
    uBumpPore: { value: o.pores ?? 0 },
    uMottle: { value: o.mottle ?? 0 },
    uMottleFreq: { value: o.mottleFreq ?? 0.06 },
  };
  m.userData.u = U;
  const sss = !!o.sss && SSS_PATCHED;
  const core = !!o.core;
  const nb = (o.bump ?? 0) > 0 || (o.mottle ?? 0) > 0;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.defines = sh.defines || {};
    if (sss) sh.defines.USE_SSS = "";
    if (core) sh.defines.USE_CORE = "";
    if (nb) sh.defines.USE_NBUMP = "";
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\n#ifdef USE_NBUMP\nvarying vec3 vNPos;\n#endif")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n#ifdef USE_NBUMP\nvNPos = position;\n#endif");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uSssColor; uniform float uSssWrap; uniform float uSssBack; uniform vec3 uCoreColor; uniform float uCoreAmt; uniform float uCorePow; uniform float uBump; uniform float uBumpFreq; uniform float uBumpPore; uniform float uMottle; uniform float uMottleFreq;\n" + NBUMP_PARS)
      .replace(
        "#include <color_fragment>",
        "#include <color_fragment>\n#ifdef USE_NBUMP\nfloat nbM = nb_fbm( vNPos * uMottleFreq + 11.0 );\ndiffuseColor.rgb *= 1.0 + uMottle * ( nbM - 0.5 ) * vec3( 0.9, 1.25, 1.2 );\n#endif",
      )
      .replace(
        "#include <roughnessmap_fragment>",
        "#include <roughnessmap_fragment>\n#ifdef USE_NBUMP\nroughnessFactor = clamp( roughnessFactor * ( 1.0 + uMottle * 1.2 * ( nbM - 0.5 ) ), 0.04, 1.0 );\n#endif",
      )
      .replace(
        "#include <normal_fragment_maps>",
        "#include <normal_fragment_maps>\n#ifdef USE_NBUMP\n{ vec3 q = vNPos * uBumpFreq; float h = nb_fbm( q ); if ( uBumpPore > 0.0 ) h -= uBumpPore * pow( nb_noise( q * 2.6 + 7.0 ), 5.0 ); h *= uBump; normal = nb_perturb( - vViewPosition, normal, vec2( dFdx( h ), dFdy( h ) ), faceDirection ); }\n#endif",
      )
      .replace("#include <lights_physical_pars_fragment>", PHYS_PARS)
      .replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\n#ifdef USE_CORE\n{ float ndv = saturate( dot( normal, normalize( vViewPosition ) ) ); totalEmissiveRadiance += uCoreColor * pow( ndv, uCorePow ) * uCoreAmt; }\n#endif",
      );
  };
  m.customProgramCacheKey = () => `h3d${sss ? "s" : ""}${core ? "c" : ""}${nb ? "b" : ""}`;
  return m;
}

// ---------------------------------------------------------------- shared GLSL
const GLSL_OUT = /* glsl */ `
vec4 outT( vec4 c ) {
  float a = clamp( c.a, 0.0, 1.0 );
  if ( a < 1e-4 ) return vec4( 0.0 );
  vec3 rgb = max( c.rgb / a, 0.0 );
  #ifdef TONE_MAPPING
  rgb = toneMapping( rgb );
  #endif
  vec4 o = linearToOutputTexel( vec4( rgb, 1.0 ) );
  return vec4( o.rgb * a, a );
}`;

const FULLSCREEN_VS = /* glsl */ `void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;
const COPY_FS = /* glsl */ `
uniform sampler2D tColor; uniform vec2 uRes;
${GLSL_OUT}
void main() { gl_FragColor = outT( texture2D( tColor, gl_FragCoord.xy / uRes ) ); }`;

const BACK_VS = /* glsl */ `varying float vDepth; void main() { vec4 mv = modelViewMatrix * vec4( position, 1.0 ); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;
const BACK_FS = /* glsl */ `varying float vDepth; void main() { gl_FragColor = vec4( vDepth, 0.0, 0.0, 1.0 ); }`;

const BLOCK_VS = /* glsl */ `
varying vec3 vWorld; varying vec3 vView; varying vec3 vNormalW;
void main() {
  vec4 wp = modelMatrix * vec4( position, 1.0 );
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vView = mv.xyz;
  vNormalW = normalize( mat3( modelMatrix ) * normal );
  gl_Position = projectionMatrix * mv;
}`;

const BLOCK_FS = /* glsl */ `
#include <packing>
uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tBack;
uniform vec2 uRes; uniform float uNear; uniform float uFar; uniform float uDpr;
uniform float uSigma; uniform float uBlur; uniform float uOnset;
uniform vec3 uTissueA; uniform vec3 uTissueB; uniform vec3 uFrost; uniform vec3 uEdge; uniform vec3 uSpeck; uniform vec3 uWhite;
uniform vec3 uKeyDir; uniform float uAmb; uniform float uKey;
uniform vec3 uGlowPos[ 3 ]; uniform vec3 uGlowCol[ 3 ]; uniform float uGlowAmt[ 3 ]; uniform float uGlowRad[ 3 ];
varying vec3 vWorld; varying vec3 vView; varying vec3 vNormalW;
const float CX = ${AN.CX.toFixed(1)}; const float CY = ${AN.CY.toFixed(1)};
${GLSL_OUT}
float hash12( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
vec2 hash22( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.xx + p3.yz ) * p3.zy ); }
float erf_( float x ) {
  float s = sign( x ), a = abs( x );
  float t = 1.0 / ( 1.0 + 0.3275911 * a );
  float y = 1.0 - ( ( ( ( ( 1.061405429 * t - 1.453152027 ) * t ) + 1.421413741 ) * t - 0.284496736 ) * t + 0.254829592 ) * t * exp( -a * a );
  return s * y;
}
// glial nuclei on a cut face (face-plane coordinates in section units)
float speck( vec2 q, float cell, float occ, float px ) {
  vec2 c0 = floor( q / cell );
  float a = 0.0;
  for ( int j = -1; j <= 1; j ++ ) for ( int i = -1; i <= 1; i ++ ) {
    vec2 c = c0 + vec2( float( i ), float( j ) );
    if ( hash12( c * 1.7 + 3.1 ) > occ ) continue;
    vec2 p = ( c + hash22( c ) ) * cell;
    float r = 0.7 + 1.0 * hash12( c + 9.7 );
    float d = length( q - p );
    a = max( a, ( 1.0 - smoothstep( r - px, r + px, d ) ) * ( 0.45 + 0.55 * hash12( c + 2.3 ) ) );
  }
  return a;
}
float vh( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float vnoise( vec3 x ) {
  vec3 i = floor( x ); vec3 f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( vh( i ), vh( i + vec3( 1, 0, 0 ) ), f.x ), mix( vh( i + vec3( 0, 1, 0 ) ), vh( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( vh( i + vec3( 0, 0, 1 ) ), vh( i + vec3( 1, 0, 1 ) ), f.x ), mix( vh( i + vec3( 0, 1, 1 ) ), vh( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
float segD( vec2 p, vec2 a, vec2 b ) { vec2 pa = p - a, ba = b - a; float h = clamp( dot( pa, ba ) / dot( ba, ba ), 0.0, 1.0 ); return length( pa - ba * h ); }
vec3 studio( vec3 r ) {
  float up = r.y * 0.5 + 0.5;
  vec3 c = mix( vec3( 0.60, 0.55, 0.53 ), vec3( 0.97, 0.95, 0.92 ), smoothstep( 0.3, 0.9, up ) );
  float k = smoothstep( 0.80, 0.95, dot( r, normalize( vec3( -0.55, 0.7, 0.45 ) ) ) );
  float s = smoothstep( 0.93, 0.985, dot( r, normalize( vec3( 0.45, 0.55, -0.7 ) ) ) );
  float f = smoothstep( 0.72, 0.95, dot( r, normalize( vec3( 0.75, 0.2, 0.6 ) ) ) );
  return c * 0.55 + k * vec3( 2.6, 2.5, 2.35 ) + s * vec3( 1.4 ) + f * vec3( 0.45, 0.47, 0.5 );
}
// layer a colour C (straight) with opacity a over premultiplied (col, alpha)
void over( inout vec3 col, inout float alpha, vec3 C, float a ) { col = C * a + col * ( 1.0 - a ); alpha = a + alpha * ( 1.0 - a ); }

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 px = 1.0 / uRes;
  float tEntry = length( vView );
  vec3 dirV = vView / tEntry;
  // MSAA resolves colour as coverage but depth as one sample: take the nearest solid depth around
  // this pixel for the covered part, and haze the uncovered part all the way to the back cut
  float dC = texture2D( tDepth, uv ).x;
  float dM = dC;
  dM = min( dM, min( texture2D( tDepth, uv + vec2( px.x, 0.0 ) ).x, texture2D( tDepth, uv - vec2( px.x, 0.0 ) ).x ) );
  dM = min( dM, min( texture2D( tDepth, uv + vec2( 0.0, px.y ) ).x, texture2D( tDepth, uv - vec2( 0.0, px.y ) ).x ) );
  float tC = perspectiveDepthToViewZ( dC, uNear, uFar ) / dirV.z;
  float tN = perspectiveDepthToViewZ( dM, uNear, uFar ) / dirV.z;
  vec4 behind0 = texture2D( tColor, uv );
  if ( tC < tEntry - 0.75 && behind0.a > 0.995 ) { gl_FragColor = outT( behind0 ); return; } // a solid wholly in front of the cut face
  float zB = texture2D( tBack, uv ).x;
  float tB = max( zB > 1.0 ? zB / -dirV.z : tEntry, tEntry );
  bool inFront = tN < tEntry - 0.75;
  float sN = inFront ? 0.0 : clamp( tN - tEntry, 0.0, tB - tEntry );
  float sF = tB - tEntry;

  // what lies inside, frosted: blur grows with depth into the tissue
  vec4 behind = behind0;
  float br = clamp( sN * uBlur, 0.0, 6.0 ) * uDpr;
  if ( br > 0.5 && !inFront ) {
    vec4 acc = behind0 * 2.0;
    for ( int i = 0; i < 6; i ++ ) {
      float a = float( i ) * 1.0471976 + 0.5;
      float rr = ( i - ( i / 2 ) * 2 == 0 ) ? 1.0 : 0.55;
      acc += texture2D( tColor, uv + vec2( cos( a ), sin( a ) ) * br * rr * px );
    }
    behind = acc / 8.0;
  }
  float cov = clamp( behind.a, 0.0, 1.0 );
  float sw = inFront ? 1.0 - cov : 1.0; // how much of this pixel is the block's own surface

  vec3 N = normalize( vNormalW );
  vec3 V = normalize( cameraPosition - vWorld );
  float ndl = dot( N, uKeyDir );
  float lightF = uAmb + uKey * clamp( ( ndl + 0.55 ) / 1.55, 0.0, 1.0 );

  // the tissue volume: Beer–Lambert, red travels furthest so what's deep turns rosier
  // optical depth with a soft onset: the first few tens of units (the midline nuclei) stay clear,
  // deeper tissue veils what lies in it
  vec3 sig = uSigma * vec3( 0.70, 1.0, 1.1 );
  vec3 T3N = exp( -sig * sN * sN / ( sN + uOnset ) );
  vec3 T3F = exp( -sig * sF * sF / ( sF + uOnset ) );
  float TN = ( T3N.r + T3N.g + T3N.b ) / 3.0;
  float TF = ( T3F.r + T3F.g + T3F.b ) / 3.0;
  float Tt = mix( TF, TN, cov );
  vec3 alb = mix( uTissueA, uTissueB, smoothstep( 0.1, 0.95, 1.0 - Tt ) );
  // cloudy density variation, sampled twice along the ray (tissue is never a uniform gel)
  vec3 dirW = normalize( vWorld - cameraPosition );
  float sAvg = mix( sF, sN, cov );
  float cl = 0.6 * vnoise( ( vWorld + dirW * sAvg * 0.3 ) * 0.022 ) + 0.4 * vnoise( ( vWorld + dirW * sAvg * 0.7 ) * 0.05 + 4.0 );
  alb *= 0.9 + 0.2 * cl;
  // denser, rosier toward the base (deeper grey matter)
  alb = mix( alb, uTissueB, 0.18 * smoothstep( ${(AN.CY - 260).toFixed(1)}, ${(AN.CY - 440).toFixed(1)}, vWorld.y ) );
  // in-scatter is grey-weighted (per-channel only tints what is seen *through* the tissue),
  // so thin tissue at the edges stays warm pink rather than turning cool
  vec3 colN = inFront ? behind.rgb : T3N * behind.rgb + alb * lightF * ( 1.0 - TN ) * cov;
  vec3 col = colN + alb * lightF * ( 1.0 - TF ) * ( 1.0 - cov );
  float alpha = cov + ( 1.0 - cov ) * ( 1.0 - TF );

  // light inside the tissue: KNDy burst, the heat-loss centre's drive, the flash
  float tEndG = mix( tB, tEntry + sN, inFront ? 0.0 : cov );
  for ( int i = 0; i < 3; i ++ ) {
    float s = uGlowRad[ i ];
    vec3 c = uGlowPos[ i ];
    float tc = dot( c, dirV );
    float h2 = max( dot( c, c ) - tc * tc, 0.0 );
    float I = exp( -h2 / ( s * s ) ) * 0.5 * ( erf_( ( tEndG - tc ) / s ) - erf_( ( tEntry - tc ) / s ) );
    float g = sw * clamp( uGlowAmt[ i ] * I * exp( -uSigma * 0.35 * max( tc - tEntry, 0.0 ) ), 0.0, 0.92 );
    over( col, alpha, uGlowCol[ i ], g * 0.62 );
    col += uGlowCol[ i ] * g * 0.22;
  }

  // the cut surface
  vec2 sec = vec2( vWorld.x + CX, CY - vWorld.y );
  float fFront = smoothstep( 0.8, 0.97, N.z );
  float fTop = smoothstep( 0.8, 0.97, N.y );
  float fEnd = smoothstep( 0.8, 0.97, abs( N.x ) );
  float NdV = clamp( dot( N, V ), 0.0, 1.0 );
  float F = 0.03 + 0.97 * pow( 1.0 - NdV, 5.0 );
  // a faint frosted skin, denser at grazing angles (gives the block its body and silhouette)
  over( col, alpha, mix( uFrost, uTissueA, 0.5 ) * lightF, sw * ( 0.07 + 0.2 * pow( 1.0 - NdV, 2.2 ) + 0.2 * ( 1.0 - smoothstep( 10.0, 90.0, sF ) ) ) );
  // painted cut anatomy (A2's front, top and end faces)
  float fpx = ( fwidth( sec.x ) + fwidth( sec.y ) + fwidth( vWorld.z ) ) * 0.5;
  fFront *= sw; fTop *= sw; fEnd *= sw;
  if ( fFront > 0.0 ) {
    // hypothalamic sulcus (A2 SULCUS)
    float dS = min( min( segD( sec, vec2( 160.0, 196.0 ), vec2( 250.0, 214.0 ) ), segD( sec, vec2( 250.0, 214.0 ), vec2( 360.0, 226.0 ) ) ), min( segD( sec, vec2( 360.0, 226.0 ), vec2( 460.0, 238.0 ) ), segD( sec, vec2( 460.0, 238.0 ), vec2( 560.0, 262.0 ) ) ) );
    over( col, alpha, uEdge * lightF * 0.9, fFront * 0.34 * ( 1.0 - smoothstep( 0.6, 1.8 + fpx, dS ) ) );
    // lamina terminalis
    float dL = min( min( segD( sec, vec2( 146.0, 190.0 ), vec2( 136.0, 240.0 ) ), segD( sec, vec2( 136.0, 240.0 ), vec2( 126.0, 300.0 ) ) ), min( segD( sec, vec2( 126.0, 300.0 ), vec2( 120.0, 350.0 ) ), segD( sec, vec2( 120.0, 350.0 ), vec2( 118.0, 404.0 ) ) ) );
    over( col, alpha, uWhite * lightF, fFront * 0.5 * ( 1.0 - smoothstep( 0.8, 2.2 + fpx, dL ) ) );
    // interthalamic adhesion (faint outline)
    float e = length( ( sec - vec2( 384.0, 184.0 ) ) / vec2( 36.0, 20.0 ) );
    over( col, alpha, uEdge * lightF, fFront * 0.07 * ( 1.0 - smoothstep( 0.0, 0.05 + fpx * 0.05, abs( e - 1.0 ) ) ) );
    over( col, alpha, uFrost * lightF, fFront * 0.1 * ( 1.0 - smoothstep( 0.9, 1.0, e ) ) );
  }
  if ( fTop > 0.0 ) {
    // horizontal cut at the thalamus: internal capsule (white V), caudate head, lentiform nucleus
    vec2 tq = vec2( sec.x, -vWorld.z );
    float dC = min( min( segD( tq, vec2( 60.0, 128.0 ), vec2( 150.0, 96.0 ) ), segD( tq, vec2( 150.0, 96.0 ), vec2( 205.0, 78.0 ) ) ), min( segD( tq, vec2( 205.0, 78.0 ), vec2( 300.0, 104.0 ) ), segD( tq, vec2( 300.0, 104.0 ), vec2( 540.0, 160.0 ) ) ) );
    over( col, alpha, uWhite * lightF, fTop * 0.55 * ( 1.0 - smoothstep( 9.0, 11.5 + fpx, dC ) ) );
    float lent = length( ( tq - vec2( 235.0, 150.0 ) ) / vec2( 120.0, 34.0 ) );
    over( col, alpha, uTissueB * lightF * 0.95, fTop * 0.14 * ( 1.0 - smoothstep( 0.92, 1.0, lent ) ) );
    float caud = length( ( tq - vec2( 100.0, 52.0 ) ) / vec2( 62.0, 34.0 ) );
    over( col, alpha, uTissueB * lightF * 0.95, fTop * 0.12 * ( 1.0 - smoothstep( 0.9, 1.0, caud ) ) );
  }
  if ( fEnd > 0.0 ) {
    // cut across behind the mammillary bodies: white matter band (capsule into peduncle)
    vec2 eq = vec2( -vWorld.z, sec.y );
    float dW = min( min( segD( eq, vec2( 108.0, 140.0 ), vec2( 116.0, 270.0 ) ), segD( eq, vec2( 116.0, 270.0 ), vec2( 140.0, 360.0 ) ) ), segD( eq, vec2( 140.0, 360.0 ), vec2( 190.0, 420.0 ) ) );
    over( col, alpha, uWhite * lightF, fEnd * 0.5 * ( 1.0 - smoothstep( 9.0, 11.5 + fpx, dW ) ) );
  }
  // glial speckle on every cut face
  vec2 q = fFront * sec + fTop * vec2( sec.x, vWorld.z * 1.0 ) + fEnd * vec2( vWorld.z, sec.y );
  float sp = speck( q, 12.5, 0.52, fpx * 0.75 ) * max( max( fFront, fTop ), fEnd );
  over( col, alpha, uSpeck * mix( 0.8, 1.0, lightF ), sp * 0.26 );
  // edges: the rounded rims of the cut catch a soft line (A2 strokes the block's edges)
  float edgeBand = 1.0 - max( max( abs( N.x ), abs( N.y ) ), abs( N.z ) );
  over( col, alpha, uEdge * lightF, sw * smoothstep( 0.04, 0.28, edgeBand ) * 0.42 );
  // wet specular: studio softboxes + a tight key glint
  vec3 R = reflect( -V, N );
  vec3 spec = studio( R ) * F * 0.85;
  vec3 H = normalize( uKeyDir + V );
  spec += vec3( 1.0, 0.97, 0.93 ) * pow( max( dot( N, H ), 0.0 ), 160.0 ) * ( 0.35 + 1.5 * F );
  spec *= sw;
  col += spec;
  alpha = clamp( alpha + dot( spec, vec3( 0.3333 ) ) * 0.5, 0.0, 1.0 );
  gl_FragColor = outT( vec4( col, alpha ) );
}`;

const HALO_VS = /* glsl */ `
attribute vec3 iPos; attribute float iSize; attribute vec4 iCol;
varying vec2 vP; varying vec4 vCol; varying float vDepth;
void main() {
  vec4 mv = viewMatrix * vec4( iPos, 1.0 );
  vDepth = -mv.z;
  mv.xy += position.xy * iSize;
  vP = position.xy * 2.0;
  vCol = iCol;
  gl_Position = projectionMatrix * mv;
}`;
const HALO_FS = /* glsl */ `
#include <packing>
uniform sampler2D tDepth; uniform vec2 uRes; uniform float uNear; uniform float uFar;
varying vec2 vP; varying vec4 vCol; varying float vDepth;
${GLSL_OUT}
void main() {
  float r2 = dot( vP, vP );
  float f = exp( -r2 * 3.4 ) * ( 1.0 - smoothstep( 0.6, 1.0, r2 ) );
  float zO = -perspectiveDepthToViewZ( texture2D( tDepth, gl_FragCoord.xy / uRes ).x, uNear, uFar );
  float occ = smoothstep( -14.0, -7.0, zO - vDepth );
  float a = clamp( f * vCol.a * occ, 0.0, 1.0 );
  gl_FragColor = outT( vec4( vCol.rgb * a, a ) );
}`;

// ---------------------------------------------------------------- procedural textures
function fibreTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#808080";
  g.fillRect(0, 0, 64, 256);
  const rng = makeRng(5);
  for (let y = 0; y < 256; y += 1) {
    const v = 110 + rng() * 60;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(0, y, 64, 1);
  }
  for (let i = 0; i < 22; i++) {
    const y = rng() * 256;
    g.fillStyle = "rgba(60,60,60,0.55)";
    g.fillRect(0, y, 64, 1.2);
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(1, 3);
  return t;
}

function shadowTexture() {
  // the contact shadow on an implied ground under the sella, painted once (soft, warm, faint)
  const Wc = 512, Hc = 320;
  const c = document.createElement("canvas");
  c.width = Wc;
  c.height = Hc;
  const g = c.getContext("2d");
  // ground spans section x ∈ [-60, 660], z ∈ [-300, 150]; map to canvas
  // (canvas top = far edge of the ground after the plane is laid flat)
  const X = (x) => ((x + 60) / 720) * Wc;
  const Z = (z) => ((z + 300) / 450) * Hc;
  const blob = (x0, x1, z0, z1, blur, alpha, rx = 0.5) => {
    g.save();
    g.shadowColor = `rgba(78, 50, 46, ${alpha})`;
    g.shadowBlur = blur;
    g.shadowOffsetX = 4000;
    g.translate(-4000, 0);
    g.fillStyle = "#000";
    g.beginPath();
    g.ellipse((X(x0) + X(x1)) / 2, (Z(z0) + Z(z1)) / 2, Math.abs(X(x1) - X(x0)) * rx, Math.abs(Z(z1) - Z(z0)) * 0.5, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  // the block, far above the ground: a broad, faint ambient shadow, nudged away from the key light
  blob(150, 540, -210, -40, 60, 0.13, 0.5);
  // the sella and pituitary: close to the ground, darker and tighter
  blob(238, 386, -62, 44, 20, 0.3, 0.5);
  blob(258, 366, -38, 26, 9, 0.26, 0.46);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- the studio environment (PMREM, procedural)
function buildEnv(renderer) {
  const scene = new Scene();
  const geo = new SphereGeometry(100, 48, 24);
  const pos = geo.attributes.position;
  const cols = [];
  const ground = lin("#d9c8bf"), horizon = lin("#efe6dc"), sky = lin("#fbf7f1");
  const tmp = new Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 100;
    if (y < 0) tmp.copy(horizon).lerp(ground, Math.min(1, -y * 2.2)).multiplyScalar(0.55);
    else tmp.copy(horizon).lerp(sky, Math.min(1, y * 1.6)).multiplyScalar(0.62 + 0.25 * y);
    cols.push(tmp.r, tmp.g, tmp.b);
  }
  geo.setAttribute("color", new Float32BufferAttribute(cols, 3));
  scene.add(new Mesh(geo, new MeshBasicMaterial({ vertexColors: true, side: BackSide })));
  const box = (d, w, h, k, hex) => {
    const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: lin(hex).multiplyScalar(k), side: DoubleSide }));
    m.position.copy(new Vector3(...d).normalize().multiplyScalar(60));
    m.lookAt(0, 0, 0);
    scene.add(m);
  };
  box([-0.55, 0.7, 0.45], 56, 38, 7, "#fff3e6"); // key softbox, upper left front
  box([0.75, 0.2, 0.6], 44, 64, 1.7, "#f3f5ff"); // fill, right front
  box([0.45, 0.55, -0.7], 70, 12, 4.5, "#ffffff"); // rim strip, back right
  box([-0.85, 0.15, -0.35], 34, 50, 1.4, "#fff0e6"); // kicker, back left
  const pmrem = new PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.04);
  pmrem.dispose();
  scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
  return rt;
}

// ---------------------------------------------------------------- the block: extruded cut outline with rounded rims
function blockGeometry() {
  const R = 7;
  const X0 = AN.BX0 - AN.CX, X1 = AN.BX1 - AN.CX, YT = AN.CY - AN.BY0;
  const pts = [];
  const arc = (cx, cy, a0, a1, n = 6) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push(new Vector2(cx + R * Math.cos(a), cy + R * Math.sin(a)));
    }
  };
  arc(X1 - R, YT - R, 0, Math.PI / 2);
  arc(X0 + R, YT - R, Math.PI / 2, Math.PI);
  const base = AN.curve(AN.BASE.slice().reverse(), 5);
  for (const [x, y] of base) pts.push(new Vector2(x - AN.CX, AN.CY - y));
  const shape = new Shape(pts);
  const bev = 3.5;
  const depth = AN.ZF - AN.ZB - 2 * bev;
  let g = new ExtrudeGeometry(shape, { depth, steps: 1, curveSegments: 1, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelOffset: -bev, bevelSegments: 4 });
  g.translate(0, 0, AN.ZB + bev);
  g.deleteAttribute("uv");
  g = creaseNormals(g, (38 * Math.PI) / 180);
  return g;
}

// ---------------------------------------------------------------- neurons
function neuronGeometry(r, nDend, rng, { stretch = [1.12, 0.92, 0.94], branches = 2 } = {}) {
  // process directions first: the soma swells toward each (a cell body that flows into its
  // processes). They spread in the section plane and back into the tissue, never down out of it.
  const dirs = [];
  for (let k = 0; k < nDend; k++) {
    const a = (k / nDend) * Math.PI * 2 + (rng() - 0.5) * 1.0;
    const el = -0.6 + rng() * 0.72;
    const d = new Vector3(Math.cos(a) * Math.cos(el), Math.sin(a) * Math.cos(el), Math.sin(el));
    if (d.y < -0.28) d.y = -0.28;
    dirs.push(d.normalize());
  }
  const shape = (x, y, z) => {
    let k = 1;
    for (const d of dirs) k += 0.3 * Math.pow(Math.max(0, x * d.x + y * d.y + z * d.z), 4);
    return k;
  };
  const R = [r * stretch[0], r * stretch[1], r * stretch[2]];
  const parts = [blobGeo(R, rng, { amp: 0.07, detail: 4, shape })];
  dirs.forEach((d, k) => {
    const tip = new Vector3(d.x * R[0], d.y * R[1], d.z * R[2]).multiplyScalar(1.12);
    const dd = tip.clone().normalize();
    const side = new Vector3().crossVectors(dd, new Vector3(0, 0, 1)).normalize();
    if (side.lengthSq() < 0.01) side.set(1, 0, 0);
    const L = r * (2.0 + rng() * 1.4);
    const bend = (rng() - 0.5) * 1.1;
    const wig = (rng() - 0.5) * 0.5;
    const P = (u) => tip.clone().addScaledVector(dd, L * u).addScaledVector(side, L * (bend * 0.38 * u * u + wig * 0.12 * Math.sin(u * 7.0)));
    const pts = [tip.clone().multiplyScalar(0.82), P(0.2), P(0.42), P(0.64), P(0.84), P(1)];
    const rad = (u) => 0.34 + r * (0.08 * (1 - u) + 0.17 * Math.pow(1 - Math.min(1, u / 0.3), 2));
    parts.push(tubeGeo(pts.map((p) => p.toArray()), rad, { tubular: 34, radial: 8 }));
    if (k < branches) {
      const b0 = P(0.48);
      const bd = dd.clone().multiplyScalar(0.55).addScaledVector(side, bend > 0 ? -0.85 : 0.85).normalize();
      const bl = L * (0.32 + rng() * 0.18);
      const bpts = [b0, b0.clone().addScaledVector(bd, bl * 0.5).addScaledVector(dd, bl * 0.12), b0.clone().addScaledVector(bd, bl).addScaledVector(dd, bl * 0.3)];
      parts.push(tubeGeo(bpts.map((p) => p.toArray()), (u) => 0.3 + r * 0.045 * (1 - u), { tubular: 16, radial: 6 }));
    }
  });
  return mergeGeos(parts);
}

// ---------------------------------------------------------------- the scene
export class HypoScene {
  constructor(canvas) {
    this.canvas = canvas;
    const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: "high-performance", preserveDrawingBuffer: false });
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = false;
    renderer.toneMapping = NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.info.autoReset = false;
    this.renderer = renderer;

    this.camera = new PerspectiveCamera(30, 1, 300, 4000);
    this.target = new Vector3(...W(300, 380, -48));
    this.dist = 980;

    this.opaque = new Scene();
    this.back = new Scene();
    this.comp = new Scene();

    this._rt(2, 2);
    this._build();
    this._initEnv();
  }

  _rt(w, h) {
    this.rtO = new WebGLRenderTarget(w, h, { type: HalfFloatType, samples: 4, depthTexture: new DepthTexture(w, h) });
    this.rtO.depthTexture.minFilter = this.rtO.depthTexture.magFilter = NearestFilter;
    this.rtB = new WebGLRenderTarget(w, h, { type: HalfFloatType, format: RedFormat, minFilter: NearestFilter, magFilter: NearestFilter });
  }

  _initEnv() {
    if (this.envRT) this.envRT.dispose();
    this.envRT = buildEnv(this.renderer);
    this.opaque.environment = this.envRT.texture;
    this.opaque.environmentIntensity = 0.85;
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** Re-create GPU-side procedural resources after a WebGL context restore. */
  restore() {
    this._initEnv();
  }

  _build() {
    const O = this.opaque;
    const rng = makeRng(23);
    const fibre = fibreTexture();
    this._disposables = [fibre];

    // lights: a warm key from the upper left front (A2's light), a cool rim, a soft sky fill
    const key = new DirectionalLight("#fff4ea", 2.5);
    this.keyDir = new Vector3(-0.55, 0.7, 0.45).normalize();
    const pitTarget = new Vector3(...W(305, 520, 0));
    key.position.copy(pitTarget).addScaledVector(this.keyDir, 700);
    key.target.position.copy(pitTarget);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, near: 400, far: 1000 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.8;
    O.add(key, key.target);
    const rim = new DirectionalLight("#eef1ff", 1.0);
    rim.position.set(0.5, 0.45, -0.75).multiplyScalar(800);
    O.add(rim);
    O.add(new HemisphereLight("#fffaf2", "#ead8d0", 0.35));

    // ---- materials
    const M = {
      white: physMat({ color: "#f5e7e2", roughness: 0.48, clearcoat: 0.3, clearcoatRoughness: 0.32, sheen: 0.5, sheenColor: "#ffffff", sheenRoughness: 0.4, sss: "#efc0c2", sssWrap: 0.7, sssBack: 0.15, bumpMap: fibre, bumpScale: 0.9 }),
      vessel: physMat({ color: PAL.vessel, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.14, sss: "#ff5a5a", sssWrap: 0.45, sssBack: 0.2 }),
      mamm: physMat({ color: PAL.mamm, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.3, sheen: 0.4, sheenColor: "#fff0f2", sss: "#f19aa8", sssWrap: 0.7, bump: 0.9, bumpFreq: 0.13, mottle: 0.18 }),
      stalk: physMat({ color: PAL.stalk, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.24, sheen: 0.45, sheenColor: "#fff0f3", sss: "#f08e9e", sssWrap: 0.75, sssBack: 0.25, bump: 0.5, bumpFreq: 0.18, mottle: 0.2, mottleFreq: 0.08 }),
      ant: physMat({ color: PAL.ant, roughness: 0.44, clearcoat: 0.7, clearcoatRoughness: 0.2, sheen: 0.4, sheenColor: "#ffe5ec", sss: "#ff7f95", sssWrap: 0.75, sssBack: 0.3, bump: 0.9, bumpFreq: 0.22, mottle: 0.32, mottleFreq: 0.05 }),
      post: physMat({ color: PAL.gland, roughness: 0.48, clearcoat: 0.62, clearcoatRoughness: 0.24, sheen: 0.4, sheenColor: "#fff2f4", sss: "#f39aab", sssWrap: 0.75, sssBack: 0.3, bump: 0.7, bumpFreq: 0.24, mottle: 0.22, mottleFreq: 0.06 }),
      bone: physMat({ color: PAL.bone, roughness: 0.6, clearcoat: 0.2, clearcoatRoughness: 0.42, sheen: 0.2, sheenColor: "#fffaf0", sss: "#efd2ae", sssWrap: 0.45, bump: 0.9, bumpFreq: 0.12, pores: 0.5, mottle: 0.16, mottleFreq: 0.05 }),
      boneCut: physMat({ color: PAL.boneCut, roughness: 0.78, clearcoat: 0.08, sss: "#efd2ae", sssWrap: 0.4, bump: 1.6, bumpFreq: 0.3, pores: 2.2 }),
      kndy: physMat({ color: "#661561", roughness: 0.4, clearcoat: 0.55, clearcoatRoughness: 0.09, env: 0.42, sss: "#b81f92", sssWrap: 0.5, sssBack: 0.3, core: "#d77ccd", coreAmt: 0.07, corePow: 5, emissive: PAL.kndyGlow, emissiveIntensity: 0, bump: 0.35, bumpFreq: 0.45 }),
      mn: physMat({ color: "#0d6e4e", roughness: 0.4, clearcoat: 0.55, clearcoatRoughness: 0.09, env: 0.42, sss: "#18a877", sssWrap: 0.5, sssBack: 0.3, core: "#9fe3c8", coreAmt: 0.06, corePow: 5, emissive: PAL.hot, emissiveIntensity: 0, bump: 0.35, bumpFreq: 0.5 }),
      rec: physMat({ color: PAL.rec, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.15, env: 0.5 }),
      axon: physMat({ color: "#8d3a86", roughness: 0.4, clearcoat: 0.4, clearcoatRoughness: 0.2, env: 0.55, sss: "#e04cc0", sssWrap: 0.5 }),
      out: physMat({ color: PAL.out, roughness: 0.4, clearcoat: 0.4, clearcoatRoughness: 0.25, sss: "#59e0b0", sssWrap: 0.6, emissive: PAL.hot, emissiveIntensity: 0 }),
      estro: physMat({ color: PAL.estro, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12, flatShading: true, emissive: "#c98a00", emissiveIntensity: 0.18, sss: "#ffcf5a", sssWrap: 0.5 }),
      nkb: new MeshStandardMaterial({ color: PAL.nkb, roughness: 0.3, emissive: PAL.nkb, emissiveIntensity: 0.9 }),
      pulse: new MeshStandardMaterial({ color: PAL.hot, roughness: 0.3, emissive: PAL.hot, emissiveIntensity: 1.1 }),
      speck: new MeshStandardMaterial({ color: "#a77aa6", roughness: 0.55 }),
    };
    this.M = M;
    const add = (geo, mat, o = {}) => {
      const m = new Mesh(geo, mat);
      if (o.cast) m.castShadow = true;
      if (o.recv) m.receiveShadow = true;
      O.add(m);
      return m;
    };

    // ---- white matter: fornix (cut at the top face), anterior commissure (cut at front and back),
    // optic chiasm with the nerve stump and the optic tract (cut at the back end)
    const F = AN.FORNIX;
    const fpts = F.pts.map((p, i) => (i === 0 ? [p[0], AN.BY0 + 0.6, p[2]] : p));
    add(tubeGeo(wpts(fpts), (u) => F.r0 + (F.r1 - F.r0) * Math.pow(u, 0.9) + 1.2 * Math.sin(u * Math.PI) * 0.5, { tubular: 110, radial: 22, capStart: true }), M.white);
    add(tubeGeo(wpts(AN.AC.pts.map((p, i, a) => (i === 0 ? [p[0], p[1], AN.ZF - 0.6] : i === a.length - 1 ? [p[0], p[1], AN.ZB + 0.6] : p))), (u) => AN.AC.r * (1 - 0.12 * Math.sin(u * Math.PI)), { tubular: 48, radial: 22, capStart: true, capEnd: true }), M.white);
    // optic chiasm: the nerves (cut stumps, forward) cross into the tracts (cut short, back)
    const optic = [blobGeo(AN.CHIASM.r, rng, { amp: 0.04, center: W(...AN.CHIASM.c) })];
    for (const path of [...AN.NERVES, ...AN.TRACTS]) optic.push(tubeGeo(wpts(path.pts), path.r, { tubular: 24, radial: 18, capEnd: true }));
    add(mergeGeos(optic), M.white);
    add(blobGeo([AN.MAMM.r, AN.MAMM.r * 0.94, AN.MAMM.r * 0.9], rng, { amp: 0.04, center: W(...AN.MAMM.c) }), M.mamm);

    // ---- vessels: A2's three in the slice (wandering in depth), deep penetrating vessels,
    // the median eminence's portal loops and the long portal vessels down the stalk
    const vessels = [];
    AN.VESSEL_LINES.forEach((v, i) => vessels.push(tubeGeo(wpts(v), (u) => (i === 2 ? 2.1 : 2.7) - 0.8 * u, { tubular: 60, radial: 10, capStart: true })));
    AN.DEEP_VESSELS.forEach((v) => vessels.push(tubeGeo(wpts(v), 2.4, { tubular: 50, radial: 8 })));
    AN.LOOPS.forEach((v) => vessels.push(tubeGeo(wpts(v), 1.05, { tubular: 28, radial: 8 })));
    AN.PORTAL.forEach((v) => vessels.push(tubeGeo(wpts(v), (u) => 1.25 - 0.55 * u, { tubular: 60, radial: 8 })));
    add(mergeGeos(vessels), M.vessel);

    // ---- the base: median eminence, stalk, anterior and posterior lobes, the bony cup
    add(tubeGeo(wpts(AN.STALK.pts), AN.STALK.r, { tubular: 40, radial: 28 }), M.stalk, { cast: true, recv: true });
    // anterior lobe: a broad bean (wider side to side), posterior lobe: smaller and rounder
    add(blobGeo(AN.LOBE_ANT.r, rng, { amp: 0.045, detail: 4, center: W(...AN.LOBE_ANT.c), shape: (x, y, z) => 1 - 0.07 * Math.max(0, x) * Math.max(0, y) + 0.035 * Math.sin(x * 4.1 + z * 2.3) * Math.sin(y * 3.7 + 1.1) }), M.ant, { cast: true, recv: true });
    add(blobGeo(AN.LOBE_POST.r, rng, { amp: 0.04, detail: 4, center: W(...AN.LOBE_POST.c) }), M.post, { cast: true, recv: true });
    const loop = closedLoop([...AN.SELLA_IN, [376, 476], ...AN.SELLA_OUT, [230, 494]], 96).map(([x, y]) => [x - AN.CX, AN.CY - y]);
    const sella = sweepGeo(loop, AN.SELLA.z0, AN.SELLA.z1, { slices: 30, lift: (zn) => -AN.SELLA.lift * zn * zn, taper: (zn) => 1 - 0.035 * zn * zn, cx: 306 - AN.CX, separate: true });
    add(sella.walls, M.bone, { cast: true, recv: true });
    add(sella.caps, M.boneCut, { recv: true });

    // ---- KNDy cells (8) and the heat-loss centre (6)
    this.kndy = AN.KNDY_POS.map((p, i) => {
      const g = new Group();
      g.position.copy(V3(p));
      const m = new Mesh(neuronGeometry(KR, 4, makeRng(100 + i)), M.kndy);
      g.add(m);
      O.add(g);
      return g;
    });
    this.mnpo = AN.MNPO_POS.map((p, i) => {
      const m = new Mesh(neuronGeometry(MR, 3, makeRng(200 + i), { branches: 1 }), M.mn);
      m.position.copy(V3(p));
      O.add(m);
      return m;
    });
    // NK3 receptor dots on the heat-loss neurons (A2: 6 per cell)
    const recGeo = blobGeo([1.9, 1.9, 1.9], rng, { amp: 0, detail: 2 });
    const rec = new InstancedMesh(recGeo, M.rec, AN.MNPO_POS.length * 6);
    const mtx = new Matrix4();
    let ri = 0;
    AN.MNPO_POS.forEach((p, i) => {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + i;
        const d = new Vector3(Math.cos(a) * 1.05, Math.sin(a) * 0.92, 0.62).normalize();
        mtx.makeTranslation(V3(p).addScaledVector(d, MR * 1.08));
        rec.setMatrixAt(ri++, mtx);
      }
    });
    O.add(rec);
    this.rec = rec;

    // ---- axons: 4 beaded KNDy → MnPO, 3 short to the median eminence; the heat-loss output
    const pathPts = (m) => m.pts.map((p, i) => W(p[0], p[1], m.zs[i]));
    add(mergeGeos([...AN.AXONS, ...AN.DOWN].map((m) => tubeGeo(pathPts(m), 1.15, { tubular: Math.max(24, m.pts.length * 2), radial: 7 }))), M.axon);
    const beadGeo = blobGeo([1, 1, 1], rng, { amp: 0, detail: 2 });
    const beadPos = AN.AXONS.flatMap((m) => m.pts.map((p, i) => [p[0], p[1], m.zs[i], i]).filter((q) => q[3] % 6 === 3));
    const beads = new InstancedMesh(beadGeo, M.axon, beadPos.length);
    beadPos.forEach((q, i) => {
      mtx.makeScale(2.1, 2.1, 2.1).setPosition(V3(q));
      beads.setMatrixAt(i, mtx);
    });
    O.add(beads);
    // output path, cut where it leaves the block's back end
    const outPts = [];
    for (let i = 0; i < AN.OUT.pts.length; i++) {
      const p = AN.OUT.pts[i];
      if (p[0] <= AN.BX1 - 0.6) outPts.push(W(p[0], p[1], AN.OUT.zs[i]));
      else {
        const q = AN.OUT.pts[i - 1];
        const t = (AN.BX1 - 0.6 - q[0]) / (p[0] - q[0]);
        outPts.push(W(AN.BX1 - 0.6, q[1] + (p[1] - q[1]) * t, AN.OUT.zs[i - 1] + (AN.OUT.zs[i] - AN.OUT.zs[i - 1]) * t));
        break;
      }
    }
    add(tubeGeo(outPts, 1.25, { tubular: 80, radial: 7, capEnd: true }), M.out);

    // ---- moving parts (instanced): neurokinin-B packets, heat-loss pulses, estrogen, glial speckle
    const ball = blobGeo([1, 1, 1], rng, { amp: 0, detail: 2 });
    this.packets = new InstancedMesh(ball, M.nkb, 96);
    this.pulses = new InstancedMesh(ball, M.pulse, 48);
    const hex = new CylinderGeometry(1, 1, 0.62, 6, 1);
    hex.rotateX(Math.PI / 2); // hexagon faces the viewer
    this.estro = new InstancedMesh(hex, M.estro, 48);
    for (const im of [this.packets, this.pulses, this.estro]) {
      im.count = 0;
      im.frustumCulled = false;
      O.add(im);
    }
    // glial nuclei through the depth of the block (they fade with depth: the strongest depth cue)
    const speckN = 420;
    const speck = new InstancedMesh(blobGeo([1, 1, 1], rng, { amp: 0, detail: 1 }), M.speck, speckN);
    const srng = makeRng(77);
    for (let i = 0; i < speckN; i++) {
      const x = AN.BX0 + 4 + srng() * (AN.BX1 - AN.BX0 - 8);
      const y = AN.BY0 + 4 + srng() * (AN.baseY(x) - AN.BY0 - 8);
      const z = AN.ZB + 4 + srng() * (AN.ZF - AN.ZB - 8);
      const s = 0.8 + srng() * 0.8;
      mtx.makeScale(s, s, s).setPosition(V3([x, y, z]));
      speck.setMatrixAt(i, mtx);
    }
    O.add(speck);

    // ---- contact shadow on an implied ground below the sella
    const shadowTex = shadowTexture();
    this._disposables.push(shadowTex);
    const ground = new Mesh(new PlaneGeometry(720, 450), new MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.copy(V3([300, 596, -75]));
    ground.renderOrder = 10;
    O.add(ground);

    // ---- block passes
    const bgeo = blockGeometry();
    this.blockGeo = bgeo;
    this.back.add(new Mesh(bgeo, new ShaderMaterial({ vertexShader: BACK_VS, fragmentShader: BACK_FS, side: BackSide })));
    const tri = new BufferGeometry();
    tri.setAttribute("position", new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.copyMat = new ShaderMaterial({ vertexShader: FULLSCREEN_VS, fragmentShader: COPY_FS, uniforms: { tColor: { value: null }, uRes: { value: new Vector2(1, 1) } }, depthTest: false, depthWrite: false, blending: NoBlending });
    const quad = new Mesh(tri, this.copyMat);
    quad.frustumCulled = false;
    quad.renderOrder = 0;
    this.comp.add(quad);
    const glowCol = [lin("#b81c95"), lin("#1f9c70"), lin("#f0822a")];
    this.blockU = {
      tColor: { value: null }, tDepth: { value: null }, tBack: { value: null },
      uRes: { value: new Vector2(1, 1) }, uNear: { value: this.camera.near }, uFar: { value: this.camera.far }, uDpr: { value: 1 },
      uSigma: { value: 0.0090 }, uOnset: { value: 85 }, uBlur: { value: 0.028 },
      uTissueA: { value: lin("#f9e7e9") }, uTissueB: { value: lin("#e8b6bf") }, uFrost: { value: lin(PAL.frost) }, uEdge: { value: lin(PAL.edge) }, uSpeck: { value: lin(PAL.speck) }, uWhite: { value: lin("#fffaf6") },
      uKeyDir: { value: this.keyDir.clone() }, uAmb: { value: 0.7 }, uKey: { value: 0.52 },
      uGlowPos: { value: [new Vector3(), new Vector3(), new Vector3()] }, uGlowCol: { value: glowCol }, uGlowAmt: { value: [0, 0, 0] }, uGlowRad: { value: [30, 40, 90] },
    };
    const blockMat = new ShaderMaterial({ vertexShader: BLOCK_VS, fragmentShader: BLOCK_FS, uniforms: this.blockU, blending: NoBlending, depthTest: true, depthWrite: true, side: FrontSide });
    const block = new Mesh(bgeo, blockMat);
    block.renderOrder = 1;
    this.comp.add(block);

    // ---- halos on moving signal (drawn last, occluded by solids, faded by depth)
    const hg = new InstancedBufferGeometry();
    const plane = new PlaneGeometry(1, 1);
    hg.index = plane.index;
    hg.setAttribute("position", plane.attributes.position);
    this.haloMax = 160;
    this.hPos = new InstancedBufferAttribute(new Float32Array(this.haloMax * 3), 3);
    this.hSize = new InstancedBufferAttribute(new Float32Array(this.haloMax), 1);
    this.hCol = new InstancedBufferAttribute(new Float32Array(this.haloMax * 4), 4);
    hg.setAttribute("iPos", this.hPos);
    hg.setAttribute("iSize", this.hSize);
    hg.setAttribute("iCol", this.hCol);
    hg.instanceCount = 0;
    this.haloGeo = hg;
    this.haloU = { tDepth: { value: null }, uRes: { value: new Vector2(1, 1) }, uNear: { value: this.camera.near }, uFar: { value: this.camera.far } };
    const haloMat = new ShaderMaterial({
      vertexShader: HALO_VS, fragmentShader: HALO_FS, uniforms: this.haloU, transparent: true, depthTest: false, depthWrite: false,
      blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor, blendSrcAlpha: OneFactor, blendDstAlpha: OneMinusSrcAlphaFactor,
    });
    const halos = new Mesh(hg, haloMat);
    halos.frustumCulled = false;
    halos.renderOrder = 2;
    this.comp.add(halos);

    // eased display state
    this.hotK = 0;
    this.blockK = 0;
    this.colMn = lin("#0d6e4e");
    this.colHot = lin(PAL.hot);
    this.colRec = lin(PAL.rec);
    this.colRecOff = lin(PAL.recOff);
    this.kCenter = AN.KNDY_POS.reduce((a, p) => [a[0] + p[0] / 8, a[1] + p[1] / 8, a[2] + p[2] / 8], [0, 0, 0]);
    this._tmpQ = new Quaternion();
    this._tmpE = new Euler();
    this._tmpV = new Vector3();
    this._tmpS = new Vector3();
    this._mtx = mtx;
  }

  setSize(w, h, dpr) {
    const r = this.renderer;
    r.setPixelRatio(dpr);
    r.setSize(w, h, false);
    const W2 = Math.max(1, Math.floor(w * dpr)), H2 = Math.max(1, Math.floor(h * dpr));
    this.rtO.setSize(W2, H2);
    this.rtB.setSize(W2, H2);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.copyMat.uniforms.uRes.value.set(W2, H2);
    this.blockU.uRes.value.set(W2, H2);
    this.blockU.uDpr.value = dpr;
    this.haloU.uRes.value.set(W2, H2);
    this.w = w;
    this.h = h;
  }

  /** Orbit around the target: yaw (+ = from the right), pitch (+ = from above), radians. */
  setView(yaw, pitch) {
    const c = this.camera;
    const d = this.dist;
    c.position.set(this.target.x + d * Math.sin(yaw) * Math.cos(pitch), this.target.y + d * Math.sin(pitch), this.target.z + d * Math.cos(yaw) * Math.cos(pitch));
    c.lookAt(this.target);
    c.updateMatrixWorld();
  }

  /** Light travel through the block from a point inside it toward the camera (for halos). */
  _haze(p) {
    const c = this.camera.position;
    const d = this._tmpV.subVectors(c, p).normalize();
    const X0 = AN.BX0 - AN.CX, X1 = AN.BX1 - AN.CX, YT = AN.CY - AN.BY0;
    if (p.x < X0 || p.x > X1 || p.y > YT || p.z > AN.ZF || p.z < AN.ZB) return 1;
    let t = 1e9;
    if (d.z > 1e-4) t = Math.min(t, (AN.ZF - p.z) / d.z);
    if (d.z < -1e-4) t = Math.min(t, (AN.ZB - p.z) / d.z);
    if (d.y > 1e-4) t = Math.min(t, (YT - p.y) / d.y);
    if (d.x > 1e-4) t = Math.min(t, (X1 - p.x) / d.x);
    if (d.x < -1e-4) t = Math.min(t, (X0 - p.x) / d.x);
    return Math.exp((-this.blockU.uSigma.value * t * t) / (t + this.blockU.uOnset.value));
  }

  /** Apply the simulation's state to the scene. dt = 0 snaps every eased value. */
  update(sim, dt) {
    const s = kndyOf(sim.e);
    const snap = !(dt > 0);
    const ease = (cur, to, tau) => (snap ? to : cur + (to - cur) * (1 - Math.exp(-dt / tau)));
    // KNDy cells: size from the model (diameter × √area), burst glow (A2: 0.18 + 0.82 × glow)
    for (const g of this.kndy) g.scale.setScalar(s.scale);
    const kg = 0.18 + 0.82 * sim.glow;
    this.M.kndy.emissiveIntensity = 0.55 * sim.glow;
    this.M.kndy.userData.u.uCoreAmt.value = 0.2 + 0.25 * sim.glow;
    // heat-loss centre: orange in a flash (A2 'a2-hot', 0.4 s transition), greyed receptors under a blocker
    this.hotK = ease(this.hotK, sim.hot() ? 1 : 0, 0.16);
    this.blockK = ease(this.blockK, sim.block ? 1 : 0, 0.35);
    const mc = this.M.mn.color.copy(this.colMn).lerp(this.colHot, this.hotK);
    if (this.blockK > 0) {
      const l = mc.r * 0.2126 + mc.g * 0.7152 + mc.b * 0.0722;
      mc.lerp(new Color(l, l, l), 0.45 * this.blockK);
    }
    this.M.mn.emissiveIntensity = 0.5 * this.hotK;
        this.M.rec.color.copy(this.colRec).lerp(this.colRecOff, this.blockK);
    this.M.out.emissiveIntensity = 0.25 * sim.heat();

    // glows inside the tissue (view space)
    const view = this.camera.matrixWorldInverse;
    const U = this.blockU;
    const total = sim.total();
    U.uGlowPos.value[0].copy(V3(this.kCenter)).applyMatrix4(view);
    U.uGlowRad.value[0] = 30 * s.scale;
    U.uGlowAmt.value[0] = 0.42 * kg;
    U.uGlowPos.value[1].copy(V3([186, 234, -11])).applyMatrix4(view);
    U.uGlowRad.value[1] = 40;
    U.uGlowAmt.value[1] = 0.5 * (0.12 + 0.7 * Math.min(1, total));
    U.uGlowPos.value[2].copy(V3([186, 234, -14])).applyMatrix4(view);
    U.uGlowRad.value[2] = 92;
    U.uGlowAmt.value[2] = 0.85 * sim.heat();

    // packets (A2 radii 2.8 to the heat-loss centre, 2.2 to the median eminence)
    const mtx = this._mtx;
    const pt = [0, 0, 0];
    let n = 0, h = 0;
    const hP = this.hPos.array, hS = this.hSize.array, hC = this.hCol.array;
    const nkb = lin(PAL.nkb);
    const hot = lin("#ff8a2a");
    const pushHalo = (p, size, c, a) => {
      if (h >= this.haloMax) return;
      hP[h * 3] = p.x;
      hP[h * 3 + 1] = p.y;
      hP[h * 3 + 2] = p.z;
      hS[h] = size;
      hC[h * 4] = c.r;
      hC[h * 4 + 1] = c.g;
      hC[h * 4 + 2] = c.b;
      hC[h * 4 + 3] = a;
      h++;
    };
    for (const p of sim.packets) {
      if (p.s < 0 || n >= this.packets.instanceMatrix.count) continue;
      along(p.m, p.s, pt);
      const r = (p.mn ? 2.8 : 2.2) * 1.22;
      const v = V3(pt);
      mtx.makeScale(r, r, r).setPosition(v);
      this.packets.setMatrixAt(n++, mtx);
      pushHalo(v, r * 5.2, nkb, 0.46 * this._haze(v));
    }
    this.packets.count = n;
    this.packets.instanceMatrix.needsUpdate = true;
    n = 0;
    for (const q of sim.pulses) {
      along(AN.OUT, q.s, pt);
      if (pt[0] > AN.BX1 - 2 || n >= 48) continue;
      const v = V3(pt);
      mtx.makeScale(3.4, 3.4, 3.4).setPosition(v);
      this.pulses.setMatrixAt(n++, mtx);
      pushHalo(v, 20, hot, 0.55 * this._haze(v));
    }
    this.pulses.count = n;
    this.pulses.instanceMatrix.needsUpdate = true;
    // estrogen: amber hexagons, fade in and out over 0.6 s (A2), docked ones sit on the soma
    n = 0;
    const kEase = snap ? 1 : 1 - Math.exp(-dt / 0.12);
    for (const m of sim.estro) {
      const fade = Math.min(1, m.age / 0.6, (m.life - m.age) / 0.6);
      let tx, ty, tz;
      if (m.dock >= 0) {
        // seated on the soma's viewer-facing side, in A2's docking direction
        const k = AN.KNDY_POS[m.dock];
        const a = Math.atan2(m.oy, m.ox);
        const rr = KR * 1.05 * s.scale + 3.2;
        tx = k[0] + Math.cos(a) * rr * 0.78;
        ty = k[1] + Math.sin(a) * rr * 0.78;
        tz = k[2] + rr * 0.63;
      } else {
        tx = m.x;
        ty = m.y;
        tz = m.z;
      }
      // drawn inside the tissue
      tx = Math.min(AN.BX1 - 5, Math.max(AN.BX0 + 5, tx));
      ty = Math.min(AN.baseY(tx) - 5, Math.max(AN.BY0 + 5, ty));
      tz = Math.min(AN.ZF - 5, Math.max(AN.ZB + 5, tz));
      if (m.px === undefined || snap) {
        m.px = tx;
        m.py = ty;
        m.pz = tz;
      } else {
        m.px += (tx - m.px) * kEase;
        m.py += (ty - m.py) * kEase;
        m.pz += (tz - m.pz) * kEase;
      }
      if (fade <= 0.05 || n >= 48) continue;
      const r = 5.0 * Math.max(0.4, fade);
      this._tmpE.set(0.35 * Math.sin(m.spin * 0.7), 0.4 * Math.cos(m.spin * 0.5), m.spin);
      this._tmpQ.setFromEuler(this._tmpE);
      mtx.compose(V3([m.px, m.py, m.pz]), this._tmpQ, this._tmpS.set(r, r, r));
      this.estro.setMatrixAt(n++, mtx);
    }
    this.estro.count = n;
    this.estro.instanceMatrix.needsUpdate = true;
    this.haloGeo.instanceCount = h;
    this.hPos.needsUpdate = this.hSize.needsUpdate = this.hCol.needsUpdate = true;
  }

  render() {
    const r = this.renderer;
    const cam = this.camera;
    r.info.reset();
    r.setRenderTarget(this.rtB);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.back, cam);
    r.setRenderTarget(this.rtO);
    r.clear();
    r.render(this.opaque, cam);
    r.setRenderTarget(null);
    r.clear();
    this.copyMat.uniforms.tColor.value = this.rtO.texture;
    const U = this.blockU;
    U.tColor.value = this.rtO.texture;
    U.tDepth.value = this.rtO.depthTexture;
    U.tBack.value = this.rtB.texture;
    this.haloU.tDepth.value = this.rtO.depthTexture;
    r.render(this.comp, cam);
  }

  stats() {
    const i = this.renderer.info;
    return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures };
  }

  dispose() {
    this.opaque.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    this.comp.traverse((o) => o.material && o.material.dispose());
    this.blockGeo.dispose();
    this.haloGeo.dispose();
    for (const t of this._disposables) t.dispose();
    this.rtO.dispose();
    this.rtB.dispose();
    if (this.envRT) this.envRT.dispose();
    this.renderer.dispose();
  }
}
