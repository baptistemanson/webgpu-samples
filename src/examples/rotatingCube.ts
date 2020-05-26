import { mat4, vec3 } from "gl-matrix";
import {
  cubeVertexArray,
  cubeVertexSize,
  cubeColorOffset,
  cubePositionOffset,
} from "../cube";
import glslangModule from "../glslang";
import { updateBufferData } from "../helpers";

export const title = "Rotating Cube";
export const description =
  "The rotating cube demonstrates vertex input \
              and update of uniform data every frame.";

export async function init(canvas: HTMLCanvasElement) {
  const vertexShaderGLSL = `#version 450
  layout(set = 0, binding = 0) uniform Uniforms {
    mat4 modelViewProjectionMatrix;
  } uniforms;

  layout(location = 0) in vec4 position;
  layout(location = 1) in vec4 color;

  layout(location = 0) out vec4 fragColor;

  void main() {
    gl_Position = uniforms.modelViewProjectionMatrix * position;
    fragColor = color;
  }
  `;

  const fragmentShaderGLSL = `#version 450
  layout(location = 0) in vec4 fragColor;
  layout(location = 0) out vec4 outColor;

  void main() {
    outColor = fragColor;
  }
  `;

  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
  const glslang = await glslangModule();

  const aspect = Math.abs(canvas.width / canvas.height);
  let projectionMatrix = mat4.create();
  mat4.perspective(projectionMatrix, (2 * Math.PI) / 5, aspect, 1, 100.0); // perspective camera matrix

  const context = canvas.getContext("gpupresent");

  // @ts-ignore:
  const swapChain = context.configureSwapChain({
    device,
    format: "bgra8unorm",
  });

  const [verticesBuffer, vertexMapping] = device.createBufferMapped({
    // accessible by the CPU
    size: cubeVertexArray.byteLength,
    usage: GPUBufferUsage.VERTEX,
  });
  new Float32Array(vertexMapping).set(cubeVertexArray);
  verticesBuffer.unmap(); // now usable by the GPU and not anymore by the CPU

  const uniformsBindGroupLayout = device.createBindGroupLayout({
    // when using uniforms, there is the notion of bind group.
    // bindgroups are a NxN system between render pass and resources
    // a resource can be used in several stages, and a stage can use several resources.
    // the bindgroup layout is the same as what is in the shader. Could be probably be optained by the compiler? Independent because couldnt agree on the shading lg?
    // anyhow, it lists the input and output of the shaders.
    entries: [
      {
        binding: 0,
        visibility: 1,
        type: "uniform-buffer",
      },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [uniformsBindGroupLayout],
  });
  // here we see something cool, one pipeline can be the union of several bindgroups.
  // So we can group uniforms/objects per bindgroup and reuse those bindgroups in different pipelines.
  const pipeline = device.createRenderPipeline({
    layout: pipelineLayout,

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
    depthStencilState: {
      // dont draw if behind. I saw demos doing reflections by deactivating this depth stuff and using stencil instead.
      // https://open.gl/depthstencils
      // stencils could be used also for picture in picture imo. Pretty cool stuff.
      depthWriteEnabled: true,
      depthCompare: "less",
      format: "depth24plus-stencil8",
    },
    vertexState: {
      vertexBuffers: [
        {
          // vertex buffer slot 0 I imagine.
          // here we will see one buffer with several interlaced attributes in it.
          arrayStride: cubeVertexSize,
          // 4*10 float4 position, float4 color, float2 uv, = 10 floats of 4 bytes.
          attributes: [
            {
              // position
              shaderLocation: 0, // love this, it is explicitely matching a number in the shader.
              offset: cubePositionOffset, // easy peasy.
              format: "float4", // super dope to have this shortcut. It was a pain in OpenGL.
            },
            {
              // color
              shaderLocation: 1,
              offset: cubeColorOffset,
              format: "float4",
            },
          ],
        },
      ],
    },

    rasterizationState: {
      cullMode: "back",
      // "none", when we want triangles to have two back faces.
      // "front", for a skybox?
      // "back", for spheres, cubes, convex stuff.
      // specify the orientation of the faces that will be culled. Culling is an optimization that drops fragments that are opposing the viewer. For convex objects, it makes sense.
    },

    colorStates: [
      {
        format: "bgra8unorm",
      },
    ],
  });

  const depthTexture = device.createTexture({
    size: {
      width: canvas.width,
      height: canvas.height,
      depth: 1,
    },
    format: "depth24plus-stencil8", // It is the only texture format with stencil actually.
    usage: GPUTextureUsage.OUTPUT_ATTACHMENT,
  });

  const renderPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [
      {
        // attachment is acquired and set in render loop. Pretty cool it accepts undefined.
        attachment: undefined,
        loadValue: { r: 0.5, g: 0.5, b: 0.5, a: 1.0 },
      },
    ],
    depthStencilAttachment: {
      // how we will write to the attachment
      attachment: depthTexture.createView(),

      depthLoadValue: 1.0,
      depthStoreOp: "store",
      stencilLoadValue: 0,
      stencilStoreOp: "store", // wonder why there is a stencil here?
    },
  };

  const uniformBufferSize = 4 * 16; // the transform 4x4 matrix, with 4 bytes per float.

  const uniformBuffer = device.createBuffer({
    // the buffer that will contain all the uniforms.
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // this is where the bindgroup entry is mapped to a buffer/resource. The NxN happens here.
  // it is outside of the pipeline description as well, so it can be changed on the fly imo without impacting the pipeline
  const uniformBindGroup = device.createBindGroup({
    layout: uniformsBindGroupLayout,
    entries: [
      {
        binding: 0, // must match the layout
        resource: {
          buffer: uniformBuffer,
        },
      },
    ],
  });

  // returns the matrix, nothing webgpu here.
  function getTransformationMatrix() {
    let viewMatrix = mat4.create();
    mat4.translate(viewMatrix, viewMatrix, vec3.fromValues(0, 0, -5));
    let now = Date.now() / 1000;
    mat4.rotate(
      viewMatrix,
      viewMatrix,
      1,
      vec3.fromValues(Math.sin(now), Math.cos(now), 0)
    );

    let modelViewProjectionMatrix = mat4.create();
    mat4.multiply(modelViewProjectionMatrix, projectionMatrix, viewMatrix);

    return modelViewProjectionMatrix as Float32Array;
  }

  return function frame() {
    // so we can access colorAttachments like arrays for each channel. Interesting.
    renderPassDescriptor.colorAttachments[0].attachment = swapChain
      .getCurrentTexture()
      .createView();

    const commandEncoder = device.createCommandEncoder();
    // explicit update buffer data function, to upload portions of the uniforms that change I guess.
    // it adds a command to the command buffer to update the data.
    const { uploadBuffer } = updateBufferData(
      device,
      uniformBuffer,
      0,
      getTransformationMatrix(),
      commandEncoder
    );

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, uniformBindGroup); // new cool stuff.
    passEncoder.setVertexBuffer(0, verticesBuffer); // vertices are set here. Wonder if the system is smart enough to notice the vertex buffer is unmap and doesnt require copying again.
    // we can pass different vertex buffer, probably if all our attributes are not interleaved for instance.
    // the 0 seems to be the offset in the pipeline description? I asked the question on github.
    passEncoder.draw(36, 1, 0, 0); // 36 vertices, 1 instance (multi instance built in)
    passEncoder.endPass();

    device.defaultQueue.submit([commandEncoder.finish()]);
    // this looks like pure optimization or demonstration. I couldn't see any differences.
    // It didn't change any memory situation on my graphic card, but the buffer is really small so...
    uploadBuffer.destroy();
  };
}
