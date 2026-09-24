# Hobbiton Movie Set — Reference for a Procedural 3D Recreation

Compiled 2026-09-24. Every claim has an inline source. Confidence tags:
- **[V]** verified: two or more independent sources agree, or it comes from an official source or measured data.
- **[S]** single source.
- **[U]** uncertain or conflicting. The conflict is explained where it appears.

Text sources cover the tour and its trivia well. They say very little about construction dimensions: door diameters, hinge sides, lane widths and so on. I could not find those published anywhere, and this document says so rather than guess.

---

## 0. Geodata basis (measured, not from tour blogs)

The layout numbers below come from two datasets:
- **OpenStreetMap** features inside the set, which volunteers have mapped in detail. Retrieved through the Overpass API (`overpass.kumi.systems`) on 2026-09-24, with OSM base data as of 2026-07-24.
- **Elevations** from the LINZ NZ 8 m DEM, queried through the OpenTopoData API (`api.opentopodata.org/v1/nzdem8m`).

OSM positions for small features can be off by a few metres, and the 8 m DEM smooths out any sculpted set terrain. Treat both as ±5–10 m.

**Local coordinate frame used throughout:** the origin is the OSM "Bag End" building node at lat −37.857559, lon 175.679879. **+x = East, +y = North**, in metres.

| Feature (OSM name) | x (E) | y (N) | Ground elev. (m) | Dist. / bearing from Bag End |
|---|---|---|---|---|
| Bag End (building) | 0 | 0 | 159 | — |
| "Big Oak Tree" (tagged fake; `material=polystyrene`, nickname "Marilyn") | −11 | 0 | 161 | 11 m W, i.e. above and behind Bag End |
| Party Tree | 87 | −56 | 143.5 | 103 m @ 123° (ESE) |
| Party Field (meadow, ≈2,200 m²) | centroid 70 | −39 | ~147 | spans x 41–97, y −67 to −6 |
| Bagshot Row interior holes (two one-way `tunnel=yes` footways) | ~45 | ~−57 | 147 | 73 m @ 142° (SE) |
| "Bywater Pool" / "The Water" (lake, ≈12,800 m²) | x −28…175 | y −78…−260 | surface ≈140 | north shore ~80 m S of Bag End |
| Frog Pond (small pond) | 91 | 19 | 147.5 | ~93 m E |
| Sandyman's Mill / "The Millhouse" (footprint ≈110 m², ~16×9 m) | 70 | −212 | 140 | 223 m @ 162° |
| Bywater Bridge (`bridge:structure=arch`, ≈28 m long, WNW–ESE) | 66→92 | −222→−232 | 140.7 | 240 m @ 161° |
| Green Dragon Inn (footprint ≈600 m², irregular, ~47×31 m bbox) | 119 | −237 | 142 | 265 m @ 153° (SSE) |
| Bywater Beer Garden (tent, hipped roof) | 175 | −239 | — | E of the Green Dragon |
| Gandalf's Cutting (footway in a cutting) | 174→223 | −16→11 | ~140 | ~200 m E |
| Vegetable Gardens | ~142 | ~−18 | 141 | ~143 m E |
| Mill Run (stream) | runs from the bridge (88,−212) west-southwest to (−74,−264) | | | |

Source: OpenStreetMap contributors (ODbL), https://www.openstreetmap.org/way/1347923448 (Bag End), /way/180821543 (lake), /way/296374551 (Green Dragon), /way/296374550 (Mill), /way/1245949037 (bridge), /node/3548084787 (Party Tree), /node/3001678910 (oak).

### Terrain (NZ 8 m DEM, 25 m grid, elevation in m ASL; same local frame)

