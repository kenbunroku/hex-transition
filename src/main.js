import * as THREE from "three/webgpu";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { Pane } from "tweakpane";
import {
  mx_noise_float,
  color,
  cross,
  dot,
  float,
  transformNormalToView,
  positionLocal,
  sign,
  step,
  Fn,
  uniform,
  varying,
  vec2,
  vec3,
  vec4,
  pow,
  uv,
  texture,
  attribute,
  Loop,
  mix,
  floor,
  positionWorld,
  max,
  smoothstep,
  cos,
  sin,
  length,
  abs,
  remap,
} from "three/tsl";
import t1 from "../t1.jpg";
import t2 from "../t2.jpg";

export default class Sketch {
  constructor(options) {
    this.scene = new THREE.Scene();

    this.container = options.dom;

    // Ensure container has dimensions before proceeding
    if (this.container.clientWidth === 0 || this.container.clientHeight === 0) {
      this.container.style.width = "100%";
      this.container.style.height = "100vh";
    }

    this.width = Math.max(1, this.container.clientWidth);
    this.height = Math.max(1, this.container.clientHeight);

    this.init(options);
  }

  async init(options) {
    try {
      // Create WebGPU renderer
      this.renderer = new THREE.WebGPURenderer();

      // Wait for the renderer to initialize
      await this.renderer.init();

      this.renderer.setPixelRatio(window.devicePixelRatio);

      // Ensure dimensions are valid
      this.width = Math.max(1, this.container.clientWidth);
      this.height = Math.max(1, this.container.clientHeight);
      console.log("Setting renderer size:", this.width, this.height);

      this.renderer.setSize(this.width, this.height);
      this.renderer.setClearColor(0xffffff, 1);

      this.container.appendChild(this.renderer.domElement);

      let frustumSize = 1;
      let aspect = 1;
      this.camera = new THREE.OrthographicCamera(
        frustumSize * aspect * -0.5,
        frustumSize * aspect * 0.5,
        frustumSize * 0.5,
        frustumSize * -0.5,
        0.01,
        1000
      );
      this.camera.position.set(0, 0, 3.5);
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.time = 0;

      this.isPlaying = true;

      this.addObjects();
      // this.addLights();
      this.setupResize();
      this.setUpSettings();

      // Start rendering after initialization
      this.render();
    } catch (error) {
      console.error("WebGPU initialization error:", error);
    }
  }

  setUpSettings() {
    this.settings = {
      progress: 0,
    };
    this.pane = new Pane();
    this.pane
      .addBinding(this.settings, "progress", {
        min: 0,
        max: 1,
        step: 0.01,
      })
      .on("change", (value) => {
        this.transition.value = value.value;
      });
  }

  setupResize() {
    window.addEventListener("resize", this.resize.bind(this));
    // Initial resize
    this.resize();
  }

  resize() {
    // Ensure we have valid dimensions
    this.width = Math.max(1, this.container.clientWidth);
    this.height = Math.max(1, this.container.clientHeight);

    console.log("Resize:", this.width, this.height);

    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
  }

