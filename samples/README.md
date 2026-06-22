# Diagram Samples

Complex, real-world Mermaid samples that exercise the full feature set supported
by gMermaid. View them all in the browser:

```bash
make serve
# then open http://localhost:5173/samples/index.html
```

Each `.mmd` file is plain Mermaid source — paste it into the playground
(`examples/standalone.html`), feed it to `GMermaid.create(el, { source })`, or
drop it into a `<g-diagram src="samples/sequence-oauth-pkce.mmd">`.

Files are named `<diagram-type>-<scenario>.mmd` (e.g. `sequence-…`).

## Sequence diagrams

| File | Scenario | Features exercised |
|---|---|---|
| `sequence-oauth-pkce.mmd` | OAuth 2.0 Authorization Code + PKCE login | `box` (2, colored) · `actor` · `autonumber` · nested activation (`+`/`-`) · `alt/else` · `opt` · `rect` highlight · `Note over` with `<br/>` |
| `sequence-saga-orchestration.mmd` | Distributed checkout saga (commit/compensate) | `par/and` · `critical/option` · `rect` (commit vs rollback) · `box rgb(...)` · activations |
| `sequence-realtime-chat.mmd` | WebSocket chat with presence | `create`/`destroy` participant · async `-)` / `--)` · bidirectional `<<->>` · `-x` (cross) · `loop` |
| `sequence-cicd-pipeline.mmd` | CI/CD build → test → deploy | `break` · `critical` with three `option`s · `box transparent` · parallel `par` · notes |

**Sequence coverage:**
- **Arrows:** `->`, `-->`, `->>`, `-->>`, `<<->>`, `-x`, `--x`, `-)`, `--)`
- **Participants:** `participant`, `actor`, `as` aliases, `box` grouping (named / `rgb()` / `transparent`)
- **Lifecycle:** `create participant`, `destroy`
- **Activation:** `activate`/`deactivate` and the `+`/`-` shorthand (incl. nesting)
- **Notes:** `Note left of`, `Note right of`, `Note over A,B`, `<br/>` line breaks
- **Control blocks:** `loop`, `alt/else`, `opt`, `par/and`, `critical/option`, `break`
- **Highlight:** `rect rgb(...)` / `rect rgba(...)` · **Numbering:** `autonumber`

> Sequence — not yet supported: half-arrowheads (`-\|`, `-\|/`) and interactive
> actor menus (`link` / `links`) — the parser skips those lines without erroring.

## Class diagrams

| File | Scenario | Features exercised |
|---|---|---|
| `class-ecommerce-domain.mmd` | E-commerce domain model | `<<interface>>` · `<<enumeration>>` · multiplicity (`"1"`/`"0..*"`) · composition `*--` · aggregation · association `-->` · realization `<|..` · dependency `..>` · `direction LR` · note |
| `class-shapes-generics.mmd` | Shape hierarchy + generics | `<<abstract>>` · generics `~T~` (incl. `List~T~`) · static `$` / abstract `*` members · inheritance `<|--` · realization · dependency · notes |
| `class-hexagonal-namespaces.mmd` | Hexagonal (ports & adapters) | `namespace` blocks (3) · interface ports · realization · dependency · multi-line notes |

**Class coverage:**
- **Relationships:** inheritance `<|--`, realization `<|..` / `..|>`, composition `*--`, aggregation `o--`, association `-->` / `<--`, dependency `..>`, solid link `--`, dashed link `..` (each head placed on the correct end)
- **Members:** visibility `+ - # ~`, methods with params + return types, static `$`, abstract `*`, the `Class : member` per-line form
- **Classifiers:** `<<interface>>`, `<<abstract>>`, `<<enumeration>>`, `<<service>>` (inline or standalone `<<x>> Class`)
- **Generics:** `class Name~T~`, generic member types, generic relationship endpoints
- **Structure:** `namespace { }`, `direction TB/BT/LR/RL`, multiplicity + relationship labels, `note` / `note for`

