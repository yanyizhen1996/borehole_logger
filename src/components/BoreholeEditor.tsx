import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type {
  BoreholeDocument,
  BoreholeInterval,
  DragState,
  EditorColumn,
  InteractionState,
  PreviewRange,
  SoilInterval,
  SptInterval,
} from '../types';
import {
  BLOW_COLUMN_WIDTH,
  COLUMN_GAP,
  DEPTH_COLUMN_WIDTH,
  LEFT_MARGIN,
  PAGE_DEPTH_FEET,
  PAGE_HEIGHT,
  PAGE_INNER_HEIGHT,
  PAGE_WIDTH,
  SOIL_COLUMN_WIDTH,
  TOP_MARGIN,
  clampDepth,
  depthToY,
  formatDepth,
  roundDepth,
  yToDepth,
} from '../utils/depth';

type DocumentAction =
  | { type: 'select'; id: string | null }
  | { type: 'create-spt'; interval: SptInterval }
  | { type: 'create-soil'; interval: SoilInterval }
  | { type: 'update-spt'; id: string; blows: [string, string, string] }
  | { type: 'update-soil'; id: string; description: string }
  | { type: 'update-range'; id: string; topDepth: number; bottomDepth: number }
  | { type: 'delete'; id: string };

interface EditorDocumentState {
  document: BoreholeDocument;
  selectedId: string | null;
}

const initialState: EditorDocumentState = {
  document: {
    id: 'demo-borehole',
    title: 'BH-01 Field Log Prototype',
    pageDepth: PAGE_DEPTH_FEET,
    intervals: [],
  },
  selectedId: null,
};

function documentReducer(state: EditorDocumentState, action: DocumentAction): EditorDocumentState {
  switch (action.type) {
    case 'select':
      return { ...state, selectedId: action.id };
    case 'create-spt':
      return {
        ...state,
        document: {
          ...state.document,
          intervals: [...state.document.intervals, action.interval],
        },
        selectedId: action.interval.id,
      };
    case 'create-soil':
      return {
        ...state,
        document: {
          ...state.document,
          intervals: [...state.document.intervals, action.interval],
        },
        selectedId: action.interval.id,
      };
    case 'update-spt':
      return {
        ...state,
        document: {
          ...state.document,
          intervals: state.document.intervals.map((interval) =>
            interval.id === action.id && interval.type === 'spt'
              ? { ...interval, blows: action.blows }
              : interval,
          ),
        },
      };
    case 'update-soil':
      return {
        ...state,
        document: {
          ...state.document,
          intervals: state.document.intervals.map((interval) =>
            interval.id === action.id && interval.type === 'soil'
              ? { ...interval, description: action.description }
              : interval,
          ),
        },
      };
    case 'update-range':
      return {
        ...state,
        document: {
          ...state.document,
          intervals: state.document.intervals.map((interval) =>
            interval.id === action.id
              ? { ...interval, topDepth: action.topDepth, bottomDepth: action.bottomDepth }
              : interval,
          ),
        },
      };
    case 'delete':
      return {
        ...state,
        document: {
          ...state.document,
          intervals: state.document.intervals.filter((interval) => interval.id !== action.id),
        },
        selectedId: state.selectedId === action.id ? null : state.selectedId,
      };
    default:
      return state;
  }
}

const blowColumnX = LEFT_MARGIN + DEPTH_COLUMN_WIDTH + COLUMN_GAP;
const soilColumnX = blowColumnX + BLOW_COLUMN_WIDTH + COLUMN_GAP;

const initialInteraction: InteractionState = {
  selectedId: null,
  hoverDepth: null,
  hoverColumn: null,
  preview: null,
  drag: null,
};

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function isOverlapping(
  intervals: BoreholeInterval[],
  candidate: { topDepth: number; bottomDepth: number; type: BoreholeInterval['type'] },
  ignoreId?: string,
) {
  return intervals
    .filter((interval) => interval.type === candidate.type && interval.id !== ignoreId)
    .some(
      (interval) =>
        candidate.topDepth < interval.bottomDepth && candidate.bottomDepth > interval.topDepth,
    );
}