```
 y\x   -100 -75 -50 -25   0  25  50  75 100 125 150 175 200 225 250
 150    182 184 183 180 175 170 164 158 152 147 143 140 139 138 138
 125    182 182 181 178 173 167 161 155 150 145 141 140 139 139 139
 100    181 180 179 175 170 164 158 153 148 143 140 140 140 140 139
  75    179 178 175 172 167 162 157 152 147 143 141 140 140 140 140
  50    177 174 172 168 163 159 155 151 147 143 141 140 140 140 140
  25    175 170 169 165 161 157 153 150 147 143 141 140 140 140 140
   0    172 166 165 163[159]156 152 149 146 143 141 140 140 140 140   <- Bag End at (0,0)
 -25    171 164 161 159 156 153 150 147 144 142 141 140 140 140 140
 -50    174 166 160 156 153 150 148 145 143 141 140 140 140 140 140   <- Party Field/Tree ~ (70..90, -40..-56)
 -75    176 168 161 154 149 146 145 143 141 140 140 140 140 140 140   <- lake north shore
-100    174 169 162 154 147 142 141 141 140 140 140 140 140 140 140
-125    168 164 158 151 145 140 140 140 140 140 140 140 140 140 140
-150    164 158 153 146 141 140 140 140 140 140 140 140 140 140 140
-175    159 156 152 146 141 140 140 140 140 140 140 140 141 141 141
-200    154 152 150 147 144 141 140 140 140 141 141 141 141 142 142   <- Mill (70,-212)
-225    150 147 145 144 142 140 140 141 141 142 142 142 142 142 143   <- Bridge / Green Dragon
-250    150 143 141 140 140 140 141 141 142 143 143 143 143 144 144
-275    149 143 142 142 142 142 142 143 143 144 144 145 145 145 145
```

What the grid shows:
- The set sits on the **east- to southeast-facing flank** of a ridge that rises to about 184 m to the northwest.
- The valley floor to the east and the lake to the south are flat at about 140 m.
- **Bag End is about 19 m above the lake surface.** The Party Field is about 6–7 m above the lake.
- Bag End is **not** on the true summit. Ground keeps rising behind it, about 13 m higher 100 m to the west.
- The average slope from Bag End down to the lake's north shore is about 19 m over 80–100 m, roughly 1:5.