  addObjects() {
    let texture1 = new THREE.TextureLoader().load(t1);
    let texture2 = new THREE.TextureLoader().load(t2);

    const uTransition = uniform(float(0));
    const uTime = uniform(float(0));
    this.transition = uTransition;
    this.timeUniform = uTime;

    this.material = new THREE.NodeMaterial();

    const hexDistance = Fn(([uv]) => {
      const s = vec2(1, 1.7320508075688772);
      const p = uv.toVar().abs();
      return max(dot(p, s.mul(0.5)), p.x);
    });

    const hexCoordinates = Fn(([uv]) => {
      const s = vec2(1, 1.7320508075688772);
      const hexCenter = sround(
        vec4(uv, uv.toVar().sub(vec2(0.5, 1))).div(s.xyxy)
      );

      const offset = vec4(
        uv.sub(hexCenter.xy.mul(s)),
        uv.sub(hexCenter.zw.add(vec2(0.5)).mul(s))
      );

      const dot1 = dot(offset.xy, offset.xy);
      const dot2 = dot(offset.zw, offset.zw);

      const final1 = vec4(offset.xy, hexCenter.xy);
      const final2 = vec4(offset.zw, hexCenter.zw);

      const diff = dot1.sub(dot2);
      const final = mix(final1, final2, step(0, diff));

      return final;
    });

    const sround = Fn(([s]) => {
      return floor(s.add(0.5));
    });

    const scaleUV = Fn(([uv, scale]) => {
      return uv.toVar().sub(vec2(0.5)).mul(scale).add(vec2(0.5));
    });
    const uAspect = uniform(vec2(1, this.width / this.height));

    this.material.colorNode = Fn(() => {
      const corUV = scaleUV(uv(), uAspect);

      const distUV = scaleUV(
        corUV,
        vec2(float(1).add(length(uv().sub(0.5).mul(1))))
      );

      const hexUV = distUV.mul(20);
      const hexCoords = hexCoordinates(hexUV);

      const hexDist = hexDistance(hexCoords.xy).add(0.03);
      const border = smoothstep(0.51, 0.51 + 0.01, hexDist);
      const y = pow(max(0, float(0.5).sub(hexDist)).oneMinus(), 10).mul(1.5);
      const z = mx_noise_float(hexCoords.zw.mul(0.6));

      const offset = float(0.2);
      const bounceTransition = smoothstep(
        0,
        0.5,
        abs(uTransition.sub(0.5))
      ).oneMinus();

      const blendCut = smoothstep(
        uv().y.sub(offset),
        uv().y.add(offset),
        remap(
          uTransition.add(z.mul(0.08).mul(bounceTransition)),
          0,
          1,
          offset.mul(-1),
          float(1).add(offset)
        )
      );

      const merge = smoothstep(0, 0.5, abs(blendCut.sub(0.5))).oneMinus();

      const cut = step(
        uv().y,
        uTransition.add(y.add(z).mul(0.05).mul(bounceTransition))
      );
      const textureUV = distUV.add(
        y
          .mul(sin(uv().y.mul(5).sub(uTime)))
          .mul(merge)
          .mul(0.025)
      );

      const fromUV = textureUV.toVar();
      const toUV = textureUV.toVar();

      fromUV.assign(
        scaleUV(
          fromUV.toVar(),
          vec2(float(1).add(z.mul(0.2).mul(merge).add(uTransition)))
        )
      );
      toUV.assign(
        toUV.toVar(),
        vec2(float(1).add(z.mul(0.2).mul(blendCut).add(uTransition)))
      );

      const colorBlend = merge.mul(border).mul(bounceTransition);

      const sample1 = texture(texture1, fromUV);
      const sample2 = texture(texture2, toUV);

      const final = mix(sample1, sample2, cut);

      final.addAssign(vec4(1, 0.4, 0).mul(colorBlend).mul(2));

      return final;
      // return vec4(colorBlend);
    })();

    this.geometry = new THREE.PlaneGeometry(1, 1, 1, 1);

    this.mesh = new THREE.Mesh(this.geometry, this.material);

    this.scene.add(this.mesh);
  }

  async render() {
    if (!this.isPlaying) return;

    this.time += 0.01;
    this.timeUniform.value = this.time;
    // Update controls
    this.controls.update();

    try {
      // Use renderAsync for WebGPU
      await this.renderer.renderAsync(this.scene, this.camera);
      // Schedule next frame only after successful render
      requestAnimationFrame(this.render.bind(this));
    } catch (error) {
      console.error("Render error:", error);
      // Try to recover by scheduling next frame anyway
      requestAnimationFrame(this.render.bind(this));
    }
  }
}

// Wait for DOM to be ready
window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("canvas");
  if (canvas) {
    new Sketch({
      dom: canvas,
    });
  } else {
    console.error("Canvas element not found");
  }
});
