import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Mesh } from 'three';

import {
  CAMERA_POSITIONS,
  MOBILE_CAMERA_POSITIONS,
  RASHGUARD_ARTWORK_TARGETS,
  RASHGUARD_BASE_PRICE,
  RASHGUARD_DEFAULT_COLORS,
  RASHGUARD_PARTS,
  RASHGUARD_SIZE_OPTIONS,
  nameForHex,
  type CameraView,
  type RashguardArtworkTarget,
  type RashguardPart,
} from './rashguard-config';

export interface RashguardArtworkLayer {
  id: string;
  kind: 'image' | 'text';
  imageUrl?: string;
  imageWidth: number;
  imageHeight: number;
  filename: string;
  file?: File;
  text?: string;
  fontFamily?: string;
  color?: string;
  outlineColor?: string;
  outlineWidth?: number;
  target: RashguardArtworkTarget;
  x: number;
  y: number;
  scale: number;
  rotationDeg: number;
  visible: boolean;
  locked: boolean;
  placementPending: boolean;
}

export interface RashguardSerializedArtworkLayer {
  id: string;
  filename: string;
  imageWidth: number;
  imageHeight: number;
  kind?: 'image' | 'text';
  text?: string;
  fontFamily?: string;
  color?: string;
  outlineColor?: string;
  outlineWidth?: number;
  target: RashguardArtworkTarget;
  x: number;
  y: number;
  scale: number;
  rotationDeg: number;
  visible: boolean;
  locked?: boolean;
  placementPending?: boolean;
}

export interface RashguardSerializedState {
  kind: 'short-sleeve-rashguard';
  size: string;
  partColors: Record<RashguardPart, { hex: string; name: string | null }>;
  artworkLayers: RashguardSerializedArtworkLayer[];
  price: {
    currency: 'USD';
    base: number;
    logoTotal: number;
    total: number;
    lines: Array<{
      label: string;
      unitPrice: number;
    }>;
  };
  cameraView: CameraView;
}

interface RashguardStateValue {
  size: string;
  setSize: (size: string) => void;
  selectedPanel: 'garment' | 'artwork';
  setSelectedPanel: (panel: 'garment' | 'artwork') => void;
  partColors: Record<RashguardPart, string>;
  setPartColor: (part: RashguardPart, color: string) => void;
  artworkLayers: RashguardArtworkLayer[];
  selectedArtworkLayerId: string | null;
  isArtworkDragging: boolean;
  addArtworkLayer: (input: {
    file: File;
    dimensions: { width: number; height: number };
    target?: RashguardArtworkTarget;
  }) => void;
  addTextLayer: (input?: { target?: RashguardArtworkTarget }) => void;
  updateArtworkLayer: (
    id: string,
    updates: Partial<
      Pick<
        RashguardArtworkLayer,
        | 'target'
        | 'x'
        | 'y'
        | 'scale'
        | 'rotationDeg'
        | 'visible'
        | 'locked'
        | 'placementPending'
        | 'text'
        | 'fontFamily'
        | 'color'
        | 'outlineColor'
        | 'outlineWidth'
      >
    >,
  ) => void;
  duplicateArtworkLayer: (id: string) => void;
  removeArtworkLayer: (id: string) => void;
  selectArtworkLayer: (id: string | null) => void;
  moveArtworkLayer: (id: string, direction: 'up' | 'down') => void;
  reorderArtworkLayer: (id: string, nextIndex: number) => void;
  setArtworkDragging: (isDragging: boolean) => void;
  cameraView: CameraView;
  cameraViewResetKey: number;
  setCameraView: (view: CameraView) => void;
  artworkTargetMeshes: Partial<Record<RashguardArtworkTarget, Mesh>>;
  setArtworkTargetMeshes: (
    meshes: Partial<Record<RashguardArtworkTarget, Mesh>>,
  ) => void;
  setCanvasEl: (el: HTMLCanvasElement | null) => void;
  getCanvasEl: () => HTMLCanvasElement | null;
  calculateTotal: () => number;
  serialize: () => RashguardSerializedState;
  hydrate: (
    state: RashguardSerializedState,
    artworkImages?: RashguardArtworkLayer[],
  ) => void;
}

interface RashguardHistorySnapshot {
  size: string;
  selectedPanel: 'garment' | 'artwork';
  partColors: Record<RashguardPart, string>;
  artworkLayers: RashguardArtworkLayer[];
  selectedArtworkLayerId: string | null;
  cameraView: CameraView;
}

