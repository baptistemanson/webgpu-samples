import glslangModule from "../glslang";

export const title = "Hello Triangle";
export const description = "Shows rendering a basic triangle.";

export async function init(canvas: HTMLCanvasElement) {
  // Im not used to this recent version of glsl.
  // the triangle is fully defined shader side, with vertices being all null.
  const vertexShaderGLSL = `#version 450
      const vec2 pos[3] = vec2[3](vec2(0.0f, 0.5f), vec2(-0.5f, -0.5f), vec2(0.5f, -0.5f));

      void main() {
          gl_Position = vec4(pos[gl_VertexIndex], 0.0, 1.0);
      }
    `;

  const fragmentShaderGLSL = `#version 450
      layout(location = 0) out vec4 outColor;

      void main() {
          outColor = vec4(1.0, 0.0, 0.0, 1.0);
      }
    `;

  // an adapter is a combination API x physical GPU.
  // looks inspired from Vulkan, so the idea would be to request an adapter with certain constraints, check if it matches, then instantiate.
  // could be used for instance to compare the high-performance and low-power profile to take low-profile if it meets the needs.
  // right now, it looks like not supported https://github.com/chromium/chromium/blob/b32bf850f35a50a0d22830793322094e49ffe7c5/third_party/blink/renderer/modules/webgpu/gpu_device.cc#L44
  const adapter = await navigator.gpu.requestAdapter();

  // when we have found an adapter we like in terms of extensions, limits etc, we "instantiate" the adapter. It is called a device.
  // all textures/buffers are attached to this device.
  // We need to instantiate because it creates the queues and the error callbacks.
  // I wonder why it is async, it should be fast? Queue init is nothing.
  const device = await adapter.requestDevice();
  // this is the compiler
  const glslang = await glslangModule();

  // funny this gpupresent stuff
  const context = canvas.getContext("gpupresent");

  const swapChainFormat = "bgra8unorm"; // 32 bit color pixels with transparency. normalized between 0 and 1.

  // the swap chain is essentially a collection of images waiting to be rendered on screen.
  // swap chain is not part of the render pipeline
  // @ts-ignore:
  const swapChain: GPUSwapChain = context.configureSwapChain({
    device,
    format: swapChainFormat,
  });

  const pipeline = device.createRenderPipeline({
    // a render pipeline is different from a compute pipeline.
    layout: device.createPipelineLayout({ bindGroupLayouts: [] }), // the layout is for describing the organization of uniforms.

    vertexStage: {
      module: device.createShaderModule({
        code: glslang.compileGLSL(vertexShaderGLSL, "vertex"), // we should be able to add source maps as well

        // @ts-ignore
        source: vertexShaderGLSL, // not in the specs, maybe the same as sourceMaps?
        transform: (source) => glslang.compileGLSL(source, "vertex"), // not in the specs, prob used by the live editor?
      }),
      entryPoint: "main", // reinforced on all langs. Should be the result of a pragmatic choice.
    },
    fragmentStage: {
      module: device.createShaderModule({
        code: glslang.compileGLSL(fragmentShaderGLSL, "fragment"),

        // @ts-ignore
        source: fragmentShaderGLSL,
        transform: (source) => glslang.compileGLSL(source, "fragment"), // there is now a case "compute" as well in this compiler
      }),
      entryPoint: "main",
    },

    primitiveTopology: "triangle-list", // === triangles. now it is explicitely -list or -strip. Interesting!

    colorStates: [
      // colorStates is fully concerned by the framebuffer, and how we write into it.
      // weird name huh? It could be called targetAttachment or framebuffer or output.
      // ? I wonder why it is plural, all the others are singular.
      {
        format: swapChainFormat, // also alphaBlend, colorBlend and writeMask are here
        // colorBlend and alpha blend describes how the new frame blends with the framebuffer. As we cannot have a read/write texture in the same path, opengl and others provide prebaked standar merging "functions".
        // it could be done manually but would require 2 framebuffers and an extra pass.
        // it kind of emulates the blend modes in photoshop or sketch.
        // writeMask activates or deactives color writing. I guess sometimes you only want 1 color.
      },
    ],
  });

  function frame() {
    const commandEncoder = device.createCommandEncoder({}); // so the command encoder is built at each frame.
    // maybe its here so we can reuse it for static objects between frames?
    // right now it is an accumulator of all GPU commands for one or several render passes.

    const textureView = swapChain.getCurrentTexture().createView();
    // there is an indirection here: we can have several passes rendering in different regions of the same texture.
    // probably useful for stereoscopic vision.

    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        // framebuffer to render to.
        {
          attachment: textureView,
          loadValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }, // what to put in the framebuffer by default.
        },
      ],
    };

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    // we start a render pass. It is explicitly started like a transaction, because some stuff are only set for the duration of a render pass.
    // such as the binding groups, the resource usage (a texture can toggle between write and read for instance).
    // all actions scoped to a renderPass must be called on the renderPassEncoder to make it explicit.
    // it changes the state of the commandEncoder as well.
    passEncoder.setPipeline(pipeline);
    passEncoder.draw(3, 1, 0, 0); // 3 vertices to draw, 1 triangle, then first vertex pos 0, first instance pos 0
    // we didnt attach any vertex buffer, nor indixe buffer, so I guess there is a default buffer full of 0 somewhere.
    passEncoder.endPass(); // If you draw to an ended passEncoder, it throws an error. Equally, we cannot finish if the passEncoder is not ended.

    device.defaultQueue.submit([commandEncoder.finish()]); // we submit the commands to the queue. Async.
    // to know when the call is resolved, one must use a GPUFence.
  }

  return frame;
}
