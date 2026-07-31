/**
 * Shared WGSL vertex stage for full-screen post-processing effects.
 *
 * Emits a single oversized triangle that covers the entire NDC quad (-1..1).
 * Drawing 3 vertices is faster than 6 for a quad and avoids the diagonal seam
 * where two triangles meet, which can otherwise produce visible artifacts in
 * effects that derive screen-space gradients.
 *
 * Texture coordinates flip the Y axis so the source texture (origin top-left)
 * maps correctly under the WebGPU clip-space convention (origin bottom-left).
 *
 * Effects compose this string into their full shader module alongside their
 * fragment stage. Bind group 0 holds at minimum a uniform block; RGBA paths
 * add texture and sampler bindings as needed.
 *
 * Draw with `pass.draw(3, 1, 0, 0)`.
 */
export const VS_WGSL = `
struct VsOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VsOut {
    var verts = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 3.0, -1.0),
        vec2<f32>(-1.0,  3.0),
    );

    let xy = verts[vid];

    var out: VsOut;
    out.pos = vec4<f32>(xy, 0.0, 1.0);
    out.uv = vec2<f32>((xy.x + 1.0) * 0.5, 1.0 - (xy.y + 1.0) * 0.5);

    return out;
}
`;