const RashguardStateContext = createContext<RashguardStateValue | null>(null);

const DEFAULT_ARTWORK_LAYER = {
  x: 0.5,
  y: 0.55,
  scale: 1,
  rotationDeg: 0,
  visible: true,
  locked: false,
  placementPending: false,
} satisfies Pick<
  RashguardArtworkLayer,
  'x' | 'y' | 'scale' | 'rotationDeg' | 'visible' | 'locked' | 'placementPending'
>;

const MAX_UNDO_HISTORY = 80;
const DEFAULT_TEXT_OUTLINE_WIDTH = 6;
const MAX_TEXT_OUTLINE_WIDTH = 36;
const DEFAULT_TEXT_FONT_FAMILY = 'Arial';
const RASHGUARD_TEXT_FONT_FAMILIES = new Set([
  'Arial',
  'Arial Black',
  'Georgia',
  'Impact',
  'Times New Roman',
  'Verdana',
]);

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function createArtworkLayerId() {
  return `artwork_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function isValidSize(size: string) {
  return RASHGUARD_SIZE_OPTIONS.some((option) => option === size);
}

function isValidColor(hex: string) {
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}

function isValidArtworkTarget(target: string): target is RashguardArtworkTarget {
  return RASHGUARD_ARTWORK_TARGETS.some((option) => option === target);
}

function sanitizeArtworkLayer(layer: RashguardArtworkLayer): RashguardArtworkLayer {
  return {
    ...layer,
    target: isValidArtworkTarget(layer.target) ? layer.target : 'rightFrontLeg',
    kind: layer.kind === 'text' ? 'text' : 'image',
    x: clamp(Number.isFinite(layer.x) ? layer.x : DEFAULT_ARTWORK_LAYER.x, 0, 1),
    y: clamp(Number.isFinite(layer.y) ? layer.y : DEFAULT_ARTWORK_LAYER.y, 0, 1),
    scale: clamp(
      Number.isFinite(layer.scale) ? layer.scale : DEFAULT_ARTWORK_LAYER.scale,
      0.2,
      4,
    ),
    rotationDeg: Number.isFinite(layer.rotationDeg) ? layer.rotationDeg : 0,
    visible: layer.visible !== false,
    locked: layer.locked === true,
    placementPending: layer.placementPending === true,
    text: layer.text ?? 'TEXT',
    fontFamily: RASHGUARD_TEXT_FONT_FAMILIES.has(layer.fontFamily ?? '')
      ? layer.fontFamily
      : DEFAULT_TEXT_FONT_FAMILY,
    color: layer.color ?? '#ffffff',
    outlineColor: layer.outlineColor ?? '#000000',
    outlineWidth: clamp(
      Number.isFinite(layer.outlineWidth ?? NaN)
        ? layer.outlineWidth ?? DEFAULT_TEXT_OUTLINE_WIDTH
        : DEFAULT_TEXT_OUTLINE_WIDTH,
      0, // allow 0 = no outline (6 remains the default for new text)
      MAX_TEXT_OUTLINE_WIDTH,
    ),
  };
}

function buildPriceLines(artworkLayers: RashguardArtworkLayer[]) {
  return [
    { label: 'Rashguard Base', unitPrice: RASHGUARD_BASE_PRICE },
    ...artworkLayers.map((_, index) => ({
      label: `Artwork Layer ${index + 1}`,
      unitPrice: 0,
    })),
  ];
}

export const RashguardStateProvider = memo(
  ({ children }: { children: ReactNode }) => {
    const [size, setSize] = useState('M');
    const [selectedPanel, setSelectedPanel] =
      useState<'garment' | 'artwork'>('garment');
    const [partColors, setPartColors] = useState<Record<RashguardPart, string>>(
      () => ({ ...RASHGUARD_DEFAULT_COLORS }),
    );
    const [artworkLayers, setArtworkLayers] = useState<RashguardArtworkLayer[]>(
      [],
    );
    const [selectedArtworkLayerId, setSelectedArtworkLayerId] = useState<
      string | null
    >(null);
    const [isArtworkDragging, setArtworkDragging] = useState(false);
    const [cameraView, setCameraViewState] = useState<CameraView>('front');
    const [cameraViewResetKey, setCameraViewResetKey] = useState(0);
    const [artworkTargetMeshes, setArtworkTargetMeshesState] = useState<
      Partial<Record<RashguardArtworkTarget, Mesh>>
    >({});
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const latestSnapshotRef = useRef<RashguardHistorySnapshot | null>(null);
    const undoStackRef = useRef<RashguardHistorySnapshot[]>([]);
    const lastHistoryEntryRef = useRef<{ key: string; time: number } | null>(null);

    useEffect(() => {
      latestSnapshotRef.current = {
        size,
        selectedPanel,
        partColors: { ...partColors },
        artworkLayers: artworkLayers.map((layer) => ({ ...layer })),
        selectedArtworkLayerId,
        cameraView,
      };
    }, [
      artworkLayers,
      cameraView,
      partColors,
      selectedArtworkLayerId,
      selectedPanel,
      size,
    ]);

    const recordUndoSnapshot = useCallback((key: string) => {
      const snapshot = latestSnapshotRef.current;
      if (!snapshot) return;

      const now = window.performance.now();
      const lastEntry = lastHistoryEntryRef.current;
      if (lastEntry?.key === key && now - lastEntry.time < 650) {
        lastEntry.time = now;
        return;
      }

      undoStackRef.current = [
        ...undoStackRef.current.slice(-(MAX_UNDO_HISTORY - 1)),
        {
          ...snapshot,
          partColors: { ...snapshot.partColors },
          artworkLayers: snapshot.artworkLayers.map((layer) => ({ ...layer })),
        },
      ];
      lastHistoryEntryRef.current = { key, time: now };
    }, []);

    const undoLastChange = useCallback(() => {
      const previous = undoStackRef.current.pop();
      if (!previous) return;

      setSize(previous.size);
      setSelectedPanel(previous.selectedPanel);
      setPartColors({ ...previous.partColors });
      setArtworkLayers(previous.artworkLayers.map((layer) => ({ ...layer })));
      setSelectedArtworkLayerId(previous.selectedArtworkLayerId);
      setCameraViewState(previous.cameraView);
      setCameraViewResetKey((key) => key + 1);
      lastHistoryEntryRef.current = null;
    }, []);

    useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.defaultPrevented || event.repeat) return;
        const target = event.target as HTMLElement | null;
        const isEditable =
          target?.tagName === 'INPUT' ||
          target?.tagName === 'TEXTAREA' ||
          target?.isContentEditable === true;
        if (isEditable) return;

        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
          event.preventDefault();
          undoLastChange();
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undoLastChange]);

    const setGarmentSize = useCallback(
      (nextSize: string) => {
        if (nextSize === latestSnapshotRef.current?.size) return;
        recordUndoSnapshot('size');
        setSize(nextSize);
      },
      [recordUndoSnapshot],
    );

    const setPartColor = useCallback((part: RashguardPart, color: string) => {
      if (color === latestSnapshotRef.current?.partColors[part]) return;
      recordUndoSnapshot(`part-color:${part}`);
      setPartColors((prev) => ({ ...prev, [part]: color }));
    }, [recordUndoSnapshot]);

    const setConfiguratorPanel = useCallback((panel: 'garment' | 'artwork') => {
      setSelectedPanel(panel);
    }, []);

    const addArtworkLayer = useCallback(
      ({
        file,
        dimensions,
        target,
      }: {
        file: File;
        dimensions: { width: number; height: number };
        target?: RashguardArtworkTarget;
      }) => {
        const layer: RashguardArtworkLayer = sanitizeArtworkLayer({
          ...DEFAULT_ARTWORK_LAYER,
          kind: 'image',
          id: createArtworkLayerId(),
          imageUrl: URL.createObjectURL(file),
          imageWidth: dimensions.width,
          imageHeight: dimensions.height,
          filename: file.name,
          file,
          target: target ?? (cameraView === 'back' ? 'rightBackLeg' : 'rightFrontLeg'),
          placementPending: true,
        });
        recordUndoSnapshot('add-artwork');
        setArtworkLayers((prev) => [...prev, layer]);
        setSelectedArtworkLayerId(layer.id);
        setSelectedPanel('artwork');
      },
      [cameraView, recordUndoSnapshot],
    );

    const addTextLayer = useCallback(
      (input?: { target?: RashguardArtworkTarget }) => {
        const layer: RashguardArtworkLayer = sanitizeArtworkLayer({
          ...DEFAULT_ARTWORK_LAYER,
          kind: 'text',
          id: createArtworkLayerId(),
          filename: 'Text',
          imageWidth: 800,
          imageHeight: 220,
          text: 'TEXT',
          fontFamily: DEFAULT_TEXT_FONT_FAMILY,
          color: '#ffffff',
          outlineColor: '#000000',
          outlineWidth: DEFAULT_TEXT_OUTLINE_WIDTH,
          target: input?.target ?? (cameraView === 'back' ? 'rightBackLeg' : 'rightFrontLeg'),
          placementPending: true,
        });
        recordUndoSnapshot('add-text');
        setArtworkLayers((prev) => [...prev, layer]);
        setSelectedArtworkLayerId(layer.id);
        setSelectedPanel('artwork');
      },
      [cameraView, recordUndoSnapshot],
    );

    const updateArtworkLayer = useCallback<
      RashguardStateValue['updateArtworkLayer']
    >((id, updates) => {
      recordUndoSnapshot(`update-artwork:${id}:${Object.keys(updates).sort().join(',')}`);
      setArtworkLayers((prev) =>
        prev.map((layer) =>
          layer.id === id ? sanitizeArtworkLayer({ ...layer, ...updates }) : layer,
        ),
      );
    }, [recordUndoSnapshot]);

    const duplicateArtworkLayer = useCallback((id: string) => {
      recordUndoSnapshot('duplicate-artwork');
      setArtworkLayers((prev) => {
        const index = prev.findIndex((layer) => layer.id === id);
        if (index < 0) return prev;
        const source = prev[index];
        const copy = sanitizeArtworkLayer({
          ...source,
          id: createArtworkLayerId(),
          x: source.x + 0.05,
          y: source.y - 0.05,
          filename: `${source.filename} copy`,
          placementPending: false,
        });
        setSelectedArtworkLayerId(copy.id);
        return [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)];
      });
    }, [recordUndoSnapshot]);

    const removeArtworkLayer = useCallback((id: string) => {
      recordUndoSnapshot('remove-artwork');
      setArtworkLayers((prev) => prev.filter((layer) => layer.id !== id));
      setSelectedArtworkLayerId((selected) => (selected === id ? null : selected));
    }, [recordUndoSnapshot]);

    const selectArtworkLayer = useCallback(
      (id: string | null) => {
        setSelectedArtworkLayerId(id);
        if (id) {
          setSelectedPanel('artwork');
        }
      },
      [],
    );

    const moveArtworkLayer = useCallback(
      (id: string, direction: 'up' | 'down') => {
        recordUndoSnapshot('move-artwork-layer');
        setArtworkLayers((prev) => {
          const index = prev.findIndex((layer) => layer.id === id);
          if (index < 0) return prev;
          const nextIndex = direction === 'up' ? index + 1 : index - 1;
          if (nextIndex < 0 || nextIndex >= prev.length) return prev;
          const next = [...prev];
          [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
          return next;
        });
      },
      [recordUndoSnapshot],
    );

    const reorderArtworkLayer = useCallback((id: string, nextIndex: number) => {
      recordUndoSnapshot(`reorder-artwork:${id}`);
      setArtworkLayers((prev) => {
        const currentIndex = prev.findIndex((layer) => layer.id === id);
        if (currentIndex < 0) return prev;
        const boundedIndex = Math.min(prev.length - 1, Math.max(0, nextIndex));
        if (currentIndex === boundedIndex) return prev;
        const next = [...prev];
        const [layer] = next.splice(currentIndex, 1);
        next.splice(boundedIndex, 0, layer);
        return next;
      });
    }, [recordUndoSnapshot]);

    const setCameraView = useCallback((view: CameraView) => {
      if (view !== latestSnapshotRef.current?.cameraView) {
        recordUndoSnapshot('camera-view');
      }
      setCameraViewState(view);
      setCameraViewResetKey((key) => key + 1);
    }, [recordUndoSnapshot]);

    const setArtworkTargetMeshes = useCallback(
      (meshes: Partial<Record<RashguardArtworkTarget, Mesh>>) => {
        setArtworkTargetMeshesState(meshes);
      },
      [],
    );

    const setCanvasEl = useCallback((el: HTMLCanvasElement | null) => {
      canvasRef.current = el;
    }, []);

    const getCanvasEl = useCallback(() => canvasRef.current, []);

    const calculateTotal = useCallback(() => {
      return buildPriceLines(artworkLayers).reduce(
        (sum, line) => sum + line.unitPrice,
        0,
      );
    }, [artworkLayers]);

    const serialize = useCallback<RashguardStateValue['serialize']>(() => {
      const lines = buildPriceLines(artworkLayers);
      const logoTotal = lines
        .slice(1)
        .reduce((sum, line) => sum + line.unitPrice, 0);

      return {
        kind: 'short-sleeve-rashguard',
        size,
        partColors: RASHGUARD_PARTS.reduce(
          (acc, part) => {
            const hex = partColors[part];
            acc[part] = { hex, name: nameForHex(hex) };
            return acc;
          },
          {} as Record<RashguardPart, { hex: string; name: string | null }>,
        ),
        artworkLayers: artworkLayers.map(
          ({
            id,
            kind,
            filename,
            imageWidth,
            imageHeight,
            text,
            fontFamily,
            color,
            outlineColor,
            outlineWidth,
            target,
            x,
            y,
            scale,
            rotationDeg,
            visible,
            locked,
          }) => ({
            id,
            kind,
            filename,
            imageWidth,
            imageHeight,
            text,
            fontFamily,
            color,
            outlineColor,
            outlineWidth,
            target,
            x,
            y,
            scale,
            rotationDeg,
            visible,
            locked,
            placementPending: false,
          }),
        ),
        price: {
          currency: 'USD',
          base: RASHGUARD_BASE_PRICE,
          logoTotal,
          total: RASHGUARD_BASE_PRICE + logoTotal,
          lines,
        },
        cameraView,
      };
    }, [artworkLayers, cameraView, partColors, size]);

    const hydrate = useCallback<RashguardStateValue['hydrate']>(
      (state, artworkImages) => {
        undoStackRef.current = [];
        lastHistoryEntryRef.current = null;
        setSize(isValidSize(state.size) ? state.size : 'M');
        setPartColors(
          RASHGUARD_PARTS.reduce(
            (acc, part) => {
              const hydratedHex = state.partColors?.[part]?.hex;
              acc[part] =
                hydratedHex && isValidColor(hydratedHex)
                  ? hydratedHex
                  : RASHGUARD_DEFAULT_COLORS[part];
              return acc;
            },
            {} as Record<RashguardPart, string>,
          ),
        );
        setArtworkLayers((artworkImages ?? []).map(sanitizeArtworkLayer));
        setSelectedArtworkLayerId(artworkImages?.[artworkImages.length - 1]?.id ?? null);
        setCameraViewState(state.cameraView ?? 'front');
        setCameraViewResetKey((key) => key + 1);
      },
      [],
    );

    const value = useMemo<RashguardStateValue>(
      () => ({
        size,
        setSize: setGarmentSize,
        selectedPanel,
        setSelectedPanel: setConfiguratorPanel,
        partColors,
        setPartColor,
        artworkLayers,
        selectedArtworkLayerId,
        isArtworkDragging,
        addArtworkLayer,
        addTextLayer,
        updateArtworkLayer,
        duplicateArtworkLayer,
        removeArtworkLayer,
        selectArtworkLayer,
        moveArtworkLayer,
        reorderArtworkLayer,
        setArtworkDragging,
        cameraView,
        cameraViewResetKey,
        setCameraView,
        artworkTargetMeshes,
        setArtworkTargetMeshes,
        setCanvasEl,
        getCanvasEl,
        calculateTotal,
        serialize,
        hydrate,
      }),
      [
        addArtworkLayer,
        addTextLayer,
        artworkLayers,
        artworkTargetMeshes,
        calculateTotal,
        cameraView,
        cameraViewResetKey,
        duplicateArtworkLayer,
        getCanvasEl,
        hydrate,
        isArtworkDragging,
        moveArtworkLayer,
        partColors,
        reorderArtworkLayer,
        removeArtworkLayer,
        selectedArtworkLayerId,
        selectedPanel,
        selectArtworkLayer,
        serialize,
        setArtworkTargetMeshes,
        setCameraView,
        setCanvasEl,
        setPartColor,
        setConfiguratorPanel,
        setGarmentSize,
        updateArtworkLayer,
        size,
      ],
    );

    return (
      <RashguardStateContext.Provider value={value}>
        {children}
      </RashguardStateContext.Provider>
    );
  },
);

RashguardStateProvider.displayName = 'RashguardStateProvider';

export function useRashguardState() {
  const ctx = useContext(RashguardStateContext);
  if (!ctx) {
    throw new Error('useRashguardState must be used inside RashguardStateProvider');
  }
  return ctx;
}

export function cameraViewToPosition(
  view: CameraView,
  useMobileCamera = false,
) {
  return (useMobileCamera ? MOBILE_CAMERA_POSITIONS : CAMERA_POSITIONS)[view];
}
