import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import faceImageUrl from "../assets/nise.png?url";
import spoonModelUrl from "../assets/Spoon.obj?url";
import "./style.css";

const FACE_IMAGE = faceImageUrl;
const SPOON_MODEL = spoonModelUrl;
const dialogLayer = document.querySelector("[data-dialog-layer]");
const dialogContent = {
  listen: {
    title: "Listen",
    x: "34vw",
    y: "24vh",
    html: `
      <div class="embed-stack">
        <iframe
          class="media-embed media-embed--spotify"
          title="Kitsuneri Spotify playlist"
          src="https://open.spotify.com/embed/playlist/4muOOTi0PpADqaAwGe0d5i?utm_source=generator&theme=0"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
        ></iframe>
        <div class="embed-placeholder">YouTube video</div>
      </div>
    `,
  },
  about: {
    title: "About",
    x: "18vw",
    y: "50vh",
    html: `
      <p>キツネリ / Kitsuneri</p>
      <p>音楽と絵とインターネットのあいだにいる。</p>
    `,
  },
  log: {
    title: "Log",
    x: "57vw",
    y: "23vh",
    html: `
      <ul>
        <li>Release history</li>
        <li>Works / provided songs</li>
        <li>Notes</li>
      </ul>
    `,
  },
  event: {
    title: "event",
    x: "58vw",
    y: "54vh",
    html: `
      <p>出演情報をここに置く。</p>
      <p>日付、会場、チケットリンクなど。</p>
    `,
  },
};
let dialogDepth = 10;

const canvas = document.querySelector("[data-spoon-stage]");
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  canvas,
  powerPreference: "high-performance",
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  31,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);

camera.position.set(0, 0.05, 6.2);
camera.lookAt(0, 0, 0);

const composer = new EffectComposer(renderer);
const retroPass = new ShaderPass(createRetroShader());
composer.addPass(new RenderPass(scene, camera));
composer.addPass(retroPass);
composer.setPixelRatio(1);
composer.setSize(window.innerWidth, window.innerHeight);

const targetPointer = new THREE.Vector2();
const easedPointer = new THREE.Vector2();
const facePointer = new THREE.Vector2();
const clock = new THREE.Clock();
const spoonAnchor = new THREE.Group();
const spoonState = {
  faceOverlayMaterial: null,
  model: null,
};

scene.add(spoonAnchor);
scene.environment = createEnvironment();

const fillLight = new THREE.HemisphereLight(0xffeadb, 0x140f15, 1.95);
scene.add(fillLight);

const keyLight = new THREE.DirectionalLight(0xffd9bd, 3.35);
keyLight.position.set(-2.7, 2.6, 4.6);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x9ddcff, 0.72);
rimLight.position.set(3.2, -1.5, 3.1);
scene.add(rimLight);

window.__spoonPrototype = {
  camera,
  renderer,
  composer,
  status: "loading",
};

try {
  const faceTexture = await loadTexture(FACE_IMAGE);
  const faceOverlayMaterial = createFaceOverlayMaterial(faceTexture);
  const chromeMaterial = createChromeMaterial();
  const spoon = await new OBJLoader().loadAsync(SPOON_MODEL);

  normalizeObject(spoon);
  applySpoonMaterials(spoon, chromeMaterial, faceOverlayMaterial);

  spoon.rotation.set(-Math.PI / 2, Math.PI, 0);
  spoon.scale.multiplyScalar(1.92);
  spoonAnchor.add(spoon);
  spoonAnchor.position.y = -0.96;

  spoonState.faceOverlayMaterial = faceOverlayMaterial;
  spoonState.model = spoon;

  window.__spoonPrototype = {
    camera,
    chromeMaterial,
    faceOverlayMaterial,
    renderer,
    composer,
    spoon,
    spoonAnchor,
    status: "ready",
  };

  renderer.setAnimationLoop(renderFrame);
} catch (error) {
  window.__spoonPrototype.status = "error";
  window.__spoonPrototype.error = String(error);
  console.error(error);
}

