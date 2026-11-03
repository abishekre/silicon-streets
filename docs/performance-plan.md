# Performance plan

Goal: a steady 60 fps on the laptops people actually own, without making the city look worse.
Each step is measured before and after. Anything that visibly changes the look is checked with side-by-side screenshots.

## Targets

| Preset | Hardware it must hold 60 fps on | Render resolution |
|---|---|---|
| Low | Intel UHD 620-class integrated graphics, 1080p | 0.75× + sharpening |
| Medium | Intel Iris Xe / AMD Vega integrated, 1080p | native, dynamic down to 0.75× |
| High | GTX 1650 / RTX 3050 laptop | native |
| Ultra | RTX 3060 laptop and up | native. Higher in Custom (up to 2×) |

Budgets per frame, at High: ≤ 8 ms of CPU on the main thread, ≤ 12 ms of GPU time, ≤ 150 draw calls including the shadow pass, ≤ 500k triangles drawn.

## Where the time goes today (measured 3 Nov 2026)

Measured at the MG Road start on High, on an i5-10210U with Intel UHD Graphics (integrated).
- **The game logic is cheap.** Physics, traffic, people, UI and atmosphere together cost about 2.7 ms a frame. Rendering is the problem.
- **The city itself is cheap.** All the roads, buildings and kerbs drawn through BatchedMesh add up to only about 82k triangles.
- **The expensive part is everything else.** The scene is 830k triangles before culling, and about 1.25M are drawn per frame once the shadow pass is counted. The main contributors:
  - **Map-edge barricades:** one 174k-triangle mesh in `edges.js` that spans the whole map. It is drawn and casts shadows every frame, and can never be culled. Together with the edge hoardings (11.5k) and bus shelters (11k), that's about 200k triangles drawn wherever you are.
  - **Traffic:** cars are 860–1,360 triangles each with no lower-detail version. About 200 vehicles are drawn whole even when they're off-screen, because an InstancedMesh is culled as one unit. That's roughly 250k triangles, and all of them cast shadows.
  - **People:** 6 body-part meshes per person × 130 people. About 80k triangles, all casting shadows.
  - **Trees, lamps, light pools, cables and bulbs:** up to 7 separate meshes per map area. With about 30 areas in view, that's around 150 draw calls, counted again in the shadow pass.
- **Ultra draws the scene three times a frame:** shadow map (4096 px, every frame), ambient-occlusion normal pass, and the main view. It does this at up to 2× the screen resolution, then smooths edges twice (4× MSAA on a half-float target, then SMAA). That is why it sits at 30 fps even on laptops with a graphics card.
- **Task Manager shows no spike** because the main thread is one core of 8–16. It is also possible that the browser runs on the integrated GPU even though the laptop has a dedicated one; the F3 work in step 1 will show this.

## Step 1: Measure properly (first, small)
- **F3 overlay additions:**
  - the GPU name, from `WEBGL_debug_renderer_info`, with a warning when the browser is on integrated graphics in a laptop that also has a dedicated GPU;
  - **GPU time per pass**, from the `EXT_disjoint_timer_query_webgl2` extension: shadows, AO, main pass, bloom, AA;
  - CPU time per system.
- **Benchmark:** a built-in run in Settings → Graphics: a scripted 90 s drive with weather and a time change, reporting average, 1% low and worst frame. The same route is used for every before/after comparison in this plan.
- **Look checks:** fixed screenshot spots (MG Road at 11:00, Church Street at 19:30, Cubbon in rain) per preset, captured with the benchmark, to compare looks.

## Step 2: Big, safe wins (no visible change)
1. **Stream the whole-map meshes.** The barricades, hoardings, bus shelters and signal poles in `edges.js`, `life.js` and `signals.js` go into the per-area streaming in `world.js`, using its build-steps mechanism and the shared BatchedMesh pools. Distant ones are culled and stop casting shadows. *Estimate: −200k triangles, −6 draw calls, and a much cheaper shadow pass.*
2. **Vehicle detail levels:**
   - each vehicle type gets a low-detail model (about 150 triangles) for beyond 40 m, and a box version with no shadow beyond 120 m;
   - cars are sorted into near/far InstancedMeshes each frame, and vehicles behind the camera are skipped. The traffic code already loops over every vehicle per frame, so this adds no extra pass;
   - the same for people: the 6 body parts within 40 m, one low-detail capsule mesh beyond that, and no shadow beyond 60 m.
   - *Estimate: −60–70% of vehicle and people triangles.*
