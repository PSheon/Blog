import { describe, expect, it } from "vitest";
import { COMMIT, FILTER, KERNEL, MEASURE, MERGE, PRESENT, REPROJECT } from "@/lib/rt/kernel";

/**
 * WGSL reserves a long list of words it does not use yet. Naming a variable `cast`, `target` or `smooth` compiles
 * nowhere, and CI has no GPU to find out. This is the list from the WGSL specification (§ 15.2, reserved words) plus
 * its keywords; every name the shaders declare is held against it.
 */
const RESERVED = new Set("NULL Self abstract active alignas alignof as asm asm_fragment async attribute auto await become binding_array cast catch class co_await co_return co_yield coherent column_major common compile compile_fragment concept const_cast consteval constexpr constinit crate debugger decltype delete demote demote_to_helper do dynamic_cast enum explicit export extends extern external fallthrough filter final finally friend from fxgroup get goto groupshared highp impl implements import inline instanceof interface layout lowp macro macro_rules match mediump meta mod module move mut mutable namespace new nil noexcept noinline nointerpolation noperspective null nullptr of operator package packoffset partition pass patch pixelfragment precise precision premerge priv protected pub public readonly ref regardless register reinterpret_cast require resource restrict self set shared sizeof smooth snorm static static_assert static_cast std subroutine super target template this thread_local throw trait try type typedef typeid typename typeof union unless unorm unsafe unsized use using varying virtual volatile wgsl where with writeonly yield alias break case const const_assert continue continuing default diagnostic discard else enable false fn for if let loop override requires return struct switch true var while".split(" "));

describe("the shaders", () => {
  for (const [name, code] of [["kernel", KERNEL], ["measure", MEASURE], ["present", PRESENT], ["commit", COMMIT], ["reproject", REPROJECT], ["merge", MERGE], ["filter", FILTER]] as const)
    it(`${name} declares no name that WGSL reserves`, () => {
      const declared = [...code.matchAll(/\b(?:let|var(?:<[^>]*>)?|fn|const|struct)\s+([A-Za-z_]\w*)/g)].map((m) => m[1]);
      const fields = [...code.matchAll(/struct\s+\w+\s*\{([^}]*)\}/g)].flatMap((m) => [...m[1].matchAll(/([A-Za-z_]\w*)\s*:/g)].map((f) => f[1]));
      const params = [...code.matchAll(/fn\s+\w+\s*\(([^)]*)\)/g)].flatMap((m) => [...m[1].matchAll(/(?:^|,)\s*(?:@\w+(?:\([^)]*\))?\s*)*([A-Za-z_]\w*)\s*:/g)].map((f) => f[1]));
      expect(declared.length).toBeGreaterThan(2);
      expect(code).not.toContain("${"); // every interpolation was filled in
      expect([...declared, ...fields, ...params].filter((word) => RESERVED.has(word))).toEqual([]);
    });
});
