// One-off: dedupes the paskateparks.com list against current DB parks and
// emits data/imports/park-stubs.csv with name + city + county prefilled
// where I can confidently derive county from city. Lat/lng + everything
// else stays blank for the owner to fill.

import { writeFileSync } from "node:fs";

interface Entry {
  name: string;
  city: string;
  county?: string;
}

// User-supplied list from paskateparks.com. Tuples are [name, city]; I'll
// derive county from a city map below where unambiguous.
const FROM_SITE: Array<[string, string]> = [
  ["4th St. Skatepark", "Lansdale"],
  ["9th and Poplar", "Philadelphia"],
  ["Ambler Skatepark", "Ambler"],
  ["Ashton Hill Skatepark", "Coaldale"],
  ["Bayne Skatepark (Bellevue Skate Plaza)", "Pittsburgh"],
  ["Beaty Skatepark", "Warren"],
  ["Bensalem Township Community Skatepark", "Bensalem"],
  ["Bethlehem Skateplaza", "Bethlehem"],
  ["Black Rock Skatepark", "Phoenixville"],
  ["Bloomsburg Skatepark", "Bloomsburg"],
  ["Blossburg Skatepark", "Blossburg"],
  ["Boyce Skatepark", "Monroeville"],
  ["Brady's Run Skatepark", "Beaver"],
  ["Brockway Skate Park", "Brockway"],
  ["Butler Skatepark", "Drums"],
  ["Camp Olympic Pump Track", "Emmaus"],
  ["Canonsburg Town Park", "Canonsburg"],
  ["Carbondale Skatepark", "Carbondale"],
  ["Catasauqua Skatepark", "Catasauqua"],
  ["Chambersburg Skate Park (Memorial Park)", "Chambersburg"],
  ["Chichester Skatepark", "Aston"],
  ["Clearfield (Greentop) Skatepark", "Clearfield"],
  ["Cluggy's Skatepark", "Chambersburg"],
  ["Cole's Skate Park", "East Berlin"],
  ["Conway Skatepark", "Conway"],
  ["Coolbaugh Township Skatepark", "Tobyhanna"],
  ["Cornerstone Youth Center Skatepark", "Elizabethtown"],
  ["Cranberry Skate Park", "Cranberry Township"],
  ["Daniel T. Kellett Skatepark", "King of Prussia"],
  ["Danville Skatepark", "Danville"],
  ["Denver Community Skatepark", "Denver"],
  ["Derry Township Skatepark", "Hershey"],
  ["Downingtown Skatepark", "Downingtown"],
  ["Doylestown Skatepark", "Doylestown"],
  ["DuBois Skatepark", "DuBois"],
  ["Dunlap Family Skatepark", "Waynesboro"],
  ["East Brady Skatepark", "East Brady"],
  ["Ephrata Borough Skatepark", "Ephrata"],
  ["Ewing Skatepark", "Ellwood City"], // user wrote "Ellewood" - fixing typo
  ["Falls Township Skateboard Park", "Morrisville"],
  ["Father Marinaro Skatepark", "Butler"],
  ["FDR Park", "Philadelphia"],
  ["Forks Township Skatepark", "Easton"],
  ["Frackville Skatepark", "Frackville"],
  ["Free Fall Skatepark", "Quakertown"],
  ["Freedom Memorial Park", "Millersville"],
  ["Front Street Skatepark", "Philadelphia"],
  ["Gettysburg Skatepark", "Gettysburg"],
  ["Granahan", "Philadelphia"],
  ["Grays Ferry", "Philadelphia"],
  ["Hamlin Skatepark", "Smethport"],
  ["Hanley Skatepark", "Bradford"],
  ["Harrisville Skatepark", "Harrisville"],
  ["Haverford Skatepark", "Havertown"],
  ["Hawley Skatepark", "Hawley"],
  ["Hazleton Skatepark", "Hazleton"],
  ["Hyde Skatepark", "Reading"],
  ["Imperial Skate Park", "Imperial"],
  ["Jackson St. Skate Park", "Scranton"],
  ["Johnstown Skatepark", "Johnstown"],
  ["Jordan Skatepark", "Whitehall"],
  ["Eli McCloskey Memorial Skate/Bike Park", "Kane"],
  ["Keck Skatepark", "Allentown"],
  ["Kennett YMCA Skatepark", "Kennett Square"],
  ["Kersey Skatepark (Fox Township Community Park)", "Kersey"],
  ["Kutztown Skatepark", "Kutztown"],
  ["Lancaster County Skatepark", "Lancaster"],
  ["Lebanon Valley YMCA", "Lebanon"],
  ["Lewisburg Skatepark (Water's Edge)", "Lewisburg"],
  ["Lifland Skatepark", "Williamsport"],
  ["Lititz Skatepark", "Lititz"],
  ["Lock Haven Skatepark", "Lock Haven"],
  ["Lower Macungie Skatepark", "Macungie"],
  ["Maytown Skatepark", "Marietta"],
  ["McCreesh", "Philadelphia"],
  ["McKinley Skate Park", "Pittsburgh"],
  ["McLaughlin Skatepark", "Bridgeville"],
  ["Meadville Skatepark", "Meadville"],
  ["Middletown Skatepark", "Langhorne"],
  ["Milford Skatepark", "Milford"],
  ["Mill Creek Skatepark", "Feasterville-Trevose"],
  ["Milton Skatepark (Brown Avenue)", "Milton"],
  ["Minersville Area Skatepark", "Minersville"],
  ["Montgomery Skatepark", "Montgomery"],
  ["MopTop Skatepark", "Harrisburg"],
  ["Munro Community Park", "Warminster"],
  ["Nazareth Borough Skatepark", "Nazareth"],
  ["Newtown Township Skatepark", "Newtown"],
  ["Oil City Skatepark (Hasson Park)", "Oil City"],
  ["Overlook Skatepark", "Lancaster"],
  ["Paine's Park", "Philadelphia"],
  ["Peach Plaza", "Greensburg"],
  ["Penn Hills Xtreme Skate Park", "Penn Hills"],
  ["Penn Skate", "Allentown"],
  ["Penn Township Skate Park", "Harrison City"],
  ["Perkasie Skate Park", "Perkasie"],
  ["Peters Township Community Recreation Center", "Venetia"],
  ["Pineland Skatepark", "Birdsboro"],
  ["Pitcher Park Memorial Skatepark", "Carnegie"],
  ["Polish Hill Bowl Skatepark", "Pittsburgh"],
  ["Pops", "Philadelphia"],
  ["Portstown Skatepark", "Huntingdon"],
  ["Pottstown Skatepark", "Pottstown"],
  ["Pottsville Skatepark (East Side)", "Pottsville"],
  ["Punxsutawney Skate Park", "Punxsutawney"],
  ["Radnor Skatepark", "Wayne"],
  ["Reamstown Skatepark", "Stevens"],
  ["Reid Menzer Memorial Skatepark", "York"],
  ["Richard Wall Skatepark", "Elkins Park"],
  ["Robert E. Lambert Park (Wawa)", "West Chester"],
  ["Rocky's Bicycle Shop Skatepark", "Monroe"],
  ["Roslyn (Patrick Kerr)", "Abington"],
  ["The Roxborough Courts", "Philadelphia"],
  ["Sheraden Skate Park", "Pittsburgh"], // user wrote "Pittsburg" - fixed
  ["Shoey Skate Park Fresh Life Outreach", "Shoemakersville"],
  ["The Shred Shed", "New Bloomfield"],
  ["SK814 Action Sports Park", "Altoona"],
  ["The Skateboard Academy of Philadelphia", "Philadelphia"],
  ["Skate Erie", "Erie"],
  ["Skate the Foundry (Elkins Park)", "Elkins Park"],
  ["Skate the Foundry (West Philly)", "Philadelphia"],
  ["South Park Skatepark", "Bethel Park"],
  ["Southern End Community Association (SECA) Skatepark", "Quarryville"],
  ["State College Skatepark", "Boalsburg"],
  ["Steelton Skate Park", "Steelton"],
  ["Stoneboro Skatepark", "Stoneboro"], // user wrote "Stoneborro" - fixed
  ["Stonecliffe Action Park", "Reading"],
  ["Strausstown Skatepark", "Strausstown"],
  ["Stroudsburg Borough Skate Park", "Stroudsburg"],
  ["Sunbury Skatepark", "Sunbury"],
  ["Switch and Signal Skatepark", "Swissvale"],
  ["Tamaqua Skatepark (Willing Park)", "Tamaqua"],
  ["Three16 Bowl", "Brandamore"],
  ["Tussey Mountain Skatepark", "Boalsburg"],
  ["Underwood Skatepark", "Taylor"],
  ["Waynesburg Skatepark", "Waynesburg"],
  ["Wedgewood Park", "Lansdale"],
  ["Weona Skatepark", "Pen Argyl"],
  ["Wharton Street Warehouse", "Philadelphia"],
  ["The Wheel Mill", "Pittsburgh"],
  ["Wherehouse54", "Lancaster"],
  ["Whitehall", "Philadelphia"], // user wrote "Phildelphia" - fixed
  ["Windber Skatepark", "Windber"],
  ["Woodward", "Woodward"],
  ["Zelienople Community Park", "Zelienople"],
  ["Zembo Temple of Skate and Design", "Philadelphia"],
];

