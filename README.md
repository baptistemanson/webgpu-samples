# WebGPU Samples - commented

The [WebGPU Samples](//austineng.github.io/webgpu-samples/) are a set of SPIR-V compatible samples demonstrating the use of the [WebGPU API](//webgpu.dev). Please see the current implementation status at [webgpu.io](//webgpu.io);

These samples run in Chrome Canary behind the flag `--enable-unsafe-webgpu`.

I added my comments and some design notes

## Cool findings

- verbose but explicit
- move data back and forth from the GPU explicitely. I love it, it is more flexible and we can manage performances more closely
- the pipeline is declared ahead of time. Then at render time, we pick a pipeline, bound some data and off we go!
- we have compute shaders. Its cool and can replace a bunch of stages like geom or tesselation
- textures and samplers are two different objects: motivations being we usually have the same sampler config (~50 bytes) shared across 1,000s of textures.
- instanced and regular draw calls are just the same call. It's cool, because it reduces the barrier to jump to try instanced draws.
- framebuffers can be used as a texture, instead of having to render to a texture then a framebuffer
- MSAA is simpler to properly configure than WebGL. Or at least I understood it.
- describing the layout of the buffers is easier as well.
- no state machine with binding buffers. It was super hard for me to understand the "bind" in WebGL.
- async API, using the concept of GPUFence for syncing/callbacks.
- Team is very accessible on matrix.org
- its fast, even the client side spir v compilation was fast lol.
- Examples are in typescript. It really helps to have types here.

## Meh findings

- Specs are terse and don't explain motivations around the design.
- Impossible to learn without GL knowledge right now.
- I spent a considerable amount of time in the Vulkan doc to understand WebGPU. Needs way more documentation.
- Extensive vocabulary to acquire, in particular binding, locations, slots, indexes... they all mean "id", but it is hard to track back which one is which one
- Some ids are only the key in a layout definition and not explicit ids. Makes the whole code brittle when adding / removing buffers.
- The whole adapter / device comes directly from Vulkan, but I couldnt map a use case where it is useful to have those 2 concepts. Oh well, its only a couple of lines of complication so...
- no mip map generation afaik. I need to test min and mag to see how it goes
- Needs Chrome Canary and a flag to run
- Some community members are very aggressive in their position on Github or chat - not used to that coming from React
- I wonder why this whole WSGL instead of Spir-V. It sounds like someone wants to offer an alternative to Spir-V tbh.
- still experimental, some errors that should exist are not triggered