> Class — recognized but not rendered (skipped cleanly): `click` / `callback` /
> `link` interactions and `style` / `classDef` / `cssClass` styling.

## Flowchart diagrams

| File | Scenario | Features exercised |
|---|---|---|
| `flowchart-cicd-pipeline.mmd` | CI/CD build → deploy | `subgraph` (CI/CD) with `direction` · thick `==>` / dotted `-.->` links · stadium/hexagon/subroutine/cylinder/circle/double-circle/asymmetric shapes · `classDef` + `:::` |
| `flowchart-request-lifecycle.mmd` | HTTP request lifecycle | circle head `--o` · cross head `x--x` · cache hit/miss (dotted/thick) · `:::class` · `<br>` label |
| `flowchart-order-state.mmd` | Order state machine | `&` fan-out · bidirectional `<-->` · trapezoid / parallelogram-alt shapes · nested `direction` · `class` styling |

**Flowchart coverage:**
- **Shapes:** `[rect]`, `(round)`, `([stadium])`, `[[subroutine]]`, `[(cylinder)]`, `((circle))`, `(((double circle)))`, `>asymmetric]`, `{diamond}`, `{{hexagon}}`, `[/parallelogram/]`, `[\alt\]`, `[/trapezoid\]`, `[\trap alt/]`
- **Links:** `-->`, `---`, `-.->`, `-.-`, `==>`, `===`, `--o`, `--x`, `o--o`, `x--x`, `<-->`, longer `---->`
- **Edge text:** `-->|label|` and `-- label -->`
- **Chaining:** `A & B --> C & D` fan-out
- **Grouping:** `subgraph id [title] … end`, per-subgraph `direction` (draggable; drag the header to move the group)
- **Styling:** `classDef`, `class`, `:::shorthand`; **Labels:** quoted text, `<br>` line breaks
- **Direction:** `flowchart`/`graph` with `TB`/`TD`/`BT`/`LR`/`RL`

> Flowchart — recognized but not rendered (skipped cleanly): `click` / `href`
> interactions and `linkStyle`. Nested subgraphs render as boxes but only
> top-level subgraphs drive the cluster layout.

## State diagrams

| File | Scenario | Features exercised |
|---|---|---|
| `state-order-lifecycle.mmd` | Order state machine | `composite` state · `<<choice>>` · labeled transitions · `[*]` start/end · single-line `note` · `classDef`/`class` · `direction LR` |
| `state-keyboard-concurrent.mmd` | Concurrent keyboard locks | parallel regions (`--`) · nested `[*]` per region · multi-line `note ... end note` |
| `state-job-fork-join.mmd` | Map/reduce job | `<<fork>>` / `<<join>>` · nested composite · `<<choice>>` · `State : description` · note |

**State coverage:**
- **States:** bare id, `State : description`, `state "Label" as id`, `state id`
- **Transitions:** `A --> B`, `A --> B : event`, `[*]` start/end (top-level and inside composites)
- **Composite & concurrency:** `state X { … }`, nested composites, parallel regions split by `--`
- **Pseudo-states:** `<<choice>>`, `<<fork>>`, `<<join>>`
- **Notes:** `note left/right of X : …` and multi-line `note … end note`
- **Styling:** `classDef`, `class A, B style`, `A:::style`; **Direction:** `direction TB/BT/LR/RL`

> State — `direction` inside a composite is honored locally; parallel regions are
> stacked vertically with divider lines.

## ER diagrams

| File | Scenario | Features exercised |
|---|---|---|
| `erd-ecommerce.mmd` | E-commerce schema | every cardinality (`\|\|`, `\|o`, `o{`, `\|{`, `}o`) · identifying `--` + non-identifying `..` · self-referencing category tree · `PK`/`FK`/`UK` + combined `FK,UK` · quoted comments & labels |
| `erd-hospital.mmd` | Hospital records | entity aliases `p[Patient]` / `d[Doctor]` · `classDef`/`class` styling · `direction LR` · combined keys |
| `erd-blog-cms.mmd` | Blog CMS | many-to-many (`}o--o{`) · threaded self-referencing comments · `UK` constraints · non-identifying revisions |