3. **One mesh per kind for the whole map.** Trees, lamp poles, lamp heads, light pools, bulbs and cables become one InstancedMesh (or BatchedMesh) per kind instead of one per area. Each area writes its own block of instances; dropping the area frees the block. *Estimate: −120 to −150 draw calls in the main pass, and as many again in the shadow pass.*
4. **Shadow casters by distance.** Only things within the shadow camera's area (±80–120 m) cast shadows. Small props, bulbs and light pools never do.
5. **No garbage in hot loops.** Reuse the traffic hash arrays, remove `filter`/`map` from `nextEdge`, compute bounding spheres once, and pool objects in the physics sync. This removes the small garbage-collection hitches that read as stutter.

## Step 3: Make the effects cheaper (same look)
1. **Rebalance Ultra** (agreed): native resolution by default, with Render resolution in Custom going up to 2×; one AA method (MSAA 4× or SMAA, not both); half-resolution AO with depth-aware upsampling; shadows redrawn every 2nd frame.
2. **Shadows:**
   - snap the shadow camera to whole texels, so updating every 2nd or 3rd frame doesn't shimmer;
   - Ultra gets 2 cascades (a sharp near cascade and a cheap far one) instead of one 4096 map;
   - consider a static-shadow cache: render buildings into the shadow map only when the sun moves or you've moved about 20 m, then add moving things on top. three.js has no built-in for this (Babylon Lite has one), so it's a custom render-target job. Do it only if step 1 shows shadows still dominate.
3. **Bake ambient occlusion into the geometry.** While an area is built, darken vertices where walls meet the ground, under awnings, and in corners. This gives most of the AO look for free, so Medium and High can look like they have AO without the GTAO pass. Ultra keeps GTAO on top.
4. **Sharpened upscaling.** When dynamic resolution drops below native, add an RCAS-style sharpening pass (as in AMD FSR 1). It costs about 0.3 ms, so 0.75× looks close to native. This lets Low and Medium hold 60 fps on integrated graphics without going blurry.
5. **Fewer overlapping transparent layers:** cap rain particle overdraw near the camera, reduce the light pools to one shared quad pass, and draw glow sprites at half resolution.
6. **Material cost:** distant props and trees use a cheaper material (Lambert) via the same detail switch. Check environment-map sampling on the many vertex-coloured materials.

## Step 4: Use the other CPU cores
1. **Simulation in a worker.** Rapier physics, traffic and people step in a worker at a fixed 60 Hz. Positions come back through a SharedArrayBuffer, and the main thread smooths between steps when rendering.
   - This needs COOP/COEP headers: add them to `vercel.json` and `tools/serve.py`.
   - The main thread is left with only rendering and input.
   - *Estimate: 3–7 ms freed on the main thread, more at Packed liveliness.*
2. **Build map areas in a worker.** Geometry and the per-tile placement logic run in a worker and transfer finished buffers. This removes the roughly 1 s startup placement and the 0.5 s hitch after teleports.
3. **Smoother frame pacing.** Fixed-step simulation with interpolation, a cap on long tasks per frame (area streaming already keeps to about 3 ms), and async shader compiling (`compileAsync`, using the `KHR_parallel_shader_compile` extension) at startup.

## Step 5: Engine
1. **Upgrade three.js** from r170 to the current release. It brings BatchedMesh fixes (including the r170 `optimize()` bug we work around), shadow performance work and better LOD/culling support.
   - Re-run the benchmark before and after.
   - Third-party packages to try: `@three.ez/batched-mesh-extensions` (BVH-based culling and LOD for BatchedMesh) and `@three.ez/instanced-mesh`.
