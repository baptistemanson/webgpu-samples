import glslangModule from "../glslang";

export const title = "Hello Triangle MSAA";
export const description =
  "Shows rendering a basic triangle with multisampling.";

export async function init(canvas: HTMLCanvasElement) {
  const vertexShaderGLSL = `#version 450
      const vec2 pos[3] = vec2[3](vec2(0.0f, 0.5f), vec2(-0.5f, -0.5f), vec2(0.5f, -0.5f));

      void main() {
          gl_Position = vec4(pos[gl_VertexIndex], 0.0, 1.0);
      }
    `;

  const fragmentShaderGLSL = `#version 450
      layout(location = 0) out vec4 outColor;

      void main() {
          outColor = vec4(gl_FragCoord.xy/800., 0.,1.0);
      }
    `;

  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
  const glslang = await glslangModule();

  const context = canvas.getContext("gpupresent");

  const swapChainFormat = "bgra8unorm";

  // @ts-ignore:
  const swapChain: GPUSwapChain = context.configureSwapChain({
    device,
    format: swapChainFormat,
  });

  const sampleCount = 4;

  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [] }),

    vertexStage: {
      module: device.createShaderModule({
        code: glslang.compileGLSL(vertexShaderGLSL, "vertex"),

        // @ts-ignore
        source: vertexShaderGLSL,
        transform: (source) => glslang.compileGLSL(source, "vertex"),
      }),
      entryPoint: "main",
    },
    fragmentStage: {
      module: device.createShaderModule({
        code: glslang.compileGLSL(fragmentShaderGLSL, "fragment"),

        // @ts-ignore
        source: fragmentShaderGLSL,
        transform: (source) => glslang.compileGLSL(source, "fragment"),
      }),
      entryPoint: "main",
    },

    primitiveTopology: "triangle-list",

    colorStates: [
      {
        format: swapChainFormat,
      },
    ],

    sampleCount, // sampleCount is the number of MSAA samples that each attachment has to have.
    // MSAA means basically that some pixels will have more samples being taken (smaller fragments shader in a certain way) at the boundary of triangles, to AA.
    // its built in the GPU hence, its in WebGPU.
    // It was not activated everywhere with WebGL https://www.khronos.org/webgl/public-mailing-list/public_webgl/1211/msg00197.php
    // I wonder how it works now.
  });

  const texture = device.createTexture({
    // here we fully create an output texture, instead of grabbing the one from the swapChain.
    size: {
      width: canvas.width,
      height: canvas.height,
      depth: 1,
    },
    sampleCount, // maybe that's why we need to fully create the framebuffer?
    format: swapChainFormat,
    usage: GPUTextureUsage.OUTPUT_ATTACHMENT,
  });
  const attachment = texture.createView();

  function frame() {
    const commandEncoder = device.createCommandEncoder({});

    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          attachment: attachment,
          resolveTarget: swapChain.getCurrentTexture().createView(), // I don't know what is the resolve target by opposition to the attachment.
          loadValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
        },
      ],
    };

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(pipeline);
    passEncoder.draw(3, 1, 0, 0);
    passEncoder.endPass();

    device.defaultQueue.submit([commandEncoder.finish()]);
  }

  return frame;
}