// 48 parks currently in DB. (slug, name, city) — only the ones the
// dedupe needs to match against. Pulled from DB query.
const IN_DB: Array<[string, string]> = [
  ["9th and Poplar", "Philadelphia"],
  ["Bayne Skatepark", "Pittsburgh"],
  ["Bensalem Township Community Park", "Bensalem"],
  ["Bethlehem Skateplaza", "Bethlehem"],
  ["Black Rock", "Phoenixville"],
  ["Carl W. Saldutti, Jr. Skatepark", "Lansdale"],
  ["Daniel T. Kellett Memorial Skatepark", "King of Prussia"],
  ["Downingtown Skatepark", "Downingtown"],
  ["FDR", "Philadelphia"],
  ["Freedom Memorial Skatepark", "Millersville"],
  ["Front Street Park", "Philadelphia"],
  ["Granahan", "Philadelphia"],
  ["Grays Ferry Crescent Skatepark", "Philadelphia"],
  ["Haverford Township Skatepark", "Havertown"],
  ["Hyde Skatepark", "Reading"],
  ["Jordan Skatepark", ""],
  ["Kutztown Skatepark", "Kutztown"],
  ["Lancaster County Skatepark", "Lancaster"],
  ["Lititz Skatepark", "Lititz"],
  ["Lower Macungie Skatepark", "Macungie"],
  ["McCreesh Skatepark", "Philadelphia"],
  ["McKinley Skatepark", "Pittsburgh"],
  ["Middletown Community Skatepark", "Langhorne"],
  ["Overlook Skatepark", "Lancaster"],
  ["Paine's Park", "Philadelphia"],
  ["Patrick Kerr Memorial Skatepark", "Abington"],
  ["Pendora Skatepark", "Reading"],
  ["Pineland Skatepark", "Birdsboro"],
  ["Pitcher Park Memorial Skatepark", "Carnegie"],
  ["Polish Hill Bowl Skate Park", "Pittsburgh"],
  ["Pops Skatepark", "Philadelphia"],
  ["Pottstown Skatepark", "Pottstown"],
  ["Radnor Skatepark", "Wayne"],
  ["Reid Menzer Memorial Skatepark", "York"],
  ["Richard Wall Skatepark", "Elkins Park"],
  ["Robert E. Lambert Skatepark", "West Chester"],
  ["Sk8-1-4 Park", "Altoona"],
  ["Skate the Foundry - Elkins Park", "Elkins Park"],
  ["Stonecliffe Action Park", "Reading"],
  ["Switch and Signal", "Pittsburgh"],
  ["The Shred Shed", "New Bloomfield"],
  ["The Skateboard Academy of Philadelphia", "Philadelphia"],
  ["The Wheel Mill", "Pittsburgh"],
  ["Wedgewood", "Lansdale"],
  ["Wharton Street Warehouse", "Philadelphia"],
  ["Whitehall", "Philadelphia"],
  ["Zelienople Memorial Skate Park", "Zelienople"],
  ["Zembo Temple of Skate and Design", "Philadelphia"],
];