2. **WebGPU later, not now.** Reports from 2026 still show three's WebGPURenderer using about 2× the CPU of WebGLRenderer on scenes with many meshes, and a much slower first frame. Revisit once a benchmark shows it ahead on our scene.
3. **Compressed textures (KTX2/Basis)** if we move from canvas-generated textures to authored ones. They cut GPU memory and texture bandwidth, which matters most on integrated graphics.

## Order and expected result

| Step | Effort | Expected effect |
|---|---|---|
| 1 Measure | small | real numbers per pass and per device |
| 2 Big safe wins | medium | ~−50% triangles, −40–50% draw calls, less stutter |
| 3 Cheaper effects | medium | Ultra ~2× faster; Medium/High keep the look at lower cost |
| 4 Worker threads | large | main thread mostly rendering; smoother at high liveliness |
| 5 Engine upgrade | medium | fixes and headroom; WebGPU later |

These estimates come from the measurements above. Each step is checked against the benchmark run and the screenshot spots before it is committed.

## Sources
- [WebGPURenderer ~2× CPU vs WebGLRenderer on many-mesh scenes (three.js forum)](https://discourse.threejs.org/t/why-webgpurenderer-performance-significantly-lower-than-webglrenderer/77629)
- [WebGPURenderer status discussion](https://discourse.threejs.org/t/webgpurenderer-forcewebgl-true-vs-webglrenderer/87805/2)
- [@three.ez/batched-mesh-extensions: BVH culling and LOD for BatchedMesh](https://github.com/agargaro/batched-mesh-extensions/)
- [@three.ez/instanced-mesh (InstancedMesh2)](https://www.npmjs.com/package/@three.ez/instanced-mesh)
- [three.js PR #28404: BatchedMesh sorting and frustum culling](https://www.Github.com/mrdoob/three.js/pull/28404)
- [Cascaded shadow maps cost in three.js (forum)](https://discourse.threejs.org/t/cascaded-shadow-maps/7242)
- [Babylon Lite static cascaded-shadow cache design](https://doc.babylonjs.com/lite/architecture/17-cascaded-shadow)
- [three-csm](https://github.com/vtHawk/three-csm)

## Progress (3 Nov 2026)

Done:
- **Step 1:** the F3 overlay shows the GPU name (flagging integrated graphics) and GPU time per pass. There is a 90 s benchmark drive in Settings → Graphics.
- **Step 2:**
  - edge scenery, bus shelters and signal poles stream with the map;
  - vehicles have a far model and only the ones in view are drawn;
  - trees, lamps, light pools and bulbs are one BatchedMesh per kind;
  - opaque draw order is buildings → ground layers top-down → sky last.
  - At the MG Road start on High: **214 → 132 draw calls, 1.27M → 0.34M triangles**. The scene pass on Intel UHD went from 20.4 to 14.4 ms in a back-to-back test.
- **Step 3:**
  - Ultra renders at native resolution, with half-resolution AO, MSAA 4× only, and 4096 shadows every 2nd frame;
  - Medium uses SMAA instead of MSAA 2×, because on integrated graphics the MSAA resolve was the most expensive single step;
  - CAS sharpening runs below native resolution;
  - saved presets now follow the current definitions.
- **Step 5:** three.js r170 → r186.1, which fixes `BatchedMesh.optimize()`. `Clock` was replaced with `Timer`, and PCF shadows replace the PCFSoft type that was removed.

Measured on the integrated Intel UHD (1024×768 window): Medium is about 21 ms of GPU time per frame. On this GPU, GTAO costs about 32 ms even at half resolution, so Ultra stays a setting for dedicated GPUs.

Not done yet, with the reason:
- **People LOD.** People are 7 draw calls and about 80k triangles. The remaining cost is per pixel, not per triangle.
- **Baked AO.** Building walls already darken towards the ground through vertex colours, and GTAO is only on by default on Ultra.
- **Two-cascade shadows and the static shadow cache.** Shadows are now 1–5 ms. Revisit if a dedicated-GPU benchmark shows them dominating.
- **Step 4 (workers).** The simulation is about 2.5–3.5 ms of main-thread time and sending draw commands is about 5 ms. This is worth doing for weaker CPUs, but it means reworking how physics, traffic, people, jobs and the tow truck talk to each other.
