let displayedNotSupportedError = false;
export function checkWebGPUSupport() {
  // bat: it is nice that Webgpu is a top level API, and not hidden behind canvas like webgl
  if (!navigator.gpu) {
    document.getElementById("not-supported").style.display = "block";
    if (!displayedNotSupportedError) {
      alert(
        "WebGPU not supported! Please visit webgpu.io to see the current implementation status."
      );
    }
    displayedNotSupportedError = true;
  }
  return !!navigator.gpu;
}

export async function createTextureFromImage(
  device: GPUDevice,
  src: string,
  usage: GPUTextureUsageFlags
) {
  // WebGPU doesnt provide functions to decode images, ones need to rely on the classic browser API for that.
  const img = document.createElement("img");
  img.src = src;
  // wasnt aware of this interface, neat!
  await img.decode();

  const imageCanvas = document.createElement("canvas");
  imageCanvas.width = img.width;
  imageCanvas.height = img.height;

  // it seems we require this canvas only to flip the image in y.
  const imageCanvasContext = imageCanvas.getContext("2d");
  imageCanvasContext.translate(0, img.height); // flip image vertically 1/2
  imageCanvasContext.scale(1, -1); // flip image vertically 2/2
  imageCanvasContext.drawImage(img, 0, 0, img.width, img.height);
  const imageData = imageCanvasContext.getImageData(
    0,
    0,
    img.width,
    img.height
  );

  let data = null;
  // Right now, textures need to have a row length multiple of 256.
  // It's called rowPitch in Vulkan and D3D12, but not explicitely in WebGPU specs.
  // The constraint of the multiple exist in D3. D3D12_TEXTURE_DATA_PITCH_ALIGNMENT is 256 and all texture rowPitch must be a multiple of that.
  // wonder if it is wasteful? apparently not due to fast memcpy https://lists.w3.org/Archives/Public/public-gpu/2019Nov/0016.html
  const bytesPerRow = Math.ceil((img.width * 4) / 256) * 256;
  if (bytesPerRow == img.width * 4) {
    data = imageData.data;
  } else {
    data = new Uint8Array(bytesPerRow * img.height);
    let imagePixelIndex = 0;
    for (let y = 0; y < img.height; ++y) {
      for (let x = 0; x < img.width; ++x) {
        let i = x * 4 + y * bytesPerRow;
        data[i] = imageData.data[imagePixelIndex];
        data[i + 1] = imageData.data[imagePixelIndex + 1];
        data[i + 2] = imageData.data[imagePixelIndex + 2];
        data[i + 3] = imageData.data[imagePixelIndex + 3];
        imagePixelIndex += 4;
      }
    }
  }

  // this declares a texture GPU side. Doesnt create data or anything.
  // I dont understand yet the difference between a texture and a texture view.
  const texture = device.createTexture({
    size: {
      width: img.width,
      height: img.height,
      depth: 1, // webgpu is 3d texture native.
    },
    format: "rgba8unorm", // R G B A 8bit each unsigned normalized, so 32bit per texel/pixel.
    // normalized means that the unsigned will be exposed as a float in the shader, via val = int / max.
    usage: GPUTextureUsage.COPY_DST | usage,
  });

  // bat: not detailed in the specs. Only the signature is present.
  // it takes the description of a GPU Buffer, which require size and usage to be present
  // figure out the difference with device.createBuffer ("map" meaning accessible from the CPU)
  // the TS types are not aligned with the specs boolean mappedAtCreation = false; is not accepted.
  // first object is the buffer description, the second is the data of the buffer.
  const [textureDataBuffer, mapping] = device.createBufferMapped({
    size: data.byteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    // textures can have layers. With a specific sampler, one can specify the layer id (rounded index) as the last param.
  });
  // In this case, this is not a copy as both are typed arrays. The underlying arraybuffer is shared.
  new Uint8Array(mapping).set(data);
  // make the texture data inaccessible to the CPU but accessible to the GPU.
  // its cool because we don't need to write anything anymore in the buffer.
  textureDataBuffer.unmap();

  // right now, there is no option on the command Encoder, we could also call device.createCommandEncoder() directly.
  // wonder if it should get removed for simplicity purposes.
  const commandEncoder = device.createCommandEncoder({});
  // bat: specs use inheritence for describring objects
  commandEncoder.copyBufferToTexture(
    {
      buffer: textureDataBuffer,
      bytesPerRow, // needs to be provided, as width !== bytesPerRow due to the rowPitch.
    },
    {
      texture: texture,
    },
    {
      width: img.width, // Despite knowing the CPU source and GPU destination, we need to specify which region of the source we want.
      // it is ultra weird that the copy param is either a coordinate or dimensions. It should be both.
      height: img.height,
      depth: 1,
    }
  );

  device.defaultQueue.submit([commandEncoder.finish()]);
  // data has been copied to the GPU, now we can safely destroy the CPU side buffer.
  // bat: why is it not async?
  textureDataBuffer.destroy();

  return texture;
}

// So to update a buffer GPU side, we transfer the delta update to the GPU, then apply the update on the previous buffer.
// the newly uploaded buffer has to be destroyed afterwards, outside of the render.
export function updateBufferData(
  device: GPUDevice,
  dst: GPUBuffer,
  dstOffset: number,
  src: Float32Array | Uint32Array,
  commandEncoder?: GPUCommandEncoder
): {
  commandEncoder: GPUCommandEncoder;
  uploadBuffer: GPUBuffer;
} {
  const [uploadBuffer, mapping] = device.createBufferMapped({
    size: src.byteLength,
    usage: GPUBufferUsage.COPY_SRC,
  });

  // @ts-ignore
  new src.constructor(mapping).set(src);
  uploadBuffer.unmap();

  commandEncoder = commandEncoder || device.createCommandEncoder();
  // when copying a buffer to a buffer, we can just provide the offset in the dest.
  commandEncoder.copyBufferToBuffer(
    uploadBuffer,
    0,
    dst,
    dstOffset,
    src.byteLength
  );

  return { commandEncoder, uploadBuffer };
}