window.addEventListener("pointermove", (event) => {
  targetPointer.set(
    (event.clientX / window.innerWidth) * 2 - 1,
    -((event.clientY / window.innerHeight) * 2 - 1),
  );
});

window.addEventListener("pointerleave", () => {
  targetPointer.set(0, 0);
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  composer.setPixelRatio(1);
  composer.setSize(window.innerWidth, window.innerHeight);
  retroPass.uniforms.uResolution.value.set(
    window.innerWidth,
    window.innerHeight,
  );
});

document.querySelectorAll("[data-dialog-trigger]").forEach((trigger) => {
  trigger.addEventListener("click", () => {
    openInfoDialog(trigger.dataset.dialogTrigger);
  });
});

function applySpoonMaterials(spoon, chromeMaterial, faceOverlayMaterial) {
  const overlays = [];

  spoon.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    const smoothGeometry = child.geometry.clone();
    smoothGeometry.deleteAttribute("normal");
    child.geometry = mergeVertices(smoothGeometry, 0.001);
    child.geometry.computeVertexNormals();
    child.material = chromeMaterial;
    child.castShadow = false;
    child.receiveShadow = false;

    const overlay = new THREE.Mesh(child.geometry, faceOverlayMaterial);
    overlay.name = "face-reflection-overlay";
    overlay.renderOrder = 2;
    overlay.frustumCulled = child.frustumCulled;
    overlays.push([child, overlay]);
  });

  overlays.forEach(([mesh, overlay]) => mesh.add(overlay));
}

function createChromeMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xd8d2c8,
    emissive: 0x2d2520,
    emissiveIntensity: 0.65,
    envMapIntensity: 1.08,
    metalness: 1,
    roughness: 0.31,
    clearcoat: 0.72,
    clearcoatRoughness: 0.28,
  });
}

function createEnvironment() {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
  pmrem.dispose();
  return environment;
}