### Orientation conclusions
- **Bag End faces roughly east to east-southeast.** Three things support this:
  1. The fake oak (OSM) sits about 11 m west of the door, "above" it on the uphill side.
  2. The Party Tree and Party Field lie at bearing ~123° from Bag End.
  3. Hikespeak advises that "morning tours offer better front-lit photography of Bag End" (https://www.hikespeak.com/attractions/hobbiton-movie-set-shire-tour-nz/).

  **[V: geodata + blog]**
- **The lake is south of the Party Field, and the Party Tree stands on its north shore.** The tree is about 25–35 m from the water's northern edge. Official site: "a magnificent pine tree towered over a nearby lake, adjacent to a rising hill. Bag End now sits atop that hill, overlooking the Party Tree" (https://shop.hobbitontours.com/pages/about-us; https://www.hobbitontours.com/discover/our-story/). **[V]**
- **Mill, bridge and Green Dragon form a cluster at the lake's south end.** The mill is on the west side of the bridge. The Green Dragon is on the east/south side, about 40–50 m from the mill. **[V: geodata]** An OSM viewpoint on the east shore at (130, −105) is tagged `direction=280`, meaning it looks west toward the hill.

---

## 1. Overall site layout and tour route

### Site facts
- The set covers about **12 acres (≈5 ha)** on the Alexander family's **1,250-acre (≈500 ha)** sheep and beef farm at 501 Buckland Road, Hinuera, Matamata. Wikipedia gives the "viewing area" as 5.5 ha. https://www.hobbitontours.com/discover/our-story/ ; https://en.wikipedia.org/wiki/Hobbiton_Movie_Set **[V]**
- The site was found by aerial search in 1998. The first build began in **March 1999** with NZ Army help, filming ran from December 1999 for about 3 months, and tours opened in 2002. The set was rebuilt permanently from 2009/2010 for *The Hobbit*, and filming began in 2011. https://www.auckland-tours.com/hobbiton-movie-set/facts/ ; https://en.wikipedia.org/wiki/Hobbiton_Movie_Set **[V]**
- About **1.5 km of road** was built into the site for the first build (https://en.wikipedia.org/wiki/Hobbiton_Movie_Set). OSM shows paved private service roads reaching the set from the south and east.
- The bus ride from The Shire's Rest takes about 10 minutes and covers about 2.75 km (https://www.hobbitontours.com/experiences/hobbiton-movie-set-tour/ ; hikespeak). The Shire's Rest is about 1.6 km SSE of the set, measured in OSM.

### Tour walking route
Sources:
- https://www.auckland-tours.com/hobbiton-movie-set/map/
- https://www.hikespeak.com/attractions/hobbiton-movie-set-shire-tour-nz/
- https://www.hobbitontours.com/plan-visit/accessibility/
- OSM path geometry

Official route and distance facts:
- The walk is about **1.5–2 km**. Hikespeak says 1.6 km; the official accessibility page says about 2 km. **[V]**
- Paths are "mostly compacted dirt/clay tracks with uneven cobblestone areas throughout". https://www.hobbitontours.com/plan-visit/accessibility/ **[S, official]**
- The climb to Bag End has "a steep incline and includes around 10 steps". https://www.hobbitontours.com/plan-visit/accessibility/ **[S, official]**
- The tour takes about 1.5 h guided, plus about 15–16 min in the Bagshot Row interiors and about 20 min at the Green Dragon. https://www.hobbitontours.com/plan-visit/accessibility/ **[S, official]**

The stop order below is consistent across sources. Coordinates are my placement of each stop on the OSM paths.

1. **Bus drop and entry, east side of the set.** The drop is at the valley floor, ~140 m ASL, near an OSM turning circle at (249, 55) with toilets at (248, 20).
2. **Gandalf's Cutting.** A footway runs west through a cut bank, from (223, 11) to (174, −16). This is the lane Gandalf's cart uses in *Fellowship* (hikespeak). **[V]**
3. **Vegetable gardens and the "Great Smials" path**, around (120–155, −30 to 15). The path then heads west into **"The Dell" and the Frog Pond area** around (40–95, 15–40). Hikespeak calls this the "Dell area – small pond with gardens and multiple hobbit holes".
4. **Uphill along the named "Bagshot Row" footway.** It starts at the north end, (57, 75), at about 155 m. It then **switchbacks**: it goes WSW to (16, 34), turns south through (7, 9) and (6, −2), and passes just east of Bag End's gate. It continues south to (−8, −37). A second footway, **"Hill Lane"**, loops from (87, −10) on the Party Field edge up and west to the same point at (−8, −37).
5. **Bag End** at (0, 0), about 159 m. The dedicated photo stop is outside the gate; visitors cannot go past it (https://www.hobbitontours.com/experiences/hobbiton-movie-set-tour/). **[V]**
6. **Down the lower "Bagshot Row" footway**, from (−8, −37) through (27, −48) to (59, −56). This passes **the Bagshot Row interior holes**, two parallel one-way walk-through tunnels at about (38–53, −45 to −69).
7. **Party Field and Party Tree**, at (70, −39) and (87, −56).
8. **Around the lake.** OSM shows two options from the southwest corner of the Party Field at (40, −75):
   - **"Merry Meander"** runs down the **west shore** to (11, −201), then along the "Bywater Road" footway to the mill.
   - **"Lakeside"** runs along the **north shore** east to (157, −26), toward the entrance area.

   Tours follow the lake path to the mill, the bridge, and then the Green Dragon (auckland-tours map). The OSM geometry suggests the west-shore Merry Meander is the walking route to the mill. **[U: exact tour path]**
9. **The Mill**, at (70, −212), then **the double-arch bridge**, from (66, −222) to (92, −232), then **the Green Dragon**, at (119, −237).
10. **Exit.** The "Bywater Road" footway runs east from the Green Dragon to (201, −164), toward parking and bus pickup at about (298, −168).

OSM also shows a "Stone Trolls" stop, which the official tour page mentions (https://www.hobbitontours.com/experiences/hobbiton-movie-set-tour/). Its position is not mapped. **[U]**

**Other named OSM localities:** The Dell, Sackville, Northmarch, Bramblewick Common, Overhill, Pine Grove, Willow Gully, Woody End, Eastfarthing, Greenfields, Tighfield and Westwood. These may be names added by mappers or taken from signage. They are not confirmed as official. **[U]**

### ASCII plan (north up, 1 char ≈ 10 m, approximate)

```
            N
            ^        (57,75) Bagshot Row lane (north end, ~155m)
            |           \
  ridge     |   (14,19)  \___ The Dell   Frog Pond(91,19)      Gandalf's
  rises NW  |      \          Sackville                      Cutting (174..223,-16..11)
   ~170-184m| [OAK](-11,0) BAG END(0,0) ~159m -> faces E/ESE   <-- entry from E
            |      |                                     Veg gardens (142,-18)
            |  (-8,-37) Hill Lane top          Party Field (41..97,-67..-6)
            |      \__Bagshot Row interiors(45,-57)   * PARTY TREE (87,-56) ~143m
            |  Merry  \                        ~~~~~~~~~~~~~~~~
            |  Meander |                     ~~  LAKE "The Water" ~~   (surface ~140m)
            |  (west   |                   ~~   ~200m E-W x ~180m N-S ~~
            |  shore)  |                    ~~~~~~~~~~~~~~~~~~~~~~
            |          \__(11,-201)__ MILL(70,-212)
            |    Mill Run ~~~~~~~~~~~~ =BRIDGE=(66..92,-222..-232)
            |                                  GREEN DRAGON (119,-237) -- Beer Garden (175,-239)
            |                                        \__ footway E to parking (298,-168)
```

---

## 2. Hobbit holes

### Count
- **44 hobbit holes today.** https://www.hobbitontours.com/discover/our-story/ ; https://en.wikipedia.org/wiki/Hobbiton_Movie_Set ; https://www.internationaltraveller.com/oceania/new-zealand/freaky-facts-hobbiton/ **[V]**
- **The LOTR (1999) count is 37 or 39.** Wikipedia and greenroofs.com say 37 facades. The official site and auckland-tours say 39. **[U: 37 vs 39]**
- **17 bare plywood facades** remained after the first set was dismantled. https://www.hobbitontours.com/discover/our-story/ **[V]**
- **"5 additional hobbit-holes built over the hill as backups."** https://www.mileswithvibes.com/hobbiton/30-crazy-fun-facts-about-hobbiton-new-zealand/ **[S]**

### Scales
Scale was used for forced perspective, with different builds for different actors:
- **60% scale holes were for Gandalf scenes**, so Gandalf looks big. **90% scale holes were for hobbit or dwarf actors.** https://www.internationaltraveller.com/oceania/new-zealand/freaky-facts-hobbiton/ ; https://www.hikespeak.com/attractions/hobbiton-movie-set-shire-tour-nz/ **[V]**
- Wikipedia describes **three scales**: "correct" hobbit size, a larger scale to make hobbit actors look small, and a "dwarf" scale. It also says that, with exceptions, "the colour of the front door indicates the scale… blue door [= built to the correct scale for humans]." https://en.wikipedia.org/wiki/Hobbiton_Movie_Set **[U: I found no second source for the door-colour rule]**
- The **Bagshot Row interiors are built at 83% scale.** https://www.hobbitontours.com/discover/bagshot/ ; https://bestawards.co.nz/spatial/exhibition-temporary-structures/hobbiton-movie-set/bagshot-row/ **[V]**
- **No per-hole scale list has been published**, and I could not find how many holes are at each scale. **[U]**

### Social gradient (useful for procedural dressing)
- **The higher up the hill, the wealthier the hobbit.** Gardens are more manicured higher up, and Bag End at the top belongs to one of the richest. https://www.internationaltraveller.com/oceania/new-zealand/freaky-facts-hobbiton/ ; https://www.mileswithvibes.com/hobbiton/visiting-hobbiton-movie-set-matamata-new-zealand/ **[V]**
- **The poorest holes are simpler.** "Poorest Hobbits live in primitive burrows with no window or at best one." https://frametoframe.ca/hobbiton-our-walk-through-the-shire-new-zealand/ **[S]**
- **Gardens reflect their owners.** They are "designed to reflect the character of its owner; some are kept tidy, and others border on abandoned." https://gardenhistoryresearchfoundation.com/2020/04/17/hobbiton-new-zealands-most-popular-garden/ **[S]**

### Named and notable holes

| Hole | Door colour | Notes / props | Source |
|---|---|---|---|
| **Bag End** (Bilbo/Frodo) | **Green**, round, brass knob in the centre | Top of the hill; see §4 | many (below) |
| **Sam's house** (Samwise Gamgee, on Bagshot Row) | **Yellow**, round | Exterior only. Cottage garden with kitchen herbs; flowers "spill over a weathered **picket fence**"; pink roses climb it; flowers in red, purple, yellow and orange. | https://www.hobbitontours.com/discover/bagshot/ ; https://frametoframe.ca/… ; https://www.mileswithvibes.com/hobbiton/visiting-hobbiton-movie-set-matamata-new-zealand/ **[V]** |
| **Bagshot Row interior holes** (2 of the 3 holes on the Row) | not stated officially | Opened Dec 2023; designed by Alan Lee and John Howe; 83% scale; two identical parallel walk-throughs | https://www.hobbitontours.com/discover/bagshot/ **[V]** |
| **"40 Bagshot Row"** (Wētā collectible; the walk-in hole before 2023) | **Red** | Stone slab porch, small white flowers, firewood | https://www.wetanz.com/us/40-bagshot-row-hobbit-hole **[S]** |
| **Beekeeper** | ? | Wooden beehive with lid open by the door, stacked honeycomb frames, gloves, honey jars on a stall | https://frametoframe.ca/… **[S]** |
| **Baker** | ? | Tiny wheelbarrow of flour sacks, bread on wooden stands; shop display in front | frametoframe; mileswithvibes **[V]** |
| **Cheesemaker** | ? | Window with rounds of cheese ripening; shaded table of cheeses by the cart track | frametoframe; mileswithvibes **[V]** |
| **Carpenter / woodworker** | ? | Wooden items, a pedal-operated lathe | frametoframe **[S]** |
| **Florist** | ? | Small shop front | mileswithvibes **[S]** |
| **Fisherman / "Gone Fishing"** | ? | "Gone Fishing" sign; fish hung to smoke; fishing nets | mileswithvibes; https://gallivantrix.com/2016/11/28/ten-days-in-nz-hobbiton/ **[V]** |
| **Potter** | ? | Mentioned only | search summaries (midwestmagellan) **[U]** |
| **Gourd artist** | ? | Formerly the only hole visitors could enter (used for umbrella storage) | https://www.greenroofs.com/2014/12/30/greenroofs-com-explores-middle-earth-at-hobbiton-nz/ **[S]** |

**Door colours seen across the set:** blue, yellow, red, pink, green, turquoise. https://www.greenroofs.com/2014/12/30/… ; https://www.hikespeak.com/… **[V]**

**Not found in any source:** a verified fishmonger, woodcutter or mailman hole, and per-hole window shapes or facade materials. **[U]**

### Common props across holes
- Hand-painted **mailboxes (letterboxes) at every hole**. mileswithvibes **[V]**
- **Little picket fences.** mileswithvibes; hikespeak **[V]**
- Gardening tools, brooms, cabbage patches, honey pots, butterfly catchers and **rocking chairs**. mileswithvibes; hikespeak **[V]**
- **Washing lines with hobbit-sized clothes** hanging to dry. frametoframe; gallivantrix; goingawesomeplaces **[V]**
- Stacks of firewood, drying herbs, wicker baskets of vegetables and a village bulletin board. frametoframe; gallivantrix **[V]**
- **Picnic tables** "set for second breakfast". gallivantrix **[S]**
- Wheelbarrows. mjwrightnz **[S]**
- **Hand-applied fake lichen on fence posts**, to make new timber look a century old. https://www.findingtheuniverse.com/in-photos-tour-of-hobbit-film-set/ **[S]**
- Each hole has **30–200 plants** around it. https://www.mileswithvibes.com/hobbiton/30-crazy-fun-facts-about-hobbiton-new-zealand/ **[S]**

---

## 3. Typical hobbit-hole facade construction

### Documented
- **Materials changed between the two builds:**
  - **1999:** facades of "untreated timber, 7 mm ply and polystyrene covered with native turf". https://www.greenroofs.com/2014/12/30/… ; Wikipedia **[V]**
  - **2010 rebuild:** permanent materials, reported as concrete, timber, stone and steel. Earth-sheltered structures with turf roofs of "native grasses, clover, and wildflowers". greenroofs.com; the TikTok and aggregator summaries for the material list **[V for "permanent"; S for the exact material list]**
- **The doors lead nowhere.** Behind them is "bare framing". https://goingawesomeplaces.com/how-to-visit-the-hobbiton-movie-location-in-new-zealand/ At Bag End, "just the first couple of metres inside" are themed. https://www.hobbitontours.com/experiences/hobbiton-movie-set-tour/ **[V]**
- **Doors** are round, painted wood, in many colours. **Windows** are small, set into the earth mounds, with "even tinier window dressings". https://gallivantrix.com/2016/11/28/ten-days-in-nz-hobbiton/ **[V]**
- **Chimneys, mailboxes, rocking chairs and picket fences** are present. hikespeak **[V]**
- **Timber is artificially aged.** Fence posts carry fake lichen. findingtheuniverse **[S]**

### Not published in any text source I could find (model from photos; treat as design choices)
Nothing in the sources gives these:
- Door diameters or door hinge side
- Knob height
- Exact turf overhang
- Plaster colours
- The brick vs stone arch split
- Window mullion patterns

**Film-canon descriptions** (Tolkien's text, repeated in the films) describe a round green door "with a shiny yellow brass knob in the exact middle", and round, deep-set windows. At Bag End, the round window beside the door is where "Sam was caught eavesdropping" (findingtheuniverse). **[V for Bag End]**

**Typical elements in tour photos:**
- A **timber post-and-lintel frame or porch** around the facade
- **Stone or brick voussoir surrounds** around doors
- **Stone or brick chimneys** poking up through the turf
- **Low stone retaining walls** at the lane edge
- **Post-and-rail or picket fences** with small gates
- **Stone flag steps**

These are general observations, **[U]**. Verify them against your own photo references before hard-coding them. **I could not confirm** the prompt's premise that Bag End is "yellow ochre plaster with red brick surround". **[U]**

---

## 4. Bag End

- **Door:** round and green, a "perfectly weathered" green with a **yellow brass knob in the centre**. It is often shown slightly ajar. https://www.mileswithvibes.com/hobbiton/visiting-hobbiton-movie-set-matamata-new-zealand/ ; https://goingawesomeplaces.com/… ; https://frametoframe.ca/… **[V]**
- **Round window beside the door**, the eavesdropping window. findingtheuniverse **[S]**
- **Gate sign:** "No admittance except on party business". It is on the **gate**, not the door. https://www.hikespeak.com/… ; https://www.mileswithvibes.com/… **[V]**
- **Approach:**
  - Stone steps, "around 10", lead up from the lane through a steep incline. https://www.hobbitontours.com/plan-visit/accessibility/
  - A short series of stone steps runs from the gate to the door, lined with flowers. https://www.hikespeak.com/… ; frametoframe
  - A **giant pumpkin** sits in the garden. mileswithvibes

  **[V]**
- **Bench:** a wooden bench ("Bilbo's seat") in the garden. Visitors may not use it. https://frametoframe.ca/… ; https://www.edwud.com/bag-end-at-hobbiton/ **[V]**
- **Interior:** only the doorway area is themed. The real interiors were shot in a Wellington studio. https://www.internationaltraveller.com/… ; official tour page **[V]**

### The oak above Bag End
The 1999 version and the 2010–11 version were different trees:
- **LOTR version:** a real oak, cut down near Matamata, numbered, moved and reassembled on the hill. Total weight **26 tonnes**, with artificial leaves imported from Taiwan and wired on. https://en.wikipedia.org/wiki/Hobbiton_Movie_Set ; https://geekdad.com/2013/09/leaves-of-hobbiton/ ; greenroofs **[V]**
- ***Hobbit* version:** the original had died, so a replica was built. Sources give its materials as:
  - a **steel frame with polyurethane foam and silicone** (hikespeak: "steel and silicone"), or
  - **fibreglass** (internationaltraveller, mileswithvibes, edwud).

  OSM tags it `material=polystyrene` with the nickname "Marilyn". **[U: materials conflict]**
- **Leaf count also conflicts.** Several blogs give **200,000** silk leaves from Taiwan, and gardenhistoryresearchfoundation gives **376,000** "individually attached by hand". Peter Jackson had every leaf **repainted by hand**, about **15 h/day for 10 days**, for about 10 seconds of screen time. https://www.mileswithvibes.com/hobbiton/30-crazy-fun-facts-about-hobbiton-new-zealand/ ; https://gardenhistoryresearchfoundation.com/2020/04/17/… **[U: leaf count]**
- **Size:** the height and canopy spread are not published. The tree is the tallest element above the Bag End mound and is visible across the whole set. OSM puts its trunk about 11 m west of (upslope from) Bag End's door. **[U: dimensions]**

### View from Bag End
Looking roughly ESE to SSE:
- down over the lower hobbit holes to the **Party Field and Party Tree**, about 100 m away and 16 m lower
- the **lake** beyond
- the **Mill, the double-arch bridge and the Green Dragon**, about 220–265 m away at the far (south) end of the lake

https://www.hikespeak.com/… ; https://www.findingtheuniverse.com/… **[V]**

---

## 5. The Green Dragon Inn

- **History:** a facade in the LOTR and early *Hobbit* sets. It was rebuilt and opened as a working inn in **December 2012**. It is the only building "completely built from the inside and out". https://www.greenroofs.com/… ; https://goingawesomeplaces.com/… **[V]**
- **Roof:** thatched, using rushes cut on the Alexander farm. https://www.mileswithvibes.com/hobbiton/30-crazy-fun-facts-about-hobbiton-new-zealand/ ; hikespeak **[V]**
- **Windows and doors:** "round wooden windows" (frametoframe), "round windows" (hikespeak), and "round doorways" with "slanted roofs" (mileswithvibes). Glass is "aged". goingawesomeplaces **[V]**
- **Interior:** described in these sources:
  - https://mjwrightnz.wordpress.com/2015/10/18/a-visit-to-the-hobbiton-movie-set-part-2/
  - frametoframe
  - goingawesomeplaces

  It has adzed timber beams, a stone floor, a wooden bar and fireplaces with leather armchairs. A carved green dragon sits in the arch above the bar. There are banners and kegs. It is modelled in spirit on Oxford's Eagle and Child. **[V]**
- **Footprint (OSM):** irregular and multi-winged, about 600 m², within a bbox of about 47 × 31 m. It sits on the lake's south-east corner, just east of the bridge's east end. **[V geodata]**
- **Outdoor areas:**
  - A **beer garden** overlooking the village (https://www.hobbitontours.com/discover/the-green-dragon-inn/). OSM shows a "Bywater Beer Garden" hipped-roof tent about 55 m east.
  - Picnic sites mapped around (101, −225) and (140, −218).
  - Two small **piers or docks** mapped at (71, −218) and (109, −218), matching mileswithvibes' "dock with fishing rods and picnic stuff".
  - A "Delving & Oatlock Fine Ale Cart" at (36, −218).

  **[V]**
- **Sign:** the Wētā miniature shows a small dragon figure on top of a post at the front. https://www.wetanz.com/us/the-green-dragon-inn **[S]**
- **Unknown:** wall colours, number of chimneys and exact wing count. **[U]**

## 6. The Mill (Sandyman's Mill / "The Millhouse")

- **Construction:**
  - 1999: built with the double-arch bridge from scaffolding, ply and polystyrene. https://www.hikespeak.com/… (summarised) **[S]**
  - 2015: being rebuilt as a real building, with modern materials (Hardiplank, Zincalume) overlaid with thatch, wattle and wood. https://mjwrightnz.wordpress.com/2015/10/18/… **[S]**
- **Roof:** thatched, using rushes from the farm. mileswithvibes; hikespeak **[V]**
- **Water wheel:** it turns gently beside the water. frametoframe; hikespeak ("mill wheel by water") **[V]**
- **Door:** the Wētā description says "behind its blue door…". https://www.wetanz.com/us/hobbiton-mill-and-bridge **[S, collectible; U for the real building]**
- **Position:**
  - OSM footprint about 16 × 9 m (≈110 m²) at the **west end of the bridge**, on the lake's south-west edge.
  - "The Mill Run" stream leaves from here, running west-southwest.
  - Official copy: "perches on the water's edge next to a stony bridge across the stream from the Green Dragon".

  **[V]**
- **Which wall carries the wheel:** not documented. Geometry suggests it is on the side facing the bridge or water, the east or south side. **[U]**

## 7. The double-arch bridge
- **Structure:** double arch, stone. The present bridge is a **real stone bridge** (mjwrightnz; search summary of hikespeak). The 1999 original was scaffolding, ply and polystyrene. It is "wide enough to accommodate a wizard on a cart". **[V/S]**
- **Size (OSM):** about 28 m long including approaches. The span runs WNW to ESE, from the mill side to the Green Dragon side. It is named "Bywater Bridge", carrying "Bywater Road". **[V geodata]**

---

## 8. Vegetation

Source for most items: https://gardenhistoryresearchfoundation.com/2020/04/17/hobbiton-new-zealands-most-popular-garden/

- **Hedges:** **1.2 km of barberry (*Berberis*) hedges.** **[S]** OSM maps about 30 short hedge segments across the set, typically **10–85 m long**, along lanes and around gardens. **[V geodata]**
- **Fruit trees:** apple and pear. For the book's plum trees, apple and pear trees were dressed with fake plums, though that orchard never appeared in the final cut. https://www.internationaltraveller.com/… OSM has an "Apple Orchard" path at (74–106, 0–9). **[V]**
- **Mature trees:** some were transplanted from orchards and neighbouring properties. OSM also shows:
  - "Pine Grove" and "Willow Gully" localities
  - woods: "Westwood" to the SW, "Ferny's Fen", and woodland to the NE

  Willows grow around the lake (greenroofs.com). **[V]**
- **Flowers:** roses (climbing on fences), foxgloves, geraniums, dahlias, pansies, violas and cornflowers. Also magnolias and flowering cherry. **[S]**
- **Edibles:** thornless raspberries, currants, artichokes, grapes, vegetables and herbs, plus **pipe-weed (*Nicotiana tabacum*)**. Large vegetable gardens sit on the east side near the entry, and each hole has a cottage garden. **[S]**
- **NZ natives used as filler:** corokias and coprosmas. **[S]**
- **Turf and grass:** hole roofs carry native grasses, clover and wildflowers (greenroofs). Pasture is grazed by sheep, which also helped keep the grass right during filming (mileswithvibes). **[V]**
- **Gardens:** about **2.3 km of gardens** per mileswithvibes. The set was planted a year before filming so everything looks grown-in. Staffing: 5–8 gardeners (5 in winter, 7–8 at peak). **[V]**
- **Party Tree species:**
  - The official site calls it a "**pine**" ("a magnificent pine tree"). Greenroofs describes a "massive pine … gnarly branches sweeping the ground", and frametoframe says "enormous pine tree". **[V]**
  - Gallivantrix calls it an oak, which is wrong.
  - I found **no source naming the exact pine species.** In the Waikato the likely candidates are *Pinus radiata* or *P. pinaster*, but that is **[U]**.
  - It is often described as "an actual 70-year-old tree" (auckland-tours; internationaltraveller). It predates the set and was a reason the site was chosen.

---

## 9. Scale numbers for the build

| Quantity | Value | Basis |
|---|---|---|
| Set area | ~12 acres / ~5 ha | official **[V]** |
| Bag End elevation above lake | **~19 m** (159 vs 140 m ASL) | NZ 8 m DEM **[V geodata]** |
| Party Field elevation above lake | ~6–7 m | DEM |
| Hill behind Bag End | +13 m over 100 m further W; ridge ~184 m at ~140 m NW | DEM |
| Bag End → Party Tree | ~103 m @ 123° | OSM |
| Bag End → lake north shore | ~80–100 m | OSM |
| Party Tree → bridge | ~171 m | OSM |
| Bag End → Green Dragon | ~265 m @ 153° | OSM |
| Lake | ≈12,800 m²; ~200 m E–W × ~180 m N–S overall, irregular with a western arm along the south | OSM |
| Party Field | ≈2,200 m², ~55 × 60 m | OSM |
| Mill footprint | ~16 × 9 m | OSM |
| Green Dragon footprint | ~600 m², multi-wing | OSM |
| Bridge length | ~28 m | OSM |
| Walking route | 1.5–2 km | official / hikespeak |
| Steps up to Bag End | ~10 | official |
| Hole count | 44 | official |
| Hole scales | 60% (Gandalf shots), 90% (hobbit/dwarf shots); interiors 83% | blogs / official |
| Hole spacing | **not published.** 44 holes over the ~150 × 250 m built zone implies about 20–30 m between holes on average, clustered along the lane terraces. | **[U: my estimate]** |
| Lane widths | **not published.** Paths are compacted clay with cobbled sections. Gandalf's cart lane and the bridge take a horse and cart, so plan for ~2.5–3 m. Foot paths ~1.2–2 m. | **[U: estimate]** |

---

## Key open questions (could not be verified from text sources)
1. Door diameters per scale, hinge side, and knob height.
2. Which holes are at which scale, and whether the door-colour-equals-scale rule holds.
3. Plaster and render colours, and which facades use brick vs stone surrounds.
4. The exact species and height of the Party Tree; the oak replica's height, canopy size and final material.
5. The water-wheel side of the mill, and the Green Dragon's wing count and chimneys.
6. A per-hole list of all 44 occupations. Only about 10 are documented.

For these, the best next step is photogrammetry-style review of tour photo sets (Flickr, Google Maps Street View / photo spheres at the set) or the Hobbiton Tours virtual tour.