**ERD coverage:**
- **Cardinality (both ends):** `\|o`/`o\|` (zero or one), `\|\|` (exactly one), `}o`/`o{` (zero or more), `}\|`/`\|{` (one or more) — drawn as the proper crow's-foot glyphs (bar / circle / foot)
- **Relationship type:** identifying `--` (solid) vs non-identifying `..` (dashed)
- **Attributes:** `type name`, key constraints `PK` / `FK` / `UK` and combined (`PK,FK`), quoted comments
- **Entities:** block form `E { … }`, aliases `id[Display]`, standalone `E`
- **Labels:** plain and quoted multi-word · **Direction:** `direction TB/BT/LR/RL` · **Styling:** `classDef` / `class` / `style` / `:::`

## User journey diagrams

| File | Scenario | Features exercised |
|---|---|---|
| `journey-saas-onboarding.mmd` | SaaS onboarding | 4 sections · 13 tasks · scores 1–5 · 5 actors with colour legend |
| `journey-ecommerce-purchase.mmd` | Online purchase | multi-actor tasks · per-actor colour dots |
| `journey-patient-visit.mmd` | Clinic visit | 5 distinct actors · task before the first section · satisfaction line |

**Journey coverage:**
- **Structure:** `title`, `section <name>`, tasks `Task: <score>: Actor1, Actor2` (tasks before any section go into an implicit one)
- **Score:** clamped to 1–5; drawn as a bar + a dashed satisfaction line connecting tasks
- **Actors:** comma-separated, **each actor gets a consistent colour** (coloured dots per task + a legend) — a task may have several actors
- **Robust parsing:** task names may contain a `:`; actors are optional

## Gantt diagrams

| File | Scenario | Features exercised |
|---|---|---|
| `gantt-ecommerce-release.mmd` | Platform release | `done`/`active`/`crit` (incl. combined `crit, done`) · `milestone` · `after id` · multi-`after id1 id2` · `vert` deadline |
| `gantt-mobile-launch.mmd` | Mobile app launch | `until <id>` end-dependency · multi-`after` · parallel tracks · `vert <taskId>` marker |
| `gantt-research-roadmap.mmd` | Research program | month (`M`) / week (`w`) durations · milestones · long (10-month) span |

**Gantt coverage:**
- **Config:** `title`, `dateFormat`, `axisFormat`, `excludes`, `tickInterval` (recognized; scheduling uses ISO dates)
- **Task forms:** `name : [status,…] [id,] <start> [, <end>]` where start is a date or `after id…`, and end is a date, a duration, or `until id`
- **Statuses (combinable, must come first):** `done`, `active`, `crit`, `milestone`
- **Dependencies:** `after id`, `after id1 id2` (latest), `until id`
- **Durations:** `ms`, `s`, `m` (min), `h`, `d`, `w`, `M` (month), `y` — decimals allowed (`1.5d`)
- **Markers:** `vert <date>` / `vert <taskId>` vertical lines

> Gantt — `dateFormat` other than `YYYY-MM-DD` (and `YYYY-MM-DD HH:mm`) isn't
> applied; `excludes`/`weekends` is parsed but not subtracted from durations;
> `click` is skipped.

## Pie charts

| File | Scenario | Features exercised |
|---|---|---|
| `pie-cloud-spend.mmd` | Cloud spend breakdown | `pie showData title …` · 8 slices · decimal values (legend shows actual amounts) |
| `pie-browser-share.mmd` | Browser market share | default (no `showData`) — legend shows labels, slices show percentages; values sum to 100 |
| `pie-survey-results.mmd` | Dev week split | `showData` · fractional hours |

