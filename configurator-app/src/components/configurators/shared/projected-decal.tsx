import { memo, useEffect, useMemo, useState } from 'react';
import {
  BufferGeometry,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  SRGBColorSpace,
  TextureLoader,
  Triangle,
  Vector3,
  type Texture,
} from 'three';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';

interface ProjectedDecalProps {
  /** Target mesh the decal projects onto. */
  mesh: Mesh;
  imageUrl: string;
  /** Projection center in world space. */
  position: [number, number, number];
  /** Projection orientation Euler — Z axis of the box = projection direction. */
  rotation: [number, number, number];
  widthWorld: number;
  heightWorld: number;
  depthWorld?: number;
  surfaceOffsetWorld?: number;
  depthTest?: boolean;
  polygonOffsetFactor?: number;
  polygonOffsetUnits?: number;
  normalCullMinDot?: number;
  frontSurfaceDepthWorld?: number;
  surfaceIsland?: 'largest' | 'frontmost' | 'nearest';
  alphaTest?: number;
}

export const IN_TO_WORLD = 1 / 10;

function rebuildGeometryFromTriangles(
  source: BufferGeometry,
  shouldKeepTriangle: (
    triIndex: number,
    a: Vector3,
    b: Vector3,
    c: Vector3,
    faceNormal: Vector3,
  ) => boolean,
) {
  const posAttr = source.attributes.position;
  if (!posAttr || posAttr.count < 3) return source;

  const uvAttr = source.attributes.uv;
  const normalAttr = source.attributes.normal;
  const nextPositions: number[] = [];
  const nextUvs: number[] = [];
  const nextNormals: number[] = [];
  const tri = new Triangle();
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const faceNormal = new Vector3();

  for (let i = 0; i < posAttr.count; i += 3) {
    a.fromBufferAttribute(posAttr, i);
    b.fromBufferAttribute(posAttr, i + 1);
    c.fromBufferAttribute(posAttr, i + 2);
    tri.set(a, b, c).getNormal(faceNormal);
    if (!shouldKeepTriangle(i / 3, a, b, c, faceNormal)) continue;

    for (let j = 0; j < 3; j++) {
      const idx = i + j;
      nextPositions.push(
        posAttr.getX(idx),
        posAttr.getY(idx),
        posAttr.getZ(idx),
      );
      if (uvAttr) nextUvs.push(uvAttr.getX(idx), uvAttr.getY(idx));
      if (normalAttr) {
        nextNormals.push(
          normalAttr.getX(idx),
          normalAttr.getY(idx),
          normalAttr.getZ(idx),
        );
      }
    }
  }

  if (nextPositions.length < 9) return source;

  source.dispose();
  const next = new BufferGeometry();
  next.setAttribute('position', new Float32BufferAttribute(nextPositions, 3));
  if (nextUvs.length > 0) {
    next.setAttribute('uv', new Float32BufferAttribute(nextUvs, 2));
  }
  if (nextNormals.length > 0) {
    next.setAttribute('normal', new Float32BufferAttribute(nextNormals, 3));
  } else {
    next.computeVertexNormals();
  }
  return next;
}

