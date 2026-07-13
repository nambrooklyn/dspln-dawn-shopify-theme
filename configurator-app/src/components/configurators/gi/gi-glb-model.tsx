import { memo, useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { Box3, Color, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import type { Group } from 'three';

import {
  GI_MODEL_URL,
  KIMONO_MESH_TO_SUBPART,
  PANT_MESH_TO_SUBPART,
  renderHexFor,
  type GiPart,
  type KimonoLogoSlot,
  type KimonoSubPart,
  type PantLogoSlot,
  type PantSubPart,
} from './gi-config';
import { useGiState } from './gi-state';

/**
 * Map of mesh name → gi part. Mesh names come from the .glb file and are
 * matched verbatim. Any mesh NOT in this map keeps its original material
 * (typically stitching, labels, embroidery — decorative details).
 *
 * If you swap in a different .glb, update this map to match its mesh names.
 */
const MESH_TO_PART: Record<string, GiPart> = {
  // Belt fabric + stitching. Patches / labels keep their original black
  // materials like the DTC reference.
  Belt: 'belt',
  Belt_Stitching: 'belt',

  // Kimono (jacket) — main body + lapel + structural reinforcements.
  Kimono_Body: 'jacket',
  Kimono_Lapel: 'jacket',
  Kimono_Reinforcement_1: 'jacket',
  Kimono_Reinforcement_2: 'jacket',
  Kimono_Reinforcement_3: 'jacket',
  Kimono_Reinforcement_4: 'jacket',

  // Pants — body panels + reinforcements.
  Pant_Body_1: 'pants',
  Pant_Body_2: 'pants',
  Pant_Body_3: 'pants',
  Pant_Reinforcements_1: 'pants',
  Pant_Reinforcements_2: 'pants',
};

const BELT_PATCH_MESHES = new Set(['Belt Patch', 'Belt_Patch']);

/**
 * Group a mesh into a gi part by its name prefix. Covers ALL meshes
 * (including decorative ones like stitching/labels) so that hiding a
 * part hides the entire region cleanly. Coloring still uses the
 * narrower MESH_TO_PART map above.
 */
function partForVisibility(name: string): GiPart | null {
  if (name === 'Belt' || name.startsWith('Belt_')) return 'belt';
  if (name.startsWith('Kimono')) return 'jacket';
  if (name.startsWith('Pant_') || name.startsWith('Pants_')) return 'pants';
  return null;
}

/**
 * Loads the real gi .glb and applies the merchant's chosen colors
 * to the appropriate mesh groups (jacket / pants / belt).
 * Decorative meshes (stitching, labels, embroidery, drawcord) keep
 * their original materials.
 */
export const GiGlbModel = memo(() => {
  const { scene } = useGLTF(GI_MODEL_URL) as unknown as { scene: Group };
  const {
    partColors,
    partVisibility,
    scenePartVisibility,
    kimonoSubColors,
    pantSubColors,
    setSelectedPart,
    setComputedKimonoAnchors,
    setKimonoBodyMesh,
    setKimonoLogoMeshes,
    setBeltMesh,
    setPantLogoMeshes,
  } = useGiState();
  const groupRef = useRef<Group | null>(null);

  // Clone the scene + clone each mesh's material so the merchant's color
  // tweaks don't mutate the shared GLTF asset (which would leak across
  // remounts). Enable shadow casting + receiving on every mesh so the
  // key directional light produces self-shadows (belt over kimono,
  // lapel folds, etc.) — that's what gives the gi visible shape.
  const cloned = useMemo(() => {
    const s = scene.clone(true);
    s.traverse((obj) => {
      const m = obj as Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        if (m.material) {
          if (Array.isArray(m.material)) {
            m.material = m.material.map((x) => x.clone());
          } else {
            m.material = (m.material as MeshStandardMaterial).clone();
          }
        }
      }
    });
    return s;
  }, [scene]);

  // Center + scale so the model sits roughly where the placeholder did.
  const { offset, scale } = useMemo(() => {
    const box = new Box3().setFromObject(cloned);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const desiredHeight = 2.5;
    const sc = size.y > 0 ? desiredHeight / size.y : 1;
    return {
      offset: [-center.x * sc, -box.min.y * sc, -center.z * sc] as [
        number,
        number,
        number,
      ],
      scale: sc,
    };
  }, [cloned]);

  // Signal that the real gi .glb has finished loading and mounted, so
  // off-screen consumers (the admin tech-pack page) know when it is safe to
  // capture views. Set a flag AND fire an event to avoid a
  // listener-attached-after-dispatch race.
  useEffect(() => {
    const w = window as unknown as { __giModelReady?: boolean };
    w.__giModelReady = true;
    window.dispatchEvent(new Event('dspln:gi-model-ready'));
    return () => {
      w.__giModelReady = false;
    };
  }, []);

  // Apply per-part / per-sub-part colors. Kimono is routed at the
  // sub-part level (body / lapel / reinforcement / stitching). Pants
  // follow the same structure. Belt still uses a single part-level color.
  useEffect(() => {
    const partTints = {
      jacket: new Color(renderHexFor(partColors.jacket)),
      pants: new Color(renderHexFor(partColors.pants)),
      belt: new Color(renderHexFor(partColors.belt)),
    };
    const kimonoSubTints: Record<KimonoSubPart, Color> = {
      body: new Color(renderHexFor(kimonoSubColors.body)),
      lapel: new Color(renderHexFor(kimonoSubColors.lapel)),
      reinforcement: new Color(renderHexFor(kimonoSubColors.reinforcement)),
      stitching: new Color(renderHexFor(kimonoSubColors.stitching)),
    };
    const pantSubTints: Record<PantSubPart, Color> = {
      body: new Color(renderHexFor(pantSubColors.body)),
      reinforcement: new Color(renderHexFor(pantSubColors.reinforcement)),
      stitching: new Color(renderHexFor(pantSubColors.stitching)),
      drawcord: new Color(renderHexFor(pantSubColors.drawcord)),
    };
    cloned.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      // Kimono sub-part coloring takes precedence over the broader
      // jacket color when the mesh is in the sub-part map.
      const sub = KIMONO_MESH_TO_SUBPART[mesh.name];
      const pantSub = PANT_MESH_TO_SUBPART[mesh.name];
      let target: Color | null = null;
      if (sub) {
        target = kimonoSubTints[sub];
      } else if (pantSub) {
        target = pantSubTints[pantSub];
      } else if (BELT_PATCH_MESHES.has(mesh.name)) {
        target = new Color('#050505');
      } else {
        const part = MESH_TO_PART[mesh.name];
        if (part) target = partTints[part];
      }
      if (!target) return; // decorative — keep original material
      const apply = (mat: MeshStandardMaterial) => {
        if ('color' in mat && mat.color) {
          (mat.color as Color).copy(target);
          mat.needsUpdate = true;
        }
      };
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => apply(m as MeshStandardMaterial));
      } else if (mesh.material) {
        apply(mesh.material as MeshStandardMaterial);
      }
    });
  }, [cloned, partColors, kimonoSubColors, pantSubColors]);

  // Apply per-part visibility. Add/remove controls define what is included;
  // scene visibility controls are viewer-only masks for inspection.
  useEffect(() => {
    cloned.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      const part = partForVisibility(mesh.name);
      if (!part) return;
      mesh.visible = partVisibility[part] && scenePartVisibility[part];
    });
  }, [cloned, partVisibility, scenePartVisibility]);

  // Click-to-select: clicking a mesh figures out which part it belongs to.
  // Fires on click (not pointer-down) and ignores drags — orbiting the
  // model must not yank the panel between parts.
  const handleModelClick = (e: {
    stopPropagation: () => void;
    delta?: number;
    object?: { name?: string };
  }) => {
    e.stopPropagation();
    if ((e.delta ?? 0) > 6) return;
    const name = (e.object && e.object.name) || '';
    const part = MESH_TO_PART[name];
    if (part) setSelectedPart(part);
  };

  // After the model mounts at world scale/position, compute world-space
  // anchor points for each logo slot from Kimono_Body's actual bbox.
  // This makes the decals land ON the mesh regardless of how the model
  // gets scaled by the auto-fit logic above.
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.updateWorldMatrix(true, true);

    let bodyMesh: Mesh | null = null;
    let beltMesh: Mesh | null = null;
    const pantLogoMeshes: Partial<Record<PantLogoSlot, Mesh>> = {};
    let pantFallbackMesh: Mesh | null = null;
    const logoTargetMeshes: Mesh[] = [];
    group.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      if (mesh.name === 'Belt') {
        beltMesh = mesh;
      }
      if (mesh.name === 'Kimono_Body') {
        bodyMesh = mesh;
      }
      if (mesh.name === 'Pant_Body_3') {
        pantLogoMeshes['left-pant'] = mesh;
      } else if (mesh.name === 'Pant_Body_2') {
        pantLogoMeshes['right-pant'] = mesh;
      } else if (!pantFallbackMesh && mesh.name.startsWith('Pant_Body_')) {
        pantFallbackMesh = mesh;
      }
      if (
        mesh.name === 'Kimono_Body' ||
        mesh.name.startsWith('Kimono_Reinforcement_')
      ) {
        logoTargetMeshes.push(mesh);
      }
    });
    setBeltMesh(beltMesh);
    const nextPantLogoMeshes: Partial<Record<PantLogoSlot, Mesh>> = {};
    const leftPantLogoMesh = pantLogoMeshes['left-pant'] ?? pantFallbackMesh;
    const rightPantLogoMesh =
      pantLogoMeshes['right-pant'] ??
      pantLogoMeshes['left-pant'] ??
      pantFallbackMesh;
    if (leftPantLogoMesh) nextPantLogoMeshes['left-pant'] = leftPantLogoMesh;
    if (rightPantLogoMesh) nextPantLogoMeshes['right-pant'] = rightPantLogoMesh;
    setPantLogoMeshes(nextPantLogoMeshes);
    if (!bodyMesh) return;
    setKimonoBodyMesh(bodyMesh);
    setKimonoLogoMeshes(
      logoTargetMeshes.length > 0 ? logoTargetMeshes : [bodyMesh],
    );

    // World-space bbox of the body mesh. Three.js DecalGeometry takes
    // the projection center in WORLD coords (it applies the mesh's
    // matrixWorld internally), so we anchor in world space.
    const bbox = new Box3().setFromObject(bodyMesh);
    const center = bbox.getCenter(new Vector3());
    const size = bbox.getSize(new Vector3());
    const eps = 0.005;

    // Anchors push slightly OUTWARD from the body surface (not inward)
    // so the flat-plane decal sits in front of the fabric, not behind
    // or inside it.
    const out = 0.012; // 12 mm outward push for visibility headroom
    const anchors: Record<KimonoLogoSlot, [number, number, number]> = {
      'left-chest': [
        center.x + size.x * 0.23 - 0.075,
        center.y + size.y * 0.205 - 0.05,
        bbox.max.z + out,
      ],
      // Sleeve anchors sit on the outside bicep, vertically aligned
      // with the left-chest print box.
      'left-sleeve': [
        bbox.max.x - size.x * 0.09,
        center.y + size.y * 0.18,
        bbox.max.z * -0.2,
      ],
      'right-sleeve': [
        bbox.min.x + size.x * 0.09,
        center.y + size.y * 0.18,
        bbox.max.z * -0.2,
      ],
      // Square print area on the flatter upper-back panel. Kept high
      // enough that all four corners stay inside the jacket's taper.
      back: [center.x, center.y + size.y * 0.075 - 0.025, bbox.min.z - out],
      // Wide strip on the back skirt just below the belt (studio-only
      // placement). Measured on the real mesh: the belt's back band ends
      // at ~33% up the body bbox and the BACK hem is at ~7% (the front
      // skirt hangs lower and owns bbox.min.y), so 21.5% centers the
      // strip in the visible below-belt band.
      'back-skirt': [center.x, bbox.min.y + size.y * 0.215, bbox.min.z - out],
    };
    setComputedKimonoAnchors(anchors);
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__giBodyBox = {
        min: bbox.min.toArray(),
        max: bbox.max.toArray(),
        size: size.toArray(),
      };
    }
  }, [
    cloned,
    scale,
    offset,
    setComputedKimonoAnchors,
    setBeltMesh,
    setPantLogoMeshes,
    setKimonoBodyMesh,
    setKimonoLogoMeshes,
  ]);

  return (
    <group
      ref={groupRef}
      position={offset}
      scale={scale}
      onClick={handleModelClick}
    >
      <primitive object={cloned} />
    </group>
  );
});

GiGlbModel.displayName = 'GiGlbModel';

useGLTF.preload(GI_MODEL_URL);
