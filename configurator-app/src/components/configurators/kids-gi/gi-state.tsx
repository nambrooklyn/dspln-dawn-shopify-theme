import {
  createContext,
  memo,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { Mesh } from 'three';

import {
  BELT_EMBROIDERY_DEFAULT,
  CAMERA_POSITIONS,
  MOBILE_CAMERA_POSITIONS,
  GI_DEFAULT_COLORS,
  GI_PART_PRICES,
  GI_PARTS,
  KIMONO_SUBPART_DEFAULT,
  PANT_SUBPART_DEFAULT,
  beltSwatchForName,
  nameForHex,
  type CameraView,
  type BeltFontName,
  type GiPart,
  type KimonoLogoSlot,
  type KimonoSubPart,
  type PantLogoSlot,
  type PantSubPart,
  type KidsBeltRankName,
} from './gi-config';
import { GI_PRODUCT_CONFIGS } from '../shared/gi-product-config';

const PRODUCT_CONFIG = GI_PRODUCT_CONFIGS.kids;

export type BeltTextTargetSlot = 'leftEnd' | 'rightEnd';

export interface KimonoLogo {
  imageUrl: string; // blob: URL (local for v1; signed URL in prod)
  imageWidth: number;
  imageHeight: number;
  filename: string;
  file?: File;
}

/**
 * One placed logo / image on the gi.
 * For v1 every layer maps to a fixed UV anchor on the jacket chest
 * (see gi-config.JACKET_CHEST_ANCHOR). In v2 we'll add per-layer anchors
 * and drag-on-surface placement.
 */
export interface GiLayer {
  id: string;
  name: string;
  imageUrl: string; // blob: URL for v1 (no remote upload)
  imageWidth: number; // intrinsic pixel size, used for aspect ratio
  imageHeight: number;
  // Transform on the decal (interpreted in arbitrary "design units" for v1).
  widthIn: number; // inches in print-area space
  heightIn: number;
  rotateDeg: number;
  scalePct: number; // 100 = native
  visible: boolean;
}

export interface GiSerializedState {
  kind: 'kids-gi';
  partColors: Record<GiPart, string>;
  partVisibility: Record<GiPart, boolean>;
  price: {
    currency: 'USD';
    total: number;
    lines: Array<{
      part: GiPart;
      included: boolean;
      unitPrice: number;
    }>;
  };
  kimono: {
    size: string;
    colors: Record<KimonoSubPart, { hex: string; name: string | null }>;
    logos: Partial<
      Record<
        KimonoLogoSlot,
        {
          filename: string;
          imageWidth: number;
          imageHeight: number;
        }
      >
    >;
  };
  belt: {
    size: string;
    color: {
      hex: string;
      name: string | null;
    };
    rank: {
      name: string;
      baseHex: string;
      stripeHex: string;
    };
    embroidery: {
      leftEnd: string;
      rightEnd: string;
      leftFont: string;
      rightFont: string;
      leftThreadColor: string;
      leftThreadColorName: string | null;
      rightThreadColor: string;
      rightThreadColorName: string | null;
    };
  };
  pant: {
    size: string;
    colors: Record<PantSubPart, { hex: string; name: string | null }>;
    logos: Partial<
      Record<
        PantLogoSlot,
        {
          filename: string;
          imageWidth: number;
          imageHeight: number;
        }
      >
    >;
  };
  layers: Array<Omit<GiLayer, 'imageUrl'> & { imageDataUrl?: string }>;
  cameraView: CameraView;
}

interface GiStateValue {
  // Part selection / coloring.
  partColors: Record<GiPart, string>;
  selectedPart: GiPart;
  setSelectedPart: (part: GiPart) => void;
  setPartColor: (part: GiPart, color: string) => void;

  // Which parts are "added" to the configuration. A merchant can remove
  // (hide) the kimono, belt, or pants — hidden parts vanish from the
  // 3D scene. Mirrors the ADD/REMOVE controls in the D2C reference.
  partVisibility: Record<GiPart, boolean>;
  setPartVisible: (part: GiPart, visible: boolean) => void;
  scenePartVisibility: Record<GiPart, boolean>;
  setScenePartVisible: (part: GiPart, visible: boolean) => void;

  // Selected kimono size (e.g. 'A00S', 'A2L', 'Custom Measurements').
  // Doesn't affect the 3D model itself in v1 — it's part of the design
  // payload that gets saved.
  kimonoSize: string;
  setKimonoSize: (size: string) => void;

  // Per-sub-part colors on the kimono (body, lapel, reinforcement,
  // stitching). Each maps to one or more meshes in the .glb via
  // KIMONO_MESH_TO_SUBPART. Decorative meshes outside that map (logos,
  // labels) keep their original baked materials.
  kimonoSubColors: Record<KimonoSubPart, string>;
  setKimonoSubColor: (subPart: KimonoSubPart, color: string) => void;

  pantSize: string;
  setPantSize: (size: string) => void;
  pantSubColors: Record<PantSubPart, string>;
  setPantSubColor: (subPart: PantSubPart, color: string) => void;

  beltSize: string;
  setBeltSize: (size: string) => void;
  beltRank: KidsBeltRankName;
  setBeltRank: (rank: KidsBeltRankName) => void;
  beltEmbroidery: {
    leftEnd: string;
    rightEnd: string;
    leftFont: string;
    rightFont: string;
    leftThreadColor: string;
    rightThreadColor: string;
  };
  setBeltEmbroidery: (
    patch: Partial<{
      leftEnd: string;
      rightEnd: string;
      leftFont: string;
      rightFont: string;
      leftThreadColor: string;
      rightThreadColor: string;
    }>,
  ) => void;

  // One logo per named anchor on the kimono (left-chest, left-sleeve,
  // right-sleeve, back). Slots without an entry are empty.
  kimonoLogos: Partial<Record<KimonoLogoSlot, KimonoLogo>>;
  setKimonoLogo: (slot: KimonoLogoSlot, logo: KimonoLogo) => void;
  removeKimonoLogo: (slot: KimonoLogoSlot) => void;
  pantLogos: Partial<Record<PantLogoSlot, KimonoLogo>>;
  setPantLogo: (slot: PantLogoSlot, logo: KimonoLogo) => void;
  removePantLogo: (slot: PantLogoSlot) => void;

  // World-space anchor positions for the 4 logo slots, computed from the
  // actual model bbox after the .glb loads (so the decals land ON the
  // mesh regardless of how the model gets scaled). Null until the model
  // has reported its bounds; gi-canvas falls back to the static config
  // anchors in that case.
  computedKimonoAnchors: Record<
    KimonoLogoSlot,
    [number, number, number]
  > | null;
  setComputedKimonoAnchors: (
    anchors: Record<KimonoLogoSlot, [number, number, number]>,
  ) => void;

  // Reference to the live Kimono_Body Mesh once the .glb loads — the
  // target for drei's <Decal> so logos project onto the actual mesh
  // surface (wraps around curves) rather than being a flat plane.
  kimonoBodyMesh: Mesh | null;
  setKimonoBodyMesh: (mesh: Mesh | null) => void;
  kimonoLogoMeshes: Mesh[];
  setKimonoLogoMeshes: (meshes: Mesh[]) => void;
  kimonoLogoTargetMeshes: Partial<Record<KimonoLogoSlot, Mesh>>;
  setKimonoLogoTargetMeshes: (
    meshes: Partial<Record<KimonoLogoSlot, Mesh>>,
  ) => void;
  beltMesh: Mesh | null;
  setBeltMesh: (mesh: Mesh | null) => void;
  beltTextTargetMeshes: Partial<Record<BeltTextTargetSlot, Mesh>>;
  setBeltTextTargetMeshes: (
    meshes: Partial<Record<BeltTextTargetSlot, Mesh>>,
  ) => void;
  pantLogoMeshes: Partial<Record<PantLogoSlot, Mesh>>;
  setPantLogoMeshes: (meshes: Partial<Record<PantLogoSlot, Mesh>>) => void;
  pantLogoTargetMeshes: Partial<Record<PantLogoSlot, Mesh>>;
  setPantLogoTargetMeshes: (
    meshes: Partial<Record<PantLogoSlot, Mesh>>,
  ) => void;

  // Camera view (front / back).
  cameraView: CameraView;
  cameraViewResetKey: number;
  setCameraView: (view: CameraView) => void;

  // Layers (uploaded logos).
  layers: GiLayer[];
  selectedLayerId: string | null;
  selectLayer: (id: string | null) => void;
  addLayer: (layer: Omit<GiLayer, 'id' | 'visible'>) => string;
  updateLayer: (id: string, patch: Partial<GiLayer>) => void;
  removeLayer: (id: string) => void;
  toggleLayerVisibility: (id: string) => void;

  // Canvas ref — set by GiCanvas so utilities (PDF export) can read it.
  setCanvasEl: (el: HTMLCanvasElement | null) => void;
  getCanvasEl: () => HTMLCanvasElement | null;

  // Serialize state for save.
  serialize: () => GiSerializedState;
  hydrate: (
    state: GiSerializedState,
    logoImages?: {
      kimono?: Partial<Record<KimonoLogoSlot, KimonoLogo>>;
      pant?: Partial<Record<PantLogoSlot, KimonoLogo>>;
    },
  ) => void;
}

const GiStateContext = createContext<GiStateValue | null>(null);

export const GiStateProvider = memo(({ children }: { children: ReactNode }) => {
  const [partColors, setPartColors] = useState<Record<GiPart, string>>(() => ({
    ...GI_DEFAULT_COLORS,
  }));
  const [selectedPart, setSelectedPart] = useState<GiPart>(GI_PARTS[0]);
  const [partVisibility, setPartVisibilityState] = useState<
    Record<GiPart, boolean>
  >({ jacket: true, pants: true, belt: true });
  const [scenePartVisibility, setScenePartVisibilityState] = useState<
    Record<GiPart, boolean>
  >({ jacket: true, pants: true, belt: true });
  const [kimonoSize, setKimonoSize] = useState<string>('M0');
  const [pantSize, setPantSize] = useState<string>('M0');
  const [beltSize, setBeltSize] = useState<string>('M0');
  const [beltRank, setBeltRankState] =
    useState<KidsBeltRankName>('White');
  const [kimonoSubColors, setKimonoSubColorsState] = useState<
    Record<KimonoSubPart, string>
  >(() => ({ ...KIMONO_SUBPART_DEFAULT }));
  const [pantSubColors, setPantSubColorsState] = useState<
    Record<PantSubPart, string>
  >(() => ({ ...PANT_SUBPART_DEFAULT }));
  const [beltEmbroidery, setBeltEmbroideryState] = useState(() => ({
    ...BELT_EMBROIDERY_DEFAULT,
  }));

  const setKimonoSubColor = useCallback(
    (subPart: KimonoSubPart, color: string) => {
      setKimonoSubColorsState((prev) => ({ ...prev, [subPart]: color }));
    },
    [],
  );

  const setPantSubColor = useCallback((subPart: PantSubPart, color: string) => {
    setPantSubColorsState((prev) => ({ ...prev, [subPart]: color }));
  }, []);

  const setBeltRank = useCallback((rank: KidsBeltRankName) => {
    const swatch = beltSwatchForName(rank);
    if (!swatch) return;
    setBeltRankState(rank);
    setPartColors((prev) => ({ ...prev, belt: swatch.hex }));
  }, []);

  const setBeltEmbroidery = useCallback(
	    (
	      patch: Partial<{
	        leftEnd: string;
	        rightEnd: string;
	        leftFont: BeltFontName;
	        rightFont: BeltFontName;
	        leftThreadColor: string;
	        rightThreadColor: string;
	      }>,
    ) => {
      setBeltEmbroideryState((prev) => ({ ...prev, ...patch }));
    },
    [],
  );

  const [kimonoLogos, setKimonoLogosState] = useState<
    Partial<Record<KimonoLogoSlot, KimonoLogo>>
  >({});
  const [pantLogos, setPantLogosState] = useState<
    Partial<Record<PantLogoSlot, KimonoLogo>>
  >({});

  const setKimonoLogo = useCallback(
    (slot: KimonoLogoSlot, logo: KimonoLogo) => {
      setKimonoLogosState((prev) => ({ ...prev, [slot]: logo }));
    },
    [],
  );
  const removeKimonoLogo = useCallback((slot: KimonoLogoSlot) => {
    setKimonoLogosState((prev) => {
      const next = { ...prev };
      delete next[slot];
      return next;
    });
  }, []);
  const setPantLogo = useCallback((slot: PantLogoSlot, logo: KimonoLogo) => {
    setPantLogosState((prev) => ({ ...prev, [slot]: logo }));
  }, []);
  const removePantLogo = useCallback((slot: PantLogoSlot) => {
    setPantLogosState((prev) => {
      const next = { ...prev };
      delete next[slot];
      return next;
    });
  }, []);

  const [computedKimonoAnchors, setComputedKimonoAnchorsState] =
    useState<Record<KimonoLogoSlot, [number, number, number]> | null>(null);
  const setComputedKimonoAnchors = useCallback(
    (anchors: Record<KimonoLogoSlot, [number, number, number]>) => {
      setComputedKimonoAnchorsState(anchors);
    },
    [],
  );

  const [kimonoBodyMesh, setKimonoBodyMeshState] = useState<Mesh | null>(null);
  const setKimonoBodyMesh = useCallback((mesh: Mesh | null) => {
    setKimonoBodyMeshState(mesh);
  }, []);
  const [kimonoLogoMeshes, setKimonoLogoMeshesState] = useState<Mesh[]>([]);
  const setKimonoLogoMeshes = useCallback((meshes: Mesh[]) => {
    setKimonoLogoMeshesState(meshes);
  }, []);
  const [kimonoLogoTargetMeshes, setKimonoLogoTargetMeshesState] = useState<
    Partial<Record<KimonoLogoSlot, Mesh>>
  >({});
  const setKimonoLogoTargetMeshes = useCallback(
    (meshes: Partial<Record<KimonoLogoSlot, Mesh>>) => {
      setKimonoLogoTargetMeshesState(meshes);
    },
    [],
  );
  const [beltMesh, setBeltMeshState] = useState<Mesh | null>(null);
  const setBeltMesh = useCallback((mesh: Mesh | null) => {
    setBeltMeshState(mesh);
  }, []);
  const [beltTextTargetMeshes, setBeltTextTargetMeshesState] = useState<
    Partial<Record<BeltTextTargetSlot, Mesh>>
  >({});
  const setBeltTextTargetMeshes = useCallback(
    (meshes: Partial<Record<BeltTextTargetSlot, Mesh>>) => {
      setBeltTextTargetMeshesState(meshes);
    },
    [],
  );
  const [pantLogoMeshes, setPantLogoMeshesState] = useState<
    Partial<Record<PantLogoSlot, Mesh>>
  >({});
  const setPantLogoMeshes = useCallback(
    (meshes: Partial<Record<PantLogoSlot, Mesh>>) => {
      setPantLogoMeshesState(meshes);
    },
    [],
  );
  const [pantLogoTargetMeshes, setPantLogoTargetMeshesState] = useState<
    Partial<Record<PantLogoSlot, Mesh>>
  >({});
  const setPantLogoTargetMeshes = useCallback(
    (meshes: Partial<Record<PantLogoSlot, Mesh>>) => {
      setPantLogoTargetMeshesState(meshes);
    },
    [],
  );
  const [cameraView, setCameraViewState] = useState<CameraView>('front');
  const [cameraViewResetKey, setCameraViewResetKey] = useState(0);
  const setCameraView = useCallback((view: CameraView) => {
    setCameraViewState(view);
    setCameraViewResetKey((key) => key + 1);
  }, []);
  const [layers, setLayers] = useState<GiLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);

  const canvasElRef = useRef<HTMLCanvasElement | null>(null);

  const setPartColor = useCallback((part: GiPart, color: string) => {
    setPartColors((prev) => ({ ...prev, [part]: color }));
  }, []);

  const setPartVisible = useCallback((part: GiPart, visible: boolean) => {
    setPartVisibilityState((prev) => ({ ...prev, [part]: visible }));
    if (visible) {
      setScenePartVisibilityState((prev) => ({ ...prev, [part]: true }));
    }
  }, []);

  const setScenePartVisible = useCallback(
    (part: GiPart, visible: boolean) => {
      setScenePartVisibilityState((prev) => ({ ...prev, [part]: visible }));
    },
    [],
  );

  const selectLayer = useCallback((id: string | null) => {
    setSelectedLayerId(id);
  }, []);

  const addLayer = useCallback((layer: Omit<GiLayer, 'id' | 'visible'>) => {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `layer-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const newLayer: GiLayer = { ...layer, id, visible: true };
    setLayers((prev) => [...prev, newLayer]);
    setSelectedLayerId(id);
    return id;
  }, []);

  const updateLayer = useCallback((id: string, patch: Partial<GiLayer>) => {
    setLayers((prev) =>
      prev.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)),
    );
  }, []);

  const removeLayer = useCallback((id: string) => {
    setLayers((prev) => prev.filter((layer) => layer.id !== id));
    setSelectedLayerId((curr) => (curr === id ? null : curr));
  }, []);

  const toggleLayerVisibility = useCallback((id: string) => {
    setLayers((prev) =>
      prev.map((layer) =>
        layer.id === id ? { ...layer, visible: !layer.visible } : layer,
      ),
    );
  }, []);

  const setCanvasEl = useCallback((el: HTMLCanvasElement | null) => {
    canvasElRef.current = el;
  }, []);
  const getCanvasEl = useCallback(() => canvasElRef.current, []);

  const serialize = useCallback<GiStateValue['serialize']>(() => {
    const priceLines = GI_PARTS.map((part) => ({
      part,
      included: partVisibility[part],
      unitPrice: GI_PART_PRICES[part],
    }));

    const logos = Object.entries(kimonoLogos).reduce<
      GiSerializedState['kimono']['logos']
    >((acc, [slot, logo]) => {
      if (logo) {
        acc[slot as KimonoLogoSlot] = {
          filename: logo.filename,
          imageWidth: logo.imageWidth,
          imageHeight: logo.imageHeight,
        };
      }
      return acc;
    }, {});
    const pantLogoPayload = Object.entries(pantLogos).reduce<
      GiSerializedState['pant']['logos']
    >((acc, [slot, logo]) => {
      if (logo) {
        acc[slot as PantLogoSlot] = {
          filename: logo.filename,
          imageWidth: logo.imageWidth,
          imageHeight: logo.imageHeight,
        };
      }
      return acc;
    }, {});

    return {
      kind: PRODUCT_CONFIG.stateKind,
      partColors,
      partVisibility,
      price: {
        currency: 'USD',
        total: priceLines.reduce(
          (sum, line) => sum + (line.included ? line.unitPrice : 0),
          0,
        ),
        lines: priceLines,
      },
      kimono: {
        size: kimonoSize,
        colors: {
          body: {
            hex: kimonoSubColors.body,
            name: nameForHex(kimonoSubColors.body),
          },
          lapel: {
            hex: kimonoSubColors.lapel,
            name: nameForHex(kimonoSubColors.lapel),
          },
          reinforcement: {
            hex: kimonoSubColors.reinforcement,
            name: nameForHex(kimonoSubColors.reinforcement),
          },
          stitching: {
            hex: kimonoSubColors.stitching,
            name: nameForHex(kimonoSubColors.stitching),
          },
        },
        logos,
      },
      belt: {
        size: beltSize,
        color: {
          hex: partColors.belt,
          name: beltRank,
        },
        rank: {
          name: beltRank,
          baseHex: beltSwatchForName(beltRank)?.hex ?? partColors.belt,
          stripeHex:
            beltSwatchForName(beltRank)?.stripeHex ?? partColors.belt,
        },
        embroidery: {
          ...beltEmbroidery,
          leftThreadColorName: nameForHex(beltEmbroidery.leftThreadColor),
          rightThreadColorName: nameForHex(beltEmbroidery.rightThreadColor),
        },
      },
      pant: {
        size: pantSize,
        logos: pantLogoPayload,
        colors: {
          body: {
            hex: pantSubColors.body,
            name: nameForHex(pantSubColors.body),
          },
          reinforcement: {
            hex: pantSubColors.reinforcement,
            name: nameForHex(pantSubColors.reinforcement),
          },
          stitching: {
            hex: pantSubColors.stitching,
            name: nameForHex(pantSubColors.stitching),
          },
          drawcord: {
            hex: pantSubColors.drawcord,
            name: nameForHex(pantSubColors.drawcord),
          },
        },
      },
      layers: layers.map(({ imageUrl: _imageUrl, ...rest }) => rest),
      cameraView,
    };
  }, [
    partColors,
    partVisibility,
    kimonoSize,
    kimonoSubColors,
    kimonoLogos,
    pantLogos,
    beltEmbroidery,
    beltSize,
    beltRank,
    pantSize,
    pantSubColors,
    layers,
    cameraView,
  ]);

  const hydrate = useCallback<GiStateValue['hydrate']>(
    (state, logoImages) => {
      setPartColors({ ...state.partColors });
      setPartVisibilityState({ ...state.partVisibility });
      setScenePartVisibilityState({ ...state.partVisibility });
      setKimonoSize(state.kimono.size);
      setPantSize(state.pant.size);
      setBeltSize(state.belt.size ?? 'M0');
      setBeltRankState(
        beltSwatchForName(state.belt.rank?.name ?? '')?.name ?? 'White',
      );
      setKimonoSubColorsState({
        body: state.kimono.colors.body.hex,
        lapel: state.kimono.colors.lapel.hex,
        reinforcement: state.kimono.colors.reinforcement.hex,
        stitching: state.kimono.colors.stitching.hex,
      });
      setPantSubColorsState({
        body: state.pant.colors.body.hex,
        reinforcement: state.pant.colors.reinforcement.hex,
        stitching: state.pant.colors.stitching.hex,
        drawcord: state.pant.colors.drawcord.hex,
      });
	      setBeltEmbroideryState({
	        leftEnd: state.belt.embroidery.leftEnd,
	        rightEnd: state.belt.embroidery.rightEnd,
	        leftFont: state.belt.embroidery.leftFont as BeltFontName,
	        rightFont: state.belt.embroidery.rightFont as BeltFontName,
	        leftThreadColor: state.belt.embroidery.leftThreadColor,
	        rightThreadColor: state.belt.embroidery.rightThreadColor,
	      });
      setKimonoLogosState({ ...(logoImages?.kimono ?? {}) });
      setPantLogosState({ ...(logoImages?.pant ?? {}) });
      setLayers([]);
      setSelectedLayerId(null);
      setCameraView(state.cameraView);
      const firstVisiblePart = GI_PARTS.find((part) => state.partVisibility[part]);
      setSelectedPart(firstVisiblePart ?? GI_PARTS[0]);
    },
    [],
  );

  const value = useMemo<GiStateValue>(
    () => ({
      partColors,
      selectedPart,
      setSelectedPart,
      setPartColor,
      partVisibility,
      setPartVisible,
      scenePartVisibility,
      setScenePartVisible,
      kimonoSize,
      setKimonoSize,
      kimonoSubColors,
      setKimonoSubColor,
      pantSize,
      setPantSize,
      pantSubColors,
      setPantSubColor,
      beltSize,
      setBeltSize,
      beltRank,
      setBeltRank,
      beltEmbroidery,
      setBeltEmbroidery,
      kimonoLogos,
      setKimonoLogo,
      removeKimonoLogo,
      pantLogos,
      setPantLogo,
      removePantLogo,
      computedKimonoAnchors,
      setComputedKimonoAnchors,
      kimonoBodyMesh,
      setKimonoBodyMesh,
      kimonoLogoMeshes,
      setKimonoLogoMeshes,
      kimonoLogoTargetMeshes,
      setKimonoLogoTargetMeshes,
      beltMesh,
      setBeltMesh,
      beltTextTargetMeshes,
      setBeltTextTargetMeshes,
      pantLogoMeshes,
      setPantLogoMeshes,
      pantLogoTargetMeshes,
      setPantLogoTargetMeshes,
      cameraView,
      cameraViewResetKey,
      setCameraView,
      layers,
      selectedLayerId,
      selectLayer,
      addLayer,
      updateLayer,
      removeLayer,
      toggleLayerVisibility,
      setCanvasEl,
      getCanvasEl,
      serialize,
      hydrate,
    }),
    [
      partColors,
      selectedPart,
      setPartColor,
      partVisibility,
      setPartVisible,
      scenePartVisibility,
      setScenePartVisible,
      kimonoSize,
      pantSize,
      beltSize,
      beltRank,
      kimonoSubColors,
      setKimonoSubColor,
      pantSubColors,
      setPantSubColor,
      beltEmbroidery,
      setBeltRank,
      setBeltEmbroidery,
      kimonoLogos,
      setKimonoLogo,
      removeKimonoLogo,
      pantLogos,
      setPantLogo,
      removePantLogo,
      computedKimonoAnchors,
      setComputedKimonoAnchors,
      kimonoBodyMesh,
      setKimonoBodyMesh,
      kimonoLogoMeshes,
      setKimonoLogoMeshes,
      kimonoLogoTargetMeshes,
      setKimonoLogoTargetMeshes,
      beltMesh,
      setBeltMesh,
      beltTextTargetMeshes,
      setBeltTextTargetMeshes,
      pantLogoMeshes,
      setPantLogoMeshes,
      pantLogoTargetMeshes,
      setPantLogoTargetMeshes,
      cameraView,
      cameraViewResetKey,
      setCameraView,
      layers,
      selectedLayerId,
      selectLayer,
      addLayer,
      updateLayer,
      removeLayer,
      toggleLayerVisibility,
      setCanvasEl,
      getCanvasEl,
      serialize,
      hydrate,
    ],
  );

  return (
    <GiStateContext.Provider value={value}>{children}</GiStateContext.Provider>
  );
});

GiStateProvider.displayName = 'GiStateProvider';

export function useGiState() {
  const ctx = useContext(GiStateContext);
  if (!ctx) {
    throw new Error('useGiState must be used inside <GiStateProvider>');
  }
  return ctx;
}

export const cameraViewToPosition = (
  view: CameraView,
  useMobileCamera = false,
) => (useMobileCamera ? MOBILE_CAMERA_POSITIONS : CAMERA_POSITIONS)[view];