function createFaceOverlayMaterial(faceTexture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uFace: { value: faceTexture },
      uFacePointer: { value: facePointer },
      uPointer: { value: easedPointer },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec3 vLocalPosition;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);

        vLocalPosition = position;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vWorldPosition = worldPosition.xyz;

        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D uFace;
      uniform vec2 uFacePointer;
      uniform vec2 uPointer;
      uniform float uTime;

      varying vec3 vLocalPosition;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      float frameMask(vec2 uv) {
        vec2 inside = step(vec2(0.0), uv) * step(uv, vec2(1.0));
        return inside.x * inside.y;
      }

      vec2 rotateUv(vec2 point, float angle) {
        float sine = sin(angle);
        float cosine = cos(angle);

        return mat2(cosine, -sine, sine, cosine) * point;
      }

      void main() {
        vec3 normalDirection = normalize(vWorldNormal);
        vec3 cameraRay = normalize(vWorldPosition - cameraPosition);
        vec3 reflectedRay = normalize(reflect(cameraRay, normalDirection));
        float frontReflection = smoothstep(0.01, 0.42, reflectedRay.z);

        vec2 projectedRay = reflectedRay.xy / max(reflectedRay.z + 0.56, 0.44);
        float edgeWarp = dot(projectedRay, projectedRay);
        projectedRay *= 1.0 + edgeWarp * 0.28;
        projectedRay.x += projectedRay.y * projectedRay.y * 0.22;
        projectedRay.y -= projectedRay.x * projectedRay.x * 0.1;
        projectedRay.x += sin(projectedRay.y * 7.0) * edgeWarp * 0.045;
        vec2 faceFollow = uFacePointer * vec2(0.052, 0.04);
        vec2 pointerLead = (uPointer - uFacePointer) * vec2(0.16, 0.11);
        projectedRay += faceFollow + pointerLead;
        projectedRay.x += faceFollow.x * projectedRay.y * 0.18;
        projectedRay.y -= faceFollow.y * projectedRay.x * 0.12;
        projectedRay += vec2(
          sin(uTime * 0.72 + projectedRay.y * 4.0),
          cos(uTime * 0.58 + projectedRay.x * 4.8)
        ) * 0.006;

        float lowerImageReach = smoothstep(0.05, 0.92, -uFacePointer.y);
        vec2 imageCompensation = uFacePointer * vec2(0.22, 0.31);
        imageCompensation += pointerLead * vec2(0.44, 0.52);
        imageCompensation.y += lowerImageReach * 0.58;
        float imageAngle = uFacePointer.x * 0.12 - uFacePointer.y * 0.06;
        imageAngle += (uPointer.x - uFacePointer.x) * 0.08;
        vec2 imageRay = rotateUv(projectedRay - imageCompensation, imageAngle);
        vec2 imageReach = vec2(0.13, mix(0.24, 0.275, lowerImageReach));
        vec2 faceUv = vec2(0.5, 0.5) + imageRay * imageReach;
        vec4 face = texture2D(uFace, faceUv);

        float bowlMask = 1.0 - smoothstep(-63.0, -29.0, vLocalPosition.z);
        float faceAlpha = smoothstep(0.01, 0.08, face.a);
        float facePresence = bowlMask * frameMask(faceUv) * faceAlpha;
        float opacity = facePresence * mix(0.84, 1.0, frontReflection);
        float imageContrast = smoothstep(0.04, 0.92, dot(face.rgb, vec3(0.28, 0.59, 0.13)));
        vec3 reflectedFace = mix(face.rgb * vec3(0.8, 0.92, 1.08), face.rgb, imageContrast);
        float faceLuma = dot(reflectedFace, vec3(0.28, 0.59, 0.13));
        reflectedFace *= mix(1.0, 0.76, smoothstep(0.56, 0.92, faceLuma));

        gl_FragColor = vec4(reflectedFace, opacity);
      }
    `,
    blending: THREE.NormalBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    side: THREE.DoubleSide,
    transparent: true,
    toneMapped: false,
  });
}

function renderFrame() {
  const elapsed = clock.getElapsedTime();
  easedPointer.lerp(targetPointer, 0.06);
  facePointer.lerp(targetPointer, 0.026);

  spoonAnchor.rotation.x = 0.09 + easedPointer.y * 0.23;
  spoonAnchor.rotation.y = easedPointer.x * 0.31;
  spoonAnchor.rotation.z = Math.sin(elapsed * 0.55) * 0.016;
  spoonAnchor.position.y = -0.96 + Math.sin(elapsed * 0.7) * 0.018;

  if (spoonState.faceOverlayMaterial) {
    spoonState.faceOverlayMaterial.uniforms.uTime.value = elapsed;
  }

  composer.render();
}

function openInfoDialog(id) {
  if (!dialogLayer || !dialogContent[id]) {
    return;
  }

  const existing = dialogLayer.querySelector(`[data-dialog="${id}"]`);
  if (existing) {
    existing.remove();
    return;
  }

  const dialog = document.createElement("section");
  const content = dialogContent[id];
  dialog.className = "info-dialog";
  dialog.dataset.dialog = id;
  dialog.style.setProperty("--dialog-left", content.x);
  dialog.style.setProperty("--dialog-top", content.y);
  dialog.style.setProperty("--dialog-z", String(++dialogDepth));
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-label", content.title);
  dialog.innerHTML = `
    <div class="dialog-bar" data-dialog-handle>
      <h2 class="dialog-title">${content.title}</h2>
      <button class="dialog-close" type="button" aria-label="Close ${content.title}">×</button>
    </div>
    <div class="dialog-body">${content.html}</div>
  `;

  dialogLayer.append(dialog);
  clampDialogToViewport(dialog);
  makeDialogDraggable(dialog);
  dialog.querySelector(".dialog-close").addEventListener("click", () => {
    dialog.remove();
  });
}

function bringDialogToFront(dialog) {
  dialog.style.setProperty("--dialog-z", String(++dialogDepth));
}

function makeDialogDraggable(dialog) {
  const handle = dialog.querySelector("[data-dialog-handle]");
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  handle.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) {
      return;
    }

    bringDialogToFront(dialog);
    const bounds = dialog.getBoundingClientRect();
    dragOffsetX = event.clientX - bounds.left;
    dragOffsetY = event.clientY - bounds.top;
    dialog.classList.add("is-dragging");
    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener("pointermove", (event) => {
    if (!dialog.classList.contains("is-dragging")) {
      return;
    }

    setDialogPosition(dialog, event.clientX - dragOffsetX, event.clientY - dragOffsetY);
  });

  handle.addEventListener("pointerup", (event) => {
    dialog.classList.remove("is-dragging");
    handle.releasePointerCapture(event.pointerId);
  });
}

function setDialogPosition(dialog, left, top) {
  const bounds = dialog.getBoundingClientRect();
  const margin = 8;
  const maxLeft = window.innerWidth - bounds.width - margin;
  const maxTop = window.innerHeight - bounds.height - margin;
  const nextLeft = Math.max(margin, Math.min(left, maxLeft));
  const nextTop = Math.max(margin, Math.min(top, maxTop));

  dialog.style.setProperty("--dialog-left", `${nextLeft}px`);
  dialog.style.setProperty("--dialog-top", `${nextTop}px`);
}

function clampDialogToViewport(dialog) {
  requestAnimationFrame(() => {
    const bounds = dialog.getBoundingClientRect();
    setDialogPosition(dialog, bounds.left, bounds.top);
  });
}

function normalizeObject(object) {
  const bounds = new THREE.Box3().setFromObject(object);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const largestDimension = Math.max(size.x, size.y, size.z);
  const normalizedScale = 2.4 / largestDimension;

  object.scale.setScalar(normalizedScale);
  object.position.copy(center).multiplyScalar(-normalizedScale);
}

async function loadTexture(path) {
  const texture = await new THREE.TextureLoader().loadAsync(path);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

function createRetroShader() {
  return {
    uniforms: {
      tDiffuse: { value: null },
      uResolution: {
        value: new THREE.Vector2(window.innerWidth, window.innerHeight),
      },
    },
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform vec2 uResolution;
      varying vec2 vUv;

      float bayer4(vec2 pixel) {
        vec2 p = mod(pixel, 4.0);

        if (p.y < 1.0) {
          if (p.x < 1.0) return 0.0;
          if (p.x < 2.0) return 8.0;
          if (p.x < 3.0) return 2.0;
          return 10.0;
        }

        if (p.y < 2.0) {
          if (p.x < 1.0) return 12.0;
          if (p.x < 2.0) return 4.0;
          if (p.x < 3.0) return 14.0;
          return 6.0;
        }

        if (p.y < 3.0) {
          if (p.x < 1.0) return 3.0;
          if (p.x < 2.0) return 11.0;
          if (p.x < 3.0) return 1.0;
          return 9.0;
        }

        if (p.x < 1.0) return 15.0;
        if (p.x < 2.0) return 7.0;
        if (p.x < 3.0) return 13.0;
        return 5.0;
      }

      void main() {
        float pixelScale = 2.25;
        vec2 lowRes = max(floor(uResolution / pixelScale), vec2(1.0));
        vec2 lowPixel = floor(vUv * lowRes);
        vec2 sampleUv = (lowPixel + 0.5) / lowRes;
        vec4 source = texture2D(tDiffuse, sampleUv);
        vec3 color = source.rgb;
        float dither = (bayer4(lowPixel) / 16.0 - 0.5) * 0.085;

        color = mix(color, color / (color + vec3(0.18)), 0.38);
        color += dither;
        color = floor(clamp(color, 0.0, 1.0) * 26.0) / 26.0;

        gl_FragColor = vec4(color, source.a);
      }
    `,
  };
}
