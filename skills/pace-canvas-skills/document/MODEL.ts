export type NodeType = "frame" | "group" | "rect" | "ellipse" | "line" | "vector" | "text";
export interface SolidPaint {
    type: "solid";
    id: string;
    color: string;
    opacity: number;
    visible: boolean;
    variable?: string;
}
export type ScaleMode = "fill" | "fit" | "crop" | "tile";
export interface ImagePaint {
    type: "image";
    id: string;
    imageHash: string;
    scaleMode: ScaleMode;
    opacity: number;
    visible: boolean;
}
export interface GradientStop {
    position: number;
    color: string;
    opacity: number;
}
export interface LinearGradientPaint {
    type: "gradient-linear";
    id: string;
    stops: GradientStop[];
    angle: number;
    opacity: number;
    visible: boolean;
}
export interface RadialGradientPaint {
    type: "gradient-radial";
    id: string;
    stops: GradientStop[];
    center: Vec;
    radius: Vec;
    opacity: number;
    visible: boolean;
}
export type GradientPaint = LinearGradientPaint | RadialGradientPaint;
export type Paint = SolidPaint | ImagePaint | GradientPaint;
export interface ShadowEffect {
    type: "drop-shadow" | "inner-shadow";
    id: string;
    color: string;
    opacity: number;
    x: number;
    y: number;
    blur: number;
    spread: number;
    visible: boolean;
}
export interface BlurEffect {
    type: "layer-blur";
    id: string;
    radius: number;
    visible: boolean;
}
export type Effect = ShadowEffect | BlurEffect;
export const MAX_EFFECTS = 64;
export const MAX_BLUR = 1000;
export const MAX_SHADOW_OFFSET = 10000;
export const MAX_DASH = 10000;
export const MAX_STOPS = 64;
export const MAX_GRADIENT_FRACTION = 1000;
export const MAX_ANGLE = 3600;
export const MAX_LINE_HEIGHT_PX = 10000;
export const MAX_LINE_HEIGHT_MULTIPLIER = 100;
export const MAX_LINES = 10000;
export const MAX_PATHS = 1000;
export const MAX_PATH_LENGTH = 1000000;
export type StrokeAlign = "inside" | "center" | "outside";
export type CornerRadius = number | [
    number,
    number,
    number,
    number
];
export type SizingMode = "fixed" | "hug" | "fill";
export interface GridTrack {
    kind: "px" | "fr" | "auto";
    value: number;
}
export interface GridCell {
    column: number;
    row: number;
    columnSpan: number;
    rowSpan: number;
}
export const MAX_TRACKS = 1000;
export type SelfAlign = "start" | "center" | "end";
export interface LayoutProps {
    mode: "none" | "horizontal" | "vertical" | "grid";
    gap: number;
    counterGap: number;
    padding: {
        top: number;
        right: number;
        bottom: number;
        left: number;
    };
    primaryAlign: "start" | "center" | "end" | "space-between";
    counterAlign: "start" | "center" | "end";
    wrap: boolean;
    grid?: {
        columns: GridTrack[];
        rows: GridTrack[];
    };
}
export interface Vec {
    x: number;
    y: number;
}
export interface VectorPoint extends Vec {
    in?: Vec;
    out?: Vec;
}
interface NodeBase {
    id: string;
    type: NodeType;
    name: string;
    parentId: string;
    x: number;
    y: number;
    w: number;
    h: number;
    rotation: number;
    opacity: number;
    visible: boolean;
    locked: boolean;
    fills: Paint[];
    strokes: SolidPaint[];
    strokeWidth: number;
    strokeAlign: StrokeAlign;
    strokeDash: [
        number,
        number
    ] | null;
    effects: Effect[];
    sizing: {
        horizontal: SizingMode;
        vertical: SizingMode;
    };
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
    sizeBasis?: {
        w?: {
            requested: number;
            resolved: number;
        };
        h?: {
            requested: number;
            resolved: number;
        };
    };
    absolute?: boolean;
    gridCell?: GridCell;
    alignSelf?: {
        horizontal?: SelfAlign;
        vertical?: SelfAlign;
    };
    propRefs?: {
        text?: string;
        visible?: string;
        swap?: string;
    };
    bindings?: Bindings;
}
export interface FrameNode extends NodeBase {
    type: "frame";
    children: string[];
    cornerRadius: CornerRadius;
    clipContent: boolean;
    layout: LayoutProps;
    reference?: {
        imageHash: string;
    };
    detachedFrom?: {
        name: string;
        kitId?: string;
    };
    component?: true;
    instanceOf?: string;
    overrides?: Record<string, string[]>;
    variantSet?: {
        properties: VariantProperty[];
    };
    variant?: Record<string, string>;
    componentProps?: ComponentProp[];
    propValues?: Record<string, string | boolean>;
    variableModes?: Record<string, string>;
}
export interface VariantProperty {
    name: string;
    values: string[];
}
export interface ComponentProp {
    id: string;
    name: string;
    type: "text" | "boolean" | "swap";
}
export interface GroupNode extends NodeBase {
    type: "group";
    children: string[];
}
export interface RectNode extends NodeBase {
    type: "rect";
    cornerRadius: CornerRadius;
}
export interface EllipseNode extends NodeBase {
    type: "ellipse";
}
export interface LineNode extends NodeBase {
    type: "line";
}
export type WindingRule = "nonzero" | "evenodd";
export interface VectorPath {
    d: string;
    windingRule: WindingRule;
}
export interface VectorNode extends NodeBase {
    type: "vector";
    points: VectorPoint[];
    closed: boolean;
    paths: VectorPath[];
}
export type TextAutoResize = "width-and-height" | "height" | "none";
export interface LineHeight {
    unit: "multiplier" | "px";
    value: number;
}
export type TextDecoration = "none" | "underline" | "line-through";
export interface TextNode extends NodeBase {
    type: "text";
    text: string;
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    lineHeight: LineHeight;
    letterSpacing: number;
    textAlign: "left" | "center" | "right";
    textAutoResize: TextAutoResize;
    textDecoration: TextDecoration;
    maxLines: number | null;
    autoName: boolean;
}
export type SceneNode = FrameNode | GroupNode | RectNode | EllipseNode | LineNode | VectorNode | TextNode;
export type ContainerNode = FrameNode | GroupNode;
export interface Page {
    id: string;
    name: string;
    children: string[];
    background: string;
    variableModes?: Record<string, string>;
    library?: string;
}
export type VariableType = "color" | "number" | "string" | "font" | "typography";
export interface VariableAlias {
    alias: string;
}
export interface TypographyValue {
    fontFamily: string | VariableAlias;
    fontSize: number | VariableAlias;
    fontWeight: number | VariableAlias;
    lineHeight: number | VariableAlias;
    letterSpacing: number | VariableAlias;
}
export interface TypographyLiteral {
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    lineHeight: number;
    letterSpacing: number;
}
export type VariableLiteral = string | number | TypographyLiteral;
export type VariableValue = string | number | TypographyValue | VariableAlias;
export interface VariableMode {
    id: string;
    name: string;
}
export interface VariableCollection {
    id: string;
    name: string;
    modes: VariableMode[];
    defaultModeId: string;
    variableIds: string[];
    library?: string;
}
export interface Variable {
    id: string;
    name: string;
    type: VariableType;
    collectionId: string;
    values: Record<string, VariableValue>;
}
export const BINDABLE_FIELDS = {
    minWidth: "number",
    maxWidth: "number",
    minHeight: "number",
    maxHeight: "number",
    opacity: "number",
    strokeWidth: "number",
    cornerRadius: "number",
    fontFamily: "font",
    fontSize: "number",
    fontWeight: "number",
    lineHeight: "number",
    letterSpacing: "number",
    text: "string",
    gap: "number",
    counterGap: "number",
    paddingTop: "number",
    paddingRight: "number",
    paddingBottom: "number",
    paddingLeft: "number",
    typography: "typography",
} as const satisfies Record<string, VariableType>;
export type BindableField = keyof typeof BINDABLE_FIELDS;
export type Bindings = Partial<Record<BindableField, string>>;
export const MAX_VARIABLES = 5000;
export const MAX_COLLECTIONS = 100;
export const MAX_MODES = 20;
export const MAX_ALIAS_DEPTH = 64;
export const MAX_VARIABLE_NAME = 200;
export const DOC_VERSION = 4;
export interface Doc {
    version: typeof DOC_VERSION;
    name: string;
    pages: Record<string, Page>;
    pageOrder: string[];
    nodes: Record<string, SceneNode>;
    counters: Partial<Record<NodeType | "page", number>>;
    collections: Record<string, VariableCollection>;
    collectionOrder: string[];
    variables: Record<string, Variable>;
    kit?: KitInfo;
    libraries?: Record<string, LibraryLink>;
}
export interface KitInfo {
    id: string;
    name: string;
    version: string | number;
    source?: string;
}
export interface LibraryLink {
    name: string;
    version: string | number;
    source: "builtin" | "file";
    pageId: string;
    collectionIds: string[];
}
export type Tool = "select" | "hand" | "frame" | "rect" | "ellipse" | "line" | "pen" | "text";
export interface Viewport {
    x: number;
    y: number;
    zoom: number;
}
export interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
}
