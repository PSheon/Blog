/** Dense float tensor. Layout is row-major; images are NCHW. */
export interface Tensor {
  data: Float32Array;
  shape: number[];
}

export function size(shape: number[]): number {
  return shape.reduce((a, b) => a * b, 1);
}

export function tensor(data: ArrayLike<number>, shape: number[]): Tensor {
  if (data.length !== size(shape)) {
    throw new Error(
      `tensor: ${data.length} values do not fit shape [${shape.join(", ")}]`,
    );
  }
  return {
    data: data instanceof Float32Array ? data : Float32Array.from(data),
    shape: [...shape],
  };
}

export function zeros(shape: number[]): Tensor {
  return { data: new Float32Array(size(shape)), shape: [...shape] };
}
