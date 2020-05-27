# WebGPU Samples - commented

The [WebGPU Samples](//austineng.github.io/webgpu-samples/) are a set of SPIR-V compatible samples demonstrating the use of the [WebGPU API](//webgpu.dev). Please see the current implementation status at [webgpu.io](//webgpu.io);

These samples run in Chrome Canary behind the flag `--enable-unsafe-webgpu`.

I added my comments and some design notes

## Cool findings

- verbose but explicit
- move data back and forth from the GPU explicitely. I love it, it is more flexible and we can manage performances more closely
- the pipeline is declared ahead of time. Then at render time, we pick a pipeline, bound some data and off we go!
- we have compute shaders. Its cool and can replace a bunch of stages like geom or tesselation
- textures and samplers are two different objects: motivations being we usually have the same sampler config (14 bytes) shared accross 1,000s of textures. So it saves quite a lot of bytes overall.
- instanced and regular draw calls are just the same call.
- framebuffers can be used as a texture, instead of having to render to a texture then a framebuffer
- MSAA is simpler to properly configure
- describing the layout of the buffers is easier as well
- async API, using the concept of GPUFence for syncing/callbacks.
- Specs are terse and don't explain motivations around the design
- Impossible to learn without GL knowledge right now.
- Team is very accessible on matrix.org

## Meh findings

- I spent a considerable amount of time in the Vulkan doc to understand WebGPU. Needs way more documentation.
- The whole adapter / device comes directly from Vulkan, but Im not sure it is adapted. Oh well, its only one line of complication so...
- no mip map generation afaik. I need to test min and mag to see how it goes
- Needs Chrome Canary and a flag to run
- Some community members are very aggressive in their position on Github or chat - not used to that coming from React
- I wonder why this whole WSGL instead of Spir-V. It sounds like someone wants to offer an alternative to Spir-V tbh.
- still experimental, some errors that should exist are not triggered