function keepSurfaceIsland(
  source: BufferGeometry,
  strategy: 'largest' | 'frontmost' | 'nearest',
  forward: Vector3,
  targetPoint?: Vector3,
) {
  const posAttr = source.attributes.position;
  if (!posAttr || posAttr.count < 6) return source;

  const triCount = Math.floor(posAttr.count / 3);
  const parent = Array.from({ length: triCount }, (_, i) => i);
  const find = (i: number): number => {
    if (parent[i] === i) return i;
    parent[i] = find(parent[i]);
    return parent[i];
  };
  const unite = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };
  const keyForVertex = (idx: number) =>
    `${Math.round(posAttr.getX(idx) * 10000)},${Math.round(posAttr.getY(idx) * 10000)},${Math.round(posAttr.getZ(idx) * 10000)}`;
  const seen = new Map<string, number>();

  for (let triIndex = 0; triIndex < triCount; triIndex++) {
    for (let j = 0; j < 3; j++) {
      const key = keyForVertex(triIndex * 3 + j);
      const previous = seen.get(key);
      if (previous !== undefined) {
        unite(triIndex, previous);
      } else {
        seen.set(key, triIndex);
      }
    }
  }

  const tri = new Triangle();
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const centroid = new Vector3();
  const components = new Map<
    number,
    {
      area: number;
      forwardWeightedCenter: number;
      weightedCenter: Vector3;
    }
  >();

  for (let triIndex = 0; triIndex < triCount; triIndex++) {
    const root = find(triIndex);
    let component = components.get(root);
    if (!component) {
      component = {
        area: 0,
        forwardWeightedCenter: 0,
        weightedCenter: new Vector3(),
      };
      components.set(root, component);
    }
    a.fromBufferAttribute(posAttr, triIndex * 3);
    b.fromBufferAttribute(posAttr, triIndex * 3 + 1);
    c.fromBufferAttribute(posAttr, triIndex * 3 + 2);
    tri.set(a, b, c);
    const area = tri.getArea();
    centroid
      .addVectors(a, b)
      .add(c)
      .multiplyScalar(1 / 3);
    component.area += area;
    component.forwardWeightedCenter += centroid.dot(forward) * area;
    component.weightedCenter.addScaledVector(centroid, area);
  }

  if (components.size <= 1) return source;

  const largestArea = Math.max(
    ...Array.from(components.values(), (component) => component.area),
  );
  const viable = Array.from(components.entries()).filter(
    ([, component]) => component.area >= largestArea * 0.2,
  );
  const bestEntry = viable.reduce<
    [
      number,
      { area: number; forwardWeightedCenter: number; weightedCenter: Vector3 },
    ] | undefined
  >(
    (best, entry) => {
      if (!best) return entry;
      const [, bestComponent] = best;
      const [, component] = entry;
      if (strategy === 'largest') {
        return component.area > bestComponent.area ? entry : best;
      }
      if (strategy === 'nearest' && targetPoint) {
        const score = component.weightedCenter
          .clone()
          .multiplyScalar(1 / component.area)
          .distanceToSquared(targetPoint);
        const bestScore = bestComponent.weightedCenter
          .clone()
          .multiplyScalar(1 / bestComponent.area)
          .distanceToSquared(targetPoint);
        return score < bestScore ? entry : best;
      }
      const score = component.forwardWeightedCenter / component.area;
      const bestScore =
        bestComponent.forwardWeightedCenter / bestComponent.area;
      return score > bestScore ? entry : best;
    },
    viable[0],
  );
  const bestRoot = bestEntry?.[0];

  if (bestRoot === undefined) return source;

  return rebuildGeometryFromTriangles(
    source,
    (triIndex) => find(triIndex) === bestRoot,
  );
}

/**
 * Projects an image onto a target mesh using Three.js DecalGeometry.
 * The output geometry clones the target mesh's surface inside the
 * projection box, so the texture follows every curve.
 *
 * Anti-z-fight strategy (the "Z offset" technique):
 *  1. `polygonOffset` on the material — render-time depth bias.
 *  2. Per-vertex push along the projection forward axis (~2 mm).
 *  3. `DoubleSide` so the decal renders regardless of which way the
 *     underlying mesh's triangles face the camera (was the silent killer
 *     for the flat-plane version — back-face culling hid everything).
 */
