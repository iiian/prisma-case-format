import { Options } from 'change-case';
import pluralize from 'pluralize';

export type CaseChange = (input: string, options?: Options) => string;

/** Modify a case change function to output pluralized result */
export function asPluralized(f: CaseChange): CaseChange {
  return (input: string, opt?: Options) => pluralize(f(input, opt));
}