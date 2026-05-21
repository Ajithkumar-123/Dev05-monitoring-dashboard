// assets/scripts/lib/report.js — Exit code vocabulary. Pure: no IO.
// Copied verbatim from bin/lib/report.js so the deployed helper has zero dep on bin/lib/.
export const EXIT_OK = 0;
export const EXIT_DOMAIN = 1;     // D-22/D-23/D-31/D-43/D-51 domain errors
export const EXIT_USAGE = 64;     // sysexits.h EX_USAGE
export const EXIT_INTERNAL = 70;  // sysexits.h EX_SOFTWARE