export const ProjectedDecal = memo(
  ({
    mesh,
    imageUrl,
    position,
    rotation,
    widthWorld,
    heightWorld,
    depthWorld,
    surfaceOffsetWorld,
    depthTest = true,
    polygonOffsetFactor = -4,
    polygonOffsetUnits = -4,
    normalCullMinDot,
    frontSurfaceDepthWorld,
    surfaceIsland,
    alphaTest = 0,
  }: ProjectedDecalProps) => {
    const [texture, setTexture] = useState<Texture | null>(null);

    useEffect(() => {
      let cancelled = false;
      const loader = new TextureLoader();
      loader.load(
        imageUrl,
        (tex) => {
          if (cancelled) {
            tex.dispose();
            return;
          }
          // PNG/JPG uploads are sRGB-encoded. Tagging the texture as
          // sRGB tells Three.js to convert it to linear for shading
          // and back to sRGB for display — without this the colors
          // come out washed-out because the renderer treats the data
          // as already-linear.
          tex.colorSpace = SRGBColorSpace;
          tex.generateMipmaps = false;
          tex.minFilter = LinearFilter;
          tex.magFilter = LinearFilter;
          tex.needsUpdate = true;
          setTexture(tex);
        },
        undefined,
        () => {
          if (!cancelled) setTexture(null);
        },
      );
      return () => {
        cancelled = true;
        setTexture((prev) => {
          prev?.dispose();
          return null;
        });
      };
    }, [imageUrl]);

    const geometry = useMemo(() => {
      if (!mesh) return null;
      mesh.updateMatrixWorld(true);
      // Depth = how far the projection box reaches through the mesh.
      // Must be enough to cover the LOCAL surface curvature at the
      // anchor (~10 cm world units is plenty for a gi), but NOT
      // deep enough to pierce all the way through to the opposite
      // side — that's what causes a back logo to bleed onto the
      // front. 0.15 world units works well for our model scale.
      const depth = depthWorld ?? 0.15;
      let geom: BufferGeometry;
      try {
        geom = new DecalGeometry(
          mesh,
          new Vector3(...position),
          new Euler(...rotation),
          new Vector3(widthWorld, heightWorld, depth),
        );
      } catch {
        return null;
      }
      // Push every vertex 2 mm along the projection forward axis so
      // the decal sits on TOP of the fabric, not embedded in it.
      const forward = new Vector3(0, 0, 1).applyEuler(new Euler(...rotation));
      if (frontSurfaceDepthWorld !== undefined) {
        const anchorDepth = new Vector3(...position).dot(forward);
        geom = rebuildGeometryFromTriangles(
          geom,
          (_triIndex, a, b, c) =>
            (a.dot(forward) + b.dot(forward) + c.dot(forward)) / 3 >=
            anchorDepth - frontSurfaceDepthWorld,
        );
      }
      if (normalCullMinDot !== undefined) {
        geom = rebuildGeometryFromTriangles(
          geom,
          (_triIndex, _a, _b, _c, faceNormal) =>
            faceNormal.dot(forward) >= normalCullMinDot,
        );
      }
      if (surfaceIsland) {
        geom = keepSurfaceIsland(
          geom,
          surfaceIsland,
          forward,
          new Vector3(...position),
        );
      }
      const push = surfaceOffsetWorld ?? 0.002;
      const posAttr = geom.attributes.position;
      if (!posAttr || posAttr.count < 3) {
        geom.dispose();
        return null;
      }
      for (let i = 0; i < posAttr.count; i++) {
        posAttr.setXYZ(
          i,
          posAttr.getX(i) + forward.x * push,
          posAttr.getY(i) + forward.y * push,
          posAttr.getZ(i) + forward.z * push,
        );
      }
      posAttr.needsUpdate = true;
      return geom;
    }, [
      mesh,
      position[0],
      position[1],
      position[2],
      rotation[0],
      rotation[1],
      rotation[2],
      widthWorld,
      heightWorld,
      depthWorld,
      surfaceOffsetWorld,
      normalCullMinDot,
      frontSurfaceDepthWorld,
      surfaceIsland,
    ]);

    useEffect(() => () => geometry?.dispose(), [geometry]);

    const material = useMemo(() => {
      // MeshBasicMaterial ignores scene lighting so the printed logo
      // reads at its true uploaded color — what a merchant expects from
      // a configurator. Trade-off: the decal won't get shaded by belt
      // folds etc., but the print stays vivid.
      return new MeshBasicMaterial({
        transparent: true,
        depthTest,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor,
        polygonOffsetUnits,
        side: DoubleSide,
        toneMapped: false,
        alphaTest,
      });
    }, [alphaTest, depthTest, polygonOffsetFactor, polygonOffsetUnits]);

    useEffect(() => {
      material.map = texture;
      material.needsUpdate = true;
    }, [material, texture]);

    useEffect(() => () => material.dispose(), [material]);

    const decalMesh = useMemo(() => {
      if (!geometry) return null;
      const m = new Mesh(geometry, material);
      m.renderOrder = 10;
      return m;
    }, [geometry, material]);

    if (!decalMesh || !texture) return null;

    return <primitive object={decalMesh} />;
  },
);

ProjectedDecal.displayName = 'ProjectedDecal';
