# Canvas document guide

This directory is part of canvas-skills. The bundle manifest lists supported document versions and file hashes.

## Author a document

Start with `examples/minimal.canvas.json` or `examples/two-screens.canvas.json`. Each page lists root node IDs in drawing order, and every node has the matching parent ID; all IDs must be unique and references must resolve. `MODEL.ts` describes the current version 4 model; `schema.json` is a structural guide, not a complete validation specification. `capabilities.json` lists features and limits, and `kit-catalog.json` describes the basic kit's components, variants, patterns and tokens. `examples/basic-kit.canvas.json` contains the complete editable kit; distribute `ICONS-LICENSE.txt` with documents using its icons.

`examples/image.canvas.json` demonstrates the data URL and reference relationship. Image keys are lowercase SHA-256-shaped hex strings; the importer remaps keys when bytes have a different hash. The examples named `invalid-*` are expected to fail.

Run `node validate.mjs /absolute/path/document.canvas.json`. It returns 0 for a valid document and 1 for invalid input. It runs the same parser as the app, including migration of document versions 1–3, and rejects input over 100 MiB before parsing. Write new documents with version 4. Unlike JSON Schema, the parser also checks cross-references, numerical limits, variable and component semantics. Never infer validity from the schema alone.

## Common bounds and layout

The import UI limits a file to 100 MiB. Node x, y and rotation are finite numbers in −10,000,000…10,000,000; width, height and stroke width are in 0…10,000,000. Component expansion is limited to a tree depth of 1,000 and copy nesting depth of 15; expansion that increases the document above 100,000 nodes is refused. Grid cells use one-based integer row and column coordinates and spans, ending within 1,000 tracks; each explicit row/column track list has at most 1,000 entries. Gradient fills use 2–64 sorted stops with positions and opacity in 0…1. Linear angles are −3,600…3,600 degrees; radial centers are fractions in −1,000…1,000 and radii in 0…1,000. See `capabilities.json` for other model limits, and run the bundled parser for the full set of rules.
