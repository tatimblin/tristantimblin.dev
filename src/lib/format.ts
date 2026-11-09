/**
 * Numbers and dates for print, with no help from the build machine's locale or
 * zone, which are not the reader's.
 */

/** The month names, as literals. */
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `Feb`, in UTC: frontmatter dates are bare YYYY-MM-DD, which parse as UTC
 *  midnight, so a local reading prints the day before anywhere west of UTC. */
export const monthOf = (d: Date): string => MONTHS[d.getUTCMonth()];

/** 1,204 from 1204. */
export const formatCount = (value: number): string => value.toLocaleString("en-US");
