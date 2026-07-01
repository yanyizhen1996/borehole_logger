export type IntervalType = 'spt' | 'soil';

export interface IntervalBase {
  id: string;
  type: IntervalType;
  topDepth: number;
  bottomDepth: number;
}

export interface SptInterval extends IntervalBase {
  type: 'spt';
  blows: [string, string, string];
}

export interface SoilInterval extends IntervalBase {
  type: 'soil';
  description: string;
}

export type BoreholeInterval = SptInterval | SoilInterval;

export interface BoreholeDocument {
  id: string;
  title: string;
  pageDepth: number;
  intervals: BoreholeInterval[];
}

export type EditorColumn = 'blow' | 'soil';

export interface PreviewRange {
  column: EditorColumn;
  topDepth: number;
  bottomDepth: number;
  mode: 'create' | 'move' | 'resize';
}

export interface DragState {
  kind: 'move' | 'resize-top' | 'resize-bottom' | 'create-soil' | 'create-spt';
  intervalId?: string;
  column: EditorColumn;
  anchorDepth: number;
  pointerOffset?: number;
  originalTopDepth?: number;
  originalBottomDepth?: number;
}

export interface InteractionState {
  selectedId: string | null;
  hoverDepth: number | null;
  hoverColumn: EditorColumn | null;
  preview: PreviewRange | null;
  drag: DragState | null;
}