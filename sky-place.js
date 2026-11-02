// Where the lab's sky is seen from. To move the sky, change only this file:
// a display name, latitude and longitude in degrees (south and west negative),
// and the IANA time zone used for the clock in the footer.
//
// `look` is which way the page faces:
//   "pole"    toward the celestial pole you can see: south from the southern hemisphere,
//             north from the northern. Its stars never set, so the view is rich all year.
//   "equator" the other way, toward the zodiac and the constellations that rise and set.
//   "north", "east", "south", "west", or an azimuth in degrees, to choose it outright.
window.LAB_SKY_PLACE = {
  name: "Canberra",
  lat: -35.2809,
  lon: 149.13,
  timeZone: "Australia/Sydney",
  look: "pole"
};