**Pie coverage:**
- **Header:** `pie`, optional `showData` (legend shows the raw value), `title <text>` (also as a standalone line)
- **Slices:** `"Label" : value` — positive integer or decimal (≤ 2 places); non-positive values are skipped
- **Rendering:** wedges in source order (clockwise from 12 o'clock), in-slice percentage labels, and a color legend
- **`showData` off:** legend shows just the label · **on:** legend appends the actual value

## Quadrant charts

| File | Scenario | Features exercised |
|---|---|---|
| `quadrant-tech-radar.mmd` | Tech adoption radar | `classDef core` + `:::core` points · inline `radius`/`color`/`stroke-color`/`stroke-width` |
| `quadrant-feature-priority.mmd` | Effort vs impact | two classes (`win` / `risk`) · all four quadrant labels |
| `quadrant-eisenhower.mmd` | Urgent/important matrix | 10 points · class-styled "urgent" points · classic 2×2 |

**Quadrant coverage:**
- **Axes:** two-label `x-axis low --> high` and single-label `x-axis label` (centered); same for `y-axis`
- **Quadrants:** `quadrant-1`…`quadrant-4` (top-right, top-left, bottom-left, bottom-right)
- **Points:** `Name: [x, y]` with x/y in 0–1 (clamped); labels may contain `:`
- **Styling:** inline `radius`, `color`, `stroke-color`, `stroke-width`, and class-based `Name:::class` + `classDef class <props>` (inline overrides the class)

## Requirement diagrams

| File | Scenario | Features exercised |
|---|---|---|
| `requirement-vehicle-safety.mmd` | ISO 26262 vehicle safety | all requirement types · all 7 relationship types · reverse relationship · `classDef`/`class` |
| `requirement-payment-pci.mmd` | PCI-DSS compliance | `direction LR` · risk + verifymethod · contains/derives/refines/satisfies/verifies/traces |
| `requirement-medical-pump.mmd` | IEC 62304 infusion pump | `physicalRequirement` · all 7 relationship types · reverse `verifies` |

**Requirement coverage:**
- **Requirement types:** `requirement`, `functionalRequirement`, `interfaceRequirement`, `performanceRequirement`, `physicalRequirement`, `designConstraint`
- **Body props:** `id`, `text`, `risk` (Low/Medium/High → color chip), `verifymethod` (Analysis/Inspection/Test/Demonstration → chip)
- **Elements:** `element name { type, docref }`
- **Relationships (both directions):** `a - rel -> b` and `b <- rel - a`; types `contains`, `copies`, `derives`, `satisfies`, `verifies`, `refines`, `traces`
- **Layout:** relationship-aware, honoring `direction` (TB/BT/LR/RL) · **Styling:** `classDef` / `class` / `style` / `:::`

> Requirement — the node identifier is the **name** (e.g. `FR_1`); the block
> `id:` is shown separately. `docref` is parsed but not drawn.

## C4 diagrams

| File | Scenario | Features exercised |
|---|---|---|
| `c4-context-banking.mmd` | System context | `C4Context` · `Person`/`Person_Ext` · `System`/`System_Ext`/`SystemQueue_Ext` · `Enterprise_Boundary` · `Rel` + `Rel_Back` with tech |
| `c4-container-banking.mmd` | Container view | `C4Container` · `Container`/`ContainerDb`/`ContainerQueue` · `System_Boundary` · `_Ext` systems · tech tags |
| `c4-deployment-banking.mmd` | Deployment | `C4Deployment` · **nested** `Deployment_Node` (3 levels) · `ContainerDb`/`ContainerQueue` |

**C4 coverage:**
- **Headers:** `C4Context`, `C4Container`, `C4Component`, `C4Dynamic`, `C4Deployment`
- **Elements:** `Person`, `System`, `Container`, `Component` and their `_Ext` / `Db` / `Queue` variants (with `?techn`, `?descr`)
- **Boundaries (nested via `{ }`):** `Boundary`, `Enterprise_Boundary`, `System_Boundary`, `Container_Boundary`, `Deployment_Node` / `Node` — drawn as labeled dashed frames with recursive containment
- **Relationships:** `Rel`, `BiRel`, directional `Rel_U/D/L/R` (+ `_Up/_Down/_Left/_Right`), `Rel_Back`
- **Skipped cleanly:** `UpdateElementStyle` / `UpdateRelStyle` / `UpdateLayoutConfig` and `$key=value` named args

## Mindmaps

| File | Scenario | Features exercised |
|---|---|---|
| `mindmap-product-strategy.mmd` | Product strategy | every shape · `id` prefixes · `:::class` · `::icon(...)` |
| `mindmap-software-architecture.mmd` | System design | circle/hexagon/cloud/bang shapes · classes · 3-level nesting |
| `mindmap-learning-path.mmd` | Backend learning path | bang `))…((` / cloud `)…(` / hexagon `{{…}}` · icon · deep tree |

**Mindmap coverage:**
- **Hierarchy:** by indentation only (deeper = child, equal = sibling); a single root (extra top-level nodes attach to it)
- **Shapes (with optional `id` prefix):** default text, `[square]`, `(rounded)`, `((circle))`, `))bang((`, `)cloud(`, `{{hexagon}}`
- **Decorators:** `:::class` and `::icon(fa fa-…)` (appended or on their own line)
- **Markdown strings:** backtick/quote-wrapped labels with `**bold**` / `*italic*` are unwrapped

> Mindmap — `::icon(...)` is parsed (FontAwesome glyphs aren't rendered) and
> `:::class` is captured (no `classDef` exists in mindmap, so colour stays
> depth-based).

## Timeline diagrams

| File | Scenario | Features exercised |
|---|---|---|
| `timeline-company-history.mmd` | Company milestones | 3 sections · multiple events per period · continuation lines · `<br>` |
| `timeline-product-roadmap.mmd` | Quarterly roadmap | shipped / in-progress / planned sections · multi-event |
| `timeline-internet-history.mmd` | History of the web | three events on a single line · `<br>` in an event |

**Timeline coverage:**
- **Header:** `timeline`, optional direction `timeline LR|TD`, optional `title`
- **Sections:** `section <name>` groups subsequent periods (optional)
- **Periods & events:** `<period> : <event>` and multiple events per line `<period> : e1 : e2 : e3`
- **Continuation:** a line whose period is empty (`: <event>`) appends events to the previous period
- **Events:** `<br>` line breaks render as multiple lines

> Timeline — `direction TD` is parsed but the chart renders left-to-right (LR).

## Sankey diagrams

| File | Scenario | Features exercised |
|---|---|---|
| `sankey-energy-flow.mmd` | Energy budget | multi-stage flow · 20 links · a shared intermediate node (`Electricity`) · split to losses |
| `sankey-company-budget.mmd` | P&L waterfall | **quoted field with a comma** (`"Cost of Goods, Sold"`) · `&` in labels |
| `sankey-website-funnel.mmd` | Conversion funnel | **quoted-comma source** (`"Search, Organic"`) · 4-stage acquisition→purchase funnel |

**Sankey coverage:**
- **Header:** `sankey-beta`, then raw CSV rows of `source,target,value`
- **CSV (RFC 4180):** fields with commas wrapped in `"…"`; a literal `"` inside a quoted field escaped by doubling (`""`); blank lines and `%%` comments skipped
- **Values:** positive numbers, decimals allowed; **nodes** defined implicitly from source/target names
- **Layout:** column placement by source/target side with proportional flow ribbons

## XY charts

| File | Scenario | Features exercised |
|---|---|---|
| `xychart-revenue-quarters.mmd` | Revenue vs target | **two bar series** + a line · `x-axis title [cats]` · ranged `y-axis "…" 0 --> 50` |
| `xychart-temperature.mmd` | Monthly temperature | **negative values** · explicit `-10 --> 35` range · quoted month categories · bar + line |
| `xychart-website-traffic.mmd` | Weekly active users | **auto-ranged** y-axis (no range given) · decimals · bar + line |

**XY chart coverage:**
- **Header:** `xychart-beta`, optional `horizontal` orientation (parsed)
- **Title:** `title "Multi word"` or `title Word`
- **X-axis:** categorical `[a, b, c]`, with a title `x-axis Title [a, b, c]`, quoted categories `["a b", "c d"]`, and numeric range `x-axis "L" 0 --> 100`
- **Y-axis:** `"Label" min --> max` (signed/decimal), or `"Label"` alone → **auto-ranged from data** (zero-based, padded)
- **Series:** `bar [...]` and `line [...]`, multiple series, combined bar+line; negative & decimal values; bars grow from the zero line

> XY chart — `horizontal` is parsed but the chart renders vertically; a numeric
> x-axis interpolates evenly-spaced tick labels (points are still slot-positioned).

## Block diagrams

| File | Scenario | Features exercised |
|---|---|---|
| `block-system-architecture.mmd` | Layered architecture | `columns 3` · column **spans** (`:3`) · `space:N` · **nested `block:id:N`** sub-grids · shapes · `style` |
| `block-data-pipeline.mmd` | Data pipeline | `columns 5` · nested grid · cylinder/subroutine/stadium/rhombus shapes · `classDef`/`class` |
| `block-decision-flow.mmd` | Decision flow | stadium/rhombus/asymmetric/double-circle shapes · **labeled** & **cross** edges |
| `block-event-pipeline.mmd` | Event pipeline | **block-arrows** `<["…"]>(right)` and double-headed `(x)` · spanned arrow · nested sinks |
| `block-network-topology.mmd` | Network topology | block-arrow `(down)` · `(("circle"))` · nested DMZ / internal grids |

**Block coverage:**
- **Grid:** `columns N`; blocks span columns with `id:N`; `space` and `space:N` leave gaps; default = one row
- **Shapes:** `["square"]`, `("rounded")`, `(("circle"))`, `((("…")))`, `{"rhombus"}`, `{{"hexagon"}}`, `(["stadium"])`, `[["subroutine"]]`, `[("cylinder")]`, `>"asym"]`, `]"parallelogram"[`
- **Block arrows:** `<["label"]>(dir)` with `dir` = `right` / `left` / `up` / `down`, plus double-headed `x` (horizontal) and `y` (vertical)
- **Nesting:** `block:id[:N] … end` → a labeled container with its own `columns` sub-grid (edges may target the container id)
- **Edges:** `-->`, `---`, `--x`, `--o`, labeled `-- "x" -->` and `-->|x|`, chains
- **Styling:** `style id …`, `classDef`/`class` (fill / stroke / color)

> Block — labels with spaces must be quoted (`["Two Words"]`); the trapezoid and
> some block-arrow directions render as their nearest polygon.

## Packet diagrams

| File | Scenario | Features exercised |
|---|---|---|
| `packet-tcp-header.mmd` | TCP header | `title` · single-bit flag fields · explicit ranges · 256-bit / multi-row wrap |
| `packet-ipv4-header.mmd` | IPv4 header | **all `+N` bit-count syntax** · 192 bits across 6 rows |
| `packet-udp-datagram.mmd` | UDP datagram | **mixed** explicit ranges + `+N` · payload wrapping |

**Packet coverage:**
- **Header:** `packet` or `packet-beta`, optional `title "…"`
- **Fields:** single bit `start: "Label"`, range `start-end: "Label"`, and bit-count `+N: "Label"` (begins at the end of the previous field; mixable)
- **Layout:** 32 bits per row with a bit ruler (ticks every 8 bits); fields wider than the row wrap to the next row

> Packet — the row width is fixed at 32 bits (the `bitsPerRow` config isn't read).

## Kanban boards

| File | Scenario | Features exercised |
|---|---|---|
| `kanban-sprint-board.mmd` | Sprint board | 5 columns · `ticket` / `priority` / `assigned` metadata · all priority levels |
| `kanban-content-pipeline.mmd` | Content pipeline | a **plain-text card** · assignee avatar chips · mixed metadata |
| `kanban-bug-triage.mmd` | Bug triage | every priority `Very High`…`Very Low` · ticket references |

**Kanban coverage:**
- **Structure:** indentation defines hierarchy — top level = columns, deeper = cards
- **Columns & cards:** `id[Label]`, bare `id`, or plain text
- **Metadata:** `@{ assigned: '…', ticket: '…', priority: '…' }` (quoted values may contain spaces, e.g. `'Very High'`, `'Bob Smith'`)
- **Rendering:** lanes with card-count badge; cards show label, ticket line, a **priority stripe** (Very High → Very Low) and an **assignee initials chip**

## Architecture diagrams

| File | Scenario | Features exercised |
|---|---|---|
| `architecture-cloud-deployment.mmd` | Cloud deployment | **3-level nested groups** (`group … in …`: Cloud → VPC → subnets) · port arrows (`L`/`R`/`T`/`B`) |
| `architecture-microservices.mmd` | Microservices | edge / services / data-store groups · `queue` icon · gateway fan-out |
| `architecture-data-platform.mmd` | Data platform | **junction** · `{group}` boundary edge · bidirectional `<-->` |

**Architecture coverage:**
- **Groups:** `group id(icon)[Title]`, nested via `group sub(icon)[Title] in parent` (recursive cluster layout, no overlap)
- **Services:** `service id(icon)[Title]`, assigned to a group with `in groupId`; icons `cloud`/`database`/`disk`/`internet`/`server` (+ `queue`/`storage` aliases)
- **Junctions:** `junction id [in group]` (rendered as a small connector dot)
- **Edges:** `from{group}?:PORT <op> PORT:to{group}?` with ports `L/R/T/B`, arrows `--` / `-->` / `<--` / `<-->`, and the `{group}` boundary modifier

> Architecture — custom icon packs (`pack:name`) are parsed but rendered with the
> default color; the L/R/T/B ports are honored exactly as written.

## Git graphs

| File | Scenario | Features exercised |
|---|---|---|
| `git-gitflow.mmd` | GitFlow | develop / feature / hotfix branches · `branch … order:` · `merge … id/tag/type` · `cherry-pick` · commit types |
| `git-release-train.mmd` | Release train | `gitGraph LR:` · parallel release branches · `cherry-pick` of a patch · merge `type: HIGHLIGHT` |
| `git-trunk-based.mmd` | Trunk-based | `HIGHLIGHT` / `REVERSE` commits · `cherry-pick id: … parent: …` · tags |

**Git graph coverage:**
- **Header:** `gitGraph`, with orientation `gitGraph TB:` / `LR:` / `BT:`
- **Commits:** `commit`, with `id:` / `tag:` / `msg:` / `type: NORMAL|REVERSE|HIGHLIGHT`
- **Branches:** `branch name [order: N]` (creates **and switches**); `checkout` / `switch`
- **Merge:** `merge name [id: …] [tag: …] [type: …]` → double-circle merge node
- **Cherry-pick:** `cherry-pick id: "x" [parent: "y"]` → dashed link back to the source commit
- **Glyphs:** `NORMAL` filled circle · `REVERSE` crossed circle · `HIGHLIGHT` filled square · merge double circle · HEAD ring · tag badges

> Git — the chart renders left-to-right (orientation is parsed); init config
> (`mainBranchName`, `showBranches`, …) via `%%{init}%%` frontmatter isn't read.
