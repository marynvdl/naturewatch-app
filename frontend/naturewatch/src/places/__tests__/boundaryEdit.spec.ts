import { beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, shallowRef, type Ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import type * as mapboxgl from 'mapbox-gl';
import type { MultiPolygon, Polygon } from 'geojson';
import { useBoundaryEdit } from '@/places/boundaryEdit';
import usePlacesStore from '@/store/PlacesStore';
import { useMeasureStore } from '@/store/MeasureStore';

/** The stub draw tool: one feature, and the calls made to it. */
const tool = vi.hoisted(() => ({
  features: new Map<string, { geometry: unknown; properties?: unknown }>(),
  mode: 'simple_select',
  next: 0,
  changeMode: [] as [string, unknown][],
  trash: 0,
}));

vi.mock('@mapbox/mapbox-gl-draw', () => ({
  default: class {
    add(feature: { geometry: unknown; properties: unknown }) {
      const id = `f${++tool.next}`;
      tool.features.set(id, {
        geometry: feature.geometry,
        properties: feature.properties,
      });
      return [id];
    }
    delete(id: string) {
      tool.features.delete(id);
    }
    get(id: string) {
      return tool.features.get(id);
    }
    getMode() {
      return tool.mode;
    }
    changeMode(mode: string, options: unknown) {
      tool.mode = mode;
      tool.changeMode.push([mode, options]);
    }
    trash() {
      tool.trash += 1;
    }
  },
}));

const RING = [
  [30, -20],
  [30.1, -20],
  [30.1, -19.9],
  [30, -20],
];
const SHAPE: MultiPolygon = { type: 'MultiPolygon', coordinates: [[RING]] };

/** A stub map that keeps its listeners and controls. */
function stubMap() {
  const listeners = new Map<string, () => void>();
  const controls: unknown[] = [];
  const map = {
    addControl: vi.fn((control: unknown) => controls.push(control)),
    removeControl: vi.fn((control: unknown) =>
      controls.splice(controls.indexOf(control), 1)
    ),
    on: vi.fn((type: string, fn: () => void) => listeners.set(type, fn)),
    off: vi.fn((type: string) => listeners.delete(type)),
  };
  return {
    map: map as unknown as mapboxgl.Map,
    controls,
    fire: (type: string) => listeners.get(type)?.(),
    listening: () => [...listeners.keys()],
  };
}

describe('useBoundaryEdit', () => {
  let stub: ReturnType<typeof stubMap>;
  let flyToBox: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setActivePinia(createPinia());
    tool.features.clear();
    tool.mode = 'simple_select';
    tool.next = 0;
    tool.changeMode = [];
    tool.trash = 0;
    stub = stubMap();
    flyToBox = vi.fn();
    effectScope().run(() =>
      useBoundaryEdit(
        shallowRef(stub.map) as Ref<mapboxgl.Map | null>,
        flyToBox
      )
    );
  });

  it('opens the shape for point editing in its own tool', async () => {
    const store = usePlacesStore();
    store.boundaryEdit = SHAPE;
    await nextTick();
    expect(stub.controls).toHaveLength(1);
    expect(tool.changeMode).toEqual([['direct_select', { featureId: 'f1' }]]);
    expect(store.boundaryEdited).toEqual(SHAPE);
    expect(useMeasureStore().busy).toBe(true);
    expect(flyToBox).toHaveBeenCalledWith([30, -20, 30.1, -19.9], 16);
  });

  it('writes each change back, as a MultiPolygon', async () => {
    const store = usePlacesStore();
    store.boundaryEdit = SHAPE;
    await nextTick();
    const moved: Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [30, -20],
          [30.2, -20],
          [30.1, -19.9],
          [30, -20],
        ],
      ],
    };
    tool.features.get('f1')!.geometry = moved;
    stub.fire('draw.update');
    expect(store.boundaryEdited).toEqual({
      type: 'MultiPolygon',
      coordinates: [moved.coordinates],
    });
  });

  it('stays in point editing and deletes selected points', async () => {
    const store = usePlacesStore();
    store.boundaryEdit = SHAPE;
    await nextTick();
    tool.mode = 'simple_select';
    stub.fire('draw.modechange');
    expect(tool.mode).toBe('direct_select');
    store.boundaryEditTrash += 1;
    await nextTick();
    expect(tool.trash).toBe(1);
  });

  it('puts the last whole shape back when the tool drops it', async () => {
    vi.useFakeTimers();
    const store = usePlacesStore();
    store.boundaryEdit = SHAPE;
    await nextTick();
    tool.features.delete('f1');
    stub.fire('draw.delete');
    vi.runAllTimers();
    vi.useRealTimers();
    expect(tool.features.get('f2')?.geometry).toEqual(SHAPE);
    expect(tool.mode).toBe('direct_select');
  });

  it('marks the boundary so measuring leaves it alone', async () => {
    usePlacesStore().boundaryEdit = SHAPE;
    await nextTick();
    expect(tool.features.get('f1')?.properties).toEqual({
      boundary_edit: true,
    });
  });

  it('takes the boundary out of the shared tool when the edit ends', async () => {
    const store = usePlacesStore();
    store.boundaryEdit = SHAPE;
    await nextTick();
    store.boundaryEdit = null;
    await nextTick();
    expect(tool.features.size).toBe(0);
    expect(tool.mode).toBe('simple_select');
    expect(stub.listening()).toEqual([]);
    expect(store.boundaryEdited).toBeNull();
    expect(useMeasureStore().busy).toBe(false);

    // A second edit uses the same tool.
    store.boundaryEdit = { ...SHAPE };
    await nextTick();
    expect(stub.controls).toHaveLength(1);
    expect(tool.features.get('f2')?.geometry).toEqual(SHAPE);
  });

  it('leaves another mode, such as drawing a correction, alone', async () => {
    usePlacesStore().boundaryEdit = SHAPE;
    await nextTick();
    tool.mode = 'draw_polygon';
    stub.fire('draw.modechange');
    expect(tool.mode).toBe('draw_polygon');
  });
});
