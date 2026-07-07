import { memo, useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { Box3, Color, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import type { Group, Material } from 'three';

import {
  GI_MODEL_URL,
  KIMONO_MESH_TO_SUBPART,
  PANT_MESH_TO_SUBPART,
  beltSwatchForName,
  renderHexFor,
  type GiPart,
  type KimonoLogoSlot,
  type KimonoSubPart,
  type PantLogoSlot,
  type PantSubPart,
} from './gi-config';
import { useGiState, type BeltTextTargetSlot } from './gi-state';

/**
 * Map of mesh name → gi part. Mesh names come from the .glb file and are
 * matched verbatim. Any mesh NOT in this map keeps its original material
 * (typically stitching, labels, embroidery — decorative details).
 *
 * If you swap in a different .glb, update this map to match its mesh names.
 */
const MESH_TO_PART: Record<string, GiPart> = {
  Belt_Body: 'belt',
  Belt_Body_1: 'belt',
  Belt_Body_2: 'belt',
  Belt_Stripe: 'belt',
  Belt_Stripe_1: 'belt',
  Belt_Stripe_2: 'belt',

  // Kimono (jacket) — main body + lapel + structural reinforcements.
  Kimono_Body: 'jacket',
  Kimono_Body_1: 'jacket',
  Kimono_Body_2: 'jacket',
  Kimono_Body_3: 'jacket',
  Kimono_Lapel: 'jacket',

  // Pants — body panels + reinforcements.
  Pant_Body: 'pants',
  Pant_Body_1: 'pants',
  Pant_Body_2: 'pants',
  Pant_Body_3: 'pants',
};

const PRESERVE_MATERIAL_PATTERNS = [/DSPLN/i, /DSLPN/i, /Label/i, /LOGO/i];
function normalizedMeshName(name: string) {
  return name.toLowerCase().replace(/[\s.-]+/g, '_');
}

function isLogoTargetMesh(name: string) {
  return normalizedMeshName(name).endsWith('_logo_target');
}

function isTextTargetMesh(name: string) {
  return normalizedMeshName(name).endsWith('_text_target');
}

function logoTargetSlotForMesh(name: string): KimonoLogoSlot | null {
  const normalized = normalizedMeshName(name);
  if (normalized === 'kimono_left_chest_logo_target') return 'left-chest';
  if (normalized === 'kimono_left_sleeve_logo_target') return 'left-sleeve';
  if (normalized === 'kimono_right_sleeve_logo_target') return 'right-sleeve';
  if (normalized === 'kimono_back_logo_target') return 'back';
  return null;
}

function pantLogoTargetSlotForMesh(name: string): PantLogoSlot | null {
  const normalized = normalizedMeshName(name);
  if (normalized === 'pant_left_thigh_logo_target') return 'left-pant';
  if (normalized === 'pant_right_thigh_logo_target') return 'right-pant';
  return null;
}

function beltTextTargetSlotForMesh(name: string): BeltTextTargetSlot | null {
  const normalized = normalizedMeshName(name);
  if (normalized === 'belt_left_text_target') return 'leftEnd';
  if (normalized === 'belt_right_text_target') return 'rightEnd';
  return null;
}

const CONFIGURABLE_MESHES = new Set([
  ...Object.keys(KIMONO_MESH_TO_SUBPART),
  ...Object.keys(PANT_MESH_TO_SUBPART),
  'Belt_Body',
  'Belt_Body_1',
  'Belt_Body_2',
  'Belt_Stripe',
  'Belt_Stripe_1',
  'Belt_Stripe_2',
]);

/**
 * Group a mesh into a gi part by its name prefix. Covers ALL meshes
 * (including decorative ones like stitching/labels) so that hiding a
 * part hides the entire region cleanly. Coloring still uses the
 * narrower MESH_TO_PART map above.
 */
function partForVisibility(name: string): GiPart | null {
  if (isLogoTargetMesh(name) || isTextTargetMesh(name)) return null;
  if (name.startsWith('Belt_')) return 'belt';
  if (name.startsWith('Kimono')) return 'jacket';
  if (name.startsWith('Pant_')) return 'pants';
  return null;
}

function shouldPreserveMaterial(mat: Material): boolean {
  return PRESERVE_MATERIAL_PATTERNS.some((pattern) =>
    pattern.test(mat.name ?? ''),
  );
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
    beltRank,
    setSelectedPart,
    setComputedKimonoAnchors,
    setKimonoBodyMesh,
    setKimonoLogoMeshes,
    setKimonoLogoTargetMeshes,
    setBeltMesh,
    setBeltTextTargetMeshes,
    setPantLogoMeshes,
    setPantLogoTargetMeshes,
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
        if (isLogoTargetMesh(m.name) || isTextTargetMesh(m.name)) {
          m.visible = false;
        }
        m.castShadow = true;
        m.receiveShadow = true;
        if (m.material) {
          if (Array.isArray(m.material)) {
            m.material = m.material.map((x) => {
              const material = x.clone() as MeshStandardMaterial;
              material.userData.originalMap = material.map;
              material.userData.originalAlphaMap = material.alphaMap;
              material.userData.originalAoMap = material.aoMap;
              material.userData.originalEmissiveMap = material.emissiveMap;
              material.userData.originalLightMap = material.lightMap;
              return material;
            });
          } else {
            const material = (m.material as MeshStandardMaterial).clone();
            material.userData.originalMap = material.map;
            material.userData.originalAlphaMap = material.alphaMap;
            material.userData.originalAoMap = material.aoMap;
            material.userData.originalEmissiveMap = material.emissiveMap;
            material.userData.originalLightMap = material.lightMap;
            m.material = material;
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

  // Apply per-part / per-sub-part colors. Kimono is routed at the
  // sub-part level (body / lapel / reinforcement / stitching). Pants
  // follow the same structure. Belt still uses a single part-level color.
  useEffect(() => {
    const partTints = {
      jacket: new Color(renderHexFor(partColors.jacket)),
      pants: new Color(renderHexFor(partColors.pants)),
      belt: new Color(renderHexFor(partColors.belt)),
    };
    const beltSwatch = beltSwatchForName(beltRank);
    const beltBaseHex = beltSwatch ? beltSwatch.hex : partColors.belt;
    const beltStripeHex = beltSwatch ? beltSwatch.stripeHex : partColors.belt;
    const beltBaseTint = new Color(
      renderHexFor(beltBaseHex),
    );
    const beltStripeTint = new Color(
      renderHexFor(beltStripeHex),
    );
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
      const preservesTexture = sub === 'stitching' || pantSub === 'stitching';
      let target: Color | null = null;
      if (sub) {
        target = kimonoSubTints[sub];
      } else if (pantSub) {
        target = pantSubTints[pantSub];
      } else if (mesh.name === 'Belt_Body' || mesh.name.startsWith('Belt_Body_')) {
        target = beltBaseTint;
      } else if (
        mesh.name === 'Belt_Stripe' ||
        mesh.name.startsWith('Belt_Stripe_')
      ) {
        target = beltStripeTint;
      } else {
        const part = MESH_TO_PART[mesh.name];
        if (part) target = partTints[part];
      }
      if (!target) return; // decorative — keep original material
      const isBeltFabricMesh =
        mesh.name === 'Belt_Body' ||
        mesh.name === 'Belt_Stripe' ||
        mesh.name.startsWith('Belt_Body_') ||
        mesh.name.startsWith('Belt_Stripe_');
      const apply = (mat: Material) => {
        if (shouldPreserveMaterial(mat)) return;
        const standardMat = mat as MeshStandardMaterial;
        if ('color' in mat && mat.color) {
          (standardMat.color as Color).copy(target);
          if (CONFIGURABLE_MESHES.has(mesh.name)) {
            if (preservesTexture) {
              standardMat.map = standardMat.userData.originalMap ?? null;
              standardMat.alphaMap = standardMat.userData.originalAlphaMap ?? null;
              standardMat.aoMap = standardMat.userData.originalAoMap ?? null;
              standardMat.emissiveMap =
                standardMat.userData.originalEmissiveMap ?? null;
              standardMat.lightMap = standardMat.userData.originalLightMap ?? null;
            } else if (!isBeltFabricMesh) {
              standardMat.map = null;
              standardMat.alphaMap = null;
              standardMat.aoMap = null;
              standardMat.emissiveMap = null;
              standardMat.lightMap = null;
            }
            standardMat.vertexColors = false;
            standardMat.metalness = 0;
            standardMat.roughness = Math.max(standardMat.roughness ?? 0.75, 0.75);
          }
          standardMat.needsUpdate = true;
        }
      };
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => apply(m));
      } else if (mesh.material) {
        apply(mesh.material);
      }
    });
  }, [cloned, partColors, kimonoSubColors, pantSubColors, beltRank]);

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
  const handlePointerDown = (e: {
    stopPropagation: () => void;
    object?: { name?: string };
  }) => {
    e.stopPropagation();
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
    const beltTextTargetMeshes: Partial<Record<BeltTextTargetSlot, Mesh>> = {};
    const pantLogoMeshes: Partial<Record<PantLogoSlot, Mesh>> = {};
    const pantLogoTargetMeshes: Partial<Record<PantLogoSlot, Mesh>> = {};
    let pantFallbackMesh: Mesh | null = null;
    const kimonoLogoTargetMeshes: Partial<Record<KimonoLogoSlot, Mesh>> = {};
    const logoTargetMeshes: Mesh[] = [];
    group.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      const logoTargetSlot = logoTargetSlotForMesh(mesh.name);
      if (logoTargetSlot) {
        mesh.visible = false;
        kimonoLogoTargetMeshes[logoTargetSlot] = mesh;
      }
      const pantLogoTargetSlot = pantLogoTargetSlotForMesh(mesh.name);
      if (pantLogoTargetSlot) {
        mesh.visible = false;
        pantLogoTargetMeshes[pantLogoTargetSlot] = mesh;
      }
      const beltTextTargetSlot = beltTextTargetSlotForMesh(mesh.name);
      if (beltTextTargetSlot) {
        mesh.visible = false;
        beltTextTargetMeshes[beltTextTargetSlot] = mesh;
      }
      if (mesh.name === 'Belt_Body' || mesh.name.startsWith('Belt_Body_')) {
        beltMesh = mesh;
      }
      if (
        !bodyMesh &&
        (mesh.name === 'Kimono_Body' || mesh.name.startsWith('Kimono_Body_'))
      ) {
        bodyMesh = mesh;
      }
      if (mesh.name === 'Pant_Body_3') {
        pantLogoMeshes['left-pant'] = mesh;
      } else if (mesh.name === 'Pant_Body_2') {
        pantLogoMeshes['right-pant'] = mesh;
      } else if (
        !pantFallbackMesh &&
        (mesh.name === 'Pant_Body' || mesh.name.startsWith('Pant_Body_'))
      ) {
        pantFallbackMesh = mesh;
      }
      if (
        mesh.name === 'Kimono_Body' ||
        mesh.name === 'Kimono_Reinforcement' ||
        mesh.name.startsWith('Kimono_Body_') ||
        mesh.name.startsWith('Kimono_Reinforcement_')
      ) {
        logoTargetMeshes.push(mesh);
      }
    });
    setBeltMesh(beltMesh);
    setBeltTextTargetMeshes(beltTextTargetMeshes);
    setKimonoLogoTargetMeshes(kimonoLogoTargetMeshes);
    setPantLogoTargetMeshes(pantLogoTargetMeshes);
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
    setBeltTextTargetMeshes,
    setPantLogoMeshes,
    setPantLogoTargetMeshes,
    setKimonoBodyMesh,
    setKimonoLogoMeshes,
    setKimonoLogoTargetMeshes,
  ]);

  return (
    <group
      ref={groupRef}
      position={offset}
      scale={scale}
      onPointerDown={handlePointerDown}
    >
      <primitive object={cloned} />
    </group>
  );
});

GiGlbModel.displayName = 'GiGlbModel';

useGLTF.preload(GI_MODEL_URL);
