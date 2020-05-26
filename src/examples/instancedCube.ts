import { mat4, vec3 } from "gl-matrix";
import {
  cubeVertexArray,
  cubeVertexSize,
  cubeColorOffset,
  cubePositionOffset,
} from "../cube";
import glslangModule from "../glslang";
import { updateBufferData } from "../helpers";

/**
 * This demo is just a spin on the rotating cube.
 * Several instances of the same cube vertices are drawn.
 * gl_InstanceIndex is used in the shader to change the modelViewProjectionMatrix for each cube.
 * It is super simple, and used the same draww call as any other (which is not the case in WebGL).
 * I will only point out the differences in comments.
 *
 * Previously in WebGL, we had to rely on an extension to do so: ANGLE_instanced_arrays. 98% of installs had it.
 */
export const title = "Instanced Cube";
export const description = "This example shows the use of instancing.";

// the vertex shader is different, as it has to deal with an array of modelViewProjectionMatrix instead of a single one.
// Why array => We want a different position for each instance of the cube.
export async function init(canvas: HTMLCanvasElement) {
  const vertexShaderGLSL = `#version 450
  #define MAX_NUM_INSTANCES 16
  layout(set = 0, binding = 0) uniform Uniforms {
    mat4 modelViewProjectionMatrix[MAX_NUM_INSTANCES];
  } uniforms;

  layout(location = 0) in vec4 position;
  layout(location = 1) in vec4 color;

  layout(location = 0) out vec4 fragColor;

  void main() {
    gl_Position = uniforms.modelViewProjectionMatrix[gl_InstanceIndex] * position;
    fragColor = color;
  }`;

  const fragmentShaderGLSL = `#version 450
  layout(location = 0) in vec4 fragColor;
  layout(location = 0) out vec4 outColor;

  void main() {
    outColor = fragColor;
  }`;

  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice({});
  const glslang = await glslangModule();

  const aspect = Math.abs(canvas.width / canvas.height);
  let projectionMatrix = mat4.create();
  mat4.perspective(projectionMatrix, (2 * Math.PI) / 5, aspect, 1, 100.0);

  const context = canvas.getContext("gpupresent");

  // @ts-ignore:
  const swapChain = context.configureSwapChain({
    device,
    format: "bgra8unorm",
  });

  const [verticesBuffer, vertexMapping] = device.createBufferMapped({
    size: cubeVertexArray.byteLength,
    usage: GPUBufferUsage.VERTEX,
  });
  new Float32Array(vertexMapping).set(cubeVertexArray); // note that we only send the vertices for one cube, not 9.
  verticesBuffer.unmap();

  const uniformsBindGroupLayout = device.createBindGroupLayout({
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
      depthWriteEnabled: true,
      depthCompare: "less",
      format: "depth24plus-stencil8",
    },
    vertexState: {
      vertexBuffers: [
        {
          arrayStride: cubeVertexSize,
          stepMode: "vertex",
          attributes: [
            {
              // position
              shaderLocation: 0,
              offset: cubePositionOffset,
              format: "float4",
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
    format: "depth24plus-stencil8",
    usage: GPUTextureUsage.OUTPUT_ATTACHMENT,
  });

  const renderPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [
      {
        // attachment is acquired in render loop.
        attachment: undefined,

        loadValue: { r: 0.5, g: 0.5, b: 0.5, a: 1.0 },
      },
    ],
    depthStencilAttachment: {
      attachment: depthTexture.createView(),

      depthLoadValue: 1.0,
      depthStoreOp: "store",
      stencilLoadValue: 0,
      stencilStoreOp: "store",
    },
  };

  const xCount = 100;
  const yCount = 100;
  const numInstances = xCount * yCount;
  const matrixFloatCount = 16; // 4x4 matrix
  const matrixSize = 4 * matrixFloatCount;
  const uniformBufferSize = numInstances * matrixSize;

  const uniformBuffer = device.createBuffer({
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const uniformBindGroup = device.createBindGroup({
    layout: uniformsBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: {
          buffer: uniformBuffer,
        },
      },
    ],
  });

  let modelMatrices = new Array(numInstances);
  let mvpMatricesData = new Float32Array(matrixFloatCount * numInstances);
  console.log(matrixFloatCount * numInstances);

  let step = 4.0;

  let m = 0;
  // here we create the modelviewprojection matrices for each instance of the cube.
  for (let x = 0; x < xCount; x++) {
    for (let y = 0; y < yCount; y++) {
      modelMatrices[m] = mat4.create();
      mat4.translate(
        modelMatrices[m],
        modelMatrices[m],
        vec3.fromValues(
          step * (x - xCount / 2 + 0.5),
          step * (y - yCount / 2 + 0.5),
          0
        )
      );
      m++;
    }
  }
  console.log(modelMatrices.length);

  let viewMatrix = mat4.create();
  mat4.translate(viewMatrix, viewMatrix, vec3.fromValues(0, 0, -12));

  let tmpMat4 = mat4.create();

  function updateTransformationMatrix() {
    let now = Date.now() / 1000;

    let m = 0,
      i = 0;
    // here we update the modelviewprojection matrices for each instance of the cube.
    for (let x = 0; x < xCount; x++) {
      for (let y = 0; y < yCount; y++) {
        mat4.rotate(
          tmpMat4,
          modelMatrices[i],
          1,
          vec3.fromValues(
            Math.sin((x + 0.5) * now),
            Math.cos((y + 0.5) * now),
            0
          )
        );

        mat4.multiply(tmpMat4, viewMatrix, tmpMat4);
        mat4.multiply(tmpMat4, projectionMatrix, tmpMat4);

        mvpMatricesData.set(tmpMat4, m);

        i++;
        m += matrixFloatCount;
      }
    }
  }

  return function frame() {
    updateTransformationMatrix();

    renderPassDescriptor.colorAttachments[0].attachment = swapChain
      .getCurrentTexture()
      .createView();

    const commandEncoder = device.createCommandEncoder();
    const { uploadBuffer } = updateBufferData(
      // we find in uniform all the matrices.
      device,
      uniformBuffer,
      0,
      mvpMatricesData,
      commandEncoder
    );
    // 1 cube vertices data = 36 x 10 float.
    // 1 matrix = 16 float.
    // so this approach results in less data being transfered to the GPU overall.
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(pipeline);
    passEncoder.setVertexBuffer(0, verticesBuffer);

    passEncoder.setBindGroup(0, uniformBindGroup);
    passEncoder.draw(36, numInstances, 0, 0); // num instances does the trick here!

    passEncoder.endPass();

    device.defaultQueue.submit([commandEncoder.finish()]);
    uploadBuffer.destroy();
  };
}