// City → County map for PA. Covers every city in the site list. NEW
// counties (not in src/lib/counties.ts today) are tagged with [NEW] in
// the trailing comment; the importer will need to extend COUNTIES when
// it sees these.
const CITY_TO_COUNTY: Record<string, string> = {
  "Abington": "Montgomery",
  "Allentown": "Lehigh",
  "Altoona": "Blair",
  "Ambler": "Montgomery",
  "Aston": "Delaware",
  "Beaver": "Beaver",
  "Bensalem": "Bucks",
  "Bethel Park": "Allegheny",
  "Bethlehem": "Northampton",
  "Birdsboro": "Berks",
  "Bloomsburg": "Columbia",
  "Blossburg": "Tioga",
  "Boalsburg": "Centre",
  "Bradford": "McKean",
  "Brandamore": "Chester",
  "Bridgeville": "Allegheny",
  "Brockway": "Jefferson",
  "Butler": "Butler",
  "Canonsburg": "Washington",
  "Carbondale": "Lackawanna",
  "Carnegie": "Allegheny",
  "Catasauqua": "Lehigh",
  "Chambersburg": "Franklin",
  "Clearfield": "Clearfield",
  "Coaldale": "Schuylkill",
  "Conway": "Beaver",
  "Cranberry Township": "Butler",
  "Danville": "Montour",
  "Denver": "Lancaster",
  "Downingtown": "Chester",
  "Doylestown": "Bucks",
  "Drums": "Luzerne",
  "DuBois": "Clearfield",
  "East Berlin": "Adams",
  "East Brady": "Clarion",
  "Easton": "Northampton",
  "Elizabethtown": "Lancaster",
  "Elkins Park": "Montgomery",
  "Ellwood City": "Lawrence",
  "Emmaus": "Lehigh",
  "Ephrata": "Lancaster",
  "Erie": "Erie",
  "Feasterville-Trevose": "Bucks",
  "Frackville": "Schuylkill",
  "Gettysburg": "Adams",
  "Greensburg": "Westmoreland",
  "Harrisburg": "Dauphin",
  "Harrison City": "Westmoreland",
  "Harrisville": "Butler",
  "Havertown": "Delaware",
  "Hawley": "Wayne",
  "Hazleton": "Luzerne",
  "Hershey": "Dauphin",
  "Huntingdon": "Huntingdon",
  "Imperial": "Allegheny",
  "Johnstown": "Cambria",
  "Kane": "McKean",
  "Kennett Square": "Chester",
  "Kersey": "Elk",
  "King of Prussia": "Montgomery",
  "Kutztown": "Berks",
  "Lancaster": "Lancaster",
  "Langhorne": "Bucks",
  "Lansdale": "Montgomery",
  "Lebanon": "Lebanon",
  "Lewisburg": "Union",
  "Lititz": "Lancaster",
  "Lock Haven": "Clinton",
  "Macungie": "Lehigh",
  "Marietta": "Lancaster",
  "Meadville": "Crawford",
  "Milford": "Pike",
  "Millersville": "Lancaster",
  "Milton": "Northumberland",
  "Minersville": "Schuylkill",
  "Monroe": "", // ambiguous — Monroe is a county AND multiple cities/townships exist
  "Monroeville": "Allegheny",
  "Montgomery": "Lycoming",
  "Morrisville": "Bucks",
  "Nazareth": "Northampton",
  "New Bloomfield": "Perry",
  "Newtown": "Bucks",
  "Oil City": "Venango",
  "Pen Argyl": "Northampton",
  "Penn Hills": "Allegheny",
  "Perkasie": "Bucks",
  "Philadelphia": "Philadelphia",
  "Phoenixville": "Chester",
  "Pittsburgh": "Allegheny",
  "Pottstown": "Montgomery",
  "Pottsville": "Schuylkill",
  "Punxsutawney": "Jefferson",
  "Quakertown": "Bucks",
  "Quarryville": "Lancaster",
  "Reading": "Berks",
  "Scranton": "Lackawanna",
  "Shoemakersville": "Berks",
  "Smethport": "McKean",
  "Steelton": "Dauphin",
  "Stevens": "Lancaster",
  "Stoneboro": "Mercer",
  "Strausstown": "Berks",
  "Stroudsburg": "Monroe",
  "Sunbury": "Northumberland",
  "Swissvale": "Allegheny",
  "Tamaqua": "Schuylkill",
  "Taylor": "Lackawanna",
  "Tobyhanna": "Monroe",
  "Venetia": "Washington",
  "Warminster": "Bucks",
  "Warren": "Warren",
  "Wayne": "Delaware",
  "Waynesboro": "Franklin",
  "Waynesburg": "Greene",
  "West Chester": "Chester",
  "Whitehall": "Lehigh",
  "Williamsport": "Lycoming",
  "Windber": "Somerset",
  "Woodward": "Centre",
  "York": "York",
  "Zelienople": "Butler",
};