function getColumnFromX(x: number): EditorColumn | null {
  if (x >= blowColumnX && x <= blowColumnX + BLOW_COLUMN_WIDTH) {
    return 'blow';
  }

  if (x >= soilColumnX && x <= soilColumnX + SOIL_COLUMN_WIDTH) {
    return 'soil';
  }

  return null;
}

function wrapSoilText(text: string, maxChars = 30) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.slice(0, 5);
}

export function BoreholeEditor() {
  const [{ document: boreholeDocument, selectedId }, dispatch] = useReducer(
    documentReducer,
    initialState,
  );
  const [interaction, setInteraction] = useState(initialInteraction);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selectedInterval = useMemo(
    () => boreholeDocument.intervals.find((interval) => interval.id === selectedId) ?? null,
    [boreholeDocument.intervals, selectedId],
  );

  useEffect(() => {
    setInteraction((current) => ({ ...current, selectedId }));
  }, [selectedId]);

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      const drag = interaction.drag;
      if (!drag) {
        return;
      }

      const pointer = getPointerData(event.clientX, event.clientY);
      if (!pointer || pointer.column !== drag.column) {
        return;
      }

      const preview = getPreviewForDrag(pointer.depth, drag, boreholeDocument.intervals);
      setInteraction((current) => ({ ...current, preview }));
    }

    function onPointerUp() {
      if (!interaction.drag) {
        return;
      }

      if (interaction.preview) {
        commitPreview(interaction.preview, interaction.drag);
      }

      setInteraction((current) => ({
        ...current,
        drag: null,
        preview: null,
      }));
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [boreholeDocument.intervals, interaction.drag, interaction.preview]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        const active = document.activeElement;
        if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
          return;
        }

        dispatch({ type: 'delete', id: selectedId });
      }

      if (event.key === 'Escape') {
        setInteraction((current) => ({
          ...current,
          drag: null,
          preview: null,
        }));
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId]);

  function getPointerData(clientX: number, clientY: number) {
    const container = containerRef.current;
    if (!container) {
      return null;
    }

    const bounds = container.getBoundingClientRect();
    const x = clientX - bounds.left;
    const y = clientY - bounds.top;
    const column = getColumnFromX(x);

    return {
      x,
      y,
      depth: roundDepth(yToDepth(y), 0.1),
      column,
    };
  }

  function commitPreview(preview: PreviewRange, drag: DragState) {
    if (drag.kind === 'create-spt') {
      const interval: SptInterval = {
        id: createId('spt'),
        type: 'spt',
        topDepth: preview.topDepth,
        bottomDepth: preview.bottomDepth,
        blows: ['', '', ''],
      };
      dispatch({ type: 'create-spt', interval });
      return;
    }

    if (drag.kind === 'create-soil') {
      const interval: SoilInterval = {
        id: createId('soil'),
        type: 'soil',
        topDepth: preview.topDepth,
        bottomDepth: preview.bottomDepth,
        description: '',
      };
      dispatch({ type: 'create-soil', interval });
      return;
    }

    if (drag.intervalId) {
      dispatch({
        type: 'update-range',
        id: drag.intervalId,
        topDepth: preview.topDepth,
        bottomDepth: preview.bottomDepth,
      });
    }
  }

  function getPreviewForDrag(depth: number, drag: DragState, intervals: BoreholeInterval[]): PreviewRange | null {
    if (drag.kind === 'create-spt') {
      const topDepth = clampDepth(depth);
      const bottomDepth = clampDepth(topDepth + 1.5);
      if (bottomDepth - topDepth < 1.5) {
        return null;
      }
      if (isOverlapping(intervals, { type: 'spt', topDepth, bottomDepth })) {
        return null;
      }
      return { column: 'blow', topDepth, bottomDepth, mode: 'create' };
    }

    if (drag.kind === 'create-soil') {
      const topDepth = clampDepth(Math.min(drag.anchorDepth, depth));
      const bottomDepth = clampDepth(Math.max(drag.anchorDepth, depth));
      if (bottomDepth - topDepth < 0.3) {
        return null;
      }
      if (isOverlapping(intervals, { type: 'soil', topDepth, bottomDepth })) {
        return null;
      }
      return { column: 'soil', topDepth, bottomDepth, mode: 'create' };
    }

    if (!drag.intervalId) {
      return null;
    }

    const interval = intervals.find((item) => item.id === drag.intervalId);
    if (!interval) {
      return null;
    }

    const length = interval.bottomDepth - interval.topDepth;

    if (drag.kind === 'move') {
      const topDepth = clampDepth(depth - (drag.pointerOffset ?? 0));
      const boundedTop = Math.min(topDepth, PAGE_DEPTH_FEET - length);
      const bottomDepth = roundDepth(boundedTop + length, 0.1);
      const candidate = {
        type: interval.type,
        topDepth: roundDepth(boundedTop, 0.1),
        bottomDepth,
      };
      if (isOverlapping(intervals, candidate, interval.id)) {
        return null;
      }
      return {
        column: interval.type === 'spt' ? 'blow' : 'soil',
        topDepth: candidate.topDepth,
        bottomDepth: candidate.bottomDepth,
        mode: 'move',
      };
    }

    if (drag.kind === 'resize-top') {
      const topDepth = roundDepth(clampDepth(Math.min(depth, interval.bottomDepth - 0.3)), 0.1);
      const candidate = { type: interval.type, topDepth, bottomDepth: interval.bottomDepth };
      if (isOverlapping(intervals, candidate, interval.id)) {
        return null;
      }
      return {
        column: 'soil',
        topDepth,
        bottomDepth: interval.bottomDepth,
        mode: 'resize',
      };
    }

    if (drag.kind === 'resize-bottom') {
      const bottomDepth = roundDepth(clampDepth(Math.max(depth, interval.topDepth + 0.3)), 0.1);
      const candidate = { type: interval.type, topDepth: interval.topDepth, bottomDepth };
      if (isOverlapping(intervals, candidate, interval.id)) {
        return null;
      }
      return {
        column: 'soil',
        topDepth: interval.topDepth,
        bottomDepth,
        mode: 'resize',
      };
    }

    return null;
  }

  function handleCanvasPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const pointer = getPointerData(event.clientX, event.clientY);
    if (!pointer) {
      return;
    }

    setInteraction((current) => ({
      ...current,
      hoverDepth: pointer.depth,
      hoverColumn: pointer.column,
    }));
  }

  function startSoilCreation(event: React.PointerEvent<SVGRectElement>) {
    const pointer = getPointerData(event.clientX, event.clientY);
    if (!pointer) {
      return;
    }

    dispatch({ type: 'select', id: null });
    setInteraction((current) => ({
      ...current,
      drag: {
        kind: 'create-soil',
        column: 'soil',
        anchorDepth: pointer.depth,
      },
      preview: {
        column: 'soil',
        topDepth: pointer.depth,
        bottomDepth: pointer.depth,
        mode: 'create',
      },
    }));
  }

  function startSptCreation(event: React.PointerEvent<SVGRectElement>) {
    const pointer = getPointerData(event.clientX, event.clientY);
    if (!pointer) {
      return;
    }

    dispatch({ type: 'select', id: null });
    const preview = getPreviewForDrag(pointer.depth, {
      kind: 'create-spt',
      column: 'blow',
      anchorDepth: pointer.depth,
    }, boreholeDocument.intervals);

    setInteraction((current) => ({
      ...current,
      drag: {
        kind: 'create-spt',
        column: 'blow',
        anchorDepth: pointer.depth,
      },
      preview,
    }));
  }

  function startMove(event: React.PointerEvent<SVGRectElement>, interval: BoreholeInterval) {
    event.stopPropagation();
    const pointer = getPointerData(event.clientX, event.clientY);
    if (!pointer) {
      return;
    }

    dispatch({ type: 'select', id: interval.id });
    setInteraction((current) => ({
      ...current,
      drag: {
        kind: 'move',
        intervalId: interval.id,
        column: interval.type === 'spt' ? 'blow' : 'soil',
        anchorDepth: pointer.depth,
        pointerOffset: pointer.depth - interval.topDepth,
      },
      preview: {
        column: interval.type === 'spt' ? 'blow' : 'soil',
        topDepth: interval.topDepth,
        bottomDepth: interval.bottomDepth,
        mode: 'move',
      },
    }));
  }

  function startResize(
    event: React.PointerEvent<SVGRectElement>,
    interval: SoilInterval,
    kind: 'resize-top' | 'resize-bottom',
  ) {
    event.stopPropagation();
    dispatch({ type: 'select', id: interval.id });
    setInteraction((current) => ({
      ...current,
      drag: {
        kind,
        intervalId: interval.id,
        column: 'soil',
        anchorDepth: kind === 'resize-top' ? interval.topDepth : interval.bottomDepth,
      },
      preview: {
        column: 'soil',
        topDepth: interval.topDepth,
        bottomDepth: interval.bottomDepth,
        mode: 'resize',
      },
    }));
  }

  function renderSoilText(interval: SoilInterval) {
    const lines = wrapSoilText(interval.description || 'Click to describe soil conditions.');
    return lines.map((line, index) => (
      <tspan key={`${interval.id}-${index}`} x={soilColumnX + 16} dy={index === 0 ? 0 : 18}>
        {line}
      </tspan>
    ));
  }

  const overlayStyle = selectedInterval
    ? {
        top: depthToY(selectedInterval.topDepth) + 12,
        left:
          selectedInterval.type === 'spt'
            ? blowColumnX + BLOW_COLUMN_WIDTH + 24
            : soilColumnX + SOIL_COLUMN_WIDTH + 24,
      }
    : null;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Geotechnical Field Logging Prototype</p>
          <h1>{boreholeDocument.title}</h1>
        </div>
        <div className="header-meta">
          <span>Page 1</span>
          <span>0.0–20.0 ft</span>
        </div>
      </header>

      <section className="workspace-panel">
        <div className="workspace-copy">
          <h2>Direct Interaction Model</h2>
          <p>
            Click in the Blow Count column to place a fixed 1.5 ft SPT interval. Drag in the Soil
            Description column to sketch a depth region, then type directly into the selected log
            object.
          </p>
        </div>

        <div className="workspace-board" ref={containerRef}>
          <svg
            className="borehole-canvas"
            viewBox={`0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}`}
            onPointerMove={handleCanvasPointerMove}
          >
            <defs>
              <pattern id="gridPattern" width="12" height="12" patternUnits="userSpaceOnUse">
                <path d="M 12 0 L 0 0 0 12" fill="none" stroke="rgba(21, 35, 31, 0.05)" strokeWidth="1" />
              </pattern>
            </defs>

            <rect x="0" y="0" width={PAGE_WIDTH} height={PAGE_HEIGHT} rx="24" fill="#f8f4ec" />
            <rect
              x={LEFT_MARGIN}
              y={TOP_MARGIN}
              width={PAGE_WIDTH - LEFT_MARGIN * 2}
              height={PAGE_INNER_HEIGHT}
              rx="18"
              fill="url(#gridPattern)"
            />

            <text x={LEFT_MARGIN} y="28" className="column-title">Depth</text>
            <text x={blowColumnX} y="28" className="column-title">Blow Count</text>
            <text x={soilColumnX} y="28" className="column-title">Soil Description</text>

            {Array.from({ length: PAGE_DEPTH_FEET * 2 + 1 }, (_, index) => {
              const depth = index * 0.5;
              const y = depthToY(depth);
              const isWholeFoot = Number.isInteger(depth);
              return (
                <g key={depth}>
                  <line
                    x1={LEFT_MARGIN}
                    x2={PAGE_WIDTH - LEFT_MARGIN}
                    y1={y}
                    y2={y}
                    stroke={isWholeFoot ? 'rgba(21, 35, 31, 0.16)' : 'rgba(21, 35, 31, 0.08)'}
                    strokeWidth={isWholeFoot ? 1.5 : 1}
                  />
                  {isWholeFoot ? (
                    <text x={LEFT_MARGIN + 14} y={y + 5} className="depth-label">{depth.toFixed(0)}</text>
                  ) : null}
                </g>
              );
            })}

            <rect
              x={LEFT_MARGIN}
              y={TOP_MARGIN}
              width={DEPTH_COLUMN_WIDTH}
              height={PAGE_INNER_HEIGHT}
              className="column-frame"
            />
            <rect
              x={blowColumnX}
              y={TOP_MARGIN}
              width={BLOW_COLUMN_WIDTH}
              height={PAGE_INNER_HEIGHT}
              className="column-frame interactive-column"
              onPointerDown={startSptCreation}
            />
            <rect
              x={soilColumnX}
              y={TOP_MARGIN}
              width={SOIL_COLUMN_WIDTH}
              height={PAGE_INNER_HEIGHT}
              className="column-frame interactive-column"
              onPointerDown={startSoilCreation}
            />

            {boreholeDocument.intervals
              .filter((interval) => interval.type === 'spt')
              .map((interval) => {
                const isSelected = interval.id === selectedId;
                const topY = depthToY(interval.topDepth);
                const height = depthToY(interval.bottomDepth) - topY;
                const spt = interval as SptInterval;
                return (
                  <g key={interval.id}>
                    <rect
                      x={blowColumnX + 10}
                      y={topY}
                      width={BLOW_COLUMN_WIDTH - 20}
                      height={height}
                      rx="16"
                      className={isSelected ? 'interval-card selected spt-card' : 'interval-card spt-card'}
                      onPointerDown={(event) => startMove(event, interval)}
                    />
                    <text x={blowColumnX + 24} y={topY + 24} className="interval-label">SPT Sample</text>
                    <text x={blowColumnX + 24} y={topY + 52} className="interval-value">
                      {spt.blows.map((value) => value || '–').join(' / ')}
                    </text>
                    <text x={blowColumnX + 24} y={topY + height - 14} className="interval-depth">
                      {formatDepth(interval.topDepth)} to {formatDepth(interval.bottomDepth)}
                    </text>
                  </g>
                );
              })}

            {boreholeDocument.intervals
              .filter((interval) => interval.type === 'soil')
              .map((interval) => {
                const isSelected = interval.id === selectedId;
                const topY = depthToY(interval.topDepth);
                const bottomY = depthToY(interval.bottomDepth);
                const height = bottomY - topY;
                const soil = interval as SoilInterval;
                return (
                  <g key={interval.id}>
                    <rect
                      x={soilColumnX + 10}
                      y={topY}
                      width={SOIL_COLUMN_WIDTH - 20}
                      height={height}
                      rx="16"
                      className={isSelected ? 'interval-card selected soil-card' : 'interval-card soil-card'}
                      onPointerDown={(event) => startMove(event, interval)}
                    />
                    <text x={soilColumnX + 16} y={topY + 28} className="soil-text">
                      {renderSoilText(soil)}
                    </text>
                    <text x={soilColumnX + 16} y={bottomY - 14} className="interval-depth">
                      {formatDepth(interval.topDepth)} to {formatDepth(interval.bottomDepth)}
                    </text>
                    {isSelected ? (
                      <>
                        <rect
                          x={soilColumnX + SOIL_COLUMN_WIDTH - 36}
                          y={topY - 6}
                          width="18"
                          height="12"
                          rx="6"
                          className="handle"
                          onPointerDown={(event) => startResize(event, soil, 'resize-top')}
                        />
                        <rect
                          x={soilColumnX + SOIL_COLUMN_WIDTH - 36}
                          y={bottomY - 6}
                          width="18"
                          height="12"
                          rx="6"
                          className="handle"
                          onPointerDown={(event) => startResize(event, soil, 'resize-bottom')}
                        />
                      </>
                    ) : null}
                  </g>
                );
              })}

            {interaction.preview ? (
              <g>
                <rect
                  x={interaction.preview.column === 'blow' ? blowColumnX + 6 : soilColumnX + 6}
                  y={depthToY(interaction.preview.topDepth)}
                  width={interaction.preview.column === 'blow' ? BLOW_COLUMN_WIDTH - 12 : SOIL_COLUMN_WIDTH - 12}
                  height={Math.max(
                    2,
                    depthToY(interaction.preview.bottomDepth) - depthToY(interaction.preview.topDepth),
                  )}
                  rx="18"
                  className="preview-range"
                />
                <line
                  x1={LEFT_MARGIN}
                  x2={PAGE_WIDTH - LEFT_MARGIN}
                  y1={depthToY(interaction.preview.topDepth)}
                  y2={depthToY(interaction.preview.topDepth)}
                  className="preview-line"
                />
                <line
                  x1={LEFT_MARGIN}
                  x2={PAGE_WIDTH - LEFT_MARGIN}
                  y1={depthToY(interaction.preview.bottomDepth)}
                  y2={depthToY(interaction.preview.bottomDepth)}
                  className="preview-line"
                />
              </g>
            ) : null}

            {interaction.hoverDepth !== null ? (
              <g>
                <line
                  x1={LEFT_MARGIN}
                  x2={PAGE_WIDTH - LEFT_MARGIN}
                  y1={depthToY(interaction.hoverDepth)}
                  y2={depthToY(interaction.hoverDepth)}
                  className="hover-line"
                />
                <text x={PAGE_WIDTH - 128} y={depthToY(interaction.hoverDepth) - 8} className="hover-depth">
                  {formatDepth(interaction.hoverDepth)}
                </text>
              </g>
            ) : null}
          </svg>

          {selectedInterval && overlayStyle ? (
            <div className="floating-editor" style={overlayStyle}>
              {selectedInterval.type === 'spt' ? (
                <div>
                  <div className="editor-header">
                    <strong>SPT blow counts</strong>
                    <button onClick={() => dispatch({ type: 'delete', id: selectedInterval.id })}>Delete</button>
                  </div>
                  <div className="blow-inputs">
                    {selectedInterval.blows.map((value, index) => (
                      <label key={`${selectedInterval.id}-${index}`}>
                        <span>B{index + 1}</span>
                        <input
                          inputMode="numeric"
                          value={value}
                          onChange={(event) => {
                            const next = [...selectedInterval.blows] as [string, string, string];
                            next[index] = event.target.value.replace(/[^0-9]/g, '');
                            dispatch({ type: 'update-spt', id: selectedInterval.id, blows: next });
                          }}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="editor-header">
                    <strong>Soil description</strong>
                    <button onClick={() => dispatch({ type: 'delete', id: selectedInterval.id })}>Delete</button>
                  </div>
                  <textarea
                    rows={7}
                    value={selectedInterval.description}
                    placeholder="Describe soil, moisture, structure, color, or notable changes."
                    onChange={(event) =>
                      dispatch({
                        type: 'update-soil',
                        id: selectedInterval.id,
                        description: event.target.value,
                      })
                    }
                  />
                </div>
              )}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}