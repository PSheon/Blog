/**
 * The part of three.js this site draws with. `import("three")` hands over the whole namespace, which a bundler cannot
 * trim: every loader, helper and animation class came along. Named re-exports can be trimmed, so the 3D figures
 * import this module instead (always lazily, never at the top of a file). A class missing here is a type error at the
 * call site: add it to the list.
 */
export {
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  GridHelper,
  Group,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  LineSegments,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Raycaster,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
