import { memo, useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import {
  Box3,
  Color,
  Mesh,
  MeshStandardMaterial,
  Raycaster,
  Vector3,
} from 'three';
import type { Group, Object3D } from 'three';

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
import { useGiState, type BeltTextTargetSlot } from './gi-state';

const WHITE_HEX = 'ffffff';

function normalizedMeshName(name: string) {
  return name.toLowerCase().replace(/[\s.-]+/g, '_');
}

function kimonoSubPartForMesh(name: string): KimonoSubPart | undefined {
  const normalized = normalizedMeshName(name);
  if (KIMONO_MESH_TO_SUBPART[name]) return KIMONO_MESH_TO_SUBPART[name];
  if (normalized.startsWith('kimono_body')) return 'body';
  if (normalized.startsWith('kimono_lapel')) return 'lapel';
  if (normalized.startsWith('kimono_reinforcement')) return 'reinforcement';
  if (
    normalized.startsWith('kimono_stitching') ||
    normalized.startsWith('topstitch_11608663') ||
    normalized.startsWith('topstitch_268357')
  ) {
    return 'stitching';
  }
  return undefined;
}

function pantSubPartForMesh(name: string): PantSubPart | undefined {
  const normalized = normalizedMeshName(name);
  if (PANT_MESH_TO_SUBPART[name]) return PANT_MESH_TO_SUBPART[name];
  if (normalized.startsWith('pant_body')) return 'body';
  if (normalized.startsWith('pant_reinforcement')) return 'reinforcement';
  if (
    normalized.startsWith('pant_stitching') ||
    normalized.startsWith('topstitch_2892726') ||
    normalized.startsWith('topstitch_2635989')
  ) {
    return 'stitching';
  }
  if (normalized.startsWith('pant_drawcord')) return 'drawcord';
  return undefined;
}

function isBeltPatchMesh(name: string) {
  const normalized = normalizedMeshName(name);
  return normalized.startsWith('belt_patch');
}

function objectOrAncestorMatches(
  obj: Object3D,
  matcher: (name: string) => boolean,
) {
  let current: Object3D | null = obj;
  while (current) {
    if (matcher(current.name)) return true;
    current = current.parent;
  }
  const mesh = obj as Mesh;
  if (mesh.isMesh && matcher(mesh.geometry.name)) return true;
  return false;
}

function slotFromObject<TSlot>(
  obj: Object3D,
  slotForName: (name: string) => TSlot | null,
) {
  let current: Object3D | null = obj;
  while (current) {
    const slot = slotForName(current.name);
    if (slot) return slot;
    current = current.parent;
  }
  const mesh = obj as Mesh;
  if (mesh.isMesh) return slotForName(mesh.geometry.name);
  return null;
}

function isMainBeltObject(obj: Object3D) {
  return objectOrAncestorMatches(
    obj,
    (name) => normalizedMeshName(name) === 'belt',
  );
}

function isBeltPatchObject(obj: Object3D) {
  return objectOrAncestorMatches(obj, isBeltPatchMesh);
}

function isLogoTargetMesh(name: string) {
  return normalizedMeshName(name).endsWith('_logo_target');
}

function isTextTargetMesh(name: string) {
  return normalizedMeshName(name).endsWith('_text_target');
}

function isLogoTargetObject(obj: Object3D) {
  return objectOrAncestorMatches(obj, isLogoTargetMesh);
}

function isTextTargetObject(obj: Object3D) {
  return objectOrAncestorMatches(obj, isTextTargetMesh);
}

function logoTargetSlotForMesh(name: string): KimonoLogoSlot | null {
  const normalized = normalizedMeshName(name);
  if (normalized === 'kimono_left_chest_logo_target') return 'left-chest';
  if (normalized === 'kimono_back_logo_target') return 'back';
  return null;
}

function logoTargetSlotForObject(obj: Object3D): KimonoLogoSlot | null {
  return slotFromObject(obj, logoTargetSlotForMesh);
}

function beltTextTargetSlotForMesh(name: string): BeltTextTargetSlot | null {
  const normalized = normalizedMeshName(name);
  if (normalized === 'belt_left_text_target') return 'leftEnd';
  if (normalized === 'belt_right_text_target') return 'rightEnd';
  return null;
}

function beltTextTargetSlotForObject(obj: Object3D): BeltTextTargetSlot | null {
  return slotFromObject(obj, beltTextTargetSlotForMesh);
}

function pantLogoTargetSlotForMesh(name: string): PantLogoSlot | null {
  const normalized = normalizedMeshName(name);
  if (normalized === 'pant_left_thigh_logo_target') return 'left-pant';
  if (normalized === 'pant_right_thigh_logo_target') return 'right-pant';
  return null;
}

function pantLogoTargetSlotForObject(obj: Object3D): PantLogoSlot | null {
  return slotFromObject(obj, pantLogoTargetSlotForMesh);
}

function preserveOriginalMaps(material: MeshStandardMaterial) {
  material.userData.originalMap = material.map;
  material.userData.originalAlphaMap = material.alphaMap;
  material.userData.originalAoMap = material.aoMap;
  material.userData.originalEmissiveMap = material.emissiveMap;
  material.userData.originalLightMap = material.lightMap;
  return material;
}

function cloneWithOriginalMaps(material: MeshStandardMaterial) {
  return preserveOriginalMaps(material.clone() as MeshStandardMaterial);
}

function partForColor(name: string): GiPart | undefined {
  const normalized = normalizedMeshName(name);
  if (
    normalized === 'belt' ||
    normalized.startsWith('belt_stitching')
  ) {
    return 'belt';
  }
  if (
    normalized.startsWith('kimono_body') ||
    normalized.startsWith('kimono_lapel') ||
    normalized.startsWith('kimono_reinforcement')
  ) {
    return 'jacket';
  }
  if (
    normalized.startsWith('pant_body') ||
    normalized.startsWith('pant_reinforcement')
  ) {
    return 'pants';
  }
  return undefined;
}

function partForColorObject(obj: Object3D): GiPart | undefined {
  let current: Object3D | null = obj;
  while (current) {
    const part = partForColor(current.name);
    if (part) return part;
    current = current.parent;
  }
  const mesh = obj as Mesh;
  if (mesh.isMesh) return partForColor(mesh.geometry.name);
  return undefined;
}

/**
 * Group a mesh into a gi part by its name prefix. Covers ALL meshes
 * (including decorative ones like stitching/labels) so that hiding a
 * part hides the entire region cleanly. Coloring still uses the
 * narrower MESH_TO_PART map above.
 */
function partForVisibility(name: string): GiPart | null {
  const normalized = normalizedMeshName(name);
  if (normalized.startsWith('kimono')) return 'jacket';
  if (normalized === 'belt' || normalized.startsWith('belt_')) return 'belt';
  if (normalized.startsWith('pant_')) return 'pants';
  if (
    normalized === 'dspln_size_lapel_label_1_001' ||
    normalized === 'lapel_label_patch'
  ) {
    return 'jacket';
  }
  if (
    normalized === 'belt' ||
    normalized === 'belt_label' ||
    normalized === 'dspln_size_lapel_label' ||
    normalized === 'dspln_size_lapel_label_002'
  ) {
    return 'belt';
  }
  if (
    normalized.startsWith('topstitch_11608663') ||
    normalized.startsWith('lapel_label') ||
    normalized.startsWith('dspln_main') ||
    normalized.startsWith('dslpn_main') ||
    normalized.startsWith('dslpn_back')
  ) {
    return 'jacket';
  }
  return null;
}

function partForVisibilityObject(obj: Object3D): GiPart | null {
  let current: Object3D | null = obj;
  while (current) {
    const part = partForVisibility(current.name);
    if (part) return part;
    current = current.parent;
  }
  const mesh = obj as Mesh;
  if (mesh.isMesh) {
    const geometryPart = partForVisibility(mesh.geometry.name);
    if (geometryPart) return geometryPart;
  }
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
        if (isLogoTargetObject(m) || isTextTargetObject(m)) {
          m.visible = false;
        }
        m.castShadow = true;
        m.receiveShadow = true;
        if (m.material) {
          if (Array.isArray(m.material)) {
            m.material = m.material.map((x) =>
              cloneWithOriginalMaps(x as MeshStandardMaterial),
            );
          } else {
            m.material = cloneWithOriginalMaps(
              m.material as MeshStandardMaterial,
            );
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
    const desiredHeight = 3.25;
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
      const sub = kimonoSubPartForMesh(mesh.name);
      const pantSub = pantSubPartForMesh(mesh.name);
      let targetPart: GiPart | null = null;
      let target: Color | null = null;
      if (sub) {
        target = kimonoSubTints[sub];
      } else if (pantSub) {
        target = pantSubTints[pantSub];
      } else if (isBeltPatchObject(mesh)) {
        target = new Color('#050505');
      } else {
        const part = partForColorObject(mesh);
        if (part) {
          targetPart = part;
          target = partTints[part];
        }
      }
      const preservesTexture =
        sub === 'stitching' || pantSub === 'stitching' || targetPart === 'belt';
      if (!target) return; // decorative — keep original material
      const apply = (mat: MeshStandardMaterial) => {
        if ('color' in mat && mat.color) {
          (mat.color as Color).copy(target);
          const isWhite = target.getHexString() === WHITE_HEX;
          mat.map =
            isWhite || preservesTexture
              ? (mat.userData.originalMap ?? null)
              : null;
          mat.alphaMap = isWhite ? (mat.userData.originalAlphaMap ?? null) : null;
          mat.aoMap = isWhite ? (mat.userData.originalAoMap ?? null) : null;
          mat.emissiveMap = isWhite
            ? (mat.userData.originalEmissiveMap ?? null)
            : null;
          mat.lightMap = isWhite ? (mat.userData.originalLightMap ?? null) : null;
          mat.vertexColors = false;
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
      if (isLogoTargetObject(mesh) || isTextTargetObject(mesh)) {
        mesh.visible = false;
        return;
      }
      const part = partForVisibilityObject(mesh);
      if (!part) return;
      mesh.visible = partVisibility[part] && scenePartVisibility[part];
    });
  }, [cloned, partVisibility, scenePartVisibility]);

  // Click-to-select: clicking a mesh figures out which part it belongs to.
  const handlePointerDown = (e: {
    stopPropagation: () => void;
    object?: Object3D;
  }) => {
    e.stopPropagation();
    const part = e.object ? partForColorObject(e.object) : undefined;
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
    const kimonoBodyLogoMeshes: Mesh[] = [];
    group.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      const logoTargetSlot = logoTargetSlotForObject(mesh);
      if (logoTargetSlot) {
        mesh.visible = false;
        kimonoLogoTargetMeshes[logoTargetSlot] = mesh;
      }
      const pantLogoTargetSlot = pantLogoTargetSlotForObject(mesh);
      if (pantLogoTargetSlot) {
        mesh.visible = false;
        pantLogoTargetMeshes[pantLogoTargetSlot] = mesh;
      }
      const beltTextTargetSlot = beltTextTargetSlotForObject(mesh);
      if (beltTextTargetSlot) {
        mesh.visible = false;
        beltTextTargetMeshes[beltTextTargetSlot] = mesh;
      }
      if (isMainBeltObject(mesh)) {
        beltMesh = mesh;
      }
      if (normalizedMeshName(mesh.name).startsWith('kimono_body')) {
        bodyMesh ??= mesh;
        kimonoBodyLogoMeshes.push(mesh);
      }
      if (normalizedMeshName(mesh.name).startsWith('pant_body')) {
        pantLogoMeshes['left-pant'] = mesh;
        pantLogoMeshes['right-pant'] = mesh;
      } else if (
        !pantFallbackMesh &&
        normalizedMeshName(mesh.name).startsWith('pant_body')
      ) {
        pantFallbackMesh = mesh;
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
      kimonoBodyLogoMeshes.length > 0 ? kimonoBodyLogoMeshes : [bodyMesh],
    );

    // World-space bbox of the body mesh. Three.js DecalGeometry takes
    // the projection center in WORLD coords (it applies the mesh's
    // matrixWorld internally), so we anchor in world space.
    const bbox = new Box3();
    (kimonoBodyLogoMeshes.length > 0 ? kimonoBodyLogoMeshes : [bodyMesh]).forEach(
      (mesh) => bbox.expandByObject(mesh),
    );
    const center = bbox.getCenter(new Vector3());
    const size = bbox.getSize(new Vector3());
    const eps = 0.005;

    // Anchors push slightly OUTWARD from the body surface (not inward)
    // so the flat-plane decal sits in front of the fabric, not behind
    // or inside it.
    const out = 0.012; // 12 mm outward push for visibility headroom
    const leftChestX = center.x + size.x * 0.13 + 0.03;
    const leftChestY = center.y + size.y * 0.19;
    const leftChestRay = new Raycaster(
      new Vector3(leftChestX, leftChestY, bbox.max.z + size.z * 0.25),
      new Vector3(0, 0, -1),
    );
    const leftChestHit = leftChestRay.intersectObjects(
      kimonoBodyLogoMeshes.length > 0 ? kimonoBodyLogoMeshes : [bodyMesh],
      false,
    )[0];
    const anchors: Record<KimonoLogoSlot, [number, number, number]> = {
      'left-chest': leftChestHit
        ? leftChestHit.point.toArray()
        : [leftChestX, leftChestY, bbox.max.z - 0.03],
      // Sleeve anchors sit on the outside bicep, vertically aligned
      // with the left-chest print box.
      'left-sleeve': [
        bbox.max.x - size.x * 0.09,
        center.y + size.y * 0.18,
        bbox.max.z * -0.2 - 0.0125,
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
    setKimonoBodyMesh,
    setKimonoLogoMeshes,
    setKimonoLogoTargetMeshes,
    setPantLogoTargetMeshes,
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