// ─── Normalization for dedupe matching ─────────────────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ") // strip parenthetical alt names
    .replace(/['’\.,]/g, "") // punctuation
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(skatepark|skate park|park|the|memorial|community|borough|township|crescent|skate)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cityKey(c: string): string {
  return c.toLowerCase().trim();
}

// Hand-curated alt-name pairs. The normalizer can't bridge these — the
// names are genuinely different but refer to the same physical park.
// Each entry is normalize(siteName) → normalize(dbName).
const ALT_NAME_MATCHES = new Map<string, string>([
  // "Roslyn (Patrick Kerr)" Abington → DB "Patrick Kerr Memorial Skatepark"
  [normalize("Roslyn (Patrick Kerr)") + "|abington", normalize("Patrick Kerr Memorial Skatepark") + "|abington"],
  // "SK814 Action Sports Park" Altoona → DB "Sk8-1-4 Park"
  [normalize("SK814 Action Sports Park") + "|altoona", normalize("Sk8-1-4 Park") + "|altoona"],
  // "Jordan Skatepark" Whitehall → DB has empty city; treat as match
  [normalize("Jordan Skatepark") + "|whitehall", normalize("Jordan Skatepark") + "|"],
  // "Skate the Foundry (Elkins Park)" → DB "Skate the Foundry - Elkins Park"
  [normalize("Skate the Foundry (Elkins Park)") + "|elkins park", normalize("Skate the Foundry - Elkins Park") + "|elkins park"],
  // "Switch and Signal Skatepark" Swissvale → DB has it as Pittsburgh (adjacent city)
  [normalize("Switch and Signal Skatepark") + "|swissvale", normalize("Switch and Signal") + "|pittsburgh"],
  // "4th St. Skatepark" Lansdale → DB "Carl W. Saldutti, Jr. Skatepark" (canonical name; owner confirmed 2026-06-16)
  [normalize("4th St. Skatepark") + "|lansdale", normalize("Carl W. Saldutti, Jr. Skatepark") + "|lansdale"],
]);

// Build dedupe index from DB
const dbIndex = new Set<string>();
for (const [name, city] of IN_DB) {
  dbIndex.add(`${normalize(name)}|${cityKey(city)}`);
}

// Filter site list, attach county
const stubs: Entry[] = [];
const matched: Array<{ site: string; siteCity: string }> = [];
const ambiguousCounty: Array<string> = [];

for (const [name, city] of FROM_SITE) {
  const directKey = `${normalize(name)}|${cityKey(city)}`;
  const altKey = ALT_NAME_MATCHES.get(directKey);
  if (dbIndex.has(directKey) || (altKey && dbIndex.has(altKey))) {
    matched.push({ site: name, siteCity: city });
    continue;
  }
  const county = CITY_TO_COUNTY[city];
  if (county === undefined) {
    ambiguousCounty.push(`UNKNOWN CITY: ${name}, ${city}`);
  }
  stubs.push({ name, city, county: county || undefined });
}

// ─── Emit CSV ──────────────────────────────────────────────────────────────

const HEADER = "name,city,county,lat,lng,alias,slug,street_address,zip,park_type,established_year,status,description";

function csvEscape(s: string | undefined): string {
  if (s === undefined || s === "") return "";
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const lines = [HEADER];
for (const s of stubs) {
  lines.push(
    [csvEscape(s.name), csvEscape(s.city), csvEscape(s.county), "", "", "", "", "", "", "", "", "", ""].join(","),
  );
}

writeFileSync("data/imports/park-stubs.csv", lines.join("\n") + "\n", "utf8");

// ─── Report ────────────────────────────────────────────────────────────────

console.log(`SITE LIST:     ${FROM_SITE.length}`);
console.log(`MATCHED IN DB: ${matched.length}`);
console.log(`STUBS TO IMPORT: ${stubs.length}`);
console.log(`WROTE: data/imports/park-stubs.csv`);

if (ambiguousCounty.length) {
  console.log(`\nAMBIGUOUS COUNTY (left blank for owner):`);
  for (const a of ambiguousCounty) console.log(`  ${a}`);
}

// Flag DB parks not accounted for by any matched site entry. Build a set
// of matched DB keys (including alt-name redirects) and report only the
// truly orphaned ones.
const matchedDbKeys = new Set<string>();
for (const [name, city] of FROM_SITE) {
  const directKey = `${normalize(name)}|${cityKey(city)}`;
  if (dbIndex.has(directKey)) {
    matchedDbKeys.add(directKey);
    continue;
  }
  const altKey = ALT_NAME_MATCHES.get(directKey);
  if (altKey && dbIndex.has(altKey)) {
    matchedDbKeys.add(altKey);
  }
}
const onlyInDb: Array<string> = [];
for (const [name, city] of IN_DB) {
  const key = `${normalize(name)}|${cityKey(city)}`;
  if (!matchedDbKeys.has(key)) {
    onlyInDb.push(`  ${name} (${city})`);
  }
}
if (onlyInDb.length) {
  console.log(`\nIN DB BUT NOT IN THE SITE LIST (possibly renamed or missing from your list):`);
  for (const o of onlyInDb) console.log(o);
}
